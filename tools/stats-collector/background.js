// Orchestrates the monthly collection run.
// lib/github.js is loaded first (see manifest background.scripts), so
// commitCwsEntry is available as a global here.

const SETTLE_MS  = 3500;
const LOGIN_RE   = /accounts\.google|google\.com\/ServiceLogin|SignIn/i;
const SCRAPE_FILES = ['lib/selectors.js', 'lib/normalize.js', 'content/scrape.js'];
const CWS_BASE   = 'https://chrome.google.com/webstore/devconsole';

// ── URL helpers ───────────────────────────────────────────────────────────────

// Always injects hl=en; additional params (e.g. startDate/endDate) are merged in.
function buildUrl(base, extra = {}) {
  const params = { hl: 'en', ...extra };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}?${qs}`;
}

function isoToDayIndex(iso) {
  return Math.floor(new Date(iso + 'T00:00:00Z').getTime() / 864e5);
}

// Returns the last n complete calendar months as [{period_start, period_end}],
// oldest first.
function monthRanges(n) {
  const ranges = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() - 1; // last complete month (0-indexed)
  if (m < 0) { m = 11; y--; }
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.UTC(y, m, 1));
    const end   = new Date(Date.UTC(y, m + 1, 0)); // last day of month
    ranges.unshift({
      period_start: start.toISOString().slice(0, 10),
      period_end:   end.toISOString().slice(0, 10),
    });
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return ranges;
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

  onProgress('Scraping listing page…');
  const listing = await scrapeUrl(buildUrl(`${CWS_BASE}/${pubId}`));
  const weeklyUsersById = Object.fromEntries(
    (listing.items ?? []).map(({ id, weekly_users }) => [id, weekly_users])
  );

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

    onProgress(`${item.name}: committing…`);
    const { committed, reason } = await commitCwsEntry(token, github, item.id, entry);
    onProgress(`${item.name}: ${committed ? 'committed ✓' : `skipped (${reason})`}`);
  }
}

// ── back-fill run ─────────────────────────────────────────────────────────────

async function runBackfill(config, token, onProgress, months = 12) {
  const { publisher_id: pubId, items, github } = config;
  const today = new Date().toISOString().slice(0, 10);
  const ranges = monthRanges(months);

  for (const { period_start, period_end } of ranges) {
    const dateParams = {
      startDate: isoToDayIndex(period_start),
      endDate:   isoToDayIndex(period_end),
    };

    onProgress(`── ${period_start} → ${period_end}`);

    for (const item of items) {
      const itemBase = `${CWS_BASE}/${pubId}/${item.id}`;

      onProgress(`  ${item.name}: installs…`);
      const installsData = await scrapeUrl(
        buildUrl(`${itemBase}/analytics/installs`, dateParams)
      );

      // Verify the page actually loaded the requested date range.
      if (installsData.period_start && installsData.period_start !== period_start) {
        throw new Error(
          `Date-range params not respected for ${period_start}: ` +
          `page returned ${installsData.period_start}–${installsData.period_end}. ` +
          `CWS may not support URL date params — please file an issue.`
        );
      }

      onProgress(`  ${item.name}: users…`);
      const usersData = await scrapeUrl(
        buildUrl(`${itemBase}/analytics/users`, dateParams)
      );

      let impressions = null;
      try {
        onProgress(`  ${item.name}: impressions…`);
        const impData = await scrapeUrl(
          buildUrl(`${itemBase}/analytics/impressions`, dateParams)
        );
        impressions = impData.impressions ?? null;
      } catch (e) {
        console.warn(`[stats-collector] impressions backfill failed for ${item.id}:`, e.message);
      }

      const entry = {
        collected_at:           today,
        period_start,
        period_end,
        installs:               installsData.installs               ?? null,
        uninstalls:             installsData.uninstalls             ?? null,
        weekly_users:           null, // point-in-time metric, not meaningful historically
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

      onProgress(`  ${item.name}: committing…`);
      const { committed, reason } = await commitCwsEntry(token, github, item.id, entry);
      onProgress(`  ${item.name}: ${committed ? 'committed ✓' : `skipped (${reason})`}`);
    }
  }

  onProgress('Back-fill complete ✓');
}

// ── message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'START_COLLECTION' && msg.type !== 'START_BACKFILL') return;

  const { config, token, months } = msg;
  (async () => {
    try {
      const progress = status =>
        chrome.runtime.sendMessage({ type: 'PROGRESS', status }).catch(() => {});

      if (msg.type === 'START_BACKFILL') {
        await runBackfill(config, token, progress, months ?? 12);
      } else {
        await runCollection(config, token, progress);
      }
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
