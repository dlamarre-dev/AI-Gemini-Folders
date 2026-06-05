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
// Two-step: tries direct match first, then opens the date-range trigger in
// case presets only appear inside a dropdown.
// Must be self-contained (serialised by executeScript — no closure access).
// Returns {ok:true, clicked} or {ok:false, step, hints, label}.
async function clickPresetPeriod(label) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const normalized = label.trim().toLowerCase();

  // Scroll to bring the chart area into layout range — inactive (background)
  // tabs don't compute layout for off-screen elements, so getBoundingClientRect
  // returns 0,0 for anything below the fold. A scroll forces the layout engine
  // to resolve element positions.
  window.scrollTo(0, 800);
  await sleep(400);

  function notHidden(el) {
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function findByText(candidates) {
    // Prefer leaf-ish elements (childElementCount ≤ 3) whose text closely
    // matches the label; fall back to any element containing it.
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

  // Pass 1: search every visible element for the label text.
  let target = findByText(allEls());

  // Pass 2: if not found, try clicking the current date-range display first
  // (presets may live inside a dropdown that isn't open yet).
  if (!target) {
    const RANGE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{1,40}\bto\b/i;
    const trigger = allEls()
      .filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('jsaction'))
      .find(el => RANGE_RE.test(el.textContent || '') || /last\s+\d+\s+days/i.test(el.textContent || ''));
    if (trigger) {
      trigger.click();
      await sleep(1200);
    }
    target = findByText(allEls());
  }

  if (!target) {
    // Diagnostic: show page text and any date-count-related elements.
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

// ── SVG time-series extraction (runs in MAIN world) ──────────────────────────
// NOTE: The CWS analytics time-series chart is canvas-based (0 SVG text nodes).
// This function is kept for reference but is no longer called.
// Back-fill uses scrapeUrlWithPreset instead.

function extractTimeSeriesFromSVG() {
  const DATE_RE       = /^[A-Za-zÀ-ÿ]+ \d{1,2}(, \d{4})?$/;
  const MONTH_YEAR_RE = /^[A-Za-zÀ-ÿ]+ \d{4}$/;

  // No visibility filter — getBoundingClientRect is unreliable in inactive tabs.
  // Identify the time-series SVG by the presence of date-like x-axis labels.
  const allSvgs = Array.from(document.querySelectorAll('svg'));

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
      svgSamples: allSvgs.slice(0, 6).map(s => ({
        textCount: s.querySelectorAll('text').length,
        texts: Array.from(s.querySelectorAll('text')).map(t => t.textContent.trim()).slice(0, 6),
      })),
    };
  }

  // Accumulate translate(dx, dy) transforms walking up to the SVG root.
  function getTranslate(el) {
    let dx = 0, dy = 0;
    let node = el.parentElement;
    while (node && node !== tsSvg) {
      const t = node.getAttribute('transform');
      if (t) {
        const m = t.match(/translate\(\s*([-\d.]+)(?:\s*[, ]\s*([-\d.]+))?\s*\)/);
        if (m) { dx += parseFloat(m[1]) || 0; dy += parseFloat(m[2]) || 0; }
      }
      node = node.parentElement;
    }
    return { dx, dy };
  }

  // Absolute SVG-space coordinates for a <text> element.
  function textCoords(el) {
    const { dx, dy } = getTranslate(el);
    return {
      text: el.textContent.trim(),
      x: (parseFloat(el.getAttribute('x') || '0')) + dx,
      y: (parseFloat(el.getAttribute('y') || '0')) + dy,
    };
  }

  const textEls = Array.from(tsSvg.querySelectorAll('text'))
    .map(textCoords)
    .filter(t => t.text);

  const xLabels = textEls.filter(({ text }) => DATE_RE.test(text) || MONTH_YEAR_RE.test(text));
  const yLabels = textEls
    .filter(({ text }) => /^\d[\d,]*$/.test(text))
    .map(({ text, y }) => ({ value: parseInt(text.replace(/,/g, ''), 10), y }))
    .filter(({ value }) => !isNaN(value));

  if (xLabels.length < 2) {
    return { ok: false, step: 'no-x-labels', xCount: xLabels.length, texts: textEls.map(t => t.text).slice(0, 30) };
  }
  if (yLabels.length < 2) {
    return { ok: false, step: 'no-y-labels', yCount: yLabels.length, texts: textEls.map(t => t.text).slice(0, 30) };
  }

  // In SVG space, smaller y = higher on screen = higher data value.
  yLabels.sort((a, b) => a.y - b.y);
  const yTop = yLabels[0];
  const yBot = yLabels[yLabels.length - 1];

  function svgYToValue(svgY) {
    if (yTop.y === yBot.y) return yTop.value;
    const t = (svgY - yTop.y) / (yBot.y - yTop.y);
    return Math.round(yTop.value + t * (yBot.value - yTop.value));
  }

  // Bar rects using SVG attributes (not getBoundingClientRect).
  const rects = Array.from(tsSvg.querySelectorAll('rect')).map(r => {
    const { dx, dy } = getTranslate(r);
    return {
      x: (parseFloat(r.getAttribute('x') || '0')) + dx,
      y: (parseFloat(r.getAttribute('y') || '0')) + dy,
      w: parseFloat(r.getAttribute('width') || '0'),
      h: parseFloat(r.getAttribute('height') || '0'),
    };
  }).filter(({ h, w }) => h > 1 && w > 1);

  if (rects.length < 2) {
    return { ok: false, step: 'no-bars', rectCount: rects.length };
  }

  // Assign each bar to its nearest x-label by SVG x coordinate.
  xLabels.sort((a, b) => a.x - b.x);
  const buckets = xLabels.map(l => ({ label: l.text, x: l.x, bars: [] }));

  for (const rect of rects) {
    const barCx = rect.x + rect.w / 2;
    let best = buckets[0], bestDist = Math.abs(barCx - buckets[0].x);
    for (const b of buckets) {
      const d = Math.abs(barCx - b.x);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    best.bars.push(rect);
  }

  // For each bucket, the bar with the smallest y (= top of tallest bar) is the
  // primary series (installs on the installs page).
  const entries = buckets
    .filter(b => b.bars.length > 0)
    .map(b => {
      const topBar = b.bars.reduce((best, r) => r.y < best.y ? r : best);
      return { label: b.label, value: Math.max(0, svgYToValue(topBar.y)) };
    });

  if (!entries.length) {
    return { ok: false, step: 'no-entries' };
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

// Opens url, clicks the named preset period, waits for the SPA to re-render,
// then runs the normal scrape.js to read DOM totals and breakdown charts.
// Returns the same shape as scrapeUrl().
async function scrapeUrlWithPreset(url, presetLabel) {
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
      const dateEls = (clickRes?.dateEls ?? []).map(h => `[${h.role || h.tag}] "${h.text}"`).join(' | ');
      const body = clickRes?.bodyText ? ` | page: "${clickRes.bodyText.slice(0, 120)}"` : '';
      throw new Error(`Preset "${presetLabel}" not found. date-els: ${dateEls || '(none)'}${body}`);
    }

    // The SPA re-fetches chart data; wait before reading DOM.
    await new Promise(r => setTimeout(r, SETTLE_MS));

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: SCRAPE_FILES,
    });
    const result = results?.[0]?.result;
    if (!result) throw new Error(`No scrape result after preset "${presetLabel}"`);
    if (result.page === 'unknown') throw new Error(`Unexpected page at ${url}`);
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

// For each preset period, clicks the preset on the CWS analytics page and runs
// the normal scrape.js to read the live DOM totals and breakdown charts for
// that window.  Commits one entry per preset per item.
//
// The CWS time-series chart is canvas-based (no SVG text nodes), so per-month
// granularity is not available; this gives one data point per preset window.
// The dashboard chart uses period_start for the x-axis so these appear at
// their correct historical positions.
async function runBackfill(config, token, onProgress) {
  const { publisher_id: pubId, items, github } = config;
  const today = new Date().toISOString().slice(0, 10);

  // Presets in order of preference; longest first for maximum history.
  // Labels must match the exact text in the CWS combobox options.
  const PRESETS = ['Last year', 'Last 180 days', 'Last 90 days', 'Last 30 days'];

  // Fallback: compute approximate period dates from preset label when
  // parseDateRange doesn't reflect the newly selected preset.
  function approxDates(label) {
    const DAYS = { 'last year': 365, 'last 180 days': 180, 'last 90 days': 90, 'last 30 days': 30 };
    const days = DAYS[label.toLowerCase()];
    if (!days) return null;
    const end   = new Date();
    const start = new Date(Date.now() - days * 864e5);
    return {
      period_start: start.toISOString().slice(0, 10),
      period_end:   end.toISOString().slice(0, 10),
    };
  }

  for (const item of items) {
    const itemBase = `${CWS_BASE}/${pubId}/${item.id}`;
    onProgress(`${item.name}: scraping historical preset windows…`);

    let committed = 0, skipped = 0;

    for (const preset of PRESETS) {
      try {
        onProgress(`  ${preset}…`);

        const installsData = await scrapeUrlWithPreset(
          buildUrl(`${itemBase}/analytics/installs`), preset
        );

        let usersData = null;
        try {
          usersData = await scrapeUrlWithPreset(
            buildUrl(`${itemBase}/analytics/users`), preset
          );
        } catch (_) { /* users breakdown is optional */ }

        // parseDateRange reads the inline AF_dataServiceRequests script.
        // If the SPA updated it after the preset click, we get precise dates;
        // otherwise fall back to approximate computed dates.
        const dates = (installsData.period_start && installsData.period_end)
          ? { period_start: installsData.period_start, period_end: installsData.period_end }
          : approxDates(preset);

        if (!dates) {
          onProgress(`  ${preset}: could not determine period dates — skipping`);
          continue;
        }

        const entry = {
          collected_at:           today,
          period_start:           dates.period_start,
          period_end:             dates.period_end,
          installs:               installsData.installs               ?? null,
          uninstalls:             installsData.uninstalls             ?? null,
          weekly_users:           null,
          impressions:            null,
          installs_by_country:    installsData.installs_by_country    ?? null,
          installs_by_language:   installsData.installs_by_language   ?? null,
          installs_by_os:         installsData.installs_by_os         ?? null,
          uninstalls_by_country:  installsData.uninstalls_by_country  ?? null,
          uninstalls_by_language: installsData.uninstalls_by_language ?? null,
          uninstalls_by_os:       installsData.uninstalls_by_os       ?? null,
          users_by_country:       usersData?.users_by_country         ?? null,
          users_by_language:      usersData?.users_by_language        ?? null,
          users_by_os:            usersData?.users_by_os              ?? null,
          active_versions:        usersData?.active_versions          ?? null,
        };

        const { committed: c, reason } = await commitCwsEntry(token, github, item.id, entry);
        if (c) committed++; else skipped++;
        onProgress(`  ${preset} (${dates.period_start}…${dates.period_end}): ${c ? '✓' : `skipped (${reason})`}`);
      } catch (e) {
        onProgress(`  ${preset}: failed — ${e.message.slice(0, 200)}`);
      }
    }

    onProgress(`${item.name}: ${committed} committed, ${skipped} skipped`);
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
