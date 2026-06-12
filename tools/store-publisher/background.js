// Orchestrates a store-listing publish run.
// lib/locales.js and stores/cws.js are loaded first (manifest background
// scripts), so LOCALES, the helpers and CwsDriver are globals here.
//
// The orchestration is store-agnostic: it only talks to a driver object
// (CwsDriver today, an AMO driver later) through the interface documented at
// the bottom of stores/cws.js.

const SETTLE_PAGE_MS  = 6000;   // initial SPA render after tab load
const SETTLE_FIELD_MS = 1200;   // after a language switch, before touching fields
const TAB_LOAD_MS     = 60000;
const UPLOAD_WAIT_MS  = 45000;  // per-screenshot upload (thumbnail appears)
const MAX_DELETES     = 12;     // safety bound on the delete loop

const DRIVERS = { cws: CwsDriver };

// ── native messaging (shared host with stats-collector) ───────────────────────

// Binary reads arrive as a stream of {ok, chunk, done} messages: Firefox caps
// native→extension messages at 1 MB and a screenshot's base64 exceeds that.
function readFileNative(path, binary = false) {
  return new Promise((resolve, reject) => {
    let port;
    try {
      port = chrome.runtime.connectNative('com.geminifoldersantigravity.filereader');
    } catch (e) {
      reject(new Error('Native host unavailable — run tools/stats-collector/native/install-native-host.ps1 first. ' + e.message));
      return;
    }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try { port.disconnect(); } catch (_) {}
      fn(value);
    };
    const parts = [];
    port.onMessage.addListener(msg => {
      if (!msg.ok) { finish(reject, new Error(`Native read error (${path}): ${msg.error}`)); return; }
      if (msg.chunk !== undefined) {
        parts.push(msg.chunk);
        if (msg.done) finish(resolve, parts.join(''));
        return;
      }
      finish(resolve, msg.content);
    });
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message ?? 'disconnected';
      finish(reject, new Error('Native host disconnected: ' + err));
    });
    port.postMessage(binary ? { path, binary: true } : { path });
  });
}

// ── tab helpers ───────────────────────────────────────────────────────────────

function waitForTabComplete(tabId, timeoutMs = TAB_LOAD_MS) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdate);
      resolve();
    };
    const onUpdate = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
    chrome.tabs.onUpdated.addListener(onUpdate);
    chrome.tabs.get(tabId, t => { if (!chrome.runtime.lastError && t?.status === 'complete') finish(); });
    setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdate);
      reject(new Error(`Timeout waiting for tab ${tabId}`));
    }, timeoutMs);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── path helpers ──────────────────────────────────────────────────────────────

function joinPath(root, parts) {
  const sep = root.includes('/') && !root.includes('\\') ? '/' : '\\';
  return [root.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

// ── failure type carrying page diagnostics ────────────────────────────────────

class PublishError extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
}

function fmtDetail(detail) {
  try { return JSON.stringify(detail, null, 1).slice(0, 1500); }
  catch { return String(detail); }
}

// ── screenshot replacement (delete all, upload 1..5) ──────────────────────────

async function waitForShotCount(driver, tabId, scope, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(1000);
    const res = await driver.countScreenshots(tabId, scope);
    if (res?.ok) {
      last = res.count;
      if (res.count >= expected) return res.count;
    }
  }
  throw new PublishError(`Screenshot count (${scope}) did not reach ${expected} within ${timeoutMs / 1000}s (last: ${last})`, null);
}

async function replaceScreenshots(driver, tabId, marketingDir, internalCode, scope, onProgress) {
  const countRes = await driver.countScreenshots(tabId, scope);
  if (!countRes?.ok) throw new PublishError(`Screenshot section (${scope}) not found`, countRes);
  onProgress(`  ${scope} screenshots: ${countRes.count} existing`);

  let guard = MAX_DELETES;
  let remaining = countRes.count;
  while (remaining > 0 && guard-- > 0) {
    const res = await driver.deleteOneScreenshot(tabId, scope);
    if (!res?.ok) throw new PublishError('Screenshot delete failed', res);
    remaining = res.after;
  }
  if (remaining > 0) throw new PublishError(`Still ${remaining} screenshots after ${MAX_DELETES} delete attempts`, null);
  if (countRes.count > 0) onProgress('  screenshots: cleared');

  for (let i = 1; i <= SCREENSHOTS_PER_LOCALE; i++) {
    const name = screenshotName(internalCode, i);
    const path = joinPath(marketingDir, ['screenshots', name]);
    const b64 = await readFileNative(path, true);

    const before = await driver.countScreenshots(tabId, scope);
    const up = await driver.uploadScreenshot(tabId, b64, name, scope);
    if (!up?.ok) throw new PublishError(`Upload of ${name} failed`, up);
    await waitForShotCount(driver, tabId, scope, (before?.count ?? 0) + 1, UPLOAD_WAIT_MS);
    onProgress(`  upload ${name} ✓`);
  }
}

// ── per-locale step ───────────────────────────────────────────────────────────

async function publishLocale(driver, tabId, locale, text, opts, marketingDir, onProgress) {
  onProgress(`${locale.internal} (${locale.name})`);

  const sel = await driver.selectLanguage(tabId, locale);
  if (!sel?.ok) throw new PublishError(`Language "${locale.name}" not selectable`, sel);
  onProgress(`  language → "${sel.selected}"${sel.confirmed === false ? ' (UNCONFIRMED)' : ''}`);
  if (sel.confirmed === false && !opts.dryRun) {
    throw new PublishError(`Language switch to "${locale.name}" could not be confirmed (combobox shows "${sel.trigger}") — aborting before writing into the wrong locale`, sel);
  }
  await sleep(SETTLE_FIELD_MS);

  if (opts.updateTexts) {
    const res = await driver.setDescription(tabId, text, !opts.dryRun);
    if (!res?.ok) throw new PublishError('Description field not updated', res);
    onProgress(opts.dryRun
      ? `  description target: "${res.label}" (currently ${res.currentLength} chars)`
      : `  description ✓ ${res.length} chars (field "${res.label}")`);
  }

  if (opts.updateImages) {
    if (opts.dryRun) {
      const c = await driver.countScreenshots(tabId, 'localized');
      onProgress(c?.ok
        ? `  localized screenshots: ${c.count} existing`
        : '  ⚠ localized screenshots card NOT found: ' + fmtDetail(c));
    } else {
      await replaceScreenshots(driver, tabId, marketingDir, locale.internal, 'localized', onProgress);
    }
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

async function runPublish(config, opts, onProgress) {
  const driver = DRIVERS[opts.store || 'cws'];
  if (!driver) throw new Error(`Unknown store driver: ${opts.store}`);

  const item = config.items.find(i => i.slug === opts.itemSlug);
  if (!item) throw new Error(`Item "${opts.itemSlug}" not in config.json`);

  const locales = filterLocales(opts.localeFilter);
  const marketingDir = joinPath(config.repo_root, driver.marketingDirParts(item));

  // Pre-flight: read every promo text up front so a missing/stale dist file
  // aborts the run before the page is touched. (Skipped for a pure probe.)
  const texts = {};
  if (opts.updateTexts && !opts.probeOnly) {
    onProgress(`Pre-flight: reading ${locales.length} promo texts from ${marketingDir}…`);
    for (const locale of locales) {
      texts[locale.internal] = await readFileNative(joinPath(marketingDir, [promoTxtName(locale.internal)]));
    }
    onProgress('Pre-flight texts OK.');
  }
  if ((opts.updateImages || opts.updateGlobalImages) && !opts.probeOnly) {
    // Spot-check one image per concerned locale set (full bytes are read lazily).
    const probeLocale = opts.updateImages ? locales[0].internal : 'en';
    await readFileNative(joinPath(marketingDir, ['screenshots', screenshotName(probeLocale, 1)]), true);
    onProgress('Pre-flight screenshots dir OK.');
  }

  // Open the listing page. The tab stays open at the end — the manual
  // "Save draft" + review is the user's job.
  const url = driver.listingUrl(config, item);
  onProgress(`Opening ${url}`);
  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabComplete(tab.id);
  const { url: finalUrl } = await chrome.tabs.get(tab.id);
  if (driver.isLoginUrl(finalUrl)) {
    throw new Error(`Not logged in to Google — redirected to ${finalUrl}. Log in in this profile and re-run.`);
  }
  await sleep(SETTLE_PAGE_MS);

  if (opts.probeOnly) {
    const probe = await driver.probe(tab.id);
    onProgress('Probe result:');
    onProgress(JSON.stringify(probe, null, 1)); // full dump, never truncated
    return;
  }

  for (const locale of locales) {
    try {
      await publishLocale(driver, tab.id, locale, texts[locale.internal], opts, marketingDir, onProgress);
    } catch (e) {
      if (e.detail) onProgress('Diagnostics: ' + fmtDetail(e.detail));
      onProgress(`Aborted at locale "${locale.internal}". Fix the issue (see stores/${driver.id}.js), then resume with filter "from:${locale.internal}".`);
      throw e;
    }
  }

  // International / global screenshots: the "Global assets" card on the same
  // page (independent of the selected language). Replaced with the EN set,
  // once per deployment.
  if (opts.updateGlobalImages) {
    onProgress('International screenshots (Global assets) → EN set…');
    if (opts.dryRun) {
      const c = await driver.countScreenshots(tab.id, 'global');
      onProgress(c?.ok
        ? `  global screenshots: ${c.count} existing`
        : '  ⚠ global screenshots card NOT found: ' + fmtDetail(c));
    } else {
      await replaceScreenshots(driver, tab.id, marketingDir, 'en', 'global', onProgress);
    }
  }

  onProgress('All done. Review the page, then click "Save draft" yourself — nothing has been saved.');
}

// ── message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'START_PUBLISH') return;
  const { config, opts } = msg;
  (async () => {
    try {
      const progress = status =>
        chrome.runtime.sendMessage({ type: 'PROGRESS', status }).catch(() => {});
      await runPublish(config, opts, progress);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
