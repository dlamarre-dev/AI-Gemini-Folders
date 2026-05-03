// folders.js functions depend on globals from utils.js and the DOM.
// We mock those globals here so tests run in isolation.

const { deleteChat, moveChat, togglePin, renameFolder } = require('../src/folders');

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
