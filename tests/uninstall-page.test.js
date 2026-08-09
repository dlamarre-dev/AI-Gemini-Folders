/**
 * The uninstall feedback page (docs/uninstall-*.html + site/uninstall.js).
 * Driven here in jsdom the same way the browser drives it: the extension's URL
 * params go in, and what comes out is the rendered form and — only on an
 * explicit submit — the Google Form payload.
 *
 * @jest-environment-options {"url": "https://aifolders.xyz/uninstall-ai-folders.html?l=fr&v=1.6.2&b=chrome&i=2026-06-08&o=63&s=9"}
 */

// 2026-06-08 → 2026-07-25 is 47 days; pinned so the tenure math is assertable.
const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);
const FR_URL = '/uninstall-ai-folders.html?l=fr&v=1.6.2&b=chrome&i=2026-06-08&o=63&s=9';

// Stands in for real ids from a Form's pre-filled link.
const WIRED = {
  af: {
    formId: 'AF_FORM',
    fields: {
      reasons: 'entry.1', other: 'entry.2', comments: 'entry.3', days: 'entry.4',
      daysExact: 'entry.5', opens: 'entry.6', version: 'entry.7', browser: 'entry.8', lang: 'entry.9',
      saves: 'entry.10',
    },
  },
  gf: { formId: 'GF_FORM', fields: { reasons: 'entry.11', lang: 'entry.19', daysExact: 'entry.15' } },
};

// `tweak` runs after the string tables are in place but before the renderer boots
// — the only window where a stale/partial i18n file can be simulated, since the
// require would otherwise overwrite any change made beforehand.
function load({ product = 'af', search = FR_URL, tweak } = {}) {
  jest.resetModules();
  window.history.replaceState({}, '', search);
  document.body.innerHTML = '<main id="app"></main>';
  window.UF_PRODUCT = product;
  window.UF_FORMS = undefined;
  require('../docs/site/i18n-manual.js');
  require('../docs/site/logos.js');
  require('../docs/site/uninstall-i18n.js');
  if (tweak) tweak();
  require('../docs/site/uninstall.js');
}

const opts = () => Array.from(document.querySelectorAll('.uf-opt input'));
const check = value => {
  const el = document.querySelector(`.uf-opt input[value="${value}"]`);
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
// The result panel is shown from the send promise's .then(), so every submit is
// awaited — both to assert on the outcome and so no stray microtask from one
// test lands in the middle of the next one.
const flush = () => new Promise(r => setTimeout(r, 0));   // jsdom has no setImmediate
const submit = async () => {
  document.getElementById('ufForm').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
};
const body = () => global.fetch.mock.calls[0][1].body;

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  global.fetch = jest.fn(() => Promise.resolve());
  try { sessionStorage.clear(); } catch (_) {}
});

describe('rendering', () => {
  test('uses the language and product the extension put in the URL', () => {
    load();
    expect(document.querySelector('.h1').textContent).toBe('Avant de partir');
    expect(document.querySelector('.uf-brand').textContent).toContain('Dossiers IA');
    // The product name is substituted into the question, not left as "{p}".
    const q1 = document.querySelectorAll('.h3')[0].textContent;
    expect(q1).toContain('Dossiers IA');
    expect(q1).not.toContain('{p}');
    expect(document.documentElement.getAttribute('lang')).toBe('fr');
  });

  test('the Gemini Folders page carries its own name and mark', () => {
    load({ product: 'gf', search: '/uninstall-gemini-folders.html?l=fr' });
    expect(document.querySelector('.uf-brand').textContent).toContain('Dossiers Gemini');
    expect(document.querySelector('.uf-mark svg')).not.toBeNull();  // LOGOS.geminiFolders
  });

  test('an unknown or missing language falls back to English', () => {
    load({ search: '/uninstall-ai-folders.html?l=xx' });
    expect(document.querySelector('.h1').textContent).toBe('Before you go');
    load({ search: '/uninstall-ai-folders.html' });
    expect(document.querySelector('.h1').textContent).toBe('Before you go');
  });

  test('a regional tag the extension did not normalize still resolves', () => {
    load({ search: '/uninstall-ai-folders.html?l=fr-CA' });
    expect(document.querySelector('.h1').textContent).toBe('Avant de partir');
  });

  test('an RTL locale flips the document direction', () => {
    load({ search: '/uninstall-ai-folders.html?l=ar' });
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  test('the seven reasons carry the stable English values the Form expects', () => {
    load();
    expect(opts().map(el => el.value)).toEqual([
      'not-what-expected', 'dont-understand-how', 'wanted-in-page-ui', 'found-bugs',
      'no-longer-needed', 'found-alternative', 'other',
    ]);
    // ...and are shown with translated labels, not those values.
    expect(document.querySelector('.uf-opts').textContent).toContain('bogues');
  });

  test('Gemini Folders offers "switched to AI Folders" first, naming the other product', () => {
    load({ product: 'gf', search: '/uninstall-gemini-folders.html?l=fr' });
    expect(opts().map(el => el.value)).toEqual([
      'switched-to-ai-folders',
      'not-what-expected', 'dont-understand-how', 'wanted-in-page-ui', 'found-bugs',
      'no-longer-needed', 'found-alternative', 'other',
    ]);
    // The label must name AI Folders even though the page is about Gemini Folders.
    const first = document.querySelector('.uf-opt span').textContent;
    expect(first).toContain('Dossiers IA');
    expect(first).not.toContain('{p}');
    // The page itself still identifies as Gemini Folders.
    expect(document.querySelector('.uf-brand').textContent).toContain('Dossiers Gemini');
  });

  test('the AI Folders page never offers the switch option', () => {
    load();
    expect(opts().map(el => el.value)).not.toContain('switched-to-ai-folders');
  });

  test('a reason with no string anywhere is dropped, not rendered blank', () => {
    // uninstall.js and uninstall-i18n.js are separate files, so a browser holding
    // a stale copy of one can pair a known value with a missing label. An empty
    // checkbox is worse than one option fewer.
    load({
      product: 'gf',
      search: '/uninstall-gemini-folders.html?l=fr',
      tweak: () => {
        for (const lang of Object.keys(window.UF_I18N)) delete window.UF_I18N[lang].optSwitchedToAf;
      },
    });

    expect(opts().map(el => el.value)).not.toContain('switched-to-ai-folders');
    expect(opts()).toHaveLength(7);   // the GF-only option dropped, the rest intact
    // No checkbox is ever shown without a readable label.
    for (const el of opts()) {
      expect(el.closest('.uf-opt').textContent.trim()).not.toBe('');
    }
  });

  test('the free-text field appears only once Other is checked', () => {
    load();
    expect(document.getElementById('ufOther').hidden).toBe(true);
    check('other');
    expect(document.getElementById('ufOther').hidden).toBe(false);
  });

  test('nothing is sent while the page is merely open', () => {
    load();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('submission', () => {
  test('sends the reasons, the free text and the derived tenure', async () => {
    load();
    window.UF_FORMS = WIRED;
    check('found-bugs');
    check('other');
    document.getElementById('ufOther').value = '  the popup was slow  ';
    document.getElementById('ufComments').value = 'otherwise nice';
    await submit();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://docs.google.com/forms/d/e/AF_FORM/formResponse');
    expect(init.method).toBe('POST');
    expect(init.mode).toBe('no-cors');

    const b = body();
    expect(b.getAll('entry.1')).toEqual(['found-bugs', 'other']);  // one append per box
    expect(b.get('entry.2')).toBe('the popup was slow');           // trimmed
    expect(b.get('entry.3')).toBe('otherwise nice');
    expect(b.get('entry.4')).toBe('47');                           // days, computed here
    expect(b.get('entry.5')).toBe('yes');                          // tenure is exact
    expect(b.get('entry.6')).toBe('63');                           // popup opens
    expect(b.get('entry.10')).toBe('9');                           // conversations saved
    expect(b.get('entry.7')).toBe('1.6.2');
    expect(b.get('entry.8')).toBe('chrome');
    expect(b.get('entry.9')).toBe('fr');
    expect(b.get('fvv')).toBe('1');
  });

  // An entry key the Form does not know costs the WHOLE response, not just that
  // field — so the page must stay shippable before the `saves` question exists.
  test('the saves count is withheld until its Form question is wired up', async () => {
    load();
    window.UF_FORMS = {
      af: { formId: 'AF_FORM', fields: { ...WIRED.af.fields, saves: 'PASTE_SAVES_ENTRY_ID' } },
    };
    await submit();
    const b = body();
    expect(b.has('PASTE_SAVES_ENTRY_ID')).toBe(false);
    expect(b.has('entry.10')).toBe(false);
    expect(b.get('entry.6')).toBe('63');   // the rest of the payload is unaffected
  });

  test('a Form config with no saves field at all still submits', async () => {
    load();
    const { saves, ...withoutSaves } = WIRED.af.fields;
    window.UF_FORMS = { af: { formId: 'AF_FORM', fields: withoutSaves } };
    await submit();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(body().has('undefined')).toBe(false);
  });

  test('an empty answer is still accepted — everything is optional', async () => {
    load();
    window.UF_FORMS = WIRED;
    await submit();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(body().getAll('entry.1')).toEqual([]);
    expect(document.getElementById('ufResult').hidden).toBe(false);
  });

  test('the result panel replaces the ask, not just the form', async () => {
    load();
    window.UF_FORMS = WIRED;
    // "Before you go / two short questions" must not sit above a thank-you.
    expect(document.getElementById('ufAsk').hidden).toBe(false);
    await submit();
    expect(document.getElementById('ufAsk').hidden).toBe(true);
    expect(document.getElementById('ufForm').hidden).toBe(true);
    // The product name stays, so the page still says what it is about.
    expect(document.querySelector('.uf-brand').textContent).toContain('Dossiers IA');
  });

  test('free text typed then unchecked is not sent behind the user\'s back', async () => {
    load();
    window.UF_FORMS = WIRED;
    check('other');
    document.getElementById('ufOther').value = 'changed my mind';
    const el = document.querySelector('.uf-opt input[value="other"]');
    el.checked = false;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await submit();
    expect(body().has('entry.2')).toBe(false);
  });

  test('an inferred install date is reported as inexact', async () => {
    load({ search: '/uninstall-ai-folders.html?l=en&i=2026-06-08&ie=1' });
    window.UF_FORMS = WIRED;
    await submit();
    expect(body().get('entry.5')).toBe('no');
  });

  test('no install date means no tenure field at all', async () => {
    load({ search: '/uninstall-ai-folders.html?l=en' });
    window.UF_FORMS = WIRED;
    await submit();
    expect(body().has('entry.4')).toBe(false);
  });

  test('the response goes to the form of the extension being uninstalled', async () => {
    load({ product: 'gf', search: '/uninstall-gemini-folders.html?l=en' });
    window.UF_FORMS = WIRED;
    await submit();
    expect(global.fetch.mock.calls[0][0]).toContain('GF_FORM');
  });

  test('the switch reason is submitted under its stable English value', async () => {
    load({ product: 'gf', search: '/uninstall-gemini-folders.html?l=fr' });
    window.UF_FORMS = WIRED;
    check('switched-to-ai-folders');
    await submit();
    // Never the translated label — the GF Form only knows this exact option.
    expect(body().getAll('entry.11')).toEqual(['switched-to-ai-folders']);
  });

  test('unconfigured Form ids warn the maintainer, never the user', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    load();                       // window.UF_FORMS left undefined
    await submit();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(document.getElementById('ufForm').hidden).toBe(true);
    expect(document.getElementById('ufResult').textContent).toContain('Merci');
    warn.mockRestore();
  });

  test('a bot that fills the honeypot gets the thank-you and sends nothing', async () => {
    load();
    window.UF_FORMS = WIRED;
    document.getElementById('ufHp').value = 'http://spam.example';
    await submit();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(document.getElementById('ufResult').textContent).toContain('Merci');
  });

  test('a blocked request offers the answer back instead of a false success', async () => {
    load();
    window.UF_FORMS = WIRED;
    global.fetch.mockReturnValue(Promise.reject(new Error('blocked')));
    check('found-bugs');
    document.getElementById('ufComments').value = 'my long report';
    await submit();
    await Promise.resolve();
    await Promise.resolve();

    const out = document.getElementById('ufResult');
    expect(out.hidden).toBe(false);
    expect(out.textContent).toContain("L'envoi n'a pas fonctionné");
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: t => { copied.push(t); return Promise.resolve(); } },
      configurable: true,
    });
    document.getElementById('ufCopy').click();
    expect(copied[0]).toContain('my long report');
    expect(copied[0]).toContain('bogues');   // the localized reason label
  });

  test('a reload after a successful send does not post a duplicate', async () => {
    load();
    window.UF_FORMS = WIRED;
    await submit();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    load();                    // same product, as if the page were reopened
    window.UF_FORMS = WIRED;
    // load() calls jest.resetModules(), which also drops the mock's call
    // history — clear it explicitly so the intent is not resting on that.
    global.fetch.mockClear();
    await submit();
    expect(global.fetch).not.toHaveBeenCalled();
    // ...and the user still gets the thank-you rather than an error.
    expect(document.getElementById('ufResult').hidden).toBe(false);
  });

  test('a later uninstall in a new session can answer again', async () => {
    load();
    window.UF_FORMS = WIRED;
    await submit();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // A no-cors response is opaque, so a rejected submission (401 from an
    // unpublished Form, server error) also resolves and gets marked as sent. The
    // guard therefore has to be per-tab: in localStorage that verdict would be
    // permanent and a genuine later uninstall would never reach us.
    sessionStorage.clear();          // new tab, months later
    load();
    window.UF_FORMS = WIRED;
    global.fetch.mockClear();
    await submit();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
