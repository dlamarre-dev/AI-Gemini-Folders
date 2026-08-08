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

// `sites` stands in for the SITES registry that site-config.js defines as a global.
// welcome.html loads that file with a <script> tag, which innerHTML never executes,
// so the default here is "no registry" — the Gemini Folders case.
function load({ lang = 'en', missingI18n = false, sites, messages } = {}) {
  jest.resetModules();
  chrome.i18n.getUILanguage = jest.fn(() => lang);
  chrome.i18n.getMessage = missingI18n
    ? jest.fn(() => '')          // a locale file that failed to load
    : jest.fn((key) => (messages && key in messages ? messages[key] : key));
  if (sites) global.SITES = sites; else delete global.SITES;
  document.documentElement.removeAttribute('lang');
  document.body.removeAttribute('dir');
  // Only the <body> content — jsdom ignores <head> in innerHTML anyway.
  document.body.innerHTML = HTML.replace(/[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*/, '');
  require('../src/welcome');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

afterEach(() => { delete global.SITES; });

const txt = (id) => document.getElementById(id).textContent;
const logos = () => Array.from(document.querySelectorAll('#wSites img')).map(el => el.getAttribute('src'));

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
  });

  // The instruction quotes the popup's own Save label. Substituting at runtime is
  // what keeps the two from ever disagreeing across 43 locales.
  test('the save step quotes the popup Save button, never a literal placeholder', () => {
    load({
      lang: 'fr',
      messages: {
        welcomeSaveBody: 'type a name and press {b}.',
        saveBtn: 'Sauvegarder',
      },
    });
    expect(txt('wSaveBody')).toBe('type a name and press Sauvegarder.');
    expect(txt('wSaveBody')).not.toContain('{b}');
  });

  test('every locale wires the placeholder, so none can hardcode a button name', () => {
    const fs2 = require('fs');
    for (const ext of ['ai-folders', 'gemini-folders']) {
      const base = path.join(ROOT, 'extensions', ext, '_locales');
      for (const loc of fs2.readdirSync(base)) {
        const m = JSON.parse(fs2.readFileSync(path.join(base, loc, 'messages.json'), 'utf8'));
        expect({ ext, loc, has: m.welcomeSaveBody.message.includes('{b}') })
          .toEqual({ ext, loc, has: true });
      }
    }
  });

  test('the add-conversation replica is labelled the way the popup labels it', () => {
    load();
    expect(txt('wAddBtn')).toBe('➕ btnToggleAdd');
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

  // AI Folders draws the row from its SITES registry; Gemini Folders has none.
  test('the site row lists every supported site, local LLM excluded', () => {
    load({
      sites: {
        gemini: { key: 'gemini', domain: 'gemini.google.com', logo: 'icons/gemini.png' },
        claude: { key: 'claude', domain: 'claude.ai', logo: 'icons/claude.png' },
        // The user-configured local LLM has no domain — it is not a site you go to.
        local: { key: 'local', domain: null, logo: 'icons/local.png' },
      },
    });
    expect(logos()).toEqual(['icons/gemini.png', 'icons/claude.png']);
    expect(document.getElementById('wSites').classList.contains('site-row-single')).toBe(false);
  });

  test('with no registry it falls back to Gemini alone, shown larger', () => {
    load();
    expect(logos()).toEqual(['icons/gemini.png']);
    expect(document.getElementById('wSites').classList.contains('site-row-single')).toBe(true);
  });

  test('both extensions ship the Gemini mark the fallback points at', () => {
    for (const ext of ['ai-folders', 'gemini-folders']) {
      expect(fs.existsSync(path.join(ROOT, 'extensions', ext, 'icons/gemini.png'))).toBe(true);
    }
  });

  // The step-3 button is a hand-copied replica of the popup's own, so it can drift
  // the day someone restyles the popup. jsdom has no CSS engine to compare against,
  // but pinning the two values the replica hardcodes is enough to catch it: if the
  // popup's dark accent or card shadow changes, this fails and points here.
  test('the add-button replica still matches the popup accent it copies', () => {
    const popupCss = fs.readFileSync(path.join(ROOT, 'src/popup.css'), 'utf8');
    const welcomeCss = fs.readFileSync(path.join(ROOT, 'src/welcome.css'), 'utf8');
    const dark = popupCss.slice(popupCss.indexOf('@media (prefers-color-scheme: dark)'));
    // Space after a comma is free variation in CSS but not in a string compare.
    const tidy = (s) => s.replace(/\s+/g, ' ').replace(/,\s/g, ',').trim().toLowerCase();
    const tokenOf = (name) => tidy(dark.match(new RegExp(`--${name}:\\s*([^;]+);`))[1]);

    // Bounded to the rule body, so a later rule's background cannot stand in for it.
    const start = welcomeCss.indexOf('.popup-btn {');
    const replica = welcomeCss.slice(start, welcomeCss.indexOf('}', start));
    expect(tidy(replica.match(/background:\s*([^;]+);/)[1])).toBe(tokenOf('accent-color'));
    expect(tidy(replica.match(/box-shadow:\s*([^;]+);/)[1])).toBe(tokenOf('shadow-sm'));
    // The popup sets its own family on body and the button inherits it; the page's
    // display font must not leak into the replica.
    expect(replica).toContain("font-family: 'Inter'");
    expect(replica).toContain('font-weight: 600');
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
