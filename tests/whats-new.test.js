// The what's-new page (src/whats-new.html + whats-new.js) opens itself on update,
// so the same rules as the welcome page apply: it must localize in all 43 locales,
// name the modifier key this platform actually has, and touch neither the network
// nor storage — a tab the user did not ask for that phoned home would be
// indefensible. The Baidu card is the one thing that differs between the two
// products, and it is decided by the site registry rather than a flag.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'src/whats-new.html'), 'utf8');

const SHARED_KEYS = [
  'whatsNewHeading', 'whatsNewNestedTitle', 'whatsNewNestedBody',
  'whatsNewReuseTitle', 'whatsNewReuseBody',
];
const BAIDU_KEYS = ['whatsNewBaiduTitle', 'whatsNewBaiduBody'];

const AF_SITES = { baidu: { key: 'baidu', domain: 'wenxin.baidu.com', logo: 'icons/baidu.png' } };

const REAL_PLATFORM = navigator.platform;
function setPlatform(value) {
  Object.defineProperty(navigator, 'platform', { value, configurable: true });
  // userAgentData is the signal the helper prefers; keep it out of the way.
  Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
}

function load({ lang = 'en', missingI18n = false, sites, messages, platform = 'Win32', version = '1.7.0' } = {}) {
  jest.resetModules();
  setPlatform(platform);
  chrome.i18n.getUILanguage = jest.fn(() => lang);
  chrome.i18n.getMessage = missingI18n
    ? jest.fn(() => '')          // a locale file that failed to load
    : jest.fn((key) => (messages && key in messages ? messages[key] : key));
  chrome.runtime.getManifest = jest.fn(() => ({ version }));
  if (sites) global.SITES = sites; else delete global.SITES;
  // whats-new.html loads utils.js with a <script> tag, which innerHTML never runs.
  global.currentModifierKeyLabel = require('../src/utils').currentModifierKeyLabel;
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

afterEach(() => {
  delete global.SITES;
  delete global.currentModifierKeyLabel;
  setPlatform(REAL_PLATFORM);
});

const txt = (id) => document.getElementById(id).textContent;

describe('what\'s-new page rendering', () => {
  test('every slot gets its localized string', () => {
    load({ sites: AF_SITES });
    for (const id of ['nTitle', 'nHeading', 'nNestedTitle', 'nNestedBody',
      'nReuseTitle', 'nBaiduTitle', 'nBaiduBody', 'nCta']) {
      expect(txt(id)).toBeTruthy();
    }
    // Reused keys, so the page adds no string for the product name or the button.
    expect(txt('nTitle')).toBe('appTitle');
    expect(txt('nCta')).toBe('welcomeCta');
  });

  test('the version chip comes from the manifest, never from a translation', () => {
    load({ version: '4.6.0' });
    expect(txt('nVersion')).toBe('v4.6.0');
  });

  test('the modifier key is the one this platform actually has', () => {
    const body = { whatsNewReuseBody: '{k}-click reuses the last tab.', keyCtrl: 'Strg' };
    load({ platform: 'MacIntel', messages: body });
    expect(txt('nReuseBody')).toBe('Cmd-click reuses the last tab.');
    expect(txt('nModKey')).toBe('Cmd');

    load({ platform: 'Win32', messages: body });
    // The control key's own name is localized — German keyboards say Strg.
    expect(txt('nReuseBody')).toBe('Strg-click reuses the last tab.');
    expect(txt('nModKey')).toBe('Strg');
  });

  test('the placeholder never survives into the rendered text', () => {
    load();
    expect(txt('nReuseBody')).not.toContain('{k}');
  });

  test('the Baidu card is dropped when the product has no such site', () => {
    load();   // no registry — Gemini Folders
    expect(document.getElementById('nBaiduCard')).toBeNull();
    expect(document.querySelectorAll('.step')).toHaveLength(2);
  });

  test('the Baidu card is kept, with its logo, when the registry has it', () => {
    load({ sites: AF_SITES });
    expect(document.getElementById('nBaiduCard')).not.toBeNull();
    expect(document.querySelectorAll('.step')).toHaveLength(3);
    const img = document.querySelector('#nBaiduLogo img');
    expect(img.getAttribute('src')).toBe('icons/baidu.png');
    expect(img.getAttribute('alt')).toBe('');
  });

  test('a registry without Baidu also drops the card', () => {
    // Gemini Folders has no registry at all, but a future AF-like build could ship
    // one without that site; the card follows the data either way.
    load({ sites: { claude: { key: 'claude', domain: 'claude.ai', logo: 'icons/claude.png' } } });
    expect(document.getElementById('nBaiduCard')).toBeNull();
  });

  test('the cards are features, not numbered steps', () => {
    load();
    // .cards switches the counter markers off; without it the list would read
    // "1. 2." like the install steps, which these are not.
    expect(document.querySelector('.steps').classList.contains('cards')).toBe(true);
  });

  test('a locale that fails to load still renders readable English, never blanks', () => {
    load({ missingI18n: true, sites: AF_SITES });
    expect(txt('nHeading')).toBe("What's new");
    expect(txt('nNestedBody')).toContain('Drag a folder');
    expect(txt('nBaiduTitle')).toBeTruthy();
    expect(txt('nCta')).toBe('Got it');
    // The fallback still gets the placeholder filled in.
    expect(txt('nReuseBody')).toContain('Ctrl');
    expect(txt('nReuseBody')).not.toContain('{k}');
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

  test('every locale keeps the {k} placeholder and hardcodes no key name', () => {
    for (const ext of ['ai-folders', 'gemini-folders']) {
      for (const locale of localesOf(ext)) {
        const body = read(ext, locale).whatsNewReuseBody.message;
        expect(body).toContain('{k}');
        // Naming a key outright would be wrong on half the machines.
        expect(body).not.toMatch(/\bCmd\b/);
        expect(body).not.toMatch(/\bCtrl\b/);
      }
    }
  });

  test('the Baidu strings ship in AI Folders only — Gemini Folders never shows them', () => {
    for (const locale of localesOf('ai-folders')) {
      const messages = read('ai-folders', locale);
      for (const key of BAIDU_KEYS) {
        expect(messages[key] && messages[key].message.trim()).toBeTruthy();
      }
    }
    for (const locale of localesOf('gemini-folders')) {
      const messages = read('gemini-folders', locale);
      for (const key of BAIDU_KEYS) {
        expect(messages[key]).toBeUndefined();
      }
    }
  });

  test('the shared wording is product-neutral, so the two cannot drift', () => {
    for (const locale of localesOf('ai-folders')) {
      const af = read('ai-folders', locale);
      const gf = read('gemini-folders', locale);
      for (const key of SHARED_KEYS) {
        expect(af[key].message).toBe(gf[key].message);
      }
    }
  });
});

describe('the update trigger', () => {
  const read = (ext) => fs.readFileSync(
    path.join(ROOT, 'extensions', ext, 'background.js'), 'utf8');
  const manifestVersion = (ext) => JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extensions', ext, 'manifest.json'), 'utf8')).version;

  test.each(['ai-folders', 'gemini-folders'])(
    '%s gates the page on the version it actually ships', (ext) => {
      const src = read(ext);
      const declared = src.match(/const WHATS_NEW_VERSION = '([^']+)'/);
      expect(declared).not.toBeNull();
      // A constant left behind on the next release would reopen the page for a
      // version whose notes it does not describe.
      expect(declared[1]).toBe(manifestVersion(ext));
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
