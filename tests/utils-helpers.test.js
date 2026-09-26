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
  isStorageFullError,
  modifierKeyLabel,
} = require('../src/utils');

// modifierKeyLabel moved here from folders.js so the what's-new page can name the
// modifier key without loading the folder renderer. Its platform matrix is covered
// in tests/folders.test.js through the re-export; what matters here is that the
// canonical copy lives in utils and still behaves.
describe('modifierKeyLabel (canonical copy)', () => {
  test('Cmd on Apple platforms, the localized Ctrl name elsewhere', () => {
    expect(modifierKeyLabel('MacIntel', 'Strg')).toBe('Cmd');
    expect(modifierKeyLabel('Win32', 'Strg')).toBe('Strg');
    expect(modifierKeyLabel(undefined, undefined)).toBe('Ctrl');
  });
});

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

describe('isStorageFullError', () => {
  test.each([
    ['QUOTA_BYTES quota exceeded', true],
    ['QUOTA_BYTES_PER_ITEM quota exceeded', true],
    ['QuotaExceededError: storage.sync API call exceeded its quota limitations.', true],
    // Rate limits are reported as quotas too, but are gone a minute later.
    ['This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.', false],
    ['This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.', false],
    ['MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE quota exceeded', false],
    ['Some other storage error', false],
  ])('%s → %s', (message, expected) => {
    expect(isStorageFullError(message)).toBe(expected);
  });
});

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
    // The rebuild re-checks the setting before creating the master folder.
    chrome.storage.sync.get = jest.fn((_keys, cb) => cb({ syncBookmarksEnabled: true }));
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

  test('does not mirror an unsafe stored URL into the bookmark tree', async () => {
    const folders = {
      Dev: [
        { title: 'safe', url: 'https://a/ok', timestamp: 2 },
        { title: 'evil', url: 'javascript:alert(1)', timestamp: 1 },
      ],
    };

    await syncToBookmarksTree(folders, [], 'dateDesc');

    const chatCreates = chrome.bookmarks.create.mock.calls
      .map((c) => c[0])
      .filter((o) => o.url);
    expect(chatCreates.map((o) => o.url)).toEqual(['https://a/ok']);
  });

  test('mirrors a sub-folder INSIDE its parent, after the parent conversations', async () => {
    const folders = {
      Work: [{ title: 'w1', url: 'https://a/w1', timestamp: 5 }],
      Clients: [{ title: 'c1', url: 'https://a/c1', timestamp: 9 }],
    };

    await syncToBookmarksTree(folders, [], 'dateDesc', { Clients: 'Work' });

    // Clients is a child, so it never appears at the top level…
    expect(order).toEqual([
      'remove:stale',
      'create:folder(masterFolderName)',
      'create:folder(Work)',
      'create:chat(w1)',
      'create:folder(Clients)',
      'create:chat(c1)',
    ]);

    // …it hangs off Work, at the index right after Work's own conversation.
    // The mock hands out ids in creation order: master=node0, Work=node1.
    const creates = chrome.bookmarks.create.mock.calls.map((c) => c[0]);
    const work = creates.find((o) => o.title === 'Work');
    const clients = creates.find((o) => o.title === 'Clients');
    expect(work.parentId).toBe('node0');
    expect(clients.parentId).toBe('node1');
    expect(clients.index).toBe(1);
  });

  test('an orphaned nesting entry mirrors at the top level rather than vanishing', async () => {
    const folders = { Solo: [{ title: 's', url: 'https://a/s', timestamp: 1 }] };

    await syncToBookmarksTree(folders, [], 'dateDesc', { Solo: 'DeletedParent' });

    expect(order).toContain('create:folder(Solo)');
  });

  // The nesting argument is optional, which is exactly how two call sites came to
  // forget it: saving a conversation mirrored the tree nested, while toggling the
  // feature on rebuilt it flat, with every sub-folder beside its parent. Nothing
  // failed loudly — the tree was simply wrong. So every caller is checked here.
  test('every caller passes the nesting, or the mirror silently goes flat', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'src');
    const callers = [];
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const match of source.matchAll(/syncToBookmarksTree\(/g)) {
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        const line = source.slice(lineStart, source.indexOf('\n', match.index));
        // The definition and the prose that mentions it are not calls.
        if (/function syncToBookmarksTree/.test(line) || /^\s*(\/\/|\*)/.test(line)) continue;
        // The argument list, which may span lines (finishSave's does).
        const args = source.slice(match.index, source.indexOf(');', match.index));
        callers.push({ where: `${file}:${source.slice(0, match.index).split('\n').length}`, args });
      }
    }
    expect(callers.length).toBeGreaterThan(0);
    for (const { where, args } of callers) {
      expect(`${where} → ${args.includes('folderParents')}`).toBe(`${where} → true`);
    }
  });

  // A request arriving mid-rebuild used to be dropped, so a save made while the
  // popup's opening rebuild ran was never mirrored. It is queued now: the two
  // calls never overlap, and the second one's (fresher) data is what ends up
  // in the tree.
  test('a call made while a sync is in flight is queued and re-run afterwards', async () => {
    const first = syncToBookmarksTree({ A: [{ title: 'old', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    await syncToBookmarksTree({ A: [{ title: 'new', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    await first;
    await new Promise((r) => setTimeout(r, 200)); // the queued rebuild
    expect(order.filter((o) => o === 'create:folder(masterFolderName)')).toHaveLength(2);
    // The queued run starts only after the first has created everything.
    expect(order.indexOf('create:chat(old)')).toBeLessThan(order.lastIndexOf('create:folder(masterFolderName)'));
    expect(order[order.length - 1]).toBe('create:chat(new)');
  });

  test('switching the feature off mid-rebuild creates no master folder', async () => {
    chrome.storage.sync.get = jest.fn((_keys, cb) => cb({ syncBookmarksEnabled: false }));
    await syncToBookmarksTree({ A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    expect(order).toEqual(['remove:stale']);
  });

  // The popup and the service worker each hold their own lock, so both can
  // build at once. Each keeps the same winner (lowest id) and removes the rest.
  function twoMasters(sizes) {
    let searches = 0;
    chrome.bookmarks.search = jest.fn((_q, cb) => {
      searches++;
      // 1st search: pre-build cleanup finds nothing. 2nd: ours (node0) + another.
      cb(searches === 1 ? [] : [
        { id: 'node0', title: 'masterFolderName' },
        { id: 'node9', title: 'masterFolderName' },
      ]);
    });
    const tree = (n) => ({ children: Array.from({ length: n }, () => ({})) });
    chrome.bookmarks.getSubTree = jest.fn((id, cb) => cb([tree(sizes[id])]));
  }

  test('a second, equally complete master folder is removed (lowest id wins the tie)', async () => {
    twoMasters({ node0: 2, node9: 2 });
    await syncToBookmarksTree({ A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    expect(chrome.bookmarks.removeTree.mock.calls.map((c) => c[0])).toEqual(['node9']);
  });

  // The largest tree is not necessarily the newest: a delete builds a smaller
  // tree than a quick-save that started earlier from older data. So resolving
  // duplicates asks for one rebuild from storage — and a follow-up never asks
  // for another, or two builders could keep re-triggering each other.
  const askedForResync = () => chrome.storage.sync.get.mock.calls
    .some((c) => Array.isArray(c[0]) && c[0].includes('pinnedFolders'));

  test('resolving duplicates queues one rebuild from fresh storage', async () => {
    twoMasters({ node0: 2, node9: 2 });
    await syncToBookmarksTree({ A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    expect(askedForResync()).toBe(true);
  });

  test('a follow-up rebuild does not queue another', async () => {
    twoMasters({ node0: 2, node9: 2 });
    await syncToBookmarksTree({ A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc', {}, { followUp: true });
    expect(askedForResync()).toBe(false);
  });

  test('a normal rebuild with a single tree queues nothing', async () => {
    await syncToBookmarksTree({ A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    expect(askedForResync()).toBe(false);
  });

  // The popup's rebuild dies whenever the popup closes. A partial tree with the
  // lower id must not win over the complete one.
  test('a partial tree left by a killed builder loses to the complete one', async () => {
    twoMasters({ node0: 1, node9: 5 });
    await syncToBookmarksTree({ A: [{ title: 'c', url: 'https://a/y', timestamp: 1 }] }, [], 'dateDesc');
    expect(chrome.bookmarks.removeTree.mock.calls.map((c) => c[0])).toEqual(['node0']);
  });


});
