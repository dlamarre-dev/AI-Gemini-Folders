// The first-run page (src/welcome.html + welcome.js) exists to fix a measured
// failure: 23% of the people who removed Gemini Folders had never opened the popup
// once (uninstall survey, 2026-08). Chrome hides a new extension behind the puzzle
// icon, so nothing on screen changes after installing. What is worth locking down
// here is that the page localizes, that step 1 really is "pin it", and that every
// locale can render it — a blank step would read as a broken install.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'src/welcome.html'), 'utf8');

const WELCOME_KEYS = [
  'welcomeReady', 'welcomePinTitle', 'welcomePinBody', 'welcomeOpenTitle',
  'welcomeOpenBody', 'welcomeSaveTitle', 'welcomeSaveBody', 'welcomeCta',
];

function load({ lang = 'en', missingI18n = false } = {}) {
  jest.resetModules();
  chrome.i18n.getUILanguage = jest.fn(() => lang);
  chrome.i18n.getMessage = missingI18n
    ? jest.fn(() => '')          // a locale file that failed to load
    : jest.fn((key) => key);
  document.documentElement.removeAttribute('lang');
  document.body.removeAttribute('dir');
  // Only the <body> content — jsdom ignores <head> in innerHTML anyway.
  document.body.innerHTML = HTML.replace(/[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*/, '');
  require('../src/welcome');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

const txt = (id) => document.getElementById(id).textContent;

describe('welcome page rendering', () => {
  test('every slot gets its localized string', () => {
    load();
    expect(txt('wTitle')).toBe('appTitle');   // the product name reuses an existing key
    for (const key of WELCOME_KEYS) {
      const id = 'w' + key.slice('welcome'.length);
      expect(txt(id)).toBe(key);
    }
  });

  test('the pin step comes first — it is the one that fixes the churn', () => {
    load();
    const titles = Array.from(document.querySelectorAll('.step-title')).map(el => el.id);
    expect(titles).toEqual(['wPinTitle', 'wOpenTitle', 'wSaveTitle']);
    expect(document.querySelector('.step .step-num').textContent).toBe('1');
  });

  test('a locale that fails to load still renders readable English, never blanks', () => {
    load({ missingI18n: true });
    for (const key of WELCOME_KEYS) {
      const id = 'w' + key.slice('welcome'.length);
      expect(txt(id).trim()).not.toBe('');
    }
  });

  test('an RTL locale flips the body direction', () => {
    load({ lang: 'ar' });
    expect(document.body.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  test('an LTR locale leaves the direction alone', () => {
    load({ lang: 'fr' });
    expect(document.body.getAttribute('dir')).toBeNull();
  });

  test('the CTA closes the tab and nothing else', () => {
    load();
    const close = jest.spyOn(window, 'close').mockImplementation(() => {});
    document.getElementById('wCta').click();
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });

  test('the page never reaches the network or writes storage', () => {
    // It opens unprompted on install, so it must stay inert: no telemetry, no
    // "seen the welcome page" flag, nothing that could look like a phone-home.
    const src = fs.readFileSync(path.join(ROOT, 'src/welcome.js'), 'utf8');
    expect(src).not.toMatch(/fetch|XMLHttpRequest|WebSocket|storage\.(local|sync)\.set/);
    expect(HTML).not.toMatch(/https?:\/\//);
  });
});

describe('welcome strings ship in every locale', () => {
  for (const ext of ['ai-folders', 'gemini-folders']) {
    const base = path.join(ROOT, 'extensions', ext, '_locales');
    const locales = fs.readdirSync(base);

    test(`${ext} has 43 locales`, () => {
      expect(locales).toHaveLength(43);
    });

    test.each(locales)(`${ext}/%s carries every welcome key, none empty`, (loc) => {
      const msgs = JSON.parse(fs.readFileSync(path.join(base, loc, 'messages.json'), 'utf8'));
      const bad = WELCOME_KEYS.filter(k => !msgs[k] || !String(msgs[k].message).trim());
      expect({ loc, bad }).toEqual({ loc, bad: [] });
    });
  }

  test('only welcomeOpenBody differs between the two products', () => {
    // The other seven are product-neutral on purpose, so the two extensions cannot
    // drift apart in wording. welcomeOpenBody must differ: Gemini vs 18 sites.
    const read = (ext, loc) => JSON.parse(fs.readFileSync(
      path.join(ROOT, 'extensions', ext, '_locales', loc, 'messages.json'), 'utf8'));
    const locales = fs.readdirSync(path.join(ROOT, 'extensions', 'ai-folders', '_locales'));
    const drifted = [];
    const identicalOpenBody = [];
    for (const loc of locales) {
      const af = read('ai-folders', loc);
      const gf = read('gemini-folders', loc);
      for (const k of WELCOME_KEYS) {
        if (k === 'welcomeOpenBody') {
          if (af[k].message === gf[k].message) identicalOpenBody.push(loc);
        } else if (af[k].message !== gf[k].message) {
          drifted.push(`${loc}:${k}`);
        }
      }
    }
    expect(drifted).toEqual([]);
    expect(identicalOpenBody).toEqual([]);
  });
});
