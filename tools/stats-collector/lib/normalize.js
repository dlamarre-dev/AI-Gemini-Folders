// Pure DOM-to-JSON transformation functions.
// Injected alongside content/scrape.js via scripting.executeScript.
// SEL must be defined globally before these functions are called (loaded from lib/selectors.js).

// ── helpers ───────────────────────────────────────────────────────────────────

/** Convert a day-index (days since Unix epoch) to "YYYY-MM-DD". */
function dayIndexToISO(d) {
  return new Date(d * 864e5).toISOString().slice(0, 10);
}

/**
 * Clean a raw SVG text value produced by Google's chart accessibility layer.
 *   "...150"                              → "150"
 *   "anglais (États-U...anglais (États-Unis)" → "anglais (États-Unis)"
 */
function cleanSvgText(t) {
  if (!t.includes('...')) return t;
  const parts = t.split('...');
  const last = parts[parts.length - 1].trim();
  return last || parts[0].trim();
}

// ── date range ────────────────────────────────────────────────────────────────

/**
 * Extract the collection period from the AF_dataServiceRequests embedded script.
 * Returns { period_start, period_end } as ISO strings, or null.
 */
function parseDateRange(doc) {
  const scripts = doc.querySelectorAll(SEL.DATA_SCRIPT_SELECTOR);
  for (const s of scripts) {
    const m = s.textContent.match(SEL.DATE_RANGE_RE);
    if (m) return { period_start: dayIndexToISO(+m[1]), period_end: dayIndexToISO(+m[2]) };
  }
  return null;
}

// ── SVG breakdown charts ──────────────────────────────────────────────────────

/**
 * Return true if this SVG is a time-series chart (has a date axis tick like "May 10, 2026").
 * Used to skip time-series SVGs when collecting breakdown charts.
 */
function isTimeSeries(svgEl) {
  const texts = Array.from(svgEl.querySelectorAll(SEL.SVG_TEXT_NODES))
    .map(el => el.textContent.trim());
  return texts.some(t => /^[A-Za-zÀ-ÿ]+ \d{1,2}(, \d{4})?$/.test(t));
}

/**
 * Parse a single breakdown SVG (country / language / OS) into { category: pct% }.
 *
 * SVG text structure (after dedup):
 *   [ y-axis values...,  category names (N),  N% values ]
 *
 * Returns null if the SVG doesn't match the expected pattern.
 */
function parseSvgBreakdown(svgEl) {
  const rawTexts = Array.from(svgEl.querySelectorAll(SEL.SVG_TEXT_NODES))
    .map(el => cleanSvgText(el.textContent.trim()))
    .filter(Boolean);

  // Deduplicate consecutive identical values (tooltip artifacts)
  const texts = rawTexts.filter((t, i) => i === 0 || t !== rawTexts[i - 1]);

  const firstPctIdx = texts.findIndex(t => t.endsWith('%'));
  if (firstPctIdx === -1) return null;

  const percentages = texts.slice(firstPctIdx).map(t => parseInt(t, 10));
  const n = percentages.length;
  const categories = texts.slice(firstPctIdx - n, firstPctIdx);

  if (categories.length !== n) return null;

  return Object.fromEntries(categories.map((cat, i) => [cat, percentages[i]]));
}

/**
 * Collect all breakdown SVGs from the page, in DOM order, skipping time-series and
 * decoration SVGs (fewer than 5 text nodes).
 */
function parseAllBreakdowns(doc) {
  return Array.from(doc.querySelectorAll('svg'))
    .filter(svg => svg.querySelectorAll(SEL.SVG_TEXT_NODES).length >= 5 && !isTimeSeries(svg))
    .map(parseSvgBreakdown)
    .filter(Boolean);
}

// ── per-page scrapers ─────────────────────────────────────────────────────────

/**
 * Read aggregate period totals from div.FhBhHd in DOM order.
 * On analytics/installs: [installs_total, uninstalls_total].
 * Handles K/M suffixes: "1.05K" → 1050, "2.3M" → 2300000.
 */
function parsePeriodTotals(doc) {
  return Array.from(doc.querySelectorAll(SEL.PERIOD_TOTAL)).map(el => {
    const t = el.textContent.trim();
    const m = t.match(/^([\d,]+(?:\.\d+)?)\s*([KkMm]?)$/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(num)) return null;
    const suffix = m[2].toUpperCase();
    const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : 1;
    return Math.round(num * mult);
  });
}

/**
 * Read weekly-users and item IDs from the listing-page table.
 * Returns [{ id, weekly_users }].
 */
function parseListingRows(doc) {
  return Array.from(doc.querySelectorAll(SEL.LISTING_ROW)).map(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < SEL.LISTING_USERS_COL_IDX + 1) return null;
    const link = cells[0].querySelector(SEL.LISTING_ITEM_LINK);
    const m = link?.href.match(/devconsole\/[^/]+\/([a-z]{32})/);
    const id = m?.[1] ?? null;
    const raw = cells[SEL.LISTING_USERS_COL_IDX].textContent.trim().replace(/\D/g, '');
    const weekly_users = raw ? parseInt(raw, 10) : null;
    return id ? { id, weekly_users } : null;
  }).filter(Boolean);
}

/**
 * Read active extension version strings from the users-page legend spans.
 * Returns e.g. ["3.5.0.0", "4.0.0.0", "4.2.2.0"].
 */
function parseActiveVersions(doc) {
  return Array.from(doc.querySelectorAll(SEL.TABLE_LABEL))
    .map(el => el.textContent.trim())
    .filter(t => /^\d+\.\d+\.\d+\.\d+$/.test(t));
}

if (typeof module !== 'undefined') {
  module.exports = {
    dayIndexToISO, cleanSvgText, parseDateRange,
    isTimeSeries, parseSvgBreakdown, parseAllBreakdowns,
    parsePeriodTotals, parseListingRows, parseActiveVersions,
  };
}
