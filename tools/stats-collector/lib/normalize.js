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
 * SVG text structure:
 *   [ y-axis values...,  category names (N),  N% values ]
 *
 * Long labels can be rendered as a separate truncated+concatenated node
 * (e.g. "anglais (États-U...anglais (États-Unis)") immediately followed by
 * the full label again — cleanSvgText reduces both to the same string, so
 * that immediate repeat is dropped here. Percentages are NOT deduplicated
 * this way: two categories tying on the same rounded value (e.g. two
 * entries both at "1%") are distinct, legitimate data points and must be
 * kept even though they're equal and adjacent.
 *
 * Returns null if the SVG doesn't match the expected pattern.
 */
function parseSvgBreakdown(svgEl) {
  const rawTexts = Array.from(svgEl.querySelectorAll(SEL.SVG_TEXT_NODES))
    .map(el => el.textContent.trim())
    .filter(Boolean);

  const texts = [];
  for (let i = 0; i < rawTexts.length; i++) {
    const cleaned = cleanSvgText(rawTexts[i]);
    const isEllipsisDup = texts.length > 0
      && cleaned === texts[texts.length - 1]
      && (rawTexts[i].includes('...') || rawTexts[i - 1].includes('...'));
    if (!isEllipsisDup) texts.push(cleaned);
  }

  const firstPctIdx = texts.findIndex(t => t.endsWith('%'));
  if (firstPctIdx === -1) return null;

  const percentages = texts.slice(firstPctIdx).map(t => parseInt(t, 10));
  const n = percentages.length;
  const categories = texts.slice(firstPctIdx - n, firstPctIdx);

  if (categories.length !== n) return null;

  return Object.fromEntries(categories.map((cat, i) => [cat, percentages[i]]));
}

// OS key names as they appear in the CWS dashboard (hl=en).
const _OS_KEYS = new Set(['windows', 'mac os', 'macos', 'chrome os', 'chromeos', 'linux', 'android', 'ios', 'ipad os']);

/**
 * Classify a parsed breakdown object as 'os', 'language', or 'country'
 * based on its key names, so callers don't rely on fragile DOM ordering.
 */
function classifyBreakdown(data) {
  if (!data) return 'country';
  const keys = Object.keys(data).filter(k => k.toLowerCase() !== 'other');
  if (!keys.length) return 'country';
  if (keys.some(k => _OS_KEYS.has(k.toLowerCase()))) return 'os';
  // Language entries often carry parenthetical locale specifiers ("English (United States)")
  // or are well-known language names.
  const LANG_RE = /\b(english|spanish|japanese|korean|french|german|portuguese|italian|russian|arabic|hindi|turkish|dutch|polish|swedish|chinese|anglais|espagnol|japonais)\b/i;
  if (keys.some(k => k.includes('(') || LANG_RE.test(k))) return 'language';
  return 'country';
}

/**
 * From a typed breakdown array, extract the country/language/os for one section.
 * Sections are delimited by country-type entries (each section starts with its
 * country breakdown).  sectionIndex 0 = installs (or users page), 1 = uninstalls.
 *
 * Using section boundaries — not simple Nth-occurrence — ensures that a language
 * or OS chart absent in section 0 does not bleed into it from section 1.
 */
function pickSection(typedBds, sectionIndex) {
  const countryPos = typedBds.reduce((acc, b, i) => {
    if (b.type === 'country') acc.push(i);
    return acc;
  }, []);

  const start = countryPos[sectionIndex] ?? -1;
  if (start === -1) return { country: null, language: null, os: null };

  const end     = countryPos[sectionIndex + 1] ?? typedBds.length;
  const section = typedBds.slice(start, end);
  return {
    country:  section.find(b => b.type === 'country') ?.data ?? null,
    language: section.find(b => b.type === 'language')?.data ?? null,
    os:       section.find(b => b.type === 'os')      ?.data ?? null,
  };
}

/**
 * Collect all breakdown SVGs from the page, classify each by content type,
 * and return [{type: 'country'|'language'|'os', data: {…}}] in DOM order.
 */
function parseAllBreakdowns(doc) {
  return Array.from(doc.querySelectorAll('svg'))
    .filter(svg => svg.querySelectorAll(SEL.SVG_TEXT_NODES).length >= 5 && !isTimeSeries(svg))
    .map(parseSvgBreakdown)
    .filter(Boolean)
    .map(data => ({ type: classifyBreakdown(data), data }));
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
    isTimeSeries, parseSvgBreakdown, classifyBreakdown, parseAllBreakdowns, pickSection,
    parsePeriodTotals, parseListingRows, parseActiveVersions,
  };
}
