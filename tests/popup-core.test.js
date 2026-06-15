// popup-core.js shared wiring: the i18n/RTL pass, the cross-browser clearable
// search control (recent feature), and the "save current conversation" flow.

require('../src/popup-core'); // defines window.applyCommonI18n / setupClearableSearch / initSaveConversation

const flush = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// setupClearableSearch  (the Firefox-compatible ✕ clear button)
// ---------------------------------------------------------------------------

describe('setupClearableSearch', () => {
  let input;
  beforeEach(() => {
    document.body.innerHTML = `<div id="host"><input id="s" type="search" /></div>`;
    input = document.getElementById('s');
  });

  test('wraps the input and appends a clear button', () => {
    window.setupClearableSearch(input);
    expect(input.parentElement.classList.contains('search-wrap')).toBe(true);
    const clear = input.parentElement.querySelector('.search-clear');
    expect(clear).not.toBeNull();
    expect(clear.getAttribute('aria-hidden')).toBe('true');
  });

  test('toggles the has-text class with the input content', () => {
    window.setupClearableSearch(input);
    const wrap = input.parentElement;
    expect(wrap.classList.contains('has-text')).toBe(false);

    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    expect(wrap.classList.contains('has-text')).toBe(true);
  });

  test('the clear button empties the field and fires an input event', () => {
    window.setupClearableSearch(input);
    const wrap = input.parentElement;
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));

    const onInput = jest.fn();
    input.addEventListener('input', onInput);
    wrap.querySelector('.search-clear').click();

    expect(input.value).toBe('');
    expect(wrap.classList.contains('has-text')).toBe(false);
    expect(onInput).toHaveBeenCalled(); // re-render hook for the debounced search
  });

  test('is idempotent — a second call does not double-wrap', () => {
    window.setupClearableSearch(input);
    window.setupClearableSearch(input);
    expect(document.querySelectorAll('.search-wrap')).toHaveLength(1);
    expect(document.querySelectorAll('.search-clear')).toHaveLength(1);
  });

  test('tolerates a missing input', () => {
    expect(() => window.setupClearableSearch(null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyCommonI18n  (language attribute + RTL direction)
// ---------------------------------------------------------------------------

describe('applyCommonI18n', () => {
  const I18N_IDS = [
    'appTitle', 'searchInput', 'folderName', 'chatTitle', 'saveBtn', 'status',
    'noResults', 'exportBtn', 'importBtn', 'toggleAddPanelBtn', 'sortNewest',
    'sortOldest', 'sortAlpha', 'promptSearchInput', 'promptSortNewest',
    'promptSortOldest', 'promptSortAlpha', 'modeFolderBtn', 'modePromptBtn',
    'toggleAddPromptPanelBtn', 'savePromptBtn', 'promptTitle', 'promptText',
    'newFolderBtn', 'sortToggleBtn', 'promptSortToggleBtn',
  ];

  beforeEach(() => {
    document.documentElement.removeAttribute('lang');
    document.body.removeAttribute('dir');
    document.body.innerHTML = I18N_IDS.map((id) => `<div id="${id}"></div>`).join('');
  });

  test('sets dir="rtl" for Arabic and reflects the UI language', () => {
    chrome.i18n.getUILanguage = jest.fn(() => 'ar');
    window.applyCommonI18n();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.body.getAttribute('dir')).toBe('rtl');
  });

  test('leaves the document LTR for English', () => {
    chrome.i18n.getUILanguage = jest.fn(() => 'en');
    window.applyCommonI18n();
    expect(document.documentElement.lang).toBe('en');
    expect(document.body.getAttribute('dir')).toBeNull();
    // sanity: a localized label was applied (mock returns the key)
    expect(document.getElementById('appTitle').textContent).toBe('appTitle');
  });
});

// ---------------------------------------------------------------------------
// initSaveConversation
// ---------------------------------------------------------------------------

describe('initSaveConversation', () => {
  let savedFolders;
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="saveBtn"></button>
      <input id="folderName" value="" />
      <input id="chatTitle" value="" />
      <input id="searchInput" value="" />
      <div id="status"></div>
      <button id="toggleAddPanelBtn"></button>
      <div id="addConversationPanel"></div>`;
    global.normalizeUrl = jest.fn((u) => u.split('?')[0].split('#')[0]);
    global.window.showCustomModal = jest.fn().mockResolvedValue(true);
    global.window.displayFolders = jest.fn();
    global.saveData = jest.fn((data, cb) => { savedFolders = data.folders; cb && cb(); });
  });

  function wire(getSiteKey, tagSite = false) {
    window.initSaveConversation({ getSiteKey, unsupportedMessageKey: 'wrongSite', tagSite });
  }

  test('saves the active tab into the default folder, tagging the site when asked', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) => cb({ folders: {} }));
    wire(() => 'claude', true);

    document.getElementById('saveBtn').click();
    await flush();

    const entries = savedFolders['defaultFolder']; // i18n mock returns the key
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ url: 'https://claude.ai/chat/1', site: 'claude' });
    expect(window.displayFolders).toHaveBeenCalledWith('defaultFolder');
  });

  test('alerts and does not save on an unsupported site', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://example.com' }]);
    global.loadData = jest.fn((defaults, cb) => cb({ folders: {} }));
    wire(() => null);

    document.getElementById('saveBtn').click();
    await flush();

    expect(window.showCustomModal).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'alert' })
    );
    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('does not duplicate a conversation already in the folder', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) =>
      cb({ folders: { defaultFolder: [{ title: 'x', url: 'https://claude.ai/chat/1' }] } })
    );
    wire(() => 'claude');

    document.getElementById('saveBtn').click();
    await flush();

    expect(savedFolders['defaultFolder']).toHaveLength(1);
  });
});
