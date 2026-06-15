// Pure helper coverage for utils.js: chunk split/reassemble, the shared sort
// helpers (folders + chats), prompt-data normalization, and the mobile bookmark
// tree builder. These underpin chunked storage writes (data-safety), the
// "newest-first" default sort, and mobile sync ordering.

const {
  assembleChunks,
  makeChunks,
  sortFolderNames,
  sortChats,
  normalizePromptData,
  syncToBookmarksTree,
} = require('../src/utils');

// ---------------------------------------------------------------------------
// assembleChunks / makeChunks
// ---------------------------------------------------------------------------

describe('makeChunks / assembleChunks', () => {
  test('round-trips a short string in a single chunk', () => {
    const chunks = makeChunks('hello', 'fdc');
    expect(chunks).toEqual({ fdcN: 1, fdc0: 'hello' });
    expect(assembleChunks(chunks, 'fdc')).toBe('hello');
  });

  test('splits a string longer than SYNC_CHUNK_SIZE (2500) and reassembles it', () => {
    const big = 'x'.repeat(2501);
    const chunks = makeChunks(big, 'fdc');
    expect(chunks.fdcN).toBe(2);
    expect(chunks.fdc0).toHaveLength(2500);
    expect(chunks.fdc1).toHaveLength(1);
    expect(assembleChunks(chunks, 'fdc')).toBe(big);
  });

  test('reassembly at an exact chunk boundary keeps every character', () => {
    const exact = 'a'.repeat(5000); // exactly two full chunks
    const chunks = makeChunks(exact, 'p');
    expect(chunks.pN).toBe(2);
    expect(assembleChunks(chunks, 'p')).toBe(exact);
  });

  test('assembleChunks returns null when the count key is absent', () => {
    expect(assembleChunks({}, 'fdc')).toBeNull();
    expect(assembleChunks({ otherN: 3 }, 'fdc')).toBeNull();
  });

  test('an empty payload reassembles to null (falsy result → no data)', () => {
    const chunks = makeChunks('', 'fdc');
    expect(chunks.fdcN).toBe(1);
    expect(assembleChunks(chunks, 'fdc')).toBeNull();
  });

  test('uses prefix isolation (folders vs prompts do not collide)', () => {
    const merged = { ...makeChunks('AAA', 'fdc'), ...makeChunks('BBB', 'prm') };
    expect(assembleChunks(merged, 'fdc')).toBe('AAA');
    expect(assembleChunks(merged, 'prm')).toBe('BBB');
  });
});

// ---------------------------------------------------------------------------
// sortFolderNames
// ---------------------------------------------------------------------------

describe('sortFolderNames', () => {
  const folders = {
    Alpha: [{ timestamp: 300 }],
    Beta: [{ timestamp: 100 }],
    Gamma: [{ timestamp: 200 }],
  };

  test('pinned folders always come first, then newest-first (dateDesc)', () => {
    expect(sortFolderNames(folders, ['Beta'], 'dateDesc')).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  test('dateAsc orders the rest oldest-first', () => {
    expect(sortFolderNames(folders, ['Beta'], 'dateAsc')).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  test('alphaAsc orders the rest alphabetically', () => {
    expect(sortFolderNames(folders, ['Beta'], 'alphaAsc')).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  test('an empty folder is treated as timestamp 0 (sorts last under dateDesc)', () => {
    const withEmpty = { ...folders, Empty: [] };
    expect(sortFolderNames(withEmpty, [], 'dateDesc')).toEqual(['Alpha', 'Gamma', 'Beta', 'Empty']);
  });

  test('a missing pinnedFolders argument is tolerated', () => {
    expect(sortFolderNames(folders, undefined, 'alphaAsc')).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

// ---------------------------------------------------------------------------
// sortChats
// ---------------------------------------------------------------------------

describe('sortChats', () => {
  const chats = [
    { title: 'b', timestamp: 100 },
    { title: 'a', timestamp: 300 },
    { title: 'c', timestamp: 200 },
  ];
  const titles = (arr) => arr.map((c) => c.title);

  test('dateDesc = newest first', () => {
    expect(titles(sortChats(chats, 'dateDesc'))).toEqual(['a', 'c', 'b']);
  });

  test('dateAsc = oldest first', () => {
    expect(titles(sortChats(chats, 'dateAsc'))).toEqual(['b', 'c', 'a']);
  });

  test('alphaAsc = by title', () => {
    expect(titles(sortChats(chats, 'alphaAsc'))).toEqual(['a', 'b', 'c']);
  });

  test('an unknown sort key preserves the original order', () => {
    expect(titles(sortChats(chats, 'whatever'))).toEqual(['b', 'a', 'c']);
  });

  test('does not mutate the input array', () => {
    const input = [...chats];
    sortChats(input, 'alphaAsc');
    expect(titles(input)).toEqual(['b', 'a', 'c']);
  });
});

// ---------------------------------------------------------------------------
// normalizePromptData
// ---------------------------------------------------------------------------

describe('normalizePromptData', () => {
  test('wraps the legacy plain-string shape', () => {
    expect(normalizePromptData('my prompt')).toEqual({ text: 'my prompt' });
  });

  test('keeps the object shape and its extra fields', () => {
    expect(normalizePromptData({ text: 'x', pinned: true, timestamp: 5 }))
      .toEqual({ text: 'x', pinned: true, timestamp: 5 });
  });

  test.each([
    ['an array', []],
    ['a number', 42],
    ['null', null],
    ['an object without text', { foo: 1 }],
    ['an object whose text is not a string', { text: 123 }],
  ])('rejects %s → null', (_label, value) => {
    expect(normalizePromptData(value)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// syncToBookmarksTree
// ---------------------------------------------------------------------------

describe('syncToBookmarksTree', () => {
  let order;

  beforeEach(() => {
    order = [];
    let seq = 0;
    // i18n mock returns the key → MASTER_FOLDER_NAME === "masterFolderName".
    chrome.bookmarks.search = jest.fn((_query, cb) =>
      cb([{ id: 'stale', title: 'masterFolderName' /* no url → a folder */ }])
    );
    chrome.bookmarks.removeTree = jest.fn((id, cb) => { order.push('remove:' + id); cb && cb(); });
    chrome.bookmarks.create = jest.fn((obj, cb) => {
      order.push('create:' + (obj.url ? `chat(${obj.title})` : `folder(${obj.title})`));
      cb && cb({ id: 'node' + seq++, ...obj });
    });
  });

  test('clears stale master trees before rebuilding, in sorted order', async () => {
    const folders = {
      '💻 Code': [{ title: 't1', url: 'https://a/1', timestamp: 2 }],
      Work: [{ title: 't2', url: 'https://a/2', timestamp: 1 }],
    };

    await syncToBookmarksTree(folders, [], 'dateDesc');

    // Stale removal happens before any creation.
    expect(order[0]).toBe('remove:stale');
    expect(order.indexOf('remove:stale')).toBeLessThan(order.findIndex((o) => o.startsWith('create')));

    // Master folder, then folders newest-first (Code ts2 before Work ts1), each
    // followed by its chats.
    expect(order).toEqual([
      'remove:stale',
      'create:folder(masterFolderName)',
      'create:folder(💻 Code)',
      'create:chat(t1)',
      'create:folder(Work)',
      'create:chat(t2)',
    ]);
  });

  test('keeps the emoji prefix in the displayed bookmark folder name', async () => {
    await syncToBookmarksTree({ '🚀 Launch': [{ title: 'c', url: 'https://a/x', timestamp: 1 }] }, [], 'dateDesc');
    const folderCreate = chrome.bookmarks.create.mock.calls
      .map((c) => c[0])
      .find((o) => o.title && o.title.includes('Launch'));
    expect(folderCreate.title).toBe('🚀 Launch');
  });

  test('a re-entrant call while a sync is in flight is ignored', async () => {
    const folders = { A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] };
    const first = syncToBookmarksTree(folders, [], 'dateDesc'); // holds the lock
    await syncToBookmarksTree(folders, [], 'dateDesc'); // should bail out immediately
    await first;
    // Only one master folder was created despite two calls.
    const masters = chrome.bookmarks.create.mock.calls
      .filter((c) => c[0].title === 'masterFolderName');
    expect(masters).toHaveLength(1);
  });
});
