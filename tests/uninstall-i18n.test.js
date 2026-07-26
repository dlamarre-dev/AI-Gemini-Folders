// The uninstall pages are the one place a user sees the project in their own
// language on the way out, and the survey is only comparable across locales if
// every language carries the same key set and the same submitted values. These
// guards catch a forgotten translation and a page that could leak into search
// results.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

require('../docs/site/i18n-manual.js');     // AF_LANGS (the 43 site locales)
require('../docs/site/uninstall-i18n.js');  // UF_I18N + UF_NAMES

const LANGS = Object.keys(window.AF_LANGS);
const I18N = window.UF_I18N;
const NAMES = window.UF_NAMES;
const KEYS = Object.keys(I18N.en);

describe('uninstall form strings', () => {
  test('the site ships 43 locales and the form covers exactly those', () => {
    expect(LANGS).toHaveLength(43);
    expect(Object.keys(I18N).sort()).toEqual(LANGS.slice().sort());
    expect(Object.keys(NAMES).sort()).toEqual(LANGS.slice().sort());
  });

  test.each(LANGS)('%s has every key, none of them empty', (lang) => {
    const missing = KEYS.filter(k => !I18N[lang][k] || !String(I18N[lang][k]).trim());
    expect({ lang, missing }).toEqual({ lang, missing: [] });
  });

  test.each(LANGS)('%s names both products', (lang) => {
    expect(NAMES[lang].af).toBeTruthy();
    expect(NAMES[lang].gf).toBeTruthy();
  });

  test('no language carries a stray key the English set does not have', () => {
    const extra = {};
    for (const lang of LANGS) {
      const e = Object.keys(I18N[lang]).filter(k => !KEYS.includes(k));
      if (e.length) extra[lang] = e;
    }
    expect(extra).toEqual({});
  });

  test('the product-name placeholder survives translation', () => {
    // "{p}" is substituted at render time; a translated "{produit}" would show
    // the raw placeholder to the user. optSwitchedToAf is the Gemini Folders
    // first checkbox and names the *other* product, so it needs one too.
    const broken = LANGS.filter(l => ['q1', 'intro', 'optSwitchedToAf']
      .some(k => !I18N[l][k].includes('{p}')));
    expect(broken).toEqual([]);
  });

  test('the privacy note is a real disclosure in every language', () => {
    // The English wording is the reference; the translations are checked by
    // length, so a stub like "Anonymous." cannot pass for a disclosure. The floor
    // is lower for the CJK scripts, which say the same thing in far fewer
    // characters (zh ≈ 70 where en ≈ 210).
    expect(I18N.en.privacyBody).toMatch(/version/i);
    const CJK = ['ja', 'ko', 'zh_CN', 'zh_TW'];
    const tooShort = LANGS.filter(l => I18N[l].privacyBody.length < (CJK.includes(l) ? 55 : 80));
    expect(tooShort).toEqual([]);
  });

  test('Serbian stays in Latin script', () => {
    // Guarded by tests/serbian-latin.test.js at the file level too; this asserts
    // the rendered strings, since app.js's transliteration does not reach here.
    expect(/[Ѐ-ӿ]/.test(JSON.stringify(I18N.sr) + JSON.stringify(NAMES.sr))).toBe(false);
  });
});

describe('uninstall pages stay out of search results', () => {
  const PAGES = ['docs/uninstall-ai-folders.html', 'docs/uninstall-gemini-folders.html'];

  test.each(PAGES)('%s is noindex', (rel) => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(html).toMatch(/<meta\s+name="robots"\s+content="noindex/i);
  });

  test.each(PAGES)('%s loads the form config and the renderer', (rel) => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const src of ['site/uninstall-i18n.js', 'site/uninstall-forms.js', 'site/uninstall.js']) {
      expect(html).toContain(src);
    }
    // app.js would render the marketing site over the form.
    expect(html).not.toContain('site/app.js');
  });

  test('neither page is listed in the sitemap', () => {
    const sitemap = fs.readFileSync(path.join(ROOT, 'docs/sitemap.xml'), 'utf8');
    expect(sitemap).not.toContain('uninstall');
  });

  test('robots.txt does not disallow them', () => {
    // A disallowed URL can still be indexed URL-only; the crawler has to be able
    // to read the noindex meta for it to count.
    const robots = fs.readFileSync(path.join(ROOT, 'docs/robots.txt'), 'utf8');
    expect(robots).not.toMatch(/Disallow:\s*\/uninstall/i);
  });
});
