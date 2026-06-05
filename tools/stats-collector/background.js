// Orchestrates the monthly collection run.
// lib/github.js is loaded first (see manifest background.scripts), so
// commitCwsEntry is available as a global here.

const SETTLE_MS = 3500;
const LOGIN_RE = /accounts\.google|google\.com\/ServiceLogin|SignIn/i;
const SCRAPE_FILES = ['lib/selectors.js', 'lib/normalize.js', 'content/scrape.js'];

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
    await waitForTabComplete(tab.id);

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

// ── collection run ────────────────────────────────────────────────────────────

async function runCollection(config, token, onProgress) {
  const { publisher_id: pubId, items, github } = config;
  const today = new Date().toISOString().slice(0, 10);
  const base = `https://chrome.google.com/webstore/devconsole/${pubId}`;

  onProgress('Scraping listing page…');
  const listing = await scrapeUrl(base);
  const weeklyUsersById = Object.fromEntries(
    (listing.items ?? []).map(({ id, weekly_users }) => [id, weekly_users])
  );

  for (const item of items) {
    const itemBase = `${base}/${item.id}`;

    onProgress(`${item.name}: installs…`);
    const installsData = await scrapeUrl(`${itemBase}/analytics/installs`);

    onProgress(`${item.name}: users…`);
    const usersData = await scrapeUrl(`${itemBase}/analytics/users`);

    onProgress(`${item.name}: impressions…`);
    let impressions = null;
    try {
      const impData = await scrapeUrl(`${itemBase}/analytics/impressions`);
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

    onProgress(`${item.name}: committing…`);
    const { committed, reason } = await commitCwsEntry(token, github, item.id, entry);
    onProgress(`${item.name}: ${committed ? 'committed ✓' : `skipped (${reason})`}`);
  }
}

// ── message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'START_COLLECTION') return;

  const { config, token } = msg;
  (async () => {
    try {
      await runCollection(config, token, status =>
        chrome.runtime.sendMessage({ type: 'PROGRESS', status }).catch(() => {})
      );
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
