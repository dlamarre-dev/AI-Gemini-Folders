// popup-core.js shared wiring: the i18n/RTL pass, the cross-browser clearable
// utils.js is a classic script in the popup, so its helpers are globals there.
global.isUnsafeKey = require('../src/utils').isUnsafeKey;
global.hasEntry = require('../src/utils').hasEntry;
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

  // The search-miss message carries a second line explaining that search only
  // covers already-saved conversations (uninstall survey, 2026-08).
  test('renders the no-results hint as a second line', () => {
    chrome.i18n.getUILanguage = jest.fn(() => 'en');
    window.applyCommonI18n();
    const el = document.getElementById('noResults');
    const hint = el.querySelector('.nr-hint');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe('noResultsHint');
    // The headline stays a direct text node, so the hint is not part of it.
    expect(el.firstChild.nodeType).toBe(Node.TEXT_NODE);
    expect(el.firstChild.textContent).toBe('noResults');
  });
});

// ---------------------------------------------------------------------------
// initSaveConversation
// ---------------------------------------------------------------------------

describe('initSaveConversation', () => {
  let savedFolders;
  let savedParents;
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
    global.saveData = jest.fn((data, cb) => { savedFolders = data.folders; savedParents = data.folderParents; cb && cb(); });
    // Nesting helpers are globals from utils.js in the browser.
    const utils = require('../src/utils');
    for (const name of ['resolveFolderPath', 'withFolderParent', 'pruneFolderParents', 'folderOpenPath', 'getFolderParent']) {
      global[name] = utils[name];
    }
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
    expect(window.displayFolders).toHaveBeenCalledWith(['defaultFolder']);
  });

  // The folder box is pre-filled with "Parent/Child" when a sub-folder is
  // clicked, so the save has to read it back the same way — otherwise it
  // silently creates a top-level folder literally called "Parent/Child".
  test('saves into an existing sub-folder written as Parent/Child', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) =>
      cb({ folders: { Work: [], Clients: [] }, folderParents: { Clients: 'Work' } }));
    wire(() => 'claude');

    document.getElementById('folderName').value = 'Work/Clients';
    document.getElementById('saveBtn').click();
    await flush();

    expect(savedFolders.Clients).toHaveLength(1);
    expect(savedFolders['Work/Clients']).toBeUndefined();
    // The parent is expanded too, or the conversation lands out of sight.
    expect(window.displayFolders).toHaveBeenCalledWith(['Work', 'Clients']);
  });

  test('creates the sub-folder (and its parent) when they do not exist yet', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) => cb({ folders: {}, folderParents: {} }));
    wire(() => 'claude');

    document.getElementById('folderName').value = 'Studies/Math';
    document.getElementById('saveBtn').click();
    await flush();

    expect(savedFolders.Studies).toEqual([]);
    expect(savedFolders.Math).toHaveLength(1);
    expect(savedParents).toEqual({ Math: 'Studies' });
  });

  test('a folder literally named a/b still wins over the path reading', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) =>
      cb({ folders: { 'a/b': [], a: [], b: [] }, folderParents: {} }));
    wire(() => 'claude');

    document.getElementById('folderName').value = 'a/b';
    document.getElementById('saveBtn').click();
    await flush();

    expect(savedFolders['a/b']).toHaveLength(1);
    expect(savedFolders.b).toHaveLength(0);
    expect(savedParents).toBeUndefined();   // a plain save must not rewrite the nesting
  });

  test('refuses a second level instead of creating one', async () => {
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) =>
      cb({ folders: { Work: [], Clients: [] }, folderParents: { Clients: 'Work' } }));
    wire(() => 'claude');

    document.getElementById('folderName').value = 'Clients/Deeper';
    document.getElementById('saveBtn').click();
    await flush();

    expect(global.saveData).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).toBe('errorNestTooDeep');
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

  test('does not write at all for a conversation already in the folder', async () => {
    // Re-saving a duplicate used to still call saveData with unchanged data,
    // which counts as a content save: it bumped usageStats.saves (the 's' the
    // uninstall survey reports and the anti-churn baselines read) and rebuilt
    // the whole bookmark tree for nothing.
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) =>
      cb({ folders: { defaultFolder: [{ title: 'x', url: 'https://claude.ai/chat/1' }] } })
    );
    wire(() => 'claude');

    document.getElementById('saveBtn').click();
    await flush();

    expect(global.saveData).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).toBe('toastAlreadySaved');
  });

  test('a second click still works after a duplicate', async () => {
    // The duplicate path must release the isSaving latch, or the Save button
    // stays dead for the rest of the popup session.
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) =>
      cb({ folders: { defaultFolder: [{ title: 'x', url: 'https://claude.ai/chat/1' }] } })
    );
    wire(() => 'claude');

    document.getElementById('saveBtn').click();
    await flush();
    global.loadData = jest.fn((defaults, cb) => cb({ folders: {} }));
    document.getElementById('saveBtn').click();
    await flush();

    expect(global.saveData).toHaveBeenCalled();
  });

  test.each(['toString', 'valueOf', 'hasOwnProperty', 'constructor'])(
    'saves into a folder named %s like any other', async (name) => {
      // folders[name] is inherited and truthy for every Object.prototype member,
      // so the "create it if missing" guard was skipped and the .some() after it
      // threw. Blacklisting three names could never cover this; the guard is an
      // ownership test now, which also makes these usable folder titles.
      chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
      global.loadData = jest.fn((defaults, cb) => cb({ folders: {} }));
      wire(() => 'claude');

      document.getElementById('folderName').value = name;
      document.getElementById('saveBtn').click();
      await flush();

      expect(global.saveData).toHaveBeenCalled();
      expect(savedFolders[name]).toHaveLength(1);
      expect(savedFolders[name][0].url).toBe('https://claude.ai/chat/1');
    });

  test('refuses a reserved folder name instead of wedging the Save button', async () => {
    // folders["__proto__"] is Object.prototype: truthy, so the "create it if
    // missing" guard was skipped and the .some() after it threw inside the
    // loadData callback, leaving isSaving true forever.
    chrome.tabs.query = jest.fn().mockResolvedValue([{ url: 'https://claude.ai/chat/1' }]);
    global.loadData = jest.fn((defaults, cb) => cb({ folders: {} }));
    wire(() => 'claude');

    document.getElementById('folderName').value = '__proto__';
    document.getElementById('saveBtn').click();
    await flush();

    expect(global.saveData).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).toBe('reservedNameError');

    // And the button still works afterwards.
    document.getElementById('folderName').value = 'Work';
    document.getElementById('saveBtn').click();
    await flush();
    expect(global.saveData).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// New folder button
// ---------------------------------------------------------------------------

// Creating a folder whose name was taken used to do nothing at all — the modal
// closed as if it had worked. What is worth locking down is that the refusal is
// now visible AND that nothing is written, since silence was the whole bug.
describe('new folder button', () => {
  // Every id initPopupCommon dereferences; same fixture style as applyCommonI18n.
  const IDS = [
    'newFolderBtn', 'searchInput', 'sortToggleBtn', 'sortMenu', 'modeFolderBtn',
    'modePromptBtn', 'folderModeContainer', 'promptModeContainer', 'promptSearchInput',
    'toggleAddPanelBtn', 'addConversationPanel', 'exportBtn', 'importBtn', 'importFile',
    'syncBookmarksToggle', 'syncBookmarksLabel', 'syncPromptsLabel', 'githubLink', 'kofiBtn',
  ];

  let modals;

  function wire(folders) {
    modals = [];
    document.body.innerHTML = IDS.map((id) => `<div id="${id}"></div>`).join('');
    global.loadData = jest.fn((defaults, cb) => cb({ folders: JSON.parse(JSON.stringify(folders)) }));
    global.saveData = jest.fn((data, cb) => cb && cb());
    global.window.displayFolders = jest.fn();
    global.window.displayPrompts = jest.fn();
    // The prompt returns whatever the test typed; alerts are recorded.
    global.window.showCustomModal = jest.fn((opts) => {
      modals.push(opts);
      return Promise.resolve(opts.type === 'prompt' ? typed : true);
    });
    chrome.storage.sync.get = jest.fn((_keys, cb) => cb && cb({}));
    chrome.storage.sync.set = jest.fn((_v, cb) => cb && cb());
    window.initPopupCommon({});
  }

  let typed = '';
  const alerts = () => modals.filter((m) => m.type === 'alert').map((m) => m.title);

  async function typeName(name, folders) {
    typed = name;
    wire(folders);
    // initPopupCommon renders once while wiring; clear so every assertion below
    // is about what the click did.
    global.saveData.mockClear();
    window.displayFolders.mockClear();
    modals = [];
    document.getElementById('newFolderBtn').click();
    await flush();
  }

  test('a free name creates the folder and re-renders', async () => {
    await typeName('Ideas', { Dev: [] });

    expect(global.saveData).toHaveBeenCalled();
    expect(Object.keys(global.saveData.mock.calls[0][0].folders)).toEqual(['Dev', 'Ideas']);
    expect(window.displayFolders).toHaveBeenCalled();
    expect(alerts()).toEqual([]);
  });

  test('a name already taken is refused, and nothing is written', async () => {
    await typeName('Dev', { Dev: [] });

    expect(alerts()).toEqual(['errorFolderExists']);
    // The bug was silence, so the absence of a write is the thing to assert.
    expect(global.saveData).not.toHaveBeenCalled();
    expect(window.displayFolders).not.toHaveBeenCalled();
  });

  test('a name taken by a SUB-folder is refused the same way', async () => {
    // Folder names are one flat namespace, so the collision is real even though
    // the other folder is nested out of sight under its parent.
    await typeName('Bugs', { Dev: [], Bugs: [] });

    expect(alerts()).toEqual(['errorFolderExists']);
    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('an inherited name is a usable folder title, not a collision', async () => {
    // folders['toString'] is truthy on every object; hasEntry is what makes this
    // an ordinary name rather than a permanent "already exists".
    await typeName('toString', { Dev: [] });

    expect(alerts()).toEqual([]);
    expect(global.saveData.mock.calls[0][0].folders.toString).toEqual([]);
  });

  test('__proto__ still gets the reserved-name message, not the collision one', async () => {
    await typeName('__proto__', { Dev: [] });

    expect(alerts()).toEqual(['reservedNameError']);
    expect(global.saveData).not.toHaveBeenCalled();
  });

  test.each([['a cancelled prompt', null], ['a whitespace-only name', '   ']])(
    '%s does nothing, silently', async (_label, value) => {
      await typeName(value, { Dev: [] });

      expect(alerts()).toEqual([]);
      expect(global.saveData).not.toHaveBeenCalled();
    });
});
