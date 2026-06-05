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
// Must be self-contained (serialised by executeScript — no closure access).
// Returns {ok:true, clicked} or {ok:false, step, candidates, label}.
async function clickPresetPeriod(label) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const normalized = label.trim().toLowerCase();

  const allCandidates = Array.from(
    document.querySelectorAll('[role="tab"], [role="option"], button, [role="button"]')
  ).filter(el => el.offsetParent !== null);

  const target = allCandidates.find(el => {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    return text === normalized || text.includes(normalized);
  });

  if (!target) {
    return {
      ok: false,
      step: 'find-preset-tab',
      label,
      candidates: allCandidates.slice(0, 30).map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        text: (el.innerText || el.textContent || '').trim().slice(0, 40),
      })),
    };
  }

  target.click();
  await sleep(2000);
  return { ok: true, clicked: (target.innerText || target.textContent || '').trim() };
}

// ── SVG time-series extraction (runs in MAIN world) ───────────────────────────

// Extracts a time-series from the rendered CWS analytics SVG chart.
// Uses pixel coordinate math: bar top-y → value via y-axis label scale.
// Must be self-contained (serialised by executeScript — no closure access).
// Returns {ok:true, entries:[{label,value}]} or {ok:false, step, ...diagnostics}.
function extractTimeSeriesFromSVG() {
  const DATE_RE       = /^[A-Za-zÀ-ÿ]+ \d{1,2}(, \d{4})?$/;
  const MONTH_YEAR_RE = /^[A-Za-zÀ-ÿ]+ \d{4}$/;

  // Find all large, visible SVGs and pick the one with date-like x-axis labels.
  const allSvgs = Array.from(document.querySelectorAll('svg')).filter(svg => {
    if (!svg.offsetParent) return false;
    const r = svg.getBoundingClientRect();
    return r.width > 100 && r.height > 50;
  });

  const tsSvg = allSvgs.find(svg =>
    Array.from(svg.querySelectorAll('text')).some(t => {
      const v = t.textContent.trim();
      return DATE_RE.test(v) || MONTH_YEAR_RE.test(v);
    })
  );

  if (!tsSvg) {
    return {
      ok: false, step: 'no-ts-svg',
      svgCount: allSvgs.length,
      svgTexts: allSvgs.map(s => ({
        dims: `${Math.round(s.getBoundingClientRect().width)}x${Math.round(s.getBoundingClientRect().height)}`,
        texts: Array.from(s.querySelectorAll('text')).map(t => t.textContent.trim()).slice(0, 8),
      })),
    };
  }

  // Collect all visible text nodes with pixel centres.
  const textEls = Array.from(tsSvg.querySelectorAll('text'))
    .map(t => {
      const r = t.getBoundingClientRect();
      return { text: t.textContent.trim(), cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    })
    .filter(t => t.text && t.cx > 0);

  const xLabels = textEls.filter(({ text }) => DATE_RE.test(text) || MONTH_YEAR_RE.test(text));
  const yLabels = textEls
    .filter(({ text }) => /^\d[\d,]*$/.test(text))
    .map(({ text, cy }) => ({ value: parseInt(text.replace(/,/g, ''), 10), cy }))
    .filter(({ value }) => !isNaN(value));

  if (xLabels.length < 2) {
    return { ok: false, step: 'no-x-labels', xCount: xLabels.length, texts: textEls.map(t => t.text).slice(0, 30) };
  }
  if (yLabels.length < 2) {
    return { ok: false, step: 'no-y-labels', yCount: yLabels.length, texts: textEls.map(t => t.text).slice(0, 30) };
  }

  // Build y-axis pixel→value scale.
  // Lower cy = higher on screen = higher data value.
  yLabels.sort((a, b) => a.cy - b.cy);
  const yTop = yLabels[0];
  const yBot = yLabels[yLabels.length - 1];

  function pixelToValue(py) {
    if (yTop.cy === yBot.cy) return yTop.value;
    const t = (py - yTop.cy) / (yBot.cy - yTop.cy);
    return Math.round(yTop.value + t * (yBot.value - yTop.value));
  }

  // Find bar rects (height > 3px, width > 2px).
  const rects = Array.from(tsSvg.querySelectorAll('rect'))
    .map(r => r.getBoundingClientRect())
    .filter(box => box.height > 3 && box.width > 2);

  if (rects.length < 2) {
    return { ok: false, step: 'no-bars', rectCount: rects.length };
  }

  // Assign each bar to its nearest x-label (by centre-x distance).
  xLabels.sort((a, b) => a.cx - b.cx);
  const buckets = xLabels.map(l => ({ label: l.text, cx: l.cx, bars: [] }));

  for (const box of rects) {
    const barCx = box.left + box.width / 2;
    let best = buckets[0], bestDist = Math.abs(barCx - buckets[0].cx);
    for (const b of buckets) {
      const d = Math.abs(barCx - b.cx);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    best.bars.push(box);
  }

  // For each x-label bucket, the bar with the lowest top-y (= tallest bar) is
  // the primary series (installs on the installs page).
  const entries = buckets
    .filter(b => b.bars.length > 0)
    .map(b => {
      const topBar = b.bars.reduce((best, box) => box.top < best.top ? box : best);
      return { label: b.label, value: Math.max(0, pixelToValue(topBar.top)) };
    });

  if (!entries.length) {
    return { ok: false, step: 'no-entries', buckets: buckets.map(b => ({ label: b.label, barCount: b.bars.length })) };
  }

  return { ok: true, entries };
}

// ── label → ISO range ─────────────────────────────────────────────────────────

// Converts an SVG x-axis label ("Jan 2022", "January 2022") to
// {period_start, period_end} ISO strings, or null if unrecognised.
function parseLabelToRange(label) {
  const MONTHS = {
    january:0, february:1, march:2, april:3, may:4, june:5,
    july:6, august:7, september:8, october:9, november:10, december:11,
    jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
  };
  const m = label.trim().match(/^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/);
  if (!m) return null;
  const monthIdx = MONTHS[m[1].toLowerCase()];
  if (monthIdx === undefined) return null;
  const year = parseInt(m[2], 10);
  const start = new Date(Date.UTC(year, monthIdx, 1));
  const end   = new Date(Date.UTC(year, monthIdx + 1, 0));
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end:   end.toISOString().slice(0, 10),
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

// Opens url, clicks the named preset period tab, waits for chart re-render,
// then extracts the time-series via SVG coordinate math.
// Returns [{label, value}] (primary metric for the page).
async function scrapeTimeSeries(url, presetLabel) {
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
      target: { tabId: tab.id },
      world: 'MAIN',
      func: clickPresetPeriod,
      args: [presetLabel],
    });
    const clickRes = clickResult?.[0]?.result;
    if (!clickRes?.ok) {
      throw new Error(`Preset "${presetLabel}" not found: ${JSON.stringify(clickRes)}`);
    }

    // Extra settle after preset click — chart re-fetches data from the server.
    await new Promise(r => setTimeout(r, SETTLE_MS));

    const extractResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: extractTimeSeriesFromSVG,
    });
    const extractRes = extractResult?.[0]?.result;
    if (!extractRes?.ok) {
      throw new Error(`SVG extraction failed at "${extractRes?.step}": ${JSON.stringify(extractRes)}`);
    }

    return extractRes.entries;
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

// Reads the CWS analytics time-series chart using the longest available preset
// period, then commits approximate monthly entries into cws.json.
// Installs values are derived from SVG bar heights (coordinate-math approximation).
// Breakdowns and weekly_users are not available historically; those fields are null.
async function runBackfill(config, token, onProgress) {
  const { publisher_id: pubId, items, github } = config;
  const today = new Date().toISOString().slice(0, 10);
  const PRESETS = ['5 years', 'Last year', '1 year'];

  for (const item of items) {
    const itemBase = `${CWS_BASE}/${pubId}/${item.id}`;
    let entries = null;
    let usedPreset = null;

    onProgress(`${item.name}: reading installs history…`);
    for (const preset of PRESETS) {
      try {
        entries = await scrapeTimeSeries(buildUrl(`${itemBase}/analytics/installs`), preset);
        usedPreset = preset;
        break;
      } catch (e) {
        onProgress(`  preset "${preset}" failed — ${e.message.slice(0, 80)}`);
      }
    }

    if (!entries?.length) {
      onProgress(`${item.name}: no chart data found — skipping.`);
      continue;
    }

    onProgress(`${item.name}: ${entries.length} data points from "${usedPreset}"`);

    let committed = 0, skipped = 0;
    for (const { label, value } of entries) {
      const range = parseLabelToRange(label);
      if (!range) {
        onProgress(`  skipping unrecognised label: "${label}"`);
        continue;
      }

      const entry = {
        collected_at:           today,
        period_start:           range.period_start,
        period_end:             range.period_end,
        installs:               value,
        uninstalls:             null,
        weekly_users:           null,
        impressions:            null,
        installs_by_country:    null,
        installs_by_language:   null,
        installs_by_os:         null,
        uninstalls_by_country:  null,
        uninstalls_by_language: null,
        uninstalls_by_os:       null,
        users_by_country:       null,
        users_by_language:      null,
        users_by_os:            null,
        active_versions:        null,
      };

      const result = await commitCwsEntry(token, github, item.id, entry);
      if (result.committed) committed++; else skipped++;
    }

    onProgress(`${item.name}: ${committed} new, ${skipped} already recorded ✓`);
  }

  onProgress('Back-fill complete ✓');
}

// ── message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'START_COLLECTION' && msg.type !== 'START_BACKFILL') return;

  const { config, token } = msg;
  (async () => {
    try {
      const progress = status =>
        chrome.runtime.sendMessage({ type: 'PROGRESS', status }).catch(() => {});

      if (msg.type === 'START_BACKFILL') {
        await runBackfill(config, token, progress);
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
