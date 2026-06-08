// Orchestrates the monthly collection run.
// lib/github.js is loaded first (see manifest background.scripts), so
// commitCwsEntry is available as a global here.

const SETTLE_MS    = 3500;
const TAB_LOAD_MS  = 60000; // tab load timeout; CWS analytics can be slow
const LOGIN_RE     = /accounts\.google|google\.com\/ServiceLogin|SignIn/i;
const SCRAPE_FILES = ['lib/selectors.js', 'lib/normalize.js', 'content/scrape.js'];
const CWS_BASE     = 'https://chrome.google.com/webstore/devconsole';

// ── URL helper ────────────────────────────────────────────────────────────────

function buildUrl(base, extra = {}) {
  const params = { hl: 'en', ...extra };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}?${qs}`;
}

// ── preset-period click (runs in MAIN world) ──────────────────────────────────

// Finds a preset period tab/button by label text and clicks it.
// Two-pass: tries direct match first, then opens the date-range trigger in
// case presets only appear inside a dropdown.
// Must be self-contained (serialised by executeScript — no closure access).
async function clickPresetPeriod(label) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const normalized = label.trim().toLowerCase();

  window.scrollTo(0, 800);
  await sleep(400);

  function notHidden(el) {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function findByText(candidates) {
    const norm = normalized;
    return candidates
      .filter(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === norm || t.startsWith(norm) || t.includes(norm);
      })
      .sort((a, b) => (a.textContent?.trim().length ?? 999) - (b.textContent?.trim().length ?? 999))
      [0];
  }

  const allEls = () => Array.from(document.querySelectorAll('*')).filter(notHidden);

  let target = findByText(allEls());

  if (!target) {
    const RANGE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{1,40}\bto\b/i;
    const trigger = allEls()
      .filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('jsaction'))
      .find(el => RANGE_RE.test(el.textContent || '') || /last\s+\d+\s+days/i.test(el.textContent || ''));
    if (trigger) { trigger.click(); await sleep(1200); }
    target = findByText(allEls());
  }

  if (!target) {
    const bodyText = (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const dateEls = allEls()
      .filter(el => /\d+\s*(day|year|month|365)/i.test((el.textContent || '').trim()))
      .filter(el => ((el.textContent || '').trim().length) < 35)
      .slice(0, 12)
      .map(el => ({ tag: el.tagName, role: el.getAttribute('role'), text: (el.textContent || '').trim().slice(0, 40) }));
    return { ok: false, step: 'find-preset', label, bodyText, dateEls };
  }

  target.click();

  // Poll until the page shows a date range spanning two different calendar years
  // (e.g. "Jun 6, 2025 – Jun 6, 2026"), which confirms the SPA reloaded the data.
  // Fall back after 15 s so we never hang forever.
  const deadline = Date.now() + 15000;
  let rangeDetected = false;
  while (Date.now() < deadline) {
    await sleep(600);
    const found = Array.from(document.querySelectorAll('*')).find(el => {
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const t = (el.textContent || '').trim();
      if (t.length < 10 || t.length > 120) return false;
      if (!/[–—\-]|\bto\b/i.test(t)) return false; // must look like a range
      const years = [...t.matchAll(/20(\d{2})/g)].map(m => 2000 + parseInt(m[1], 10));
      return years.length >= 2 && Math.max(...years) - Math.min(...years) >= 1;
    });
    if (found) { rangeDetected = true; break; }
  }

  return { ok: true, clicked: (target.textContent || '').trim().slice(0, 40), rangeDetected };
}

// ── CSV export button click (runs in MAIN world) ─────────────────────────────

// Clicks the Nth visible "Export to CSV" button.  The actual file capture is
// handled at the browser level by captureDownloadedCsv() in background context.
// Must be self-contained (serialised by executeScript — no closure access).
function clickExportButton(buttonIndex) {
  function notHidden(el) {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  function isExportEl(el) {
    const t   = (el.textContent || '').trim().toLowerCase();
    const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
    const tit = (el.getAttribute('title')      || '').toLowerCase();
    return (t.includes('export') && t.includes('csv')) ||
           t === 'export' ||
           lbl.includes('export csv') || tit.includes('export csv');
  }
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'))
    .filter(notHidden).filter(isExportEl);
  if (!candidates.length || buttonIndex >= candidates.length) {
    return { ok: false, found: candidates.length, requested: buttonIndex };
  }
  candidates[buttonIndex].click();
  return { ok: true };
}

// ── download capture + content-script file read ───────────────────────────────

// ── native messaging file read ─────────────────────────────────────────────────

// Reads a local file via the native messaging host (filereader.py).
// Requires one-time setup: run tools/stats-collector/native/install-native-host.ps1
function readFileNative(filename) {
  return new Promise((resolve, reject) => {
    let port;
    try {
      port = chrome.runtime.connectNative('com.geminifoldersantigravity.filereader');
    } catch (e) {
      reject(new Error('Native host unavailable — run install-native-host.ps1 first. ' + e.message));
      return;
    }

    port.onMessage.addListener(msg => {
      port.disconnect();
      if (msg.ok) resolve(msg.content);
      else reject(new Error('Native read error: ' + msg.error));
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message ?? 'disconnected';
      reject(new Error('Native host disconnected: ' + err));
    });

    port.postMessage({ path: filename });
  });
}

// Waits for a CSV download to complete after `afterMs`, reads it via the
// native messaging host, deletes the file from disk, and resolves with the text.
function captureDownloadedCsv(afterMs, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(onChange);
      reject(new Error('CSV download timeout'));
    }, timeoutMs);

    function onChange(delta) {
      if (delta.state?.current !== 'complete') return;
      chrome.downloads.search({ id: delta.id }, async ([item]) => {
        if (!item) return;
        if (new Date(item.startTime).getTime() < afterMs) return;
        const looksLikeCsv = /\.(csv|txt)$/i.test(item.filename) ||
                             (item.mime || '').includes('csv') ||
                             (item.mime || '').includes('text/plain');
        if (!looksLikeCsv) return;

        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(onChange);

        try {
          console.log('[stats-collector] reading via native host:', item.filename, '| size:', item.fileSize);
          const text = await readFileNative(item.filename);
          console.log('[stats-collector] native read ok:', text.length, 'chars');
          chrome.downloads.removeFile(item.id, () => {});
          resolve(text);
        } catch (e) {
          reject(new Error(e.message + ' [file=' + item.filename + ']'));
        }
      });
    }

    chrome.downloads.onChanged.addListener(onChange);
  });
}

// ── tab helpers ───────────────────────────────────────────────────────────────

function waitForTabComplete(tabId, timeoutMs = 30000) {
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

async function scrapeUrl(url) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id, TAB_LOAD_MS);

    const { url: finalUrl } = await chrome.tabs.get(tab.id);
    if (LOGIN_RE.test(finalUrl)) {
      throw new Error(`Not logged in to Google — redirected to ${finalUrl}. Log in and re-run.`);
    }

    await new Promise(r => setTimeout(r, SETTLE_MS));

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: SCRAPE_FILES,
    });

    const result = results?.[0]?.result;
    if (!result) throw new Error(`No scrape result from ${url}`);
    if (result.page === 'unknown') throw new Error(`Unexpected page at ${url} (path: ${result.path})`);
    return result;
  } finally {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
  }
}

// Opens an analytics page, sets period to "Last year", then captures one CSV
// per entry in buttonIndices (0-based index into the visible "Export to CSV"
// buttons on the page).  Returns [{ok, csv}] in the same order.
// Opening the page once for multiple buttons avoids redundant tab loads.
async function scrapeUrlForCsvs(url, buttonIndices) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id, TAB_LOAD_MS);

    const { url: finalUrl } = await chrome.tabs.get(tab.id);
    if (LOGIN_RE.test(finalUrl)) {
      throw new Error(`Not logged in — redirected to ${finalUrl}. Log in and re-run.`);
    }

    await new Promise(r => setTimeout(r, SETTLE_MS));

    const presetResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN', func: clickPresetPeriod, args: ['Last year'],
    });
    const presetRes = presetResult?.[0]?.result;
    if (!presetRes?.ok) throw new Error(`Preset "Last year" not found: ${JSON.stringify(presetRes).slice(0, 200)}`);
    console.log('[stats-collector] preset clicked:', JSON.stringify(presetRes.clicked),
      '| range detected:', presetRes.rangeDetected, 'on', url.slice(url.lastIndexOf('/') + 1));

    await new Promise(r => setTimeout(r, SETTLE_MS));

    const results = [];
    for (const idx of buttonIndices) {
      // Start listening for the download BEFORE clicking so we don't miss it.
      const afterMs = Date.now();
      const downloadPromise = captureDownloadedCsv(afterMs);

      const btnResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'MAIN', func: clickExportButton, args: [idx],
      });
      const btnRes = btnResult?.[0]?.result;
      if (!btnRes?.ok) {
        downloadPromise.catch(() => {});
        results.push({ ok: false, err: new Error(`Export button not found: ${JSON.stringify(btnRes)}`) });
        continue;
      }

      try {
        const csv = await downloadPromise;
        results.push({ ok: true, csv });
      } catch (e) {
        results.push({ ok: false, err: e });
      }
    }
    return results;
  } finally {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
  }
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function splitCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseIsoDate(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // CWS exports dates as M/D/YY (e.g. "5/7/26" → "2026-05-07")
  const mdyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyy) {
    const year = 2000 + parseInt(mdyy[3], 10);
    return `${year}-${mdyy[1].padStart(2, '0')}-${mdyy[2].padStart(2, '0')}`;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseCsvNum(str) {
  const n = parseInt(String(str ?? '').replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

// Parse a CWS CSV export into [{date, installs?, uninstalls?, weekly_users?, impressions?}].
// Flexible column detection — tolerates different orderings, extra columns, and the
// leading report-title row that CWS prepends before the real header (e.g. "Installs\nDate,Installs\n...").
function parseCsvRows(csvText) {
  if (!csvText) return [];
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Skip a leading title row (single bare word/phrase with no commas that isn't a header)
  let dataStart = 0;
  let headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  if (!headers.some(h => h === 'date' || h === 'day' || h.includes('date'))) {
    dataStart = 1;
    headers = splitCsvLine(lines[1]).map(h => h.toLowerCase());
  }

  const dateCol    = headers.findIndex(h => h === 'date' || h === 'day' || h.includes('date'));
  const instCol    = headers.findIndex(h => h.includes('install') && !h.includes('uninstall'));
  const uninstCol  = headers.findIndex(h => h.includes('uninstall'));
  const usersCol   = headers.findIndex(h =>
    h.includes('active user') || h.includes('weekly active') || h.includes('weekly user') ||
    (h.includes('user') && !['country', 'language', 'os'].some(x => h.includes(x)))
  );
  const impCol     = headers.findIndex(h => h.includes('impression'));

  if (dateCol === -1) return [];

  return lines.slice(dataStart + 1).flatMap(line => {
    const v    = splitCsvLine(line);
    const date = parseIsoDate(v[dateCol]);
    if (!date) return [];
    const row = { date };
    if (instCol   !== -1 && v[instCol]   != null) row.installs     = parseCsvNum(v[instCol]);
    if (uninstCol !== -1 && v[uninstCol] != null) row.uninstalls   = parseCsvNum(v[uninstCol]);
    if (usersCol  !== -1 && v[usersCol]  != null) row.weekly_users = parseCsvNum(v[usersCol]);
    if (impCol    !== -1 && v[impCol]    != null) row.impressions  = parseCsvNum(v[impCol]);
    return [row];
  });
}

// Merge multiple [{date, …}] arrays into one, combining fields for the same date.
function mergeByDate(...arrays) {
  const map = new Map();
  for (const arr of arrays) {
    for (const row of arr) {
      if (!row?.date) continue;
      if (!map.has(row.date)) map.set(row.date, { date: row.date });
      Object.assign(map.get(row.date), row);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date < b.date ? -1 : 1);
}

// ── collection run ────────────────────────────────────────────────────────────

async function runCollection(config, token, onProgress) {
  const { publisher_id: pubId, items, github } = config;
  const today = new Date().toISOString().slice(0, 10);

  onProgress('Scraping listing page…');
  const listing = await scrapeUrl(buildUrl(`${CWS_BASE}/${pubId}`));
  const weeklyUsersById = Object.fromEntries(
    (listing.items ?? []).map(({ id, weekly_users }) => [id, weekly_users])
  );

  const commitBatch = [];

  for (const item of items) {
    const itemBase = `${CWS_BASE}/${pubId}/${item.id}`;

    onProgress(`${item.name}: installs…`);
    const installsData = await scrapeUrl(buildUrl(`${itemBase}/analytics/installs`));

    onProgress(`${item.name}: users…`);
    const usersData = await scrapeUrl(buildUrl(`${itemBase}/analytics/users`));

    onProgress(`${item.name}: impressions…`);
    let impressions = null;
    try {
      const impData = await scrapeUrl(buildUrl(`${itemBase}/analytics/impressions`));
      impressions = impData.impressions ?? null;
    } catch (e) {
      console.warn(`[stats-collector] impressions scrape failed for ${item.id}:`, e.message);
    }

    const entry = {
      collected_at:           today,
      period_start:           installsData.period_start           ?? null,
      period_end:             installsData.period_end             ?? null,
      installs:               installsData.installs               ?? null,
      uninstalls:             installsData.uninstalls             ?? null,
      weekly_users:           weeklyUsersById[item.id]            ?? null,
      impressions,
      installs_by_country:    installsData.installs_by_country    ?? null,
      installs_by_language:   installsData.installs_by_language   ?? null,
      installs_by_os:         installsData.installs_by_os         ?? null,
      uninstalls_by_country:  installsData.uninstalls_by_country  ?? null,
      uninstalls_by_language: installsData.uninstalls_by_language ?? null,
      uninstalls_by_os:       installsData.uninstalls_by_os       ?? null,
      users_by_country:       usersData.users_by_country          ?? null,
      users_by_language:      usersData.users_by_language         ?? null,
      users_by_os:            usersData.users_by_os               ?? null,
      active_versions:        usersData.active_versions           ?? null,
    };

    // ── daily CSV export ──────────────────────────────────────────────────────
    // Button indices (0-based) per analytics page:
    //   analytics/installs  : 0 = installs, 4 = uninstalls
    //   analytics/users     : 0 = weekly active users
    //   analytics/impressions: 4 = CWS store impressions
    onProgress(`${item.name}: fetching daily CSV data…`);
    const csvArrays = [];
    for (const src of [
      { label: 'installs/uninstalls', url: buildUrl(`${itemBase}/analytics/installs`),   buttons: [0, 4] },
      { label: 'users',               url: buildUrl(`${itemBase}/analytics/users`),       buttons: [0]    },
      { label: 'impressions',         url: buildUrl(`${itemBase}/analytics/impressions`), buttons: [4]    },
    ]) {
      try {
        onProgress(`  ${src.label} CSV…`);
        const results = await scrapeUrlForCsvs(src.url, src.buttons);
        for (const res of results) {
          if (!res.ok) {
            const btns = res.err?.diagnostic?.btnTexts;
            if (btns?.length) {
              onProgress(`  export button not found. Visible elements:`);
              for (const b of btns) {
                const parts = [`[${b.tag}]`];
                if (b.text)  parts.push(`"${b.text}"`);
                if (b.label) parts.push(`lbl:"${b.label}"`);
                if (b.title) parts.push(`title:"${b.title}"`);
                onProgress(`    ${parts.join(' ')}`);
              }
            } else {
              onProgress(`  ${src.label} CSV: ${res.err?.message?.slice(0, 200)}`);
            }
          } else {
            const rows = parseCsvRows(res.csv);
            onProgress(`  ${src.label}: ${rows.length} rows`);
            csvArrays.push(rows);
          }
        }
      } catch (e) {
        onProgress(`  ${src.label} CSV: failed — ${e.message.slice(0, 200)}`);
      }
    }
    const dailyRows = csvArrays.length ? mergeByDate(...csvArrays) : [];
    if (dailyRows.length) onProgress(`  merged: ${dailyRows.length} daily rows`);

    commitBatch.push({ itemId: item.id, name: item.name, entry, dailyRows });
  }

  // ── single commit for all extensions ─────────────────────────────────────
  onProgress('Committing all extensions…');
  const commitResults = await commitAllCwsEntries(token, github, commitBatch);
  for (const { itemId, committed, reason, dailyAdded } of commitResults) {
    const item = items.find(i => i.id === itemId);
    const dailySuffix = dailyAdded ? ` +${dailyAdded} daily` : '';
    onProgress(`${item?.name ?? itemId}: ${committed ? `committed ✓${dailySuffix}` : `skipped (${reason})`}`);
  }
}

// ── message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'START_COLLECTION') return;

  const { config, token } = msg;
  (async () => {
    try {
      const progress = status =>
        chrome.runtime.sendMessage({ type: 'PROGRESS', status }).catch(() => {});
      await runCollection(config, token, progress);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
