// bulk-actions.js wires the multi-select bar inside a DOMContentLoaded handler.
// We mount the DOM, dispatch the event to run the wiring, then exercise the
// move / delete / bar-rebuild logic through the exposed window hooks and clicks.

const EMOJI_PREFIX_REGEX =
  /^((?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?)\s*/u;

require('../src/bulk-actions');

function mountDOM() {
  document.body.innerHTML = `
    <div id="bulkActionBar" style="display:none"></div>
    <span id="bulkCount"></span>
    <div id="bulkMoveTrigger"></div>
    <ul id="bulkMoveList" hidden></ul>
    <button id="bulkDeleteBtn"></button>
    <button id="bulkCancelBtn"></button>
    <input id="searchInput" value="" />`;
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

function setStorage(folders) {
  global.loadData = jest.fn((defaults, cb) =>
    cb({
      folders: JSON.parse(JSON.stringify(folders)),
      openFolders: [],
      pinnedFolders: [],
    })
  );
  global.saveData = jest.fn((data, cb) => cb && cb());
}

const lastSavedFolders = () => {
  const calls = global.saveData.mock.calls;
  return calls[calls.length - 1][0].folders;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  global.normalizeUrl = jest.fn((u) => u.split('?')[0].split('#')[0]);
  global.EMOJI_PREFIX_REGEX = EMOJI_PREFIX_REGEX;
  global.window.displayFolders = jest.fn();
  global.window.showCustomModal = jest.fn();
  global.window.selectedChats = [];
  mountDOM();
});

describe('updateBulkActionBar', () => {
  test('shows the bar with a count and a folder list (emoji-aware) when chats are selected', () => {
    chrome.i18n.getMessage = jest.fn((k) => (k === 'bulkSelected' ? '{count} selected' : k));
    setStorage({ 'Work': [], '💻 Code': [] });
    window.selectedChats = [{ folder: 'Work', url: 'https://a/1', chatObj: {} }];

    window.updateBulkActionBar();

    expect(document.getElementById('bulkActionBar').style.display).toBe('flex');
    expect(document.body.classList.contains('bulk-active')).toBe(true);
    expect(document.getElementById('bulkCount').textContent).toContain('1');

    const items = [...document.querySelectorAll('#bulkMoveList li')].map((li) => li.textContent);
    expect(items).toContain('💻 Code'); // emoji prefix used as the icon
    expect(items).toContain('📁 Work'); // default icon for a plain name
  });

  test('hides the bar when nothing is selected', () => {
    setStorage({ Work: [] });
    window.selectedChats = [];
    window.updateBulkActionBar();
    expect(document.getElementById('bulkActionBar').style.display).toBe('none');
    expect(document.body.classList.contains('bulk-active')).toBe(false);
  });
});

describe('move (clicking a destination folder)', () => {
  test('moves the selected chat to the target, removing it from the source', () => {
    setStorage({
      Src: [{ title: 'a', url: 'https://x/a' }],
      Dst: [],
    });
    window.selectedChats = [
      { folder: 'Src', url: 'https://x/a', chatObj: { title: 'a', url: 'https://x/a' } },
    ];

    window.updateBulkActionBar(); // builds the destination list
    const dstLi = [...document.querySelectorAll('#bulkMoveList li')]
      .find((li) => li.textContent.includes('Dst'));
    dstLi.click();

    const saved = lastSavedFolders();
    expect(saved.Src).toHaveLength(0);
    expect(saved.Dst).toHaveLength(1);
    expect(saved.Dst[0].url).toBe('https://x/a');
    expect(window.selectedChats).toHaveLength(0);
    expect(window.displayFolders).toHaveBeenCalled();
  });

  test('does not create a duplicate when the chat already exists in the target', () => {
    setStorage({
      Src: [{ title: 'a', url: 'https://x/a' }],
      Dst: [{ title: 'a', url: 'https://x/a' }],
    });
    window.selectedChats = [
      { folder: 'Src', url: 'https://x/a', chatObj: { title: 'a', url: 'https://x/a' } },
    ];

    window.updateBulkActionBar();
    [...document.querySelectorAll('#bulkMoveList li')]
      .find((li) => li.textContent.includes('Dst'))
      .click();

    expect(lastSavedFolders().Dst).toHaveLength(1);
  });
});

describe('delete', () => {
  test('removes the selected chats after the user confirms', async () => {
    setStorage({ F: [{ title: 'a', url: 'https://x/a' }, { title: 'b', url: 'https://x/b' }] });
    window.showCustomModal = jest.fn().mockResolvedValue(true);
    window.selectedChats = [{ folder: 'F', url: 'https://x/a' }];

    document.getElementById('bulkDeleteBtn').click();
    await flush();

    expect(lastSavedFolders().F.map((c) => c.url)).toEqual(['https://x/b']);
    expect(window.selectedChats).toHaveLength(0);
  });

  test('does nothing when the user cancels the confirm dialog', async () => {
    setStorage({ F: [{ title: 'a', url: 'https://x/a' }] });
    window.showCustomModal = jest.fn().mockResolvedValue(false);
    window.selectedChats = [{ folder: 'F', url: 'https://x/a' }];

    document.getElementById('bulkDeleteBtn').click();
    await flush();

    expect(global.saveData).not.toHaveBeenCalled();
    expect(window.selectedChats).toHaveLength(1);
  });
});

describe('cancel', () => {
  test('clears the selection and refreshes the list', () => {
    setStorage({ F: [{ title: 'a', url: 'https://x/a' }] });
    window.selectedChats = [{ folder: 'F', url: 'https://x/a' }];

    document.getElementById('bulkCancelBtn').click();

    expect(window.selectedChats).toHaveLength(0);
    expect(window.displayFolders).toHaveBeenCalled();
  });
});
