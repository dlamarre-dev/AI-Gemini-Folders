// Orchestrates the monthly collection run.
// lib/github.js is loaded first (see manifest background.scripts), so
// commitCwsEntry is available as a global here.

const SETTLE_MS  = 3500;
const LOGIN_RE   = /accounts\.google|google\.com\/ServiceLogin|SignIn/i;
const SCRAPE_FILES = ['lib/selectors.js', 'lib/normalize.js', 'content/scrape.js'];
const CWS_BASE   = 'https://chrome.google.com/webstore/devconsole';

// ── URL helper ────────────────────────────────────────────────────────────────

function buildUrl(base, extra = {}) {
  const params = { hl: 'en', ...extra };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}?${qs}`;
}

// ── date helpers ──────────────────────────────────────────────────────────────

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
    const end   = new Date(Date.UTC(y, m + 1, 0));
    ranges.unshift({
      period_start: start.toISOString().slice(0, 10),
      period_end:   end.toISOString().slice(0, 10),
    });
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return ranges;
}

// ── date-picker interaction (runs in MAIN world) ──────────────────────────────

// Injected into the CWS analytics page via executeScript {world:'MAIN'}.
// Finds the date range picker, navigates the calendar grid, clicks the right
// days, and confirms. Returns {ok:true} or {ok:false, step, ...diagnostics}.
async function setDateRangeInPage(startISO, endISO) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DATE_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;

  // Parse "2026-02-01" → {y,m,d}
  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d };
  }

  // ── 1. Find the date-range trigger ──────────────────────────────────────────
  const trigger = Array.from(
    document.querySelectorAll('[role="button"], button, [jsaction]')
  ).find(el => DATE_RE.test(el.innerText));

  if (!trigger) {
    return {
      ok: false, step: 'find-trigger',
      buttons: Array.from(document.querySelectorAll('[role="button"], button'))
        .slice(0, 15)
        .map(el => ({ text: el.innerText?.trim().slice(0, 60), cls: el.className.slice(0, 80) })),
    };
  }

  // ── 2. Open the picker ───────────────────────────────────────────────────────
  trigger.click();
  await sleep(1000);

  // ── 3. Find the calendar month header anywhere in the document ──────────────
  // No container guess — walk the whole document and find the exact element
  // whose text is "MonthName YYYY" (the calendar header, not the trigger).
  function getShownYM() {
    for (const el of document.querySelectorAll('*')) {
      if (!el.offsetParent) continue;          // not visible
      if (el.closest('svg')) continue;         // skip SVG text nodes
      if (el.childElementCount > 2) continue;  // skip large containers
      const txt = el.innerText?.trim();
      if (!txt) continue;
      const m = txt.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)$/i);
      if (m) {
        const mi = MONTH_NAMES.findIndex(n => n.toLowerCase() === m[1].toLowerCase());
        return { y: +m[2], m: mi + 1, el };
      }
    }
    return null;
  }

  // Walk up from the month-header element until an ancestor also contains
  // the navigation buttons or day cells we need.
  function calArea(headerEl, selector) {
    let el = headerEl;
    for (let i = 0; i < 8; i++) {
      if (!el.parentElement) break;
      el = el.parentElement;
      if (el.querySelector(selector)) return el;
    }
    return document;
  }

  function getNavButtons(headerEl) {
    const area = calArea(headerEl, '[role="button"], button');
    const btns = Array.from(area.querySelectorAll('[role="button"], button'))
      .filter(b => b.offsetParent !== null && b !== headerEl);
    const prev = btns.find(b =>
      /prev|previous|back/i.test(b.getAttribute('aria-label') || '') ||
      /chevron_left|arrow_back|keyboard_arrow_left/i.test(b.innerHTML)
    );
    const next = btns.find(b =>
      /next|forward/i.test(b.getAttribute('aria-label') || '') ||
      /chevron_right|arrow_forward|keyboard_arrow_right/i.test(b.innerHTML)
    );
    return { prev, next, area };
  }

  function clickDay(headerEl, dayNum) {
    const area = calArea(headerEl, '[role="gridcell"], td');
    const cells = Array.from(area.querySelectorAll('[role="gridcell"], [role="button"], td'))
      .filter(c => c.offsetParent !== null);
    const cell = cells.find(c => c.innerText?.trim() === String(dayNum));
    if (!cell) return { ok: false, cells: cells.map(c => c.innerText?.trim()).slice(0, 42) };
    cell.click();
    return { ok: true };
  }

  async function navigateTo(targetY, targetM) {
    let shown = getShownYM();
    if (!shown) {
      // Dump what visible buttons/text exists to diagnose
      const visButtons = Array.from(document.querySelectorAll('[role="button"], button'))
        .filter(b => b.offsetParent !== null)
        .slice(0, 20).map(b => ({ text: b.innerText?.trim().slice(0, 40), aria: b.getAttribute('aria-label'), cls: b.className.slice(0,60) }));
      return { ok: false, step: 'find-header', visButtons };
    }

    let attempts = 0;
    while ((shown.y !== targetY || shown.m !== targetM) && attempts < 24) {
      const monthsAway = (targetY - shown.y) * 12 + (targetM - shown.m);
      const { prev, next } = getNavButtons(shown.el);
      if (monthsAway < 0) {
        if (!prev) return { ok: false, step: 'no-prev-btn',
          shownYM: `${shown.y}-${shown.m}`, targetYM: `${targetY}-${targetM}` };
        prev.click();
      } else {
        if (!next) return { ok: false, step: 'no-next-btn',
          shownYM: `${shown.y}-${shown.m}`, targetYM: `${targetY}-${targetM}` };
        next.click();
      }
      await sleep(400);
      shown = getShownYM();
      attempts++;
    }
    if (!shown || shown.y !== targetY || shown.m !== targetM) {
      return { ok: false, step: 'nav-timeout',
        shownYM: shown ? `${shown.y}-${shown.m}` : 'unknown',
        targetYM: `${targetY}-${targetM}` };
    }
    return null; // success — returns shown for use by caller
  }

  const start = parseISO(startISO);
  const end   = parseISO(endISO);

  // ── 4. Navigate to start month & click start day ─────────────────────────────
  let navErr = await navigateTo(start.y, start.m);
  if (navErr) return navErr;

  let shown = getShownYM();
  const startClick = clickDay(shown.el, start.d);
  if (!startClick.ok) return { ok: false, step: 'click-start-day', day: start.d, ...startClick };
  await sleep(400);

  // ── 5. Navigate to end month (may be same) & click end day ──────────────────
  navErr = await navigateTo(end.y, end.m);
  if (navErr) return navErr;

  shown = getShownYM();
  const endClick = clickDay(shown.el, end.d);
  if (!endClick.ok) return { ok: false, step: 'click-end-day', day: end.d, ...endClick };
  await sleep(400);

  // ── 6. Click Apply / Update ──────────────────────────────────────────────────
  const applyBtn = Array.from(
    container.querySelectorAll('[role="button"], button')
  ).find(el => /\b(apply|update|ok|done)\b/i.test(el.innerText));

  if (applyBtn) {
    applyBtn.click();
  }
  // (some pickers auto-close after range selection; clicking Apply may be optional)

  // ── 7. Poll for trigger text update ─────────────────────────────────────────
  const wantStart = MONTH_NAMES[start.m - 1].slice(0, 3); // e.g. "Feb"
  const wantEnd   = MONTH_NAMES[end.m - 1].slice(0, 3);
  for (let i = 0; i < 14; i++) {
    await sleep(500);
    const txt = trigger.innerText || '';
    if (txt.includes(wantStart) && String(start.d) && txt.includes(wantEnd)) {
      return { ok: true };
    }
  }

  return {
    ok: false, step: 'verify',
    triggerText: trigger.innerText?.trim().slice(0, 120),
    wantedStart: `${wantStart} ${start.d}`, wantedEnd: `${wantEnd} ${end.d}`,
  };
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

// dateRange: null for a regular scrape, or {start, end} to change the picker first.
async function scrapeUrl(url, dateRange = null) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id);

    const { url: finalUrl } = await chrome.tabs.get(tab.id);
    if (LOGIN_RE.test(finalUrl)) {
      throw new Error(`Not logged in to Google — redirected to ${finalUrl}. Log in and re-run.`);
    }

    await new Promise(r => setTimeout(r, SETTLE_MS));

    if (dateRange) {
      const dr = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: setDateRangeInPage,
        args: [dateRange.start, dateRange.end],
      });
      const res = dr?.[0]?.result;
      if (!res?.ok) {
        throw new Error(
          `Date picker failed at step "${res?.step ?? '?'}": ` +
          JSON.stringify(res, null, 2)
        );
      }
      // setDateRangeInPage already polls up to 6 s for re-render; no extra sleep.
    }

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
    onProgress(`── ${period_start} → ${period_end}`);

    for (const item of items) {
      const itemBase = `${CWS_BASE}/${pubId}/${item.id}`;
      const dr = { start: period_start, end: period_end };

      onProgress(`  ${item.name}: installs…`);
      const installsData = await scrapeUrl(buildUrl(`${itemBase}/analytics/installs`), dr);

      onProgress(`  ${item.name}: users…`);
      const usersData = await scrapeUrl(buildUrl(`${itemBase}/analytics/users`), dr);

      let impressions = null;
      try {
        onProgress(`  ${item.name}: impressions…`);
        const impData = await scrapeUrl(buildUrl(`${itemBase}/analytics/impressions`), dr);
        impressions = impData.impressions ?? null;
      } catch (e) {
        console.warn(`[stats-collector] impressions backfill failed for ${item.id}:`, e.message);
      }

      // Use the requested period dates directly — parseDateRange reflects the
      // initial page load, not the UI-updated range.
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
