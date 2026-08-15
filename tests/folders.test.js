// folders.js functions depend on globals from utils.js and the DOM.
// We mock those globals here so tests run in isolation.

const { displayFolders, deleteChat, moveChat, nestFolder, unnestFolder, togglePin, renameFolder, renameChat, openFolderInTabGroup, queryAllTabs, pickReusableTab, openConversation, modifierKeyLabel } = require('../src/folders');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeFolder(...chats) {
  return chats.map(([title, urlSuffix]) => ({
    title,
    url: `https://gemini.google.com/app/${urlSuffix}`,
    timestamp: Date.now(),
  }));
}

function setupStorage(folders, pinnedFolders = [], openFolders = [], folderParents = {}) {
  global.loadData = jest.fn((defaults, cb) =>
    cb({
      folders: JSON.parse(JSON.stringify(folders)),
      pinnedFolders: [...pinnedFolders],
      openFolders: [...openFolders],
      folderParents: { ...folderParents },
    })
  );
  global.saveData = jest.fn((data, cb) => cb && cb());
}

function savedFolders() {
  return global.saveData.mock.calls[0][0].folders;
}

function savedPins() {
  return global.saveData.mock.calls[0][0].pinnedFolders;
}

beforeEach(() => {
  global.normalizeUrl = jest.fn((url) => url.split('?')[0].split('#')[0]);
  global.isUnsafeKey = require('../src/utils').isUnsafeKey;
global.hasEntry = require('../src/utils').hasEntry;
  global.isSafeUrl = jest.fn(() => true);
  global.window.showCustomModal = jest.fn();
  // openConversation closes the popup when it is done; in jsdom the real
  // window.close() would tear the test window down.
  global.window.close = jest.fn();

  // Provide all DOM elements that displayFolders (called after each mutation)
  // reads at the top of its body. Without them it throws on null refs.
  document.body.innerHTML = `
    <input  id="searchInput" value="" />
    <div    id="folderList"></div>
    <div    id="noResults"  style="display:none"></div>
    <input  id="folderName" value="" />
  `;
});

// ---------------------------------------------------------------------------
// deleteChat
// ---------------------------------------------------------------------------

describe('deleteChat', () => {
  test('removes the chat with the matching URL', () => {
    setupStorage({
      Dev: makeFolder(['Chat 1', 'aaa'], ['Chat 2', 'bbb']),
    });

    deleteChat('Dev', 'https://gemini.google.com/app/aaa');

    expect(savedFolders().Dev).toHaveLength(1);
    expect(savedFolders().Dev[0].url).toBe('https://gemini.google.com/app/bbb');
  });

  test('does nothing when URL is not found', () => {
    setupStorage({ Dev: makeFolder(['Chat 1', 'aaa']) });

    deleteChat('Dev', 'https://gemini.google.com/app/nonexistent');

    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('results in an empty folder when the last chat is deleted', () => {
    setupStorage({ Dev: makeFolder(['Chat 1', 'aaa']) });

    deleteChat('Dev', 'https://gemini.google.com/app/aaa');

    expect(savedFolders().Dev).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// moveChat
// ---------------------------------------------------------------------------

describe('moveChat', () => {
  test('moves chat from source to target folder', () => {
    setupStorage({
      Dev:      makeFolder(['Chat 1', 'aaa']),
      Research: [],
    });

    moveChat('Dev', 'Research', 'https://gemini.google.com/app/aaa');

    expect(savedFolders().Dev).toHaveLength(0);
    expect(savedFolders().Research).toHaveLength(1);
    expect(savedFolders().Research[0].url).toBe('https://gemini.google.com/app/aaa');
  });

  test('does not duplicate when chat already exists in target', () => {
    const chat = { title: 'Chat', url: 'https://gemini.google.com/app/aaa', timestamp: 1 };
    setupStorage({
      Dev:      [chat],
      Research: [{ ...chat }],
    });

    moveChat('Dev', 'Research', 'https://gemini.google.com/app/aaa');

    expect(savedFolders().Research).toHaveLength(1);
  });

  test('creates target folder when it does not exist yet', () => {
    setupStorage({ Dev: makeFolder(['Chat', 'aaa']) });

    moveChat('Dev', 'NewFolder', 'https://gemini.google.com/app/aaa');

    expect(savedFolders().NewFolder).toHaveLength(1);
  });

  test('does nothing when source chat URL is not found', () => {
    setupStorage({ Dev: makeFolder(['Chat', 'aaa']), Research: [] });

    moveChat('Dev', 'Research', 'https://gemini.google.com/app/nonexistent');

    expect(global.saveData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// displayFolders — open/closed state for folders with an emoji prefix
// ---------------------------------------------------------------------------

describe('displayFolders open-state (emoji prefix)', () => {
  test('exposes the raw folder name (with emoji) via dataset.folderName', () => {
    setupStorage({ '💻 Code': makeFolder(['Chat', 'aaa']) }, [], ['💻 Code']);

    displayFolders(['💻 Code']);

    const folderDiv = document.querySelector('.folder');
    // dataset keeps the raw key, while the visible name strips the emoji prefix.
    expect(folderDiv.dataset.folderName).toBe('💻 Code');
    expect(folderDiv.querySelector('.folder-name').textContent).toBe('Code');
  });

  test('moveChat keeps an open emoji folder open (regression for DOM name read)', () => {
    setupStorage(
      { '💻 Code': makeFolder(['Chat 1', 'aaa']), Research: [] },
      [],
      ['💻 Code']
    );

    // Render so the DOM carries .folder divs with their open state + dataset.
    displayFolders(['💻 Code']);
    // moveChat re-collects the open folders from the DOM before saving.
    moveChat('💻 Code', 'Research', 'https://gemini.google.com/app/aaa');

    const calls = global.saveData.mock.calls;
    const savedOpen = calls[calls.length - 1][0].openFolders;
    expect(savedOpen).toContain('💻 Code');
  });
});

// ---------------------------------------------------------------------------
// togglePin
// ---------------------------------------------------------------------------

describe('togglePin', () => {
  test('pins a folder that is not pinned', () => {
    setupStorage({ Dev: [], Research: [] }, ['Research']);

    togglePin('Dev');

    expect(savedPins()).toContain('Dev');
    expect(savedPins()).toContain('Research');
  });

  test('unpins a folder that is already pinned', () => {
    setupStorage({ Dev: [], Research: [] }, ['Dev', 'Research']);

    togglePin('Dev');

    expect(savedPins()).not.toContain('Dev');
    expect(savedPins()).toContain('Research');
  });

  test('handles toggling when pin list is empty', () => {
    setupStorage({ Dev: [] }, []);

    togglePin('Dev');

    expect(savedPins()).toEqual(['Dev']);
  });
});

// ---------------------------------------------------------------------------
// renameFolder
// ---------------------------------------------------------------------------

describe('renameFolder', () => {
  test('renames the folder and updates the pin list', async () => {
    global.window.showCustomModal.mockResolvedValue('New Dev');
    setupStorage({ Dev: makeFolder(['Chat', 'aaa']), Research: [] }, ['Dev']);

    await renameFolder('Dev');

    expect(savedFolders()['New Dev']).toBeDefined();
    expect(savedFolders()['Dev']).toBeUndefined();
    expect(savedPins()).toContain('New Dev');
    expect(savedPins()).not.toContain('Dev');
  });

  test('cancels when the modal is dismissed (returns null)', async () => {
    global.window.showCustomModal.mockResolvedValue(null);
    setupStorage({ Dev: [] }, []);

    await renameFolder('Dev');

    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('cancels when the user submits the same name', async () => {
    global.window.showCustomModal.mockResolvedValue('Dev');
    setupStorage({ Dev: [] }, []);

    await renameFolder('Dev');

    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('shows an alert and aborts when target name already exists', async () => {
    // First call = the rename prompt; second call = the conflict alert
    global.window.showCustomModal
      .mockResolvedValueOnce('Research')
      .mockResolvedValueOnce(undefined);
    setupStorage({ Dev: [], Research: [] }, []);

    await renameFolder('Dev');

    expect(global.saveData).not.toHaveBeenCalled();
    expect(global.window.showCustomModal).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// renameChat
// ---------------------------------------------------------------------------

describe('renameChat', () => {
  test('renames the conversation found by URL', async () => {
    global.window.showCustomModal.mockResolvedValue('  Renamed  ');
    setupStorage({ Work: makeFolder(['Old title', 'aaa']) });
    const url = 'https://gemini.google.com/app/aaa';

    await renameChat('Work', url, 'Old title');

    const chat = savedFolders().Work.find((c) => c.url === url);
    expect(chat.title).toBe('Renamed'); // trimmed
  });

  test('does nothing when cancelled (null)', async () => {
    global.window.showCustomModal.mockResolvedValue(null);
    setupStorage({ Work: makeFolder(['Old', 'aaa']) });

    await renameChat('Work', 'https://gemini.google.com/app/aaa', 'Old');

    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('does nothing when the new name is blank', async () => {
    global.window.showCustomModal.mockResolvedValue('   ');
    setupStorage({ Work: makeFolder(['Old', 'aaa']) });

    await renameChat('Work', 'https://gemini.google.com/app/aaa', 'Old');

    expect(global.saveData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openFolderInTabGroup
// ---------------------------------------------------------------------------

describe('openFolderInTabGroup', () => {
  beforeEach(() => {
    let id = 0;
    chrome.tabs.create = jest.fn(() => Promise.resolve({ id: ++id }));
    chrome.tabs.group = jest.fn(() => Promise.resolve(777));
    chrome.tabs.update = jest.fn(() => Promise.resolve());
    chrome.tabGroups.update = jest.fn(() => Promise.resolve());
  });

  test('opens every chat in a background tab, groups them, and focuses the first', async () => {
    const chats = [{ url: 'https://a/1' }, { url: 'https://a/2' }];

    await openFolderInTabGroup('My Folder', chats);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://a/1', active: false });
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(
      777,
      expect.objectContaining({ title: 'My Folder', color: 'blue', collapsed: false })
    );
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { active: true });
  });

  test('is a no-op for an empty folder', async () => {
    await openFolderInTabGroup('Empty', []);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('skips unsafe stored URLs, opening only the safe ones', async () => {
    // Override the permissive default mock with the real http(s)-only check.
    global.isSafeUrl = jest.fn((url) => {
      try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
    });
    const chats = [
      { url: 'https://a/1' },
      { url: 'javascript:alert(1)' }, // legacy/corrupt storage — must never open
      { url: 'https://a/2' },
    ];

    await openFolderInTabGroup('Mixed', chats);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://a/1', active: false });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://a/2', active: false });
    expect(chrome.tabs.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: 'javascript:alert(1)' })
    );
  });

  test('aborts before opening tabs when the >10-tab confirm is declined', async () => {
    global.window.showCustomModal.mockResolvedValue(false);
    const chats = Array.from({ length: 11 }, (_, i) => ({ url: `https://a/${i}` }));

    await openFolderInTabGroup('Big', chats);

    expect(global.window.showCustomModal).toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openConversation / findOpenConversationTab
// ---------------------------------------------------------------------------

describe('openConversation', () => {
  const URL_A = 'https://gemini.google.com/app/aaa';

  beforeEach(() => {
    chrome.tabs.create = jest.fn(() => Promise.resolve({ id: 99 }));
    chrome.tabs.update = jest.fn(() => Promise.resolve());
    chrome.tabs.query = jest.fn(() => Promise.resolve([]));
    chrome.windows.update = jest.fn(() => Promise.resolve());
    chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
    chrome.storage.local.set = jest.fn(() => Promise.resolve());
    window.isSupportedTabUrl = (url) => {
      try { return new URL(url).hostname === 'gemini.google.com'; } catch { return false; }
    };
  });

  test('activates the tab already showing the conversation instead of duplicating it', async () => {
    chrome.tabs.query.mockResolvedValue([
      { id: 3, windowId: 1, url: 'https://gemini.google.com/app/other' },
      { id: 7, windowId: 1, url: URL_A },
    ]);

    await openConversation(URL_A);

    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('matches ignoring query and hash (same identity as save dedup)', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 7, windowId: 1, url: `${URL_A}?hl=fr#top` }]);

    await openConversation(URL_A);

    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('raises the window when the matching tab lives in another one', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 7, windowId: 42, url: URL_A }]);

    await openConversation(URL_A);

    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(chrome.windows.update).toHaveBeenCalledWith(42, { focused: true });
  });

  test('opens a new tab when the conversation is not open anywhere', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 3, windowId: 1, url: 'https://gemini.google.com/app/other' }]);

    await openConversation(URL_A);

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('never matches a tab whose URL we cannot read (no host permission)', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 3, windowId: 1 }, { id: 4, windowId: 1, url: undefined }]);

    await openConversation(URL_A);

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('never matches an extension page (popup / import / welcome)', async () => {
    // The real http(s)-only check: this is what excludes chrome-extension:.
    global.isSafeUrl = jest.fn((url) => {
      try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
    });
    chrome.tabs.query.mockResolvedValue([
      { id: 5, windowId: 1, url: 'chrome-extension://test-id/popup.html' },
    ]);

    await openConversation('chrome-extension://test-id/popup.html');

    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('falls back to a new tab when the matching tab dies mid-flight', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 7, windowId: 1, url: URL_A }]);
    chrome.tabs.update.mockRejectedValue(new Error('No tab with id: 7'));

    await openConversation(URL_A);

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('falls back to a new tab when tabs.query is unavailable', async () => {
    chrome.tabs.query.mockRejectedValue(new Error('nope'));

    expect(await queryAllTabs()).toEqual([]);

    await openConversation(URL_A);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('remembers the tab it opened, so the next Ctrl/Cmd-click can reuse it', async () => {
    await openConversation(URL_A);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ reuseTabId: 99 });
  });

  test('closes the popup only after the tab work is done', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 7, windowId: 1, url: URL_A }]);
    const order = [];
    chrome.tabs.update = jest.fn(() => { order.push('update'); return Promise.resolve(); });
    global.window.close = jest.fn(() => order.push('close'));

    await openConversation(URL_A);

    expect(order).toEqual(['update', 'close']);
  });
});

// ---------------------------------------------------------------------------
// openConversation({ reuse: true }) — the Ctrl/Cmd-click path
// ---------------------------------------------------------------------------

describe('openConversation with reuse (Ctrl/Cmd-click)', () => {
  const URL_A = 'https://gemini.google.com/app/aaa';
  const OTHER = 'https://gemini.google.com/app/bbb';

  // The reuse path issues two different queries: all tabs, then the active one.
  function setTabs(allTabs, activeTab) {
    chrome.tabs.query = jest.fn((q) =>
      Promise.resolve(q && q.active ? (activeTab ? [activeTab] : []) : allTabs));
  }

  beforeEach(() => {
    chrome.tabs.create = jest.fn(() => Promise.resolve({ id: 99 }));
    chrome.tabs.update = jest.fn(() => Promise.resolve());
    chrome.windows.update = jest.fn(() => Promise.resolve());
    chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
    chrome.storage.local.set = jest.fn(() => Promise.resolve());
    global.isSafeUrl = jest.fn((url) => {
      try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
    });
    window.isSupportedTabUrl = (url) => {
      try { return new URL(url).hostname === 'gemini.google.com'; } catch { return false; }
    };
  });

  test('navigates the remembered tab', async () => {
    const remembered = { id: 5, windowId: 1, url: OTHER };
    const active = { id: 8, windowId: 1, url: OTHER };
    setTabs([remembered, active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 5 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).toHaveBeenCalledWith(5, { url: URL_A, active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('falls back to the tab being looked at when the remembered one is gone', async () => {
    const active = { id: 8, windowId: 1, url: OTHER };
    setTabs([active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 5 });   // closed since

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).toHaveBeenCalledWith(8, { url: URL_A, active: true });
  });

  test('opens a new tab when the active tab is on an unsupported site', async () => {
    const active = { id: 8, windowId: 1, url: 'https://github.com/some/pr' };
    setTabs([active], active);

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ reuseTabId: 99 });
  });

  test('never navigates a candidate in another window', async () => {
    const active = { id: 8, windowId: 1, url: 'https://github.com/some/pr' };
    setTabs([{ id: 5, windowId: 42, url: OTHER }, active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 5 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('never navigates a pinned tab', async () => {
    const active = { id: 5, windowId: 1, url: OTHER, pinned: true };
    setTabs([active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 5 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('never navigates a tab whose URL we cannot read (no host permission)', async () => {
    const active = { id: 5, windowId: 1 };   // url undefined
    setTabs([active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 5 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('never navigates an extension page even if it is the active tab', async () => {
    const active = { id: 5, windowId: 1, url: 'chrome-extension://test-id/popup.html' };
    setTabs([active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 5 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test('activates the existing tab rather than reusing when the conversation is already open', async () => {
    const already = { id: 3, windowId: 1, url: URL_A };
    const active = { id: 8, windowId: 1, url: OTHER };
    setTabs([already, active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 8 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true });
    expect(chrome.tabs.update).not.toHaveBeenCalledWith(8, expect.anything());
  });

  test('reuse never fires when the extension provides no site predicate', async () => {
    delete window.isSupportedTabUrl;
    const active = { id: 8, windowId: 1, url: OTHER };
    setTabs([active], active);
    chrome.storage.local.get.mockResolvedValue({ reuseTabId: 8 });

    await openConversation(URL_A, { reuse: true });

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: URL_A });
  });

  test('pickReusableTab prefers the remembered tab over the active one', () => {
    const tabs = [
      { id: 5, windowId: 1, url: OTHER },
      { id: 8, windowId: 1, url: OTHER },
    ];
    expect(pickReusableTab(tabs, { id: 8, windowId: 1 }, 5).id).toBe(5);
    expect(pickReusableTab(tabs, { id: 8, windowId: 1 }, undefined).id).toBe(8);
    expect(pickReusableTab(tabs, { id: 99, windowId: 1 }, 77)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// chatLinkReuseHint ships everywhere
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sub-folders (one level of nesting)
// ---------------------------------------------------------------------------

// jsdom has no drag & drop, so a DataTransfer stand-in carries the payload the
// handlers actually read. Note it does NOT reproduce `getData() === ''` during
// dragover — that is exactly why the hover feedback reads the module-level drag
// state instead of the payload, and why only `drop` is driven here.
function makeDataTransfer(payload) {
  const store = { 'text/plain': JSON.stringify(payload) };
  return {
    setData: (type, value) => { store[type] = value; },
    getData: (type) => store[type] || '',
    effectAllowed: '',
  };
}

// Handlers wired to a click are async and awaited internally; a single
// Promise.resolve() only advances one step of the chain.
async function flushMicrotasks(turns = 30) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

function dropOn(el, payload) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = makeDataTransfer(payload);
  el.dispatchEvent(event);
  return event;
}

const folderEl = (name) => document.querySelector(`.folder[data-folder-name="${name}"]`);
const lastSave = () => global.saveData.mock.calls[global.saveData.mock.calls.length - 1][0];

describe('sub-folder rendering', () => {
  test('a child renders inside its parent, after the conversations', () => {
    setupStorage(
      { Work: makeFolder(['W1', 'aaa']), Clients: makeFolder(['C1', 'bbb']) },
      [], ['Work'], { Clients: 'Work' }
    );

    displayFolders();

    // Only the root is a direct child of the list.
    const topLevel = document.querySelectorAll('#folderList > .folder');
    expect([...topLevel].map(f => f.dataset.folderName)).toEqual(['Work']);

    const content = folderEl('Work').querySelector(':scope > .folder-content');
    const kinds = [...content.children].map(c => c.className.split(' ')[0]);
    expect(kinds).toEqual(['chat-item', 'folder']);   // conversations first, then the sub-folder
    expect(content.querySelector('.folder--child').dataset.folderName).toBe('Clients');
  });

  test('a sub-folder has no pin button but offers the way back out', () => {
    setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });

    displayFolders();

    const child = folderEl('Clients');
    expect(child.querySelector('.pin-btn')).toBeNull();
    expect(child.querySelector('.unnest-btn')).not.toBeNull();
    expect(folderEl('Work').querySelector('.folder-header .pin-btn')).not.toBeNull();
  });

  test('a parent holding only sub-folders still expands', () => {
    setupStorage({ Work: [], Clients: makeFolder(['C1', 'bbb']) }, [], [], { Clients: 'Work' });

    displayFolders();

    const parent = folderEl('Work');
    expect(parent.querySelector('.folder-chevron')).not.toBeNull();
    expect(parent.querySelector(':scope > .folder-content')).not.toBeNull();
    // …and it is not drawn as an empty folder.
    expect(parent.querySelector('.folder-icon').textContent).toBe('🗂️');
  });

  test('an empty folder with no children still has nothing to expand', () => {
    setupStorage({ Work: [] }, []);

    displayFolders();

    expect(folderEl('Work').querySelector('.folder-chevron')).toBeNull();
    expect(folderEl('Work').querySelector(':scope > .folder-content')).toBeNull();
  });

  test('an orphaned child (parent deleted elsewhere) renders at the top level', () => {
    setupStorage({ Clients: makeFolder(['C1', 'bbb']) }, [], [], { Clients: 'Gone' });

    displayFolders();

    expect(document.querySelectorAll('#folderList > .folder')).toHaveLength(1);
    expect(folderEl('Clients').className).not.toContain('folder--child');
  });

  test('the folder-name box is pre-filled with the full path', () => {
    setupStorage({ Work: [], Clients: makeFolder(['C1', 'bbb']) }, [], [], { Clients: 'Work' });

    displayFolders();
    folderEl('Clients').querySelector('.folder-header').click();

    expect(document.getElementById('folderName').value).toBe('Work/Clients');
  });

  test('search surfaces a matching sub-folder through a parent that does not match', () => {
    setupStorage(
      { Work: makeFolder(['W1', 'aaa']), Clients: makeFolder(['C1', 'bbb']), Other: [] },
      [], [], { Clients: 'Work' }
    );

    displayFolders(null, 'client');

    expect(folderEl('Work')).not.toBeNull();
    expect(folderEl('Clients')).not.toBeNull();
    expect(folderEl('Other')).toBeNull();
    expect(document.getElementById('noResults').style.display).toBe('none');
  });

  test('search surfaces a parent whose sub-folder holds the matching conversation', () => {
    setupStorage(
      { Work: makeFolder(['W1', 'aaa']), Clients: makeFolder(['acme onboarding', 'bbb']) },
      [], [], { Clients: 'Work' }
    );

    displayFolders(null, 'acme');

    expect(folderEl('Work')).not.toBeNull();
    const childChats = folderEl('Clients').querySelectorAll('.chat-item');
    expect(childChats).toHaveLength(1);
  });
});

describe('nesting by drag & drop', () => {
  test('dropping a folder on another one nests it', () => {
    setupStorage({ Work: [], Personal: [] }, [], []);
    displayFolders();

    dropOn(folderEl('Work'), { kind: 'folder', sourceFolder: 'Personal' });

    expect(lastSave().folderParents).toEqual({ Personal: 'Work' });
    // The parent is force-opened, or the folder just dragged would vanish.
    expect(lastSave().openFolders).toContain('Work');
  });

  test('a folder that already has sub-folders is refused, with an explanation', () => {
    setupStorage({ Work: [], Clients: [], Personal: [] }, [], [], { Clients: 'Work' });
    displayFolders();

    dropOn(folderEl('Personal'), { kind: 'folder', sourceFolder: 'Work' });

    expect(global.saveData).not.toHaveBeenCalled();
    expect(global.window.showCustomModal).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'alert', title: 'errorNestTooDeep' })
    );
  });

  test('dropping onto a sub-folder is refused (one level only)', () => {
    setupStorage({ Work: [], Clients: [], Personal: [] }, [], [], { Clients: 'Work' });
    displayFolders();

    dropOn(folderEl('Clients'), { kind: 'folder', sourceFolder: 'Personal' });

    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('a conversation dropped on a SUB-folder still moves', () => {
    // Guards the CSS trap: `body.is-dragging .folder *` also matches a nested
    // .folder, so the drop target must stay live for chat drags.
    setupStorage(
      { Work: [], Clients: [], Personal: makeFolder(['P1', 'aaa']) },
      [], [], { Clients: 'Work' }
    );
    displayFolders();

    dropOn(folderEl('Clients'), {
      kind: 'chat', sourceFolder: 'Personal', chatUrl: 'https://gemini.google.com/app/aaa',
    });

    expect(lastSave().folders.Clients).toHaveLength(1);
    expect(lastSave().folders.Personal).toHaveLength(0);
    // The parent opens too, or the conversation lands out of sight.
    expect(lastSave().openFolders).toEqual(expect.arrayContaining(['Clients', 'Work']));
  });

  test('a payload with no kind is still treated as a conversation', () => {
    // A drag started before an update can outlive the re-render.
    setupStorage({ Work: [], Personal: makeFolder(['P1', 'aaa']) }, []);
    displayFolders();

    dropOn(folderEl('Work'), {
      sourceFolder: 'Personal', chatUrl: 'https://gemini.google.com/app/aaa',
    });

    expect(lastSave().folders.Work).toHaveLength(1);
  });

  test('the root drop zone moves a sub-folder back to the top level', () => {
    setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });
    displayFolders();

    dropOn(document.querySelector('.root-drop-zone'), { kind: 'folder', sourceFolder: 'Clients' });

    expect(lastSave().folderParents).toEqual({});
  });

  test('the ⤴ button moves a sub-folder back to the top level', () => {
    setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });
    displayFolders();

    folderEl('Clients').querySelector('.unnest-btn').click();

    expect(lastSave().folderParents).toEqual({});
  });
});

describe('pins and nesting', () => {
  test('nesting a pinned folder leaves its pin untouched', () => {
    setupStorage({ Work: [], Clients: [] }, ['Clients'], []);
    displayFolders();

    dropOn(folderEl('Work'), { kind: 'folder', sourceFolder: 'Clients' });

    expect(lastSave().pinnedFolders).toBeUndefined();   // the pin list is not rewritten
    expect(lastSave().folderParents).toEqual({ Clients: 'Work' });
  });

  test('the dormant pin is live again once the folder is back at the top level', () => {
    setupStorage({ Work: [], Clients: [], Zeta: [] }, ['Clients'], [], { Clients: 'Work' });

    displayFolders();
    // Nested: no pin button, and it does not sort to the top.
    expect(folderEl('Clients').querySelector('.pin-btn')).toBeNull();
    expect([...document.querySelectorAll('#folderList > .folder')].map(f => f.dataset.folderName))
      .toEqual(['Work', 'Zeta']);

    setupStorage({ Work: [], Clients: [], Zeta: [] }, ['Clients'], [], {});
    displayFolders();

    expect(folderEl('Clients').querySelector('.pin-btn').className).toContain('is-pinned');
    expect([...document.querySelectorAll('#folderList > .folder')].map(f => f.dataset.folderName)[0])
      .toBe('Clients');
  });

  test('togglePin refuses a sub-folder even if a stale DOM asks for it', () => {
    setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });

    togglePin('Clients');

    expect(global.saveData).not.toHaveBeenCalled();
  });
});

describe('deleting and renaming with sub-folders', () => {
  test('deleting a parent takes its sub-folders, their pins and their entries', async () => {
    global.window.showCustomModal.mockResolvedValue(true);
    setupStorage(
      { Work: makeFolder(['W1', 'aaa']), Clients: makeFolder(['C1', 'bbb']), Other: [] },
      ['Work', 'Clients'], [], { Clients: 'Work' }
    );
    displayFolders();

    folderEl('Work').querySelector('.delete-btn').click();
    await flushMicrotasks();

    expect(Object.keys(lastSave().folders)).toEqual(['Other']);
    expect(lastSave().pinnedFolders).toEqual([]);
    expect(lastSave().folderParents).toEqual({});
  });

  test('an EMPTY parent still asks for confirmation, naming how many it takes', async () => {
    // The shared mock returns the key itself, so give this one key a real
    // sentence — the point here is that {count} gets substituted.
    const realGetMessage = chrome.i18n.getMessage;
    chrome.i18n.getMessage = jest.fn((key) =>
      key === 'confirmDeleteFolderSub' ? 'Delete this folder and its {count} sub-folder(s)?' : key);
    try {
      global.window.showCustomModal.mockResolvedValue(false);
      setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });
      displayFolders();

      folderEl('Work').querySelector('.delete-btn').click();
      await flushMicrotasks();

      expect(global.window.showCustomModal).toHaveBeenCalledWith(
        { type: 'confirm', title: 'Delete this folder and its 1 sub-folder(s)?' }
      );
      expect(global.saveData).not.toHaveBeenCalled();
    } finally {
      chrome.i18n.getMessage = realGetMessage;
    }
  });

  test('renaming a parent follows through to its children', async () => {
    global.window.showCustomModal.mockResolvedValue('Job');
    setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });

    await renameFolder('Work');

    expect(lastSave().folderParents).toEqual({ Clients: 'Job' });
  });

  test('renaming a child moves its entry rather than un-nesting it', async () => {
    global.window.showCustomModal.mockResolvedValue('Accounts');
    setupStorage({ Work: [], Clients: [] }, [], [], { Clients: 'Work' });

    await renameFolder('Clients');

    expect(lastSave().folderParents).toEqual({ Accounts: 'Work' });
  });
});

describe('tab group with sub-folders', () => {
  beforeEach(() => {
    let id = 0;
    chrome.tabs.create = jest.fn(() => Promise.resolve({ id: ++id }));
    chrome.tabs.group = jest.fn(() => Promise.resolve(777));
    chrome.tabs.update = jest.fn(() => Promise.resolve());
    chrome.tabGroups.update = jest.fn(() => Promise.resolve());
  });

  test('a root folder opens its whole subtree, a sub-folder only itself', async () => {
    setupStorage(
      { Work: makeFolder(['W1', 'aaa']), Clients: makeFolder(['C1', 'bbb'], ['C2', 'ccc']) },
      [], [], { Clients: 'Work' }
    );
    displayFolders();

    folderEl('Work').querySelector('.open-group-btn').click();
    await flushMicrotasks();
    expect(chrome.tabs.create).toHaveBeenCalledTimes(3);

    chrome.tabs.create.mockClear();
    folderEl('Clients').querySelector('.open-group-btn').click();
    await flushMicrotasks();
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
  });
});

describe('sub-folder strings ship in every locale', () => {
  const fs = require('fs');
  const path = require('path');
  const NEW_KEYS = ['btnUnnestFolder', 'confirmDeleteFolderSub', 'dropToRootHint', 'errorNestTooDeep'];

  for (const ext of ['ai-folders', 'gemini-folders']) {
    const dir = path.join(__dirname, '..', 'extensions', ext, '_locales');
    const locales = fs.readdirSync(dir);

    test(`${ext} has all four keys in its 43 locales, none empty`, () => {
      expect(locales).toHaveLength(43);
      for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(path.join(dir, locale, 'messages.json'), 'utf8'));
        for (const key of NEW_KEYS) {
          expect(messages[key] && messages[key].message.trim()).toBeTruthy();
        }
        // The count is substituted in JS: a translation that drops the token
        // would silently print the sentence without the number.
        expect(messages.confirmDeleteFolderSub.message).toContain('{count}');
      }
    });
  }

  test('the wording is product-neutral, so the two extensions cannot drift', () => {
    const read = (ext, locale) => JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'extensions', ext, '_locales', locale, 'messages.json'), 'utf8'));
    for (const locale of fs.readdirSync(path.join(__dirname, '..', 'extensions', 'ai-folders', '_locales'))) {
      const af = read('ai-folders', locale);
      const gf = read('gemini-folders', locale);
      for (const key of NEW_KEYS) {
        expect(af[key].message).toBe(gf[key].message);
      }
    }
  });
});

describe('modifierKeyLabel', () => {
  test.each([
    ['macOS', 'Cmd'],
    ['MacIntel', 'Cmd'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Cmd'],
    ['Windows', 'Ctrl'],
    ['Win32', 'Ctrl'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Ctrl'],
    ['Linux', 'Ctrl'],
    ['Linux x86_64', 'Ctrl'],
    ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64)', 'Ctrl'],
  ])('%s → %s', (hint, expected) => {
    expect(modifierKeyLabel(hint, 'Ctrl')).toBe(expected);
  });

  test('falls back to Ctrl when the platform is unknown', () => {
    // Better to name the key most users have than to name none.
    expect(modifierKeyLabel(undefined, 'Ctrl')).toBe('Ctrl');
    expect(modifierKeyLabel('', undefined)).toBe('Ctrl');
  });

  test('uses the localized control-key name (German keyboards say Strg)', () => {
    expect(modifierKeyLabel('Win32', 'Strg')).toBe('Strg');
    // macOS is "Cmd" in every locale, so the localized Ctrl name must not leak there.
    expect(modifierKeyLabel('MacIntel', 'Strg')).toBe('Cmd');
  });
});

describe('chatLinkReuseHint ships in every locale', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const read = (ext, loc) => JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extensions', ext, '_locales', loc, 'messages.json'), 'utf8'));

  for (const ext of ['ai-folders', 'gemini-folders']) {
    const locales = fs.readdirSync(path.join(ROOT, 'extensions', ext, '_locales'));

    test(`${ext} has the key in all 43 locales, none empty`, () => {
      expect(locales).toHaveLength(43);
      const bad = locales.filter(loc => {
        const m = read(ext, loc).chatLinkReuseHint;
        return !m || !String(m.message).trim();
      });
      expect(bad).toEqual([]);
    });

    test(`${ext} keeps the {k} placeholder and hardcodes no key name`, () => {
      // The substitution is what lets the tooltip say "Cmd" on a Mac and "Ctrl"
      // on Windows/Linux. A translation that spells either one out would be
      // wrong on half the machines, so that is the failure this guards.
      const bad = locales.filter(loc => {
        const m = read(ext, loc).chatLinkReuseHint.message;
        return !m.includes('{k}') || /Ctrl|Cmd|Command|⌘/i.test(m);
      });
      expect(bad).toEqual([]);
    });
  }

  test.each(['ai-folders', 'gemini-folders'])('%s names the control key per locale', (ext) => {
    const locales = fs.readdirSync(path.join(ROOT, 'extensions', ext, '_locales'));
    const names = {};
    for (const loc of locales) names[loc] = read(ext, loc).keyCtrl?.message;
    // German keyboards are labelled "Strg", not "Ctrl" — the whole reason this is
    // an i18n key instead of a literal. Every other locale uses "Ctrl".
    expect(names.de).toBe('Strg');
    const wrong = locales.filter(loc => loc !== 'de' && names[loc] !== 'Ctrl');
    expect(wrong).toEqual([]);
  });

  test('the wording is product-neutral, so the two extensions cannot drift', () => {
    const locales = fs.readdirSync(path.join(ROOT, 'extensions', 'ai-folders', '_locales'));
    const drifted = locales.filter(loc =>
      read('ai-folders', loc).chatLinkReuseHint.message
        !== read('gemini-folders', loc).chatLinkReuseHint.message);
    expect(drifted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// .chat-link click handling
// ---------------------------------------------------------------------------

describe('chat link click', () => {
  const URL_A = 'https://gemini.google.com/app/aaa';

  function renderOneChat() {
    setupStorage({ Dev: makeFolder(['Chat 1', 'aaa']) }, [], ['Dev']);
    displayFolders(['Dev']);
    return document.querySelector('.chat-link');
  }

  function clickWith(link, init = {}) {
    const e = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    link.dispatchEvent(e);
    return e;
  }

  beforeEach(() => {
    chrome.tabs.create = jest.fn(() => Promise.resolve({ id: 99 }));
    chrome.tabs.update = jest.fn(() => Promise.resolve());
    chrome.tabs.query = jest.fn(() => Promise.resolve([]));
    chrome.windows.update = jest.fn(() => Promise.resolve());
    chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
    chrome.storage.local.set = jest.fn(() => Promise.resolve());
  });

  function stubHint(hint, ctrlName) {
    chrome.i18n.getMessage = jest.fn((key) => {
      if (key === 'chatLinkReuseHint') return hint;
      if (key === 'keyCtrl') return ctrlName;
      return key;
    });
  }

  test('the tooltip keeps the title on its first line and advertises the gesture', () => {
    stubHint('{k}-click: reuse the last tab', 'Ctrl');
    const link = renderOneChat();
    const [first, second] = link.title.split('\n');
    expect(first).toBe('Chat 1');
    // jsdom is not macOS, so {k} resolves to the control key's localized name.
    expect(second).toBe('Ctrl-click: reuse the last tab');
    expect(link.title).not.toContain('{k}');
  });

  test('the tooltip uses the locale\'s own control-key name', () => {
    stubHint('{k} + Klick: letzten Tab wiederverwenden', 'Strg');
    expect(renderOneChat().title.split('\n')[1])
      .toBe('Strg + Klick: letzten Tab wiederverwenden');
  });

  test('keeps the href and target="_blank" (a11y + native middle-click)', () => {
    const link = renderOneChat();
    expect(link.getAttribute('href')).toBe(URL_A);
    expect(link.target).toBe('_blank');
  });

  test('a plain click is handled by the extension', () => {
    const e = clickWith(renderOneChat());
    expect(e.defaultPrevented).toBe(true);
  });

  test.each([
    ['shift-click (native new window)', { shiftKey: true }],
    ['alt-click', { altKey: true }],
    ['middle-click', { button: 1 }],
  ])('%s stays fully native', (_label, init) => {
    const e = clickWith(renderOneChat(), init);
    expect(e.defaultPrevented).toBe(false);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  test.each([
    ['ctrl-click', { ctrlKey: true }],
    ['cmd-click', { metaKey: true }],
  ])('%s asks for tab reuse', async (_label, init) => {
    // Nothing reusable here — we only assert the intent reached openConversation,
    // which is observable as the extension handling the click itself.
    const e = clickWith(renderOneChat(), init);
    expect(e.defaultPrevented).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    // Two queries (all tabs, then the active one) mark the reuse path;
    // a plain click issues only one.
    expect(chrome.tabs.query).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  test('a plain click does not go looking for a tab to reuse', async () => {
    clickWith(renderOneChat());
    await new Promise(r => setTimeout(r, 0));
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.query).toHaveBeenCalledWith({});
  });

  test('an unsafe stored URL is never sent to the tabs API', () => {
    global.isSafeUrl = jest.fn(() => false);   // href becomes about:blank
    const link = renderOneChat();

    expect(link.getAttribute('href')).toBe('about:blank');
    clickWith(link);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
