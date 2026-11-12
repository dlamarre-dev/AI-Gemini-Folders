// The interface glyphs (src/icons.js) replaced the emoji the popup used as
// icons. Emoji are drawn by the OS, so they differed from one platform to the
// next; these tests are what keeps one from quietly coming back.

const fs = require('fs');
const path = require('path');
const { ICON_PATHS, icon, setIcon, setIconLabel, hydrateIcons } = require('../src/icons');

const ROOT = path.join(__dirname, '..');
const EXTENSIONS = ['ai-folders', 'gemini-folders'];
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// Pictographs only: arrows such as "↳" and typographic marks are ordinary text.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FF}]/u;

describe('icon()', () => {
  test('builds a monochrome 24×24 glyph that follows the text colour', () => {
    const svg = icon('edit');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.dataset.icon).toBe('edit');
    expect(svg.querySelector('path').getAttribute('d')).toBe(ICON_PATHS.edit);
  });

  test('the gem is an outline, empty inside', () => {
    const svg = icon('gem');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.querySelector('path').getAttribute('d')).toBe(ICON_PATHS.gem.stroke);
  });

  test('an unknown name throws instead of rendering an empty button', () => {
    expect(() => icon('nope')).toThrow('Unknown icon');
  });

  test('setIcon replaces the content; setIconLabel keeps the label as plain text', () => {
    const btn = document.createElement('button');
    btn.textContent = 'old';
    setIcon(btn, 'trash');
    expect(btn.textContent).toBe('');
    expect(btn.querySelector('svg').dataset.icon).toBe('trash');

    setIconLabel(btn, 'add', 'Add a conversation');
    expect(btn.textContent).toBe('Add a conversation');
    expect(btn.querySelectorAll('svg')).toHaveLength(1);
    expect(btn.querySelector('svg').dataset.icon).toBe('add');
  });

  test('hydrateIcons fills data-ic placeholders once, at the requested size', () => {
    document.body.innerHTML = '<button data-ic="sort" data-ic-size="18"></button>';
    hydrateIcons(document);
    hydrateIcons(document);   // a second pass must not stack a second glyph
    const svgs = document.querySelectorAll('button > svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].dataset.icon).toBe('sort');
    expect(svgs[0].getAttribute('width')).toBe('18');
  });
});

describe.each(EXTENSIONS)('%s popup.html', (ext) => {
  const html = read('extensions', ext, 'popup.html');

  test('every data-ic names a glyph that exists', () => {
    const names = [...html.matchAll(/data-ic="([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(Object.keys(ICON_PATHS)).toContain(name);
  });

  test('carries no emoji, and loads icons.js before the scripts that draw', () => {
    expect(html.match(EMOJI)).toBeNull();
    expect(html.indexOf('src="icons.js"')).toBeGreaterThan(-1);
    expect(html.indexOf('src="icons.js"')).toBeLessThan(html.indexOf('src="ui.js"'));
  });
});

describe('the shared popup code draws no emoji icon', () => {
  // utils.js is absent on purpose: its "📁 name" is the right-click menu and
  // the bookmark mirror, browser surfaces that only take text.
  test.each(['folders.js', 'prompts.js', 'bulk-actions.js', 'ui.js'])('%s', (file) => {
    expect(read('src', file).split('\n').filter((l) => EMOJI.test(l))).toEqual([]);
  });
});

describe('in-page toast (showToast, one copy per background.js)', () => {
  // The toast is a function injected into the site's page, so it cannot load
  // icons.js and carries its own copy of the two status paths.
  test.each(EXTENSIONS)('%s: its two paths are the registry\'s, and every toast names its glyph', (ext) => {
    const src = read('extensions', ext, 'background.js');
    expect(src).toContain(`'${ICON_PATHS.checkCircle}'`);
    expect(src).toContain(`'${ICON_PATHS.warning}'`);
    expect(src).not.toMatch(/[✅⚠]/);
    const calls = src.match(/func: showToast/g).length;
    const kinds = src.match(/, "(ok|warning)"\]/g).length;
    expect(kinds).toBeGreaterThanOrEqual(calls);
  });
});

describe('showCustomModal status glyph', () => {
  test('icon: "warning" puts the glyph before a title that stays plain text', () => {
    document.body.innerHTML = `<div id="customModal"><div class="modal-content">
      <h3 id="modalTitle"></h3><p id="modalMessage"></p><input id="modalInput">
      <button id="modalBtnCancel"></button><button id="modalBtnConfirm"></button></div></div>`;
    require('../src/ui');
    window.showCustomModal({ title: 'Storage full', type: 'alert', icon: 'warning' });
    const title = document.getElementById('modalTitle');
    expect(title.textContent).toBe('Storage full');
    expect(title.querySelector('svg').dataset.icon).toBe('warning');

    // An alert is an error unless told otherwise; a question carries no glyph.
    window.showCustomModal({ title: 'Folder exists', type: 'alert' });
    expect(title.querySelector('svg').dataset.icon).toBe('warning');
    window.showCustomModal({ title: 'Imported', type: 'alert', icon: 'checkCircle' });
    expect(title.querySelector('svg').dataset.icon).toBe('checkCircle');
    window.showCustomModal({ title: 'Delete?', type: 'confirm' });
    expect(title.querySelector('svg')).toBeNull();
  });
});

describe('locale strings whose emoji became a glyph', () => {
  // The icon now comes from the code, so a translation that brought the emoji
  // back would show both.
  const KEYS = ['searchPlaceholder', 'promptSearchPlaceholder', 'exportBtn', 'importBtn',
    'btnNewFolder', 'reviewTitle', 'noResults', 'noResultsHint', 'emptyFoldersHint',
    // Status messages: the mark they opened with is now a coloured glyph.
    'toastSaved', 'toastAlreadySaved', 'storageFullError', 'alertNoConversationUrl'];

  test.each(EXTENSIONS)('%s: none of the 43 locales carries one', (ext) => {
    const base = path.join(ROOT, 'extensions', ext, '_locales');
    const offenders = [];
    for (const loc of fs.readdirSync(base)) {
      const m = JSON.parse(fs.readFileSync(path.join(base, loc, 'messages.json'), 'utf8'));
      for (const key of KEYS) {
        // alertNoConversationUrl exists in AI Folders only.
        if (m[key] && EMOJI.test(m[key].message)) offenders.push(`${loc}/${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The quick-save folder name is a storage key: its emoji must NOT be cleaned
  // up, or every existing user's quick-save folder would split in two.
  test.each(EXTENSIONS)('%s: the quick-save folder name is left exactly as it was', (ext) => {
    const m = JSON.parse(read('extensions', ext, '_locales', 'en', 'messages.json'));
    expect(m.quickSaveFolder.message).toBe('⚡ Quick Saves');
  });
});
