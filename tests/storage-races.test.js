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

  test('clearing leftover pdc chunks spares a set another device re-created', async () => {
    // Prompt sync is off and no handoff is live, so the chunks are stale and a
    // local prompt save clears them — unless another device has meanwhile
    // written a new set, which now owns those keys.
    const leftover = makeChunks(compressed({ P: { text: 'x'.repeat(6000) } }), 'pdc');
    useStorage({ syncData: { syncPromptsEnabled: false, ...leftover } });

    const realLocalSet = local.set.getMockImplementation();
    local.set.mockImplementation((obj, cb) => realLocalSet(obj, () => {
      if (obj.promptsDataCompressed) {
        Object.assign(sync.data, makeChunks(compressed({ Q: { text: 'y'.repeat(9000) } }), 'pdc'));
      }
      if (cb) cb();
    }));

    await save({ prompts: { P: { text: 'x' } } });
    await settle();

    expect(sync.data.pdcN).toBeGreaterThan(leftover.pdcN);
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

// ---------------------------------------------------------------------------
// Prompt sync switched OFF by another device (the prompts handoff)
// ---------------------------------------------------------------------------

describe('prompt sync switched off elsewhere', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const synced = { Shared: { text: 'synced' }, Other: { text: 'also synced' } };

  // Both devices have had sync on: the library lives in pdc, and neither holds a
  // local copy any more (their last synced save removed it).
  function bothDevicesSynced() {
    useStorage({ syncData: { syncPromptsEnabled: true, ...makeChunks(compressed(synced), 'pdc') } });
  }

  // Device A switches it off, exactly as the toggle in prompts.js does.
  async function deviceASwitchesOff() {
    const data = await load();
    expect(await save({ prompts: data.prompts, syncPromptsEnabled: false })).toBeNull();
    await settle();
  }

  // Device B shares sync with A but has its own storage.local.
  function becomeDeviceB(localData = {}) {
    local = makeArea(localData);
    chrome.storage.local.get = local.get;
    chrome.storage.local.set = local.set;
    chrome.storage.local.remove = local.remove;
  }

  test('the switch-off leaves the synced library behind as a handoff', async () => {
    bothDevicesSynced();
    await deviceASwitchesOff();

    expect(sync.data.syncPromptsEnabled).toBe(false);
    expect(sync.data.promptsHandoffAt).toEqual(expect.any(Number));
    expect(sync.data.pdcN).toBeDefined();
    // A has its own local copy now, and counts as having taken the handoff in.
    expect(local.data.promptsDataCompressed).toBeDefined();
    expect(local.data.promptsHandoffAdopted).toBe(sync.data.promptsHandoffAt);
  });

  test('another device still sees the library instead of an empty list', async () => {
    bothDevicesSynced();
    await deviceASwitchesOff();
    becomeDeviceB();

    const { prompts } = await load();

    expect(prompts).toEqual(synced);
  });

  test('a stale local copy on that device is merged, the handoff winning a clash', async () => {
    bothDevicesSynced();
    await deviceASwitchesOff();
    becomeDeviceB({ promptsDataCompressed: compressed({ Shared: { text: 'old local' }, Mine: { text: 'b' } }) });

    const { prompts } = await load();

    expect(prompts.Shared.text).toBe('synced');
    expect(prompts['Shared (Imported)'].text).toBe('old local');
    expect(prompts.Mine.text).toBe('b');
  });

  test('once taken in, a prompt that device deletes stays deleted', async () => {
    bothDevicesSynced();
    await deviceASwitchesOff();
    becomeDeviceB();

    const data = await load();
    delete data.prompts.Other;
    await save({ prompts: data.prompts });
    await settle();

    expect(local.data.promptsHandoffAdopted).toBe(sync.data.promptsHandoffAt);
    const { prompts } = await load();
    expect(prompts).toEqual({ Shared: { text: 'synced' } });
    // ...and the handoff is still there for a third device.
    expect(sync.data.pdcN).toBeDefined();
  });

  test('a handoff that arrived after the load is not marked adopted by the save', async () => {
    useStorage({ syncData: { syncPromptsEnabled: false } });
    const data = await load(); // nothing to merge yet
    sync.data.promptsHandoffAt = Date.now() + 1; // a handoff this page never merged
    Object.assign(sync.data, makeChunks(compressed(synced), 'pdc'));

    await save({ prompts: { ...data.prompts, New: { text: 'n' } } });
    await settle();

    expect(local.data.promptsHandoffAdopted).toBeUndefined();
    const { prompts } = await load();
    expect(prompts).toEqual({ ...synced, New: { text: 'n' } });
  });

  test('an expired handoff is ignored and cleared by the next save', async () => {
    useStorage({
      syncData: { syncPromptsEnabled: false, promptsHandoffAt: Date.now() - 31 * DAY, ...makeChunks(compressed(synced), 'pdc') },
      localData: { promptsDataCompressed: compressed({ Mine: { text: 'b' } }) },
    });

    expect((await load()).prompts).toEqual({ Mine: { text: 'b' } });
    await save({ prompts: { Mine: { text: 'b2' } } });
    await settle();

    expect(sync.data.promptsHandoffAt).toBeUndefined();
    expect(sync.data.pdcN).toBeUndefined();
    expect(sync.data.pdc0).toBeUndefined();
  });

  test('switching sync back on ends the handoff', async () => {
    bothDevicesSynced();
    await deviceASwitchesOff();

    const data = await load();
    await save({ prompts: data.prompts, syncPromptsEnabled: true });
    await settle();

    expect(sync.data.promptsHandoffAt).toBeUndefined();
    expect((await load()).prompts).toEqual(synced);
  });

  // A full sync storage may be why sync was switched off in the first place.
  test('the handoff is dropped rather than let a save fail on quota', async () => {
    useStorage({
      syncData: { syncPromptsEnabled: false, promptsHandoffAt: Date.now(), ...makeChunks(compressed(synced), 'pdc') },
      localData: { promptsHandoffAdopted: 1 },
    });
    const realSet = sync.set.getMockImplementation();
    sync.set.mockImplementation((obj, cb) => {
      if (sync.data.pdcN !== undefined) {
        chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        cb();
        chrome.runtime.lastError = null;
        return;
      }
      realSet(obj, cb);
    });

    expect(await save({ folders: { Dev: [] } })).toBeNull();
    await settle();

    expect(sync.data.pdcN).toBeUndefined();
    expect(sync.data.promptsHandoffAt).toBeUndefined();
    expect(sync.data.fdcN).toBe(1);
  });

  test('a quota failure with no handoff to drop is still reported', async () => {
    useStorage();
    sync.set.mockImplementation((obj, cb) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      cb();
      chrome.runtime.lastError = null;
    });

    expect(await save({ folders: { Dev: [] } })).toBe('QUOTA_BYTES quota exceeded');
  });
});
