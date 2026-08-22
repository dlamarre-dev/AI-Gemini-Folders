// The site offers one button per store it has a listing on.
//
// Which stores those are is decided in exactly one place — the STORES table and
// the LINKS map in app.js — because the buttons appear in five: the nav, the
// hero, the Gemini Folders card, the final CTA and both footers. An Edge listing
// has no public URL until it clears certification, so LINKS.edge is empty and
// every one of those places omits it; filling it in turns them all on at once.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'docs/site/app.js'), 'utf8');
const LOGOS_SRC = fs.readFileSync(path.join(ROOT, 'docs/site/logos.js'), 'utf8');

require('../docs/site/i18n-manual.js');   // AF_MANUAL + AF_LANGS
const MANUAL = window.AF_MANUAL;
const LANGS = Object.keys(window.AF_LANGS);

const STORE_CTAS = ['ctaChrome', 'ctaEdge', 'ctaFirefox'];

describe('store buttons', () => {
  test('every store in the table has a call-to-action string in all 43 locales', () => {
    expect(LANGS).toHaveLength(43);
    for (const key of STORE_CTAS) {
      const missing = LANGS.filter((lang) => !MANUAL[lang] || !MANUAL[lang][key]);
      expect({ key, missing }).toEqual({ key, missing: [] });
    }
  });

  // Matched on the STEM, not the whole brand: several languages decline it.
  // Czech and Slovak say "Přidat do Chromu", Finnish "Lisää Edgeen", Hungarian
  // "Letöltés Firefoxhoz". A test that demanded the bare brand would fail on
  // perfectly correct translations — which is how a naive guard trains people
  // to write worse copy.
  const STEM = { ctaChrome: /Chrom/, ctaEdge: /Edge/, ctaFirefox: /Firefox/ };

  test('each label names the store it is for', () => {
    for (const [key, own] of Object.entries(STEM)) {
      const bad = LANGS.filter((lang) => !own.test(MANUAL[lang][key]));
      expect({ key, bad }).toEqual({ key, bad: [] });
    }
  });

  // And names no other. A label that still said "Chrome" on the Edge button
  // would be invisible in a language nobody here reads, and it is the exact
  // mistake a copy-paste makes.
  test('and no other store', () => {
    for (const key of STORE_CTAS) {
      const others = STORE_CTAS.filter((k) => k !== key).map((k) => STEM[k]);
      const bad = LANGS.filter((lang) => others.some((re) => re.test(MANUAL[lang][key])));
      expect({ key, bad }).toEqual({ key, bad: [] });
    }
  });
});

describe('app.js wiring', () => {
  test('the store table covers the three stores and their CTA keys', () => {
    for (const key of STORE_CTAS) {
      expect(APP).toContain(`cta: "${key}"`);
    }
  });

  // The gate. Without it, an uncertified listing puts a dead button on a live
  // site — the same rule build.py follows when it strips the review banner for a
  // target whose store URL does not exist yet.
  test('buttons are filtered on the link being set, not hard-coded', () => {
    expect(APP).toMatch(/const stores = \(which\) => STORES\.filter/);
    // Nothing may reach past the filter and emit a store link directly.
    expect(APP).not.toMatch(/href="\$\{LINKS\.(chrome|firefox|edge|gemChrome|gemFirefox|gemEdge)\}/);
  });

  test('an unpublished store ships with an empty link', () => {
    expect(APP).toMatch(/\n\s*edge: "",/);
    expect(APP).toMatch(/\n\s*gemEdge: "",/);
  });

  // Gradient ids collide when the same markup is inlined more than once, which
  // is why Firefox's mark is an external <img>. Edge's mark has gradients too.
  test('the Edge mark is referenced as a file, like Firefox', () => {
    expect(LOGOS_SRC).toMatch(/edge:\s*`<img src="site\/assets\/edge\.svg"/);
    expect(fs.existsSync(path.join(ROOT, 'docs/site/assets/edge.svg'))).toBe(true);
  });
});
