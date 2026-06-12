const fs = require('fs');
const path = require('path');
const {
  LOCALES, promoTxtName, screenshotName, SCREENSHOTS_PER_LOCALE, filterLocales,
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
});
