// folders.js functions depend on globals from utils.js and the DOM.
// We mock those globals here so tests run in isolation.

const { displayFolders, deleteChat, moveChat, togglePin, renameFolder, renameChat, openFolderInTabGroup } = require('../src/folders');

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

function setupStorage(folders, pinnedFolders = [], openFolders = []) {
  global.loadData = jest.fn((defaults, cb) =>
    cb({
      folders: JSON.parse(JSON.stringify(folders)),
      pinnedFolders: [...pinnedFolders],
      openFolders: [...openFolders],
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
  global.isSafeUrl = jest.fn(() => true);
  global.window.showCustomModal = jest.fn();

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
