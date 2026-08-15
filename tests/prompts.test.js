// displayPrompts renders the prompt library: pinned-first ordering, the date/
// alpha sort, the live search filter (title + body) and the pinned/unpinned
// divider. Mirrors the displayFolders coverage in folders.test.js.

require('../src/prompts'); // exposes window.displayPrompts

// In the popup, utils.js is a classic script loaded first, so its helpers are
// globals. Jest has no such loader — provide the one prompts.js reaches for.
global.isUnsafeKey = require('../src/utils').isUnsafeKey;

function setupStorage(prompts, { promptSortPref = 'dateDesc', openPrompts = [] } = {}) {
  global.loadData = jest.fn((defaults, cb) =>
    cb({
      prompts: JSON.parse(JSON.stringify(prompts)),
      openPrompts: [...openPrompts],
      promptSortPref,
    })
  );
  global.saveData = jest.fn((data, cb) => cb && cb());
}

// setupStorage replays the same initial data on every load, which cannot express
// a sequence like "the flush wrote, then the rename read it back". This one keeps
// state, the way real storage does.
function setupStatefulStorage(prompts, { openPrompts = [] } = {}) {
  const store = {
    prompts: JSON.parse(JSON.stringify(prompts)),
    openPrompts: [...openPrompts],
    promptSortPref: 'dateDesc',
  };
  global.loadData = jest.fn((defaults, cb) => cb(JSON.parse(JSON.stringify(store))));
  global.saveData = jest.fn((data, cb) => {
    Object.assign(store, JSON.parse(JSON.stringify(data)));
    if (cb) cb();
  });
  return store;
}

function render(searchValue = '') {
  document.getElementById('promptSearchInput').value = searchValue;
  window.displayPrompts();
}

const listEl = () => document.getElementById('promptList');
const titles = () =>
  [...listEl().querySelectorAll('.prompt-title')].map((el) => el.textContent);

beforeEach(() => {
  document.body.innerHTML = `
    <input id="promptSearchInput" value="" />
    <div id="promptList"></div>`;
});

describe('displayPrompts — ordering', () => {
  test('default dateDesc lists newest first', () => {
    setupStorage({
      A: { text: '', timestamp: 100 },
      B: { text: '', timestamp: 300 },
      C: { text: '', timestamp: 200 },
    });
    render();
    expect(titles()).toEqual(['B', 'C', 'A']);
  });

  test('alphaAsc lists by title', () => {
    setupStorage(
      { B: { text: '', timestamp: 1 }, A: { text: '', timestamp: 2 }, C: { text: '', timestamp: 3 } },
      { promptSortPref: 'alphaAsc' }
    );
    render();
    expect(titles()).toEqual(['A', 'B', 'C']);
  });

  test('pinned prompts float to the top with a divider before the rest', () => {
    setupStorage({
      Pinned: { text: '', timestamp: 1, pinned: true },
      Recent: { text: '', timestamp: 500 },
    });
    render();
    expect(titles()).toEqual(['Pinned', 'Recent']);

    const children = [...listEl().children];
    const dividerIdx = children.findIndex((c) => c.classList.contains('pin-divider'));
    const recentIdx = children.findIndex(
      (c) => c.querySelector?.('.prompt-title')?.textContent === 'Recent'
    );
    expect(dividerIdx).toBeGreaterThan(0);
    expect(dividerIdx).toBeLessThan(recentIdx);
  });
});

describe('displayPrompts — search filter', () => {
  beforeEach(() => {
    setupStorage({
      Welcome: { text: 'hello world', timestamp: 2 },
      Other: { text: 'nothing here', timestamp: 1 },
    });
  });

  test('matches on the title', () => {
    render('welc');
    expect(titles()).toEqual(['Welcome']);
  });

  test('matches on the prompt body', () => {
    render('world');
    expect(titles()).toEqual(['Welcome']);
  });

  // A search miss must not claim the library is empty — that made the search look
  // broken to users who did have prompts saved (uninstall survey, 2026-08).
  test('shows the no-results message when nothing matches', () => {
    render('zzz');
    expect(listEl().querySelectorAll('.prompt-item')).toHaveLength(0);
    expect(listEl().textContent).toContain('noResults');
    expect(listEl().textContent).not.toContain('promptNoSavedYet');
  });

  test('suppresses the pinned divider while searching', () => {
    setupStorage({
      Pinned: { text: 'alpha match', timestamp: 1, pinned: true },
      Plain: { text: 'alpha match', timestamp: 2 },
    });
    render('alpha');
    expect(titles()).toEqual(['Pinned', 'Plain']);
    expect(listEl().querySelector('.pin-divider')).toBeNull();
  });
});

describe('displayPrompts — empty library', () => {
  test('renders the empty-state hint', () => {
    setupStorage({});
    render();
    expect(listEl().textContent).toContain('promptNoSavedYet');
  });
});

// ---------------------------------------------------------------------------
// buildPromptItem — per-row action buttons (pin / delete / rename / edit) and
// the expand/collapse toggle.
// ---------------------------------------------------------------------------

const lastSavedPrompts = () => {
  const calls = global.saveData.mock.calls;
  return calls[calls.length - 1][0].prompts;
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const firstItem = () => listEl().querySelector('.prompt-item');
const itemByTitle = (title) =>
  [...listEl().querySelectorAll('.prompt-item')].find(
    (it) => it.querySelector('.prompt-title').textContent === title
  );

describe('buildPromptItem — actions', () => {
  beforeEach(() => {
    global.window.showCustomModal = jest.fn();
  });

  test('the pin button flips the pinned flag and persists it', () => {
    setupStorage({ MyPrompt: { text: 't', timestamp: 1 } });
    render();
    firstItem().querySelector('.pin-btn').click();
    expect(lastSavedPrompts().MyPrompt.pinned).toBe(true);
  });

  test('the delete button removes the prompt after confirmation', async () => {
    window.showCustomModal.mockResolvedValue(true);
    setupStorage({ MyPrompt: { text: 't', timestamp: 1 }, Keep: { text: 'k', timestamp: 2 } });
    render();
    itemByTitle('MyPrompt').querySelector('.delete-btn').click();
    await flush();
    const saved = lastSavedPrompts();
    expect(saved.MyPrompt).toBeUndefined();
    expect(saved.Keep).toBeDefined();
  });

  test('the delete button is a no-op when cancelled', async () => {
    window.showCustomModal.mockResolvedValue(false);
    setupStorage({ MyPrompt: { text: 't', timestamp: 1 } });
    render();
    firstItem().querySelector('.delete-btn').click();
    await flush();
    expect(global.saveData).not.toHaveBeenCalled();
  });

  test('the rename button moves the prompt to the new title', async () => {
    window.showCustomModal.mockResolvedValue('Renamed');
    setupStorage({ MyPrompt: { text: 't', timestamp: 1 } });
    render();
    // The rename button is the ✏️ action (not pin/insert/copy/delete).
    [...firstItem().querySelectorAll('.action-btn')]
      .find((b) => b.textContent === '✏️')
      .click();
    await flush();
    const saved = lastSavedPrompts();
    expect(saved.Renamed).toBeDefined();
    expect(saved.Renamed.text).toBe('t');
    expect(saved.MyPrompt).toBeUndefined();
  });

  test('renaming onto an existing title overwrites only after confirmation', async () => {
    window.showCustomModal
      .mockResolvedValueOnce('Other') // the rename prompt
      .mockResolvedValueOnce(true);   // the overwrite confirm
    setupStorage({
      MyPrompt: { text: 'fresh', timestamp: 2 },
      Other: { text: 'stale', timestamp: 1 },
    });
    render();
    [...firstItem().querySelectorAll('.action-btn')]
      .find((b) => b.textContent === '✏️')
      .click();
    await flush();
    await flush();
    const saved = lastSavedPrompts();
    expect(saved.Other.text).toBe('fresh');
    expect(saved.MyPrompt).toBeUndefined();
  });

  test('editing the textarea auto-saves after the debounce', () => {
    jest.useFakeTimers();
    setupStorage({ MyPrompt: { text: 'old', timestamp: 1 } });
    render();
    const ta = firstItem().querySelector('.prompt-text-edit');
    ta.value = 'new body';
    ta.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(600); // PROMPT_DELAY.AUTOSAVE
    expect(lastSavedPrompts().MyPrompt.text).toBe('new body');
    jest.useRealTimers();
  });

  // --- Losing an edit was the actual bug, so these cover each way it happened ---

  test('an unsaved edit is committed when the textarea loses focus', async () => {
    setupStorage({ MyPrompt: { text: 'old', timestamp: 1 } });
    render();
    const ta = firstItem().querySelector('.prompt-text-edit');
    ta.value = 'typed but not yet debounced';
    ta.dispatchEvent(new Event('input'));
    ta.dispatchEvent(new Event('blur'));
    await flush();
    expect(lastSavedPrompts().MyPrompt.text).toBe('typed but not yet debounced');
  });

  test('an unsaved edit is committed when the popup is dismissed', async () => {
    // Closing the popup destroyed the document and the pending timer with it.
    setupStorage({ MyPrompt: { text: 'old', timestamp: 1 } });
    render();
    const ta = firstItem().querySelector('.prompt-text-edit');
    ta.value = 'unsaved on close';
    ta.dispatchEvent(new Event('input'));
    window.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(lastSavedPrompts().MyPrompt.text).toBe('unsaved on close');
  });

  test('an unsaved edit survives a rename', async () => {
    // doRename copies the STORED text, and the pending timer then looked up a
    // title that no longer existed — so the edit vanished twice over.
    const store = setupStatefulStorage({ MyPrompt: { text: 'old', timestamp: 1 } });
    global.window.showCustomModal = jest.fn().mockResolvedValue('Renamed');
    render();
    const ta = firstItem().querySelector('.prompt-text-edit');
    ta.value = 'edited then renamed';
    ta.dispatchEvent(new Event('input'));
    [...firstItem().querySelectorAll('.action-btn')]
      .find((b) => b.textContent === '✏️')
      .click();
    await flush();
    await flush();
    await flush();
    expect(store.prompts.Renamed.text).toBe('edited then renamed');
    expect(store.prompts.MyPrompt).toBeUndefined();
  });

  test('an unsaved edit survives a re-render (search, mode switch, pin)', async () => {
    setupStorage({ MyPrompt: { text: 'old', timestamp: 1 } });
    render();
    const ta = firstItem().querySelector('.prompt-text-edit');
    ta.value = 'edited then re-rendered';
    ta.dispatchEvent(new Event('input'));
    render('my');   // a search keystroke rebuilds the whole list
    await flush();
    expect(lastSavedPrompts().MyPrompt.text).toBe('edited then re-rendered');
  });

  test('a reserved prompt title is refused instead of silently vanishing', async () => {
    // prompts["__proto__"] = {...} hits the prototype setter, so the prompt is
    // never created and JSON.stringify then serializes {}. The duplicate check
    // is also always truthy, so the user first got a phantom overwrite prompt.
    // initPromptsUI needs the add-prompt panel, which the list-only DOM lacks.
    document.body.innerHTML += `
      <input id="promptTitle" value="" />
      <textarea id="promptText"></textarea>
      <button id="savePromptBtn"></button>
      <input type="checkbox" id="syncPromptsToggle" />
      <div id="promptStatus"></div>
      <button id="toggleAddPromptPanelBtn"></button>
      <div id="addPromptPanel"></div>
      <button id="promptSortToggleBtn"></button>
      <div id="promptSortMenu"></div>`;
    setupStorage({});
    window.initPromptsUI();
    document.getElementById('promptTitle').value = '__proto__';
    document.getElementById('promptText').value = 'body';
    document.getElementById('savePromptBtn').click();
    await flush();
    expect(global.saveData).not.toHaveBeenCalled();
    expect(document.getElementById('promptStatus').textContent).toBe('reservedNameError');
  });

  test('toggling the header persists the open state', () => {
    setupStorage({ MyPrompt: { text: 't', timestamp: 1 } }, { openPrompts: [] });
    render();
    firstItem().querySelector('.prompt-header').click();
    const lastOpen = global.saveData.mock.calls.at(-1)[0].openPrompts;
    expect(lastOpen).toContain('MyPrompt');
  });
});
