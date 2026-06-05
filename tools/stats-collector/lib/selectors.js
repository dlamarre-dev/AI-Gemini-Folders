// All CWS dev-console DOM selectors in one place.
// If Google redesigns the console, this is the only file that needs updating.

const SEL = {
  // --- Listing page (/devconsole/{publisherId}) ---
  LISTING_ROW: 'table tbody tr',
  LISTING_USERS_COL_IDX: 5,                         // 0-indexed: Élément/Type/Created/Updated/Rating/Users/Status
  LISTING_ITEM_LINK: 'a[href*="/devconsole/"]',      // Link containing the item ID in its href

  // --- Period aggregate totals ---
  // analytics/installs: first = installs total, second = uninstalls total.
  // analytics/impressions: first = impressions total.
  PERIOD_TOTAL: 'div.FhBhHd',

  // --- SVG chart text nodes ---
  SVG_TEXT_NODES: 'text, title',

  // --- Version labels (analytics/users, table legend spans) ---
  TABLE_LABEL: 'span.ke9kZe-mU4ghb-V67aGc',

  // --- Date range: pattern matched inside inline <script> tags ---
  DATA_SCRIPT_SELECTOR: 'script:not([src])',
  DATE_RANGE_RE: /\[null,\[(\d+),(\d+)\]\]/,
};

if (typeof module !== 'undefined') module.exports = { SEL };
