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

  // Store dropdowns do not agree on language names, and a lookup that only knows
  // ours fails silently on exactly the locales that need an alias. Verified
  // against a real Partner Center menu: it writes Bangla, Kiswahili and
  // Norwegian (Bokmål) where we write Bengali, Swahili and Norwegian.
  test('locales whose store name differs from ours carry an alias', () => {
    const alts = Object.fromEntries(
      config.locales.map((l) => [l.internal, l.altNames || []]));
    expect(alts.bn).toContain('Bangla');
    expect(alts.sw).toContain('Kiswahili');
    expect(alts.nb).toContain('Norwegian (Bokmål)');
  });

  // Filipino is offered by the Chrome Web Store and not by Partner Center, so it
  // is the one locale that can never have an Edge listing. Recorded here because
  // a future "why is tl missing" is otherwise a research task from scratch.
  test('Filipino is still configured, even though Edge does not offer it', () => {
    const tl = config.locales.find((l) => l.internal === 'tl');
    expect(tl.cws).toBe('fil');
    expect(tl.name).toBe('Filipino');
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

  // Every store this project publishes to. Kept in one place because the loops
  // below all walk it, and because the build.py binding asserts build.py's own
  // target table matches it exactly.
  const STORES = ['chrome', 'edge', 'firefox'];

  test('a profile exists for every store, and no store is left undeclared', () => {
    expect(Object.keys(config.assets).sort()).toEqual([...STORES].sort());
  });

  test('the path templates point at dist/, which build.py produces', () => {
    for (const store of STORES) {
      const dir = `marketing_${store}`;
      const profile = config.assets[store];
      expect(profile.description).toBe(`dist/{slug}/${dir}/Promo{LANG}.txt`);
      expect(profile.screenshot).toBe(`dist/{slug}/${dir}/screenshots/Promo_{n}_{lang}.png`);
      expect(profile.screenshotsPerListing).toBe(5);
    }
  });

  // The publisher uploads the package through each store's API, so it has to be
  // able to find the zip build.py emits. {version} is read from the BUILT
  // manifest, which is what stops the version in the filename from disagreeing
  // with the bytes inside it.
  test('the package templates match what build.py emits', () => {
    for (const store of STORES) {
      const profile = config.assets[store];
      expect(profile.package).toBe(`dist/{slug}-${store}-v{version}.zip`);
      expect(profile.versionSource).toEqual({
        path: `dist/{slug}/${store}/manifest.json`, key: 'version',
      });
    }
  });

  // Not a style check: a template that lost {version} or {slug} would resolve to
  // one path for every item and release, and upload whichever build was there.
  test('every package template keeps the placeholders that make it specific', () => {
    for (const store of STORES) {
      expect(config.assets[store].package).toContain('{slug}');
      expect(config.assets[store].package).toContain('{version}');
      expect(config.assets[store].versionSource.path).toContain('{slug}');
    }
  });

  // The comparisons above only say the config still says what it said. These
  // bind it to the code that actually names the files: rename the zip in
  // build.py and the publisher would look for a file that is never written.
  //
  // This used to assert the literal `-chrome-` and `-firefox-` substrings and
  // the exact indentation of zip_prefix. That worked while build.py had one
  // hand-written function per target; generalizing it to a TARGETS table made
  // those strings disappear, so the assertions were re-aimed at the general
  // form. Same intention, mechanism that survives a third store.
  describe('bound to what build.py actually emits', () => {
    const buildPy = fs.readFileSync(path.join(ROOT, 'build.py'), 'utf8');

    // The single f-string every target's archive is named by.
    test('build.py names the zips <prefix>-<target>-v<version>.zip', () => {
      expect(buildPy).toContain(
        `f"{cfg['zip_prefix']}-{target_name}-v{version}.zip"`);
    });

    // The store profiles above are only meaningful if build.py actually builds
    // those targets — a profile for a target build.py never emits would resolve
    // to paths nothing writes.
    test('build.py\'s TARGETS table is exactly the stores in the config', () => {
      const table = buildPy.slice(buildPy.indexOf('TARGETS = {'));
      const declared = [...table.slice(0, table.indexOf('\n}'))
        .matchAll(/^ {4}"(\w+)": \{$/gm)].map(m => m[1]);
      expect(declared.sort()).toEqual([...STORES].sort());
    });

    // The templates use {slug}; build.py uses zip_prefix. They are only
    // interchangeable while those two strings agree, for every item.
    // Whitespace-tolerant: the old form pinned the exact column, which made
    // re-indenting EXTENSION_CONFIG a test failure for no reason.
    test('each item\'s slug is its zip_prefix in build.py', () => {
      for (const item of config.items) {
        expect(buildPy).toMatch(
          new RegExp(`"zip_prefix":\\s*"${item.slug}"`));
      }
    });
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
