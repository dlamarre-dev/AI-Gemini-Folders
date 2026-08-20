// The store publisher itself lives in its own repo now
// (github.com/dlamarre-dev/store-listing-publisher). What stayed here is the
// half that describes THIS project: store-publisher.config.json, which the tool
// reads through its "extends" field.
//
// These tests exist for the one assertion that could not travel with the tool: a
// standalone publisher knows nothing about extensions/*/_locales, so nothing over
// there can notice that a language was added to the extensions and not to the
// listing config — the publisher would simply skip it, and the new locale's
// store page would silently keep the old text.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'store-publisher.config.json'), 'utf8'));

describe('store-publisher.config.json', () => {
  test('its locale table is exactly the _locales of both extensions', () => {
    const internals = config.locales.map(l => l.internal).sort();
    for (const ext of ['ai-folders', 'gemini-folders']) {
      const dirs = fs.readdirSync(path.join(ROOT, 'extensions', ext, '_locales')).sort();
      expect(internals).toEqual(dirs);
    }
  });

  test('internal and CWS codes are unique', () => {
    const internals = config.locales.map(l => l.internal);
    const cws = config.locales.map(l => l.cws);
    expect(new Set(internals).size).toBe(config.locales.length);
    expect(new Set(cws).size).toBe(config.locales.length);
  });

  test('CWS codes diverge from repo notation where Google differs', () => {
    const byInternal = Object.fromEntries(config.locales.map(l => [l.internal, l.cws]));
    expect(byInternal.nb).toBe('no');
    expect(byInternal.he).toBe('iw');
    expect(byInternal.tl).toBe('fil');
    expect(byInternal.pt_BR).toBe('pt-BR');
    expect(byInternal.pt_PT).toBe('pt-PT');
    expect(byInternal.zh_CN).toBe('zh-CN');
    expect(byInternal.zh_TW).toBe('zh-TW');
    expect(byInternal.fr).toBe('fr');
  });

  test('AMO codes map AMO prod languages, null elsewhere', () => {
    const byInternal = Object.fromEntries(config.locales.map(l => [l.internal, l.amo]));
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
    expect(config.locales.filter(l => l.amo).length).toBe(28);
  });

  // The naming quirk that used to be a special case in the tool's code. The
  // publisher resolves {LANG} from fileCode when present, so these two facts
  // together are what makes dist/'s PromoCN.txt reachable.
  test('zh_CN carries the fileCode that makes {LANG} resolve to CN', () => {
    const zh = config.locales.find(l => l.internal === 'zh_CN');
    expect(zh.fileCode).toBe('CN');
    // Every other locale uses its own code uppercased, so none needs an override.
    const overrides = config.locales.filter(l => l.fileCode).map(l => l.internal);
    expect(overrides).toEqual(['zh_CN']);
  });

  test('the path templates point at dist/, which build.py produces', () => {
    for (const [store, dir] of [['chrome', 'marketing_chrome'], ['firefox', 'marketing_firefox']]) {
      const profile = config.assets[store];
      expect(profile.description).toBe(`dist/{slug}/${dir}/Promo{LANG}.txt`);
      expect(profile.screenshot).toBe(`dist/{slug}/${dir}/screenshots/Promo_{n}_{lang}.png`);
      expect(profile.screenshotsPerListing).toBe(5);
    }
  });

  // assets.root is the one machine-dependent value, so it belongs in the
  // operator's own gitignored config, not in a file the repo commits.
  test('no machine-specific path and no credential is committed here', () => {
    expect(config.assets.root).toBeUndefined();
    expect(config.publisher_id).toBeUndefined();
    expect(config.amo.jwt_issuer).toBeUndefined();
    expect(config.amo.jwt_secret).toBeUndefined();
  });

  test('both extensions are listed, with the ids each store addresses them by', () => {
    const bySlug = Object.fromEntries(config.items.map(i => [i.slug, i]));
    expect(Object.keys(bySlug).sort()).toEqual(['ai-folders', 'gemini-folders']);
    for (const item of config.items) {
      expect(item.id).toMatch(/^[a-p]{32}$/);          // CWS extension id
      expect(item.amo_guid).toMatch(/@/);              // Firefox gecko id
      expect(item.name).toBeTruthy();
    }
  });

  // The AMO listing summary and name mirror the extension's own strings, so a
  // rename in _locales reaches the store instead of drifting from it.
  test('the AMO summary and name are sourced from the built Firefox _locales', () => {
    expect(config.amo.summarySource).toEqual({
      path: 'dist/{slug}/firefox/_locales/{lang}/messages.json', key: 'extDesc',
    });
    expect(config.amo.nameSource).toEqual({
      path: 'dist/{slug}/firefox/_locales/{lang}/messages.json', key: 'extName',
    });
  });
});
