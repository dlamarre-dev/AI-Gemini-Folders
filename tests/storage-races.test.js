// Storage behaviour that only shows up when callbacks are genuinely async.
//
// The synchronous chrome.storage mocks in setup.js call back inline, which
// hides every ordering bug (CLAUDE.md §7). Here each area is a small in-memory
// store whose callbacks land on a later tick, like the real API, so a second
// writer — the service worker, or another device through sync — can be slipped
// in between a read and the write that depends on it.

const {
  loadData,
  saveData,
  mergeImportData,
  bumpUsageStat,
  makeChunks,
} = require('../src/utils');

function makeArea(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  const later = (fn) => setTimeout(fn, 0);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  return {
    data,
    get: jest.fn((keys, cb) => later(() => {
      const wanted = keys === null ? Object.keys(data)
        : Array.isArray(keys) ? keys
        : typeof keys === 'string' ? [keys] : Object.keys(keys);
      const out = {};
      for (const k of wanted) if (k in data) out[k] = clone(data[k]);
      cb(out);
    })),
    set: jest.fn((obj, cb) => later(() => {
      Object.assign(data, clone(obj));
      if (cb) cb();
    })),
    remove: jest.fn((keys, cb) => later(() => {
      for (const k of [].concat(keys)) delete data[k];
      if (cb) cb();
    })),
  };
}

let sync;
let local;
function useStorage({ syncData = {}, localData = {} } = {}) {
  sync = makeArea(syncData);
  local = makeArea(localData);
  chrome.storage.sync.get = sync.get;
  chrome.storage.sync.set = sync.set;
  chrome.storage.sync.remove = sync.remove;
  chrome.storage.local.get = local.get;
  chrome.storage.local.set = local.set;
  chrome.storage.local.remove = local.remove;
}

const load = (defaults = { folders: {}, prompts: {} }) => new Promise((r) => loadData(defaults, r));
const save = (data, opts) => new Promise((r) => saveData(data, r, opts));
// Lets fire-and-forget cleanups (runCleanup, the stats bump) finish.
const settle = () => new Promise((r) => setTimeout(r, 30));
const compressed = (obj) => `C:${JSON.stringify(obj)}`;

// A folder set big enough to need several 2,500-char chunks.
function bigFolders(tag, n = 60) {
  const chats = [];
  for (let i = 0; i < n; i++) {
    chats.push({ title: `${tag} conversation number ${i}`, url: `https://gemini.google.com/app/${tag}${i}`, timestamp: i });
  }
  return { [tag]: chats };
}

// ---------------------------------------------------------------------------
// 1. Prompt sync switched on by another device
// ---------------------------------------------------------------------------

describe('prompt sync switched on elsewhere', () => {
  // syncPromptsEnabled is a sync key, so it arrives here while this device's
  // library still sits in storage.local. Reading only sync hid that library,
  // and the next prompt save deleted the local copy for good.
  test("this device's local prompts are still visible", async () => {
    useStorage({
      syncData: { syncPromptsEnabled: true, ...makeChunks(compressed({ Shared: { text: 'from A' } }), 'pdc') },
      localData: { promptsDataCompressed: compressed({ Mine: { text: 'only on B' } }) },
    });

    const { prompts } = await load();

    expect(prompts).toEqual({ Shared: { text: 'from A' }, Mine: { text: 'only on B' } });
  });

  test('a clash keeps the synced prompt and suffixes the local one', async () => {
    useStorage({
      syncData: { syncPromptsEnabled: true, ...makeChunks(compressed({ Email: { text: 'A version' } }), 'pdc') },
      localData: { promptsDataCompressed: compressed({ Email: { text: 'B version' } }) },
    });

    const { prompts } = await load();

    expect(prompts.Email.text).toBe('A version');
    expect(prompts['Email (Imported)'].text).toBe('B version');
  });

  test('the next prompt save carries them into sync before the local copy goes', async () => {
    useStorage({
      syncData: { syncPromptsEnabled: true, ...makeChunks(compressed({ Shared: { text: 'from A' } }), 'pdc') },
      localData: { promptsDataCompressed: compressed({ Mine: { text: 'only on B' } }) },
    });

    // What any prompt edit does: load, change one thing, save the whole set.
    const data = await load();
    data.prompts.Shared.text = 'edited on B';
    expect(await save({ prompts: data.prompts })).toBeNull();
    await settle();

    expect(local.data.promptsDataCompressed).toBeUndefined();
    const { prompts } = await load();
    expect(prompts).toEqual({ Shared: { text: 'edited on B' }, Mine: { text: 'only on B' } });
  });

  test('re-merging on every load until then adds nothing twice', async () => {
    useStorage({
      syncData: { syncPromptsEnabled: true, ...makeChunks(compressed({ Email: { text: 'A' }, 'Email (Imported)': { text: 'B' } }), 'pdc') },
      localData: { promptsDataCompressed: compressed({ Email: { text: 'B' } }) },
    });

    const { prompts } = await load();

    expect(Object.keys(prompts).sort()).toEqual(['Email', 'Email (Imported)']);
  });
});

// ---------------------------------------------------------------------------
// 2. Stale-chunk cleanup vs. a concurrent writer
// ---------------------------------------------------------------------------

describe('chunk cleanup with a concurrent writer', () => {
  test('a shrinking save does not delete chunks a later writer now owns', async () => {
    const large = bigFolders('Big');
    const largeChunks = makeChunks(compressed(large), 'fdc');
    expect(largeChunks.fdcN).toBeGreaterThan(2);
    useStorage({ syncData: { ...largeChunks } });

    // Writer A shrinks the set to one chunk. Right after its set lands, writer B
    // (the service worker, another device) commits a large set again — before
    // A's cleanup of "its" stale range fdc1..fdcN-1 has run.
    const realSet = sync.set.getMockImplementation();
    sync.set.mockImplementation((obj, cb) => realSet(obj, () => {
      if (obj.fdcN === 1) Object.assign(sync.data, JSON.parse(JSON.stringify(largeChunks)));
      if (cb) cb();
    }));

    expect(await save({ folders: { Small: [] } })).toBeNull();
    await settle();

    // B's pointer still counts every chunk it wrote, and they are all there.
    const { folders } = await load();
    expect(folders).toEqual(large);
  });

  test('without interference, a shrinking save still removes its stale tail', async () => {
    const largeChunks = makeChunks(compressed(bigFolders('Big')), 'fdc');
    useStorage({ syncData: { ...largeChunks } });

    await save({ folders: { Small: [] } });
    await settle();

    expect(sync.data.fdcN).toBe(1);
    for (let i = 1; i < largeChunks.fdcN; i++) expect(sync.data['fdc' + i]).toBeUndefined();
  });

  test('switching prompt sync off keeps pdc chunks another device re-created', async () => {
    const promptChunks = makeChunks(compressed({ P: { text: 'x'.repeat(6000) } }), 'pdc');
    useStorage({ syncData: { syncPromptsEnabled: true, ...promptChunks } });

    const realSet = sync.set.getMockImplementation();
    sync.set.mockImplementation((obj, cb) => realSet(obj, () => {
      // Another device writes a set of a different size meanwhile.
      if (obj.syncPromptsEnabled === false) {
        Object.assign(sync.data, makeChunks(compressed({ Q: { text: 'y'.repeat(9000) } }), 'pdc'));
      }
      if (cb) cb();
    }));

    await save({ prompts: { P: { text: 'x' } }, syncPromptsEnabled: false });
    await settle();

    expect(sync.data.pdcN).toBeGreaterThan(promptChunks.pdcN);
    for (let i = 0; i < sync.data.pdcN; i++) expect(sync.data['pdc' + i]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. usageStats.saves counts conversation saves only
// ---------------------------------------------------------------------------

describe('usageStats.saves', () => {
  const stats = () => local.data.usageStats || { saves: 0, opens: 0 };

  test('a folders write that is not a conversation save does not count', async () => {
    useStorage();
    await save({ folders: { Dev: [] } }); // a rename, a delete, a move…
    await save({ prompts: { P: { text: 'autosaved' } } });
    await settle();
    expect(stats().saves).toBe(0);
  });

  test('a conversation save counts once', async () => {
    useStorage();
    await save({ folders: { Dev: [{ title: 't', url: 'https://a/1' }] } }, { countSave: true });
    await settle();
    expect(stats().saves).toBe(1);
  });

  // Both counters share one object; two independent read-modify-writes could
  // each write back a copy missing the other's increment.
  test('an open and a save counted together both survive', async () => {
    useStorage({ localData: { usageStats: { saves: 4, opens: 10 } } });
    await Promise.all([bumpUsageStat('opens'), bumpUsageStat('saves'), bumpUsageStat('opens')]);
    expect(stats()).toEqual({ saves: 5, opens: 12 });
  });
});

// ---------------------------------------------------------------------------
// 6. Import name clashes
// ---------------------------------------------------------------------------

describe('importing a clashing prompt twice', () => {
  const importPrompt = (text) => mergeImportData({ folders: {}, prompts: { Email: { text } } });

  test('a second clash gets its own name instead of overwriting the first', async () => {
    useStorage({ localData: { promptsDataCompressed: compressed({ Email: { text: 'mine' } }) } });

    await importPrompt('backup one');
    await settle();
    // The user edits the first imported copy…
    const data = await load();
    data.prompts['Email (Imported)'].text = 'backup one, edited';
    await save({ prompts: data.prompts });
    await settle();
    // …then imports another backup that clashes on the same title.
    await importPrompt('backup two');
    await settle();

    const { prompts } = await load();
    expect(prompts.Email.text).toBe('mine');
    expect(prompts['Email (Imported)'].text).toBe('backup one, edited');
    expect(prompts['Email (Imported 2)'].text).toBe('backup two');
  });

  test('importing the same backup again adds nothing', async () => {
    useStorage({ localData: { promptsDataCompressed: compressed({ Email: { text: 'mine' } }) } });

    await importPrompt('backup one');
    await settle();
    await importPrompt('backup one');
    await settle();

    const { prompts } = await load();
    expect(Object.keys(prompts).sort()).toEqual(['Email', 'Email (Imported)']);
  });
});
