// Orchestrates the monthly collection run.
// lib/github.js is loaded first (see manifest background.scripts), so
// commitCwsEntry is available as a global here.

const SETTLE_MS    = 3500;
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
  await sleep(2500);
  return { ok: true, clicked: (target.textContent || '').trim().slice(0, 40) };
}

// ── CSV capture (runs in MAIN world) ─────────────────────────────────────────

// Clicks the Nth visible "Export to CSV" button on an analytics page and
// returns the raw CSV text without saving it to disk.
// Three interception strategies run in parallel:
//   1. window.fetch() patch — captures the response body before the browser sees it
//   2. URL.createObjectURL patch — reads blob content via FileReader
//   3. HTMLAnchorElement.prototype.click patch — suppresses the actual file download
//      so the file never lands in the user's downloads folder
// Must be self-contained (serialised by executeScript — no closure access).
async function captureAnalyticsCsv(buttonIndex) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function notHidden(el) {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function isExportEl(el) {
    const t     = (el.textContent       || '').trim().toLowerCase();
    const lbl   = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title')      || '').toLowerCase();
    return (t.includes('export') && t.includes('csv')) ||
           (t.includes('download') && t.includes('csv')) ||
           t === 'export' || t === 'download' ||
           lbl.includes('export') || lbl.includes('download') ||
           title.includes('export') || title.includes('download') ||
           lbl.includes('csv') || title.includes('csv');
  }

  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], [role="menuitem"]'))
    .filter(notHidden).filter(isExportEl);

  if (!candidates.length || buttonIndex >= candidates.length) {
    const btnTexts = Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], a[href]'))
      .filter(notHidden).slice(0, 40)
      .map(el => ({
        tag: el.tagName,
        text: (el.textContent || '').trim().slice(0, 50),
        label: (el.getAttribute('aria-label') || '').slice(0, 50),
        title: (el.getAttribute('title') || '').slice(0, 50),
      }));
    return { ok: false, step: 'no-export-element', found: candidates.length, requested: buttonIndex, btnTexts };
  }

  const btn = candidates[buttonIndex];

  // Pattern 1: direct anchor — fetch directly, no download triggered
  if (btn.tagName === 'A' && btn.href && !btn.href.startsWith('javascript:')) {
    try {
      const r = await fetch(btn.href, { credentials: 'include' });
      if (!r.ok) return { ok: false, step: 'link-fetch-failed', status: r.status };
      return { ok: true, csv: await r.text() };
    } catch (e) {
      return { ok: false, step: 'link-fetch-error', message: e.message };
    }
  }

  // Patterns 2 & 3: button — intercept network + suppress file download
  let captured = null;

  // Strategy A: intercept fetch (captures response before browser processes it)
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    const p = origFetch.apply(this, args);
    p.then(r => {
      if (!captured) {
        const ct = (r.headers.get('content-type')        || '').toLowerCase();
        const cd = (r.headers.get('content-disposition') || '').toLowerCase();
        if (ct.includes('csv') || ct.includes('text/plain') || ct.includes('octet-stream') || cd.includes('attachment')) {
          r.clone().text().then(t => { if (t && !captured) captured = t; }).catch(() => {});
        }
      }
    }).catch(() => {});
    return p;
  };

  // Strategy B: intercept blob creation (fallback if fetch isn't used)
  const origCOBU = URL.createObjectURL;
  URL.createObjectURL = function(obj) {
    if (obj instanceof Blob && !captured) {
      const reader = new FileReader();
      reader.onload = e => { if (!captured) captured = e.target.result; };
      reader.readAsText(obj);
    }
    return origCOBU.call(URL, obj);
  };

  // Strategy C: suppress anchor downloads so the file never lands on disk
  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (this.hasAttribute('download') || (this.href && this.href.startsWith('blob:'))) return;
    return origAnchorClick.call(this);
  };

  btn.click();

  for (let i = 0; i < 75; i++) {
    await sleep(200);
    if (captured !== null) break;
  }

  window.fetch = origFetch;
  URL.createObjectURL = origCOBU;
  HTMLAnchorElement.prototype.click = origAnchorClick;

  if (!captured) return { ok: false, step: 'no-csv-received' };
  return { ok: true, csv: captured };
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

// Opens an analytics page, sets period to "Last year", then captures one CSV
// per entry in buttonIndices (0-based index into the visible "Export to CSV"
// buttons on the page).  Returns [{ok, csv, diagnostic}] in the same order.
// Opening the page once for multiple buttons avoids redundant tab loads.
async function scrapeUrlForCsvs(url, buttonIndices) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id);

    const { url: finalUrl } = await chrome.tabs.get(tab.id);
    if (LOGIN_RE.test(finalUrl)) {
      throw new Error(`Not logged in — redirected to ${finalUrl}. Log in and re-run.`);
    }

    await new Promise(r => setTimeout(r, SETTLE_MS));

    const clickResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN', func: clickPresetPeriod, args: ['Last year'],
    });
    const clickRes = clickResult?.[0]?.result;
    if (!clickRes?.ok) throw new Error(`Preset "Last year" not found: ${JSON.stringify(clickRes).slice(0, 200)}`);

    await new Promise(r => setTimeout(r, SETTLE_MS));

    const results = [];
    for (const idx of buttonIndices) {
      const csvResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'MAIN', func: captureAnalyticsCsv, args: [idx],
      });
      const csvRes = csvResult?.[0]?.result;
      if (!csvRes?.ok) {
        const err = new Error(`CSV capture failed: step=${csvRes?.step ?? 'unknown'}`);
        err.diagnostic = csvRes;
        results.push({ ok: false, err });
      } else {
        results.push({ ok: true, csv: csvRes.csv });
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
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseCsvNum(str) {
  const n = parseInt(String(str ?? '').replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

// Parse a CWS CSV export into [{date, installs?, uninstalls?, weekly_users?, impressions?}].
// Flexible column detection — tolerates different orderings and extra columns.
function parseCsvRows(csvText) {
  if (!csvText) return [];
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());

  const dateCol    = headers.findIndex(h => h === 'date' || h === 'day' || h.includes('date'));
  const instCol    = headers.findIndex(h => h.includes('install') && !h.includes('uninstall'));
  const uninstCol  = headers.findIndex(h => h.includes('uninstall'));
  const usersCol   = headers.findIndex(h =>
    h.includes('active user') || h.includes('weekly active') || h.includes('weekly user') ||
    (h.includes('user') && !['country', 'language', 'os'].some(x => h.includes(x)))
  );
  const impCol     = headers.findIndex(h => h.includes('impression'));

  if (dateCol === -1) return [];

  return lines.slice(1).flatMap(line => {
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

    onProgress(`${item.name}: committing…`);
    const { committed, reason, dailyAdded } = await commitCwsEntry(token, github, item.id, entry, dailyRows);
    const dailySuffix = dailyAdded ? ` +${dailyAdded} daily` : '';
    onProgress(`${item.name}: ${committed ? `committed ✓${dailySuffix}` : `skipped (${reason})`}`);
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
