// Unit tests for lib/normalize.js (pure parsing/normalization functions).
// The browser globals SEL and all normalize* functions are set up below.

const { SEL } = require('../../tools/stats-collector/lib/selectors');
global.SEL = SEL;
const {
  dayIndexToISO, cleanSvgText,
  isTimeSeries, parseSvgBreakdown, parseAllBreakdowns,
  parsePeriodTotals, parseListingRows, parseActiveVersions, parseDateRange,
} = require('../../tools/stats-collector/lib/normalize');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSvg(texts) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  texts.forEach(t => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.textContent = t;
    svg.appendChild(el);
  });
  return svg;
}

function makeDoc(html) {
  const d = document.implementation.createHTMLDocument('');
  d.body.innerHTML = html;
  return d;
}

// ── dayIndexToISO ─────────────────────────────────────────────────────────────

describe('dayIndexToISO', () => {
  it('converts Unix epoch day 0 to 1970-01-01', () => {
    expect(dayIndexToISO(0)).toBe('1970-01-01');
  });

  it('converts day 20579 to 2026-05-06', () => {
    expect(dayIndexToISO(20579)).toBe('2026-05-06');
  });

  it('converts day 20608 to 2026-06-04', () => {
    expect(dayIndexToISO(20608)).toBe('2026-06-04');
  });
});

// ── cleanSvgText ──────────────────────────────────────────────────────────────

describe('cleanSvgText', () => {
  it('strips leading ellipsis from y-axis labels', () => {
    expect(cleanSvgText('...150')).toBe('150');
  });

  it('extracts full label from truncated+full concatenation', () => {
    expect(cleanSvgText('anglais (États-U...anglais (États-Unis)')).toBe('anglais (États-Unis)');
  });

  it('returns unchanged text when no ellipsis present', () => {
    expect(cleanSvgText('Windows')).toBe('Windows');
  });
});

// ── isTimeSeries ─────────────────────────────────────────────────────────────

describe('isTimeSeries', () => {
  it('returns true when SVG contains a date tick label', () => {
    const svg = makeSvg(['May 10, 2026', 'May 17', 'May 24', 'May 31', '60', '30', '0']);
    expect(isTimeSeries(svg)).toBe(true);
  });

  it('returns false for a breakdown SVG with country names', () => {
    const svg = makeSvg(['0', '100', '200', 'France', 'Germany', 'Autre', '40%', '35%', '25%']);
    expect(isTimeSeries(svg)).toBe(false);
  });
});

// ── parseSvgBreakdown ─────────────────────────────────────────────────────────

describe('parseSvgBreakdown', () => {
  it('parses a 4-category country breakdown', () => {
    const svg = makeSvg(['0', '100', '200', '300', '400',
      'États-Unis', 'Espagne', 'Japon', 'Autre',
      '18%', '16%', '11%', '55%']);
    expect(parseSvgBreakdown(svg)).toEqual({
      'États-Unis': 18, 'Espagne': 16, 'Japon': 11, 'Autre': 55,
    });
  });

  it('strips ellipsis artifacts before parsing', () => {
    const svg = makeSvg([
      '0', '75', '...150', '150', '...225', '225', '...300', '300',
      'espagnol', 'anglais (États-U...anglais (États-Unis)', 'anglais (États-Unis)', 'japonais', 'Autre',
      '26%', '13%', '12%', '49%',
    ]);
    const result = parseSvgBreakdown(svg);
    expect(result).toEqual({
      'espagnol': 26, 'anglais (États-Unis)': 13, 'japonais': 12, 'Autre': 49,
    });
  });

  it('returns null when no percentage values are present', () => {
    const svg = makeSvg(['May 10, 2026', 'May 17', '60', '30', '0']);
    expect(parseSvgBreakdown(svg)).toBeNull();
  });
});

// ── parsePeriodTotals ─────────────────────────────────────────────────────────

describe('parsePeriodTotals', () => {
  it('reads two FhBhHd totals from a document', () => {
    const doc = makeDoc('<div class="FhBhHd">694</div><div class="FhBhHd">297</div>');
    expect(parsePeriodTotals(doc)).toEqual([694, 297]);
  });

  it('returns empty array when no totals present', () => {
    const doc = makeDoc('<p>nothing here</p>');
    expect(parsePeriodTotals(doc)).toEqual([]);
  });
});

// ── parseListingRows ──────────────────────────────────────────────────────────

describe('parseListingRows', () => {
  it('extracts item ID and weekly users from a listing-page table row', () => {
    const itemId = 'jffchdehoapigpmifkmleglfimjiilik';
    const doc = makeDoc(`
      <table><tbody><tr>
        <td><a href="https://chrome.google.com/webstore/devconsole/pub123/${itemId}/details">Gemini Folders</a></td>
        <td>Extension</td><td>2024-01-01</td><td>2026-06-01</td><td>4.8</td>
        <td>562</td>
        <td>Published</td>
      </tr></tbody></table>
    `);
    expect(parseListingRows(doc)).toEqual([{ id: itemId, weekly_users: 562 }]);
  });

  it('skips rows without a valid item link', () => {
    const doc = makeDoc(`
      <table><tbody><tr>
        <td>No link here</td><td></td><td></td><td></td><td></td><td>42</td><td></td>
      </tr></tbody></table>
    `);
    expect(parseListingRows(doc)).toEqual([]);
  });
});

// ── parseActiveVersions ───────────────────────────────────────────────────────

describe('parseActiveVersions', () => {
  it('extracts version strings from table label spans', () => {
    const doc = makeDoc(`
      <span class="ke9kZe-mU4ghb-V67aGc">Utilisateurs de la semaine</span>
      <span class="ke9kZe-mU4ghb-V67aGc">3.5.0.0</span>
      <span class="ke9kZe-mU4ghb-V67aGc">4.0.0.0</span>
      <span class="ke9kZe-mU4ghb-V67aGc">4.2.2.0</span>
      <span class="ke9kZe-mU4ghb-V67aGc">Désactivé</span>
    `);
    expect(parseActiveVersions(doc)).toEqual(['3.5.0.0', '4.0.0.0', '4.2.2.0']);
  });
});

// ── parseDateRange ────────────────────────────────────────────────────────────

describe('parseDateRange', () => {
  it('extracts period dates from an AF_dataServiceRequests script block', () => {
    const doc = makeDoc(`
      <script>var AF_dataServiceRequests = {'ds:2':{id:'WlSRsc',request:[[[null,[20579,20608]],"abc",4]]}};</script>
    `);
    expect(parseDateRange(doc)).toEqual({
      period_start: '2026-05-06',
      period_end:   '2026-06-04',
    });
  });

  it('returns null when no date range script is present', () => {
    const doc = makeDoc('<p>nothing</p>');
    expect(parseDateRange(doc)).toBeNull();
  });
});
