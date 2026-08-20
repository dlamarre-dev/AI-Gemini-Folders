const fs = require('fs');
const path = require('path');
const {
  LOCALES, promoTxtName, screenshotName, SCREENSHOTS_PER_LOCALE, filterLocales,
  needsLocaleWalk,
} = require('../../tools/store-publisher/lib/locales');

describe('store-publisher locales', () => {
  test('covers exactly the 43 _locales of both extensions', () => {
    const internals = LOCALES.map(l => l.internal).sort();
    for (const ext of ['ai-folders', 'gemini-folders']) {
      const dirs = fs.readdirSync(
        path.join(__dirname, '..', '..', 'extensions', ext, '_locales')
      ).sort();
      expect(internals).toEqual(dirs);
    }
  });

  test('internal and cws codes are unique', () => {
    const internals = LOCALES.map(l => l.internal);
    const cws = LOCALES.map(l => l.cws);
    expect(new Set(internals).size).toBe(LOCALES.length);
    expect(new Set(cws).size).toBe(LOCALES.length);
  });

  test('amo codes map AMO prod languages, null elsewhere', () => {
    const byInternal = Object.fromEntries(LOCALES.map(l => [l.internal, l.amo]));
    expect(byInternal.en).toBe('en-US');
    expect(byInternal.es).toBe('es-ES');
    expect(byInternal.nb).toBe('nb-NO');
    expect(byInternal.sv).toBe('sv-SE');
    expect(byInternal.fr).toBe('fr');
    expect(byInternal.pt_BR).toBe('pt-BR');
    // Not in AMO's PROD_LANGUAGES — listing translations can't be saved.
    for (const code of ['ar', 'bg', 'bn', 'ca', 'da', 'et', 'hi', 'id', 'lt', 'lv', 'ms', 'sr', 'sw', 'th', 'tl']) {
      expect(byInternal[code]).toBeNull();
    }
    expect(LOCALES.filter(l => l.amo).length).toBe(28);
  });

  test('LOCALES rows stay parseable by amo_publish.py (one line per locale)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'tools', 'store-publisher', 'lib', 'locales.js'), 'utf8');
    const rows = src.match(/\{ internal: '[A-Za-z_]+',\s*cws: '[^']+',\s*amo: (null|'[^']+'),/g);
    expect(rows).toHaveLength(LOCALES.length);
  });

  test('cws codes diverge from repo notation where Google differs', () => {
    const byInternal = Object.fromEntries(LOCALES.map(l => [l.internal, l.cws]));
    expect(byInternal.nb).toBe('no');
    expect(byInternal.he).toBe('iw');
    expect(byInternal.tl).toBe('fil');
    expect(byInternal.pt_BR).toBe('pt-BR');
    expect(byInternal.pt_PT).toBe('pt-PT');
    expect(byInternal.zh_CN).toBe('zh-CN');
    expect(byInternal.zh_TW).toBe('zh-TW');
    expect(byInternal.fr).toBe('fr');
  });

  test('promo text filenames match the dist naming (zh_CN quirk included)', () => {
    expect(promoTxtName('fr')).toBe('PromoFR.txt');
    expect(promoTxtName('pt_BR')).toBe('PromoPT_BR.txt');
    expect(promoTxtName('zh_CN')).toBe('PromoCN.txt');
    expect(promoTxtName('zh_TW')).toBe('PromoZH_TW.txt');
  });

  test('screenshot filenames match the dist naming', () => {
    expect(SCREENSHOTS_PER_LOCALE).toBe(5);
    expect(screenshotName('en', 1)).toBe('Promo_1_en.png');
    expect(screenshotName('pt_BR', 5)).toBe('Promo_5_pt_BR.png');
  });

  describe('filterLocales', () => {
    test('empty filter returns all locales', () => {
      expect(filterLocales('')).toHaveLength(LOCALES.length);
      expect(filterLocales(undefined)).toHaveLength(LOCALES.length);
    });

    test('comma list returns the named locales in order', () => {
      expect(filterLocales('fr, DE').map(l => l.internal)).toEqual(['fr', 'de']);
    });

    test('from:xx resumes at xx', () => {
      const tail = filterLocales('from:vi').map(l => l.internal);
      expect(tail).toEqual(['vi', 'zh_CN', 'zh_TW']);
    });

    test('unknown locales throw', () => {
      expect(() => filterLocales('xx')).toThrow(/Unknown locale/);
      expect(() => filterLocales('from:xx')).toThrow(/Unknown locale/);
    });
  });

  // The international screenshots live in the language-independent "Global
  // assets" card. A run that only replaces them must not walk the 43 languages:
  // besides the wasted ~2 min, one unconfirmed language switch aborts the run
  // before the global step it was asked to perform.
  describe('needsLocaleWalk', () => {
    test('true when a per-language step is selected', () => {
      expect(needsLocaleWalk({ updateTexts: true })).toBe(true);
      expect(needsLocaleWalk({ updateImages: true })).toBe(true);
      expect(needsLocaleWalk({ updateTexts: true, updateImages: true })).toBe(true);
      expect(needsLocaleWalk({ updateTexts: true, updateGlobalImages: true })).toBe(true);
    });

    test('false for international screenshots alone', () => {
      expect(needsLocaleWalk({ updateGlobalImages: true })).toBe(false);
    });

    test('false when nothing is selected', () => {
      expect(needsLocaleWalk({})).toBe(false);
      expect(needsLocaleWalk(undefined)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Store-listing claims must stay true (external audit, 2026-08)
// ---------------------------------------------------------------------------

describe('Promo listings make no false claims', () => {
  const fsx = require('fs');
  const pathx = require('path');
  const ROOTX = pathx.join(__dirname, '..', '..');
  const promoFiles = (ext) => {
    const dir = pathx.join(ROOTX, 'Marketing', ext);
    return fsx.readdirSync(dir).filter(f => /^Promo.*\.txt$/.test(f))
      .map(f => [ext + '/' + f, fsx.readFileSync(pathx.join(dir, f), 'utf8')]);
  };
  const all = [...promoFiles('ai-folders'), ...promoFiles('gemini-folders')];

  test('there are 43 listings per extension', () => {
    expect(promoFiles('ai-folders')).toHaveLength(43);
    expect(promoFiles('gemini-folders')).toHaveLength(43);
  });

  // MV3 blocks remotely hosted code; it does NOT block packaged runtime
  // injection, and both extensions use chrome.scripting.executeScript on
  // purpose. Claiming otherwise in a store listing is a reviewable falsehood.
  test('no listing claims Manifest V3 prevents dynamic script execution', () => {
    const DYNAMIC = /dynami|динамич|動的|ダイナミ|동적|dinâm|dinam|dynamis|δυναμικ|ديناميك|ডায়নামিক|डायनामिक|ไดนามิก|dünaamili|dinamis|dynaamis/i;
    const bad = all
      .filter(([, t]) => (t.split('\n').find(l => /Manifest V3/i.test(l)) || '').match(DYNAMIC))
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  // The AI Folders trigger works on every supported site and on a local LLM.
  // Only Gemini Folders may say "Gemini" here.
  test('the AI Folders trigger bullet does not say the field is Gemini’s', () => {
    const bad = promoFiles('ai-folders')
      .filter(([, t]) => t.split('\n').some(l => /⌨/.test(l) && /#/.test(l) && /Gemini/.test(l)))
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });
});
