// The what's-new page (src/whats-new.html + whats-new.js) opens itself on update,
// so the same rules as the welcome page apply: it must localize in all 43 locales
// and touch neither the network nor storage — a tab the user did not ask for that
// phoned home would be indefensible. 1.9.0 / 4.8.0 carry one card, sub-folders
// several levels deep (#117), worded product-neutrally so both extensions ship
// the same strings.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'src/whats-new.html'), 'utf8');

const SHARED_KEYS = ['whatsNewHeading', 'whatsNewNestTitle', 'whatsNewNestBody'];
// Earlier releases' cards (1.7.0 / 4.6.0, then the 1.8.0 / 4.7.0 side panel).
// Their strings must not linger in 86 files.
const RETIRED_KEYS = [
  'whatsNewNestedTitle', 'whatsNewNestedBody', 'whatsNewReuseTitle', 'whatsNewReuseBody',
  'whatsNewBaiduTitle', 'whatsNewBaiduBody', 'whatsNewPanelTitle', 'whatsNewPanelBody',
];

function load({ lang = 'en', missingI18n = false, messages, version = '1.9.0' } = {}) {
  jest.resetModules();
  chrome.i18n.getUILanguage = jest.fn(() => lang);
  chrome.i18n.getMessage = missingI18n
    ? jest.fn(() => '')          // a locale file that failed to load
    : jest.fn((key) => (messages && key in messages ? messages[key] : key));
  chrome.runtime.getManifest = jest.fn(() => ({ version }));
  document.documentElement.removeAttribute('lang');
  document.body.removeAttribute('dir');
  document.body.innerHTML = HTML.replace(/[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*/, '');

  // Capture this module instance's DOMContentLoaded handler rather than dispatching
  // the event: `document` outlives jest.resetModules(), so every earlier load()
  // would still be listening and re-run against this DOM.
  let onReady = null;
  const spy = jest.spyOn(document, 'addEventListener')
    .mockImplementation((type, fn) => { if (type === 'DOMContentLoaded') onReady = fn; });
  require('../src/whats-new');
  spy.mockRestore();
  onReady();
}

const txt = (id) => document.getElementById(id).textContent;

describe('what\'s-new page rendering', () => {
  test('every slot gets its localized string', () => {
    load();
    for (const id of ['nTitle', 'nHeading', 'nNestTitle', 'nNestBody', 'nCta']) {
      expect(txt(id)).toBeTruthy();
    }
    // Reused keys, so the page adds no string for the product name or the button.
    expect(txt('nTitle')).toBe('appTitle');
    expect(txt('nCta')).toBe('welcomeCta');
  });

  test('the version chip comes from the manifest, never from a translation', () => {
    load({ version: '4.8.0' });
    expect(txt('nVersion')).toBe('v4.8.0');
  });

  test('one card: sub-folders several levels deep', () => {
    load();
    expect(document.querySelectorAll('.step')).toHaveLength(1);
    expect(document.getElementById('nNestTitle')).not.toBeNull();
  });

  test('the cards are features, not numbered steps', () => {
    load();
    // .cards switches the counter markers off; without it the list would read
    // "1." like the install steps, which these are not.
    expect(document.querySelector('.steps').classList.contains('cards')).toBe(true);
  });

  test('a locale that fails to load still renders readable English, never blanks', () => {
    load({ missingI18n: true });
    expect(txt('nHeading')).toBe("What's new");
    expect(txt('nNestTitle')).toBe('Sub-folders, several levels deep');
    expect(txt('nNestBody')).toContain('4 levels');
    expect(txt('nCta')).toBe('Got it');
  });

  test('an RTL locale flips the body direction', () => {
    load({ lang: 'ar' });
    expect(document.body.getAttribute('dir')).toBe('rtl');
  });

  test('an LTR locale leaves the direction alone', () => {
    load({ lang: 'fr' });
    expect(document.body.getAttribute('dir')).toBeNull();
  });

  test('the CTA closes the tab and nothing else', () => {
    load();
    const close = jest.spyOn(window, 'close').mockImplementation(() => {});
    chrome.tabs.getCurrent = jest.fn((cb) => cb({ id: 7 }));
    chrome.tabs.remove = jest.fn();

    document.getElementById('nCta').click();

    expect(close).toHaveBeenCalled();
    expect(chrome.tabs.remove).toHaveBeenCalledWith(7);
    close.mockRestore();
  });

  test('the page never reaches the network or writes storage', () => {
    // It opens unprompted, so anything firing here would look like a phone-home.
    const src = fs.readFileSync(path.join(ROOT, 'src/whats-new.js'), 'utf8');
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
    expect(src).not.toMatch(/storage\.(sync|local)\.set/);
    // The markup pulls in no remote asset either.
    expect(HTML).not.toMatch(/https?:\/\//);
  });
});

describe('what\'s-new strings ship in every locale', () => {
  const localesOf = (ext) =>
    fs.readdirSync(path.join(ROOT, 'extensions', ext, '_locales'));
  const read = (ext, locale) => JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extensions', ext, '_locales', locale, 'messages.json'), 'utf8'));

  for (const ext of ['ai-folders', 'gemini-folders']) {
    test(`${ext} has the shared keys in all 43 locales, none empty`, () => {
      const locales = localesOf(ext);
      expect(locales).toHaveLength(43);
      for (const locale of locales) {
        const messages = read(ext, locale);
        for (const key of SHARED_KEYS) {
          expect(messages[key] && messages[key].message.trim()).toBeTruthy();
        }
      }
    });
  }

  test('the earlier cards left no strings behind', () => {
    for (const ext of ['ai-folders', 'gemini-folders']) {
      for (const locale of localesOf(ext)) {
        const messages = read(ext, locale);
        for (const key of RETIRED_KEYS) expect(messages[key]).toBeUndefined();
      }
    }
  });

  test('the shared wording is product-neutral, so the two cannot drift', () => {
    for (const locale of localesOf('ai-folders')) {
      const af = read('ai-folders', locale);
      const gf = read('gemini-folders', locale);
      for (const key of [...SHARED_KEYS, 'openSidePanel']) {
        expect(af[key] && af[key].message.trim()).toBeTruthy();
        expect(gf[key].message).toBe(af[key].message);
      }
    }
  });
});

describe('the update trigger', () => {
  const read = (ext) => fs.readFileSync(
    path.join(ROOT, 'extensions', ext, 'background.js'), 'utf8');
  const manifestVersion = (ext) => JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extensions', ext, 'manifest.json'), 'utf8')).version;

  const parts = (v) => v.split('.').map(Number);
  const isAhead = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  };

  test.each(['ai-folders', 'gemini-folders'])(
    '%s never gates the page on a version it does not ship', (ext) => {
      const src = read(ext);
      const declared = src.match(/const WHATS_NEW_VERSION = '([^']+)'/);
      expect(declared).not.toBeNull();
      // Ahead of the manifest is the failure: the page would open on the release
      // AFTER this one, carrying notes written for a version already installed.
      //
      // Behind is not. It is the documented way to ship a release with nothing to
      // explain — the gate is an equality, so a constant left where it was simply
      // never fires. This test used to demand equality outright, which forbade
      // exactly the case CLAUDE.md §10b describes, and made a patch release
      // reopen the previous release's notes.
      expect(isAhead(declared[1], manifestVersion(ext))).toBe(false);
    });

  test.each(['ai-folders', 'gemini-folders'])(
    '%s does not carry notes for a version that already shipped', (ext) => {
      // The other half: if the constant matches the manifest, the page WILL open,
      // so the notes have to be this release's. Nothing here can check prose —
      // what it can check is that the pairing was a decision, which is what the
      // two states above make visible in the diff.
      const declared = read(ext).match(/const WHATS_NEW_VERSION = '([^']+)'/)[1];
      const shipped = manifestVersion(ext);
      expect([declared, shipped].every((v) => /^\d+\.\d+(\.\d+)?$/.test(v))).toBe(true);
    });

  test.each(['ai-folders', 'gemini-folders'])(
    '%s opens it only on update, once', (ext) => {
      const src = read(ext);
      expect(src).toMatch(/if \(reason !== 'update'\) return;/);
      // The seen-marker is what survives an unpacked reload, which also fires
      // onInstalled with reason 'update'.
      expect(src).toMatch(/whatsNewSeenFor === WHATS_NEW_VERSION/);
      expect(src).toMatch(/openWhatsNewTab\(details && details\.reason\)/);
    });
});
