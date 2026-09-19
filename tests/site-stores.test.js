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

  // Every link is either a real store URL or empty — never a placeholder, never a
  // guess at what the URL will be once a listing clears review. Written as a shape
  // rather than as a list of which stores are live, so publishing one does not
  // fail a test about something else. Edge went from empty to filled here on
  // 31/08/2026, and this is what stayed true across that.
  test('every store link is a real URL or nothing at all', () => {
    const block = APP.match(/const LINKS = \{([\s\S]*?)\n  \};/)[1];
    const links = [...block.matchAll(/^\s*(\w+): "([^"]*)",?\s*$/gm)];
    expect(links.length).toBeGreaterThanOrEqual(7);
    for (const [, key, url] of links) {
      expect(url === '' || /^https:\/\/\S+$/.test(url)).toBe(true);
      expect(url).not.toMatch(/__|example\.|TODO|localhost/);
      if (key.toLowerCase().includes('edge') && url) {
        expect(url).toMatch(/^https:\/\/microsoftedge\.microsoft\.com\/addons\/detail\//);
      }
    }
  });

  // Gradient ids collide when the same markup is inlined more than once, which
  // is why Firefox's mark is an external <img>. Edge's carries six of them
  // (a-f, single letters), so inlining it would be the worst case of that bug —
  // as a separate document behind <img>, they cannot reach anything.
  test('the Edge mark is referenced as a file, like Firefox', () => {
    expect(LOGOS_SRC).toMatch(/edge:\s*`<img src="site\/assets\/edge\.svg"/);
    expect(fs.existsSync(path.join(ROOT, 'docs/site/assets/edge.svg'))).toBe(true);
  });
});

// Every page that offers the store buttons must offer all of them. The nav is
// hand-written HTML on each page rather than rendered from the STORES table, so
// it is the one place a store can be forgotten on one page and not another —
// which is exactly what happened to privacy.html.
describe('nav buttons are on every page that has them', () => {
  const pages = fs.readdirSync(path.join(ROOT, 'docs'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8')])
    .filter(([, html]) => html.includes('id="navCtaLink"'));

  test('at least one page carries them, or this suite proves nothing', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  test.each(pages.map(([f]) => f))('%s offers Edge alongside Chrome and Firefox', (file) => {
    const html = pages.find(([f]) => f === file)[1];
    expect(html).toContain('id="navCtaFoxLink"');
    expect(html).toContain('id="navCtaEdgeLink"');
  });

  // Ships hidden: app.js reveals it only once LINKS.edge is set, so a page
  // cannot leak a dead button before the listing is certified.
  test.each(pages.map(([f]) => f))('%s ships the Edge button hidden', (file) => {
    const html = pages.find(([f]) => f === file)[1];
    const tag = html.match(/<a[^>]*id="navCtaEdgeLink"[^>]*>/)[0];
    expect(tag).toMatch(/\shidden\b/);
  });
});

// The site states a service count in 43 languages, and the store listings state
// it again. Both are numbers in copy that nothing recomputed, and both drifted
// the same way when You.com was retired: the promo texts were caught, this one
// shipped a stale "19" to aifolders.xyz. The count includes the local LLM, so
// grepping for the platform count misses it — which is exactly how it survived
// the first pass. Tie it to the registry here, as marketing-listings.test.js
// does for the store copy, and neither surface can drift alone again.
describe('the site states the real number of services', () => {
  const { SITES } = require('../extensions/ai-folders/site-config.js');
  // Retired entries survive for their colour and logo only and are not services
  // the site may count; the local LLM is one, and is counted (SERVICES + LOCAL_SVC).
  const live = Object.values(SITES).filter((s) => !s.retired);
  const expected = live.length;

  // Bengali may write the number in Bengali digits, as the promo texts do.
  const toAscii = (s) => s.replace(/[\u09e6-\u09ef]/g,
    (d) => String(d.charCodeAt(0) - 0x09e6));

  test('every localized heading counts the registry, not a literal', () => {
    const wrong = LANGS.map((lang) => {
      const title = MANUAL[lang] && MANUAL[lang].servicesTitle;
      if (!title) return [lang, 'no servicesTitle'];
      const n = toAscii(title).match(/\d+/);
      if (!n) return [lang, `no number in ${JSON.stringify(title)}`];
      return Number(n[0]) === expected ? null : [lang, `says ${n[0]}, expected ${expected}`];
    }).filter(Boolean);
    expect(wrong).toEqual([]);
  });

  test('and the service cards it renders are that same set, minus the local one', () => {
    // SERVICES in app.js is the list of named services; LOCAL_SVC is appended
    // separately, which is why the card count is expected - 1.
    const block = APP.slice(APP.indexOf('const SERVICES = ['), APP.indexOf('const LOCAL_SVC'));
    const cards = block.match(/\{ n: "/g) || [];
    expect(cards).toHaveLength(expected - 1);
    // A retired service must not still have a card.
    for (const s of Object.values(SITES).filter((x) => x.retired)) {
      expect(block).not.toContain(`logo: "${s.key.charAt(0).toUpperCase()}${s.key.slice(1)}"`);
    }
  });
});
