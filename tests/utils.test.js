const {
  isSafeUrl,
  normalizeUrl,
  loadData,
  saveData,
  mergeImportData,
} = require('../src/utils');

// extractGeminiTitleLogic now lives in the GF extension overlay
const { extractGeminiTitleLogic } = require('../extensions/gemini-folders/site-config');

// ---------------------------------------------------------------------------
// isSafeUrl
// ---------------------------------------------------------------------------

describe('isSafeUrl', () => {
  test('accepts http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  test('accepts https URLs', () => {
    expect(isSafeUrl('https://gemini.google.com/app/abc')).toBe(true);
  });

  test('rejects javascript: protocol', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  test('rejects data: protocol', () => {
    expect(isSafeUrl('data:text/html,<h1>XSS</h1>')).toBe(false);
  });

  test('rejects ftp: protocol', () => {
    expect(isSafeUrl('ftp://files.example.com')).toBe(false);
  });

  test('rejects plain strings that are not URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------

describe('normalizeUrl', () => {
  test('strips query string', () => {
    expect(normalizeUrl('https://gemini.google.com/app/abc?param=1'))
      .toBe('https://gemini.google.com/app/abc');
  });

  test('strips hash fragment', () => {
    expect(normalizeUrl('https://gemini.google.com/app/abc#section'))
      .toBe('https://gemini.google.com/app/abc');
  });

  test('strips both query string and hash', () => {
    expect(normalizeUrl('https://gemini.google.com/app/abc?a=1&b=2#section'))
      .toBe('https://gemini.google.com/app/abc');
  });

  test('preserves origin and pathname when no params', () => {
    expect(normalizeUrl('https://example.com/path/page'))
      .toBe('https://example.com/path/page');
  });

  test('handles malformed URLs gracefully via fallback', () => {
    expect(normalizeUrl('not-a-url?query#hash')).toBe('not-a-url');
  });
});

// ---------------------------------------------------------------------------
// extractGeminiTitleLogic — runs injected into the page DOM
// ---------------------------------------------------------------------------

describe('extractGeminiTitleLogic', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  test('Plan A: returns the official conversation title element', () => {
    document.body.innerHTML =
      '<div data-test-id="conversation-title">My Chat Title</div>';
    expect(extractGeminiTitleLogic('fallback')).toBe('My Chat Title');
  });

  test('Plan B: returns sidebar link text matching current path', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/app/abc123' },
      configurable: true,
    });
    document.body.innerHTML = '<a href="/app/abc123">Sidebar Chat</a>';
    expect(extractGeminiTitleLogic('fallback')).toBe('Sidebar Chat');
  });

  test('Plan C: uses document.title when not in the ignore list', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/app' },
      configurable: true,
    });
    Object.defineProperty(document, 'title', {
      value: 'Refactor API - Gemini',
      configurable: true,
    });
    expect(extractGeminiTitleLogic('fallback')).toBe('Refactor API');
  });

  test('Plan C: skips ignored titles like "Gemini"', () => {
    Object.defineProperty(document, 'title', {
      value: 'Gemini',
      configurable: true,
    });
    // No DOM title element, no sidebar link, no user message — should fall back
    expect(extractGeminiTitleLogic('my fallback')).toBe('my fallback');
  });

  test('Plan D: returns excerpt from first user message', () => {
    Object.defineProperty(document, 'title', {
      value: 'Gemini',
      configurable: true,
    });
    document.body.innerHTML =
      '<div data-message-author-role="user">Help me refactor this function</div>';
    expect(extractGeminiTitleLogic('fallback')).toBe('Help me refactor this function');
  });

  test('Plan D: truncates long user messages at 40 characters', () => {
    Object.defineProperty(document, 'title', {
      value: 'Gemini',
      configurable: true,
    });
    const longMsg = 'This is a very long message that definitely exceeds forty characters';
    document.body.innerHTML =
      `<div data-message-author-role="user">${longMsg}</div>`;
    const result = extractGeminiTitleLogic('fallback');
    expect(result).toBe(longMsg.substring(0, 40) + '...');
  });

  test('returns fallback when no strategy yields a title', () => {
    expect(extractGeminiTitleLogic('my fallback')).toBe('my fallback');
  });
});

// ---------------------------------------------------------------------------
// loadData
// ---------------------------------------------------------------------------

describe('loadData', () => {
  function mockStorage({ sync = {}, local = {} } = {}) {
    chrome.storage.sync.get.mockImplementation((_, cb) => cb(sync));
    chrome.storage.local.get.mockImplementation((_, cb) => cb(local));
  }

  test('returns defaults when storage is empty', (done) => {
    mockStorage();
    loadData({ folders: {}, prompts: {} }, (data) => {
      expect(data.folders).toEqual({});
      expect(data.prompts).toEqual({});
      done();
    });
  });

  test('decompresses folder data from sync storage (legacy single key)', (done) => {
    const folders = { Dev: [{ title: 'Chat', url: 'https://gemini.google.com/app/a', timestamp: 1000 }] };
    mockStorage({ sync: { foldersDataCompressed: `C:${JSON.stringify(folders)}` } });

    loadData({ folders: {} }, (data) => {
      expect(data.folders).toEqual(folders);
      done();
    });
  });

  test('assembles folder data from chunked sync keys', (done) => {
    const folders = { Dev: [{ title: 'Chat', url: 'https://gemini.google.com/app/a', timestamp: 1000 }] };
    const compressed = `C:${JSON.stringify(folders)}`;
    const mid = Math.floor(compressed.length / 2);
    mockStorage({ sync: { fdcN: 2, fdc0: compressed.slice(0, mid), fdc1: compressed.slice(mid) } });

    loadData({ folders: {} }, (data) => {
      expect(data.folders).toEqual(folders);
      done();
    });
  });

  test('falls back to default folders when decompression returns null', (done) => {
    // 'bad data' does not start with 'C:' so the mock returns null, intentionally
    // triggering the catch branch. Silence the expected console.error for this test.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockStorage({ sync: { foldersDataCompressed: 'bad data' } });

    loadData({ folders: { placeholder: [] } }, (data) => {
      expect(data.folders).toEqual({ placeholder: [] });
      spy.mockRestore();
      done();
    });
  });

  test('loads prompts from local storage when sync is disabled', (done) => {
    const prompts = { 'My Prompt': { text: 'Hello', timestamp: 1000 } };
    mockStorage({
      sync:  { syncPromptsEnabled: false },
      local: { promptsDataCompressed: `C:${JSON.stringify(prompts)}` },
    });

    loadData({ prompts: {} }, (data) => {
      expect(data.prompts).toEqual(prompts);
      done();
    });
  });

  test('loads prompts from sync storage when sync is enabled (legacy single key)', (done) => {
    const prompts = { 'Synced Prompt': { text: 'Synced', timestamp: 2000 } };
    mockStorage({
      sync: { syncPromptsEnabled: true, promptsDataCompressed: `C:${JSON.stringify(prompts)}` },
    });

    loadData({ prompts: {} }, (data) => {
      expect(data.prompts).toEqual(prompts);
      done();
    });
  });

  test('reads openFolders from local storage', (done) => {
    mockStorage({ local: { openFolders: ['Dev'] } });
    loadData({ openFolders: [] }, (data) => {
      expect(data.openFolders).toEqual(['Dev']);
      done();
    });
  });

  test('local openFolders wins over a stale synced copy', (done) => {
    mockStorage({ sync: { openFolders: ['Old'] }, local: { openFolders: ['New'] } });
    loadData({ openFolders: [] }, (data) => {
      expect(data.openFolders).toEqual(['New']);
      done();
    });
  });

  test('assembles prompt data from chunked sync keys', (done) => {
    const prompts = { 'Synced Prompt': { text: 'Synced', timestamp: 2000 } };
    const compressed = `C:${JSON.stringify(prompts)}`;
    const mid = Math.floor(compressed.length / 2);
    mockStorage({
      sync: { syncPromptsEnabled: true, pdcN: 2, pdc0: compressed.slice(0, mid), pdc1: compressed.slice(mid) },
    });

    loadData({ prompts: {} }, (data) => {
      expect(data.prompts).toEqual(prompts);
      done();
    });
  });
});

// ---------------------------------------------------------------------------
// saveData
// ---------------------------------------------------------------------------

describe('saveData', () => {
  beforeEach(() => {
    // finishSave reads syncBookmarksEnabled and usageStats
    chrome.storage.sync.get.mockImplementation((_, cb) =>
      cb({ syncBookmarksEnabled: false })
    );
    chrome.storage.local.get.mockImplementation((_, cb) =>
      cb({ usageStats: { saves: 0, opens: 0 } })
    );
    chrome.storage.sync.remove.mockImplementation(() => {});
    chrome.storage.local.remove.mockImplementation(() => {});
  });

  function getSyncSetArg() {
    // saveData calls sync.set once for the compressed folder data
    const calls = chrome.storage.sync.set.mock.calls;
    return calls[calls.length - 1]?.[0] ?? {};
  }

  test('compresses folders into sync chunks', (done) => {
    const folders = { Dev: [{ title: 'Chat', url: 'https://gemini.google.com/app/a', timestamp: 1 }] };
    saveData({ folders }, () => {
      const saved = getSyncSetArg();
      expect(saved.fdcN).toBeDefined();
      expect(saved.fdc0).toBeDefined();
      expect(saved.foldersDataCompressed).toBeUndefined(); // legacy key must not be written
      expect(saved.folders).toBeUndefined();
      let assembled = '';
      for (let i = 0; i < saved.fdcN; i++) assembled += (saved['fdc' + i] || '');
      const decompressed = JSON.parse(LZString.decompressFromUTF16(assembled));
      expect(decompressed).toEqual(folders);
      done();
    });
  });

  test('stores prompts locally when sync is disabled', (done) => {
    const prompts = { 'P1': { text: 'text', timestamp: 1 } };
    chrome.storage.sync.get.mockImplementation((keys, cb) => {
      if (Array.isArray(keys) && keys.includes('syncPromptsEnabled')) {
        cb({ syncPromptsEnabled: false });
      } else {
        cb({ syncBookmarksEnabled: false });
      }
    });

    saveData({ prompts }, () => {
      const localCalls = chrome.storage.local.set.mock.calls;
      const localSaved = localCalls.find((c) => c[0].promptsDataCompressed)?.[0];
      expect(localSaved).toBeDefined();
      const decompressed = JSON.parse(LZString.decompressFromUTF16(localSaved.promptsDataCompressed));
      expect(decompressed).toEqual(prompts);
      done();
    });
  });

  test('stores prompts in sync chunks when sync is enabled', (done) => {
    const prompts = { 'P1': { text: 'text', timestamp: 1 } };
    chrome.storage.sync.get.mockImplementation((keys, cb) => {
      cb({ syncPromptsEnabled: true, syncBookmarksEnabled: false });
    });

    saveData({ prompts }, () => {
      const syncArg = getSyncSetArg();
      expect(syncArg.pdcN).toBeDefined();
      expect(syncArg.pdc0).toBeDefined();
      const decompressed = JSON.parse(LZString.decompressFromUTF16(syncArg.pdc0));
      expect(decompressed).toEqual(prompts);
      done();
    });
  });

  test('calls callback with null on success', (done) => {
    saveData({ folders: {} }, (err) => {
      expect(err).toBeNull();
      done();
    });
  });

  test('calls callback with error message on sync write failure', (done) => {
    chrome.storage.sync.set.mockImplementationOnce((_, cb) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      cb();
      chrome.runtime.lastError = null;
    });

    saveData({ folders: {} }, (err) => {
      expect(err).toBe('QUOTA_BYTES quota exceeded');
      done();
    });
  });

  // -------------------------------------------------------------------------
  // Write-before-delete: nothing is removed until the replacement has landed
  // -------------------------------------------------------------------------

  test("removes the superseded keys only AFTER the write is confirmed", (done) => {
    const order = [];
    chrome.storage.sync.remove.mockImplementation(() => order.push("remove"));
    chrome.storage.sync.set.mockImplementationOnce((_, cb) => { order.push("set"); cb(); });

    saveData({ folders: { Dev: [] } }, () => {
      expect(order).toEqual(["set", "remove"]);
      done();
    });
  });

  test("deletes nothing when the write fails, so the old data stays readable", (done) => {
    // The failure that used to destroy data: the shrink case removed the tail
    // chunks first, the set then failed, and the surviving fdcN pointed at keys
    // that no longer existed -> assembleChunks returned garbage -> loadData fell
    // back to {} and every folder looked empty.
    chrome.storage.sync.get.mockImplementation((keys, cb) =>
      cb({ syncBookmarksEnabled: false, fdcN: 5 }));
    chrome.storage.sync.set.mockImplementationOnce((_, cb) => {
      chrome.runtime.lastError = { message: "QUOTA_BYTES quota exceeded" };
      cb();
      chrome.runtime.lastError = null;
    });

    saveData({ folders: { Dev: [] } }, (err) => {
      expect(err).toBe("QUOTA_BYTES quota exceeded");
      expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
      done();
    });
  });

  test("reports a local write failure instead of calling back empty", (done) => {
    // callback() with no argument made every caller take its success branch.
    // The console spies are not decoration: this path is the only place a
    // service-worker save reports a failure at all (there is no window there, so
    // the modal fallback never fires), so the log IS the user-visible signal —
    // and capturing it keeps a deliberately simulated quota error from printing
    // a scary "QUOTA_BYTES quota exceeded" block in every build.
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    chrome.storage.local.set.mockImplementationOnce((_, cb) => {
      chrome.runtime.lastError = { message: "QUOTA_BYTES quota exceeded" };
      cb();
      chrome.runtime.lastError = null;
    });

    saveData({ openFolders: ["Dev"] }, (err) => {
      expect(err).toBeTruthy();
      expect(String(err)).toContain("QUOTA_BYTES");
      expect(errSpy).toHaveBeenCalledWith(
        "Local storage write failed:",
        expect.objectContaining({ message: "QUOTA_BYTES quota exceeded" })
      );
      // No window in a service worker, so the warn is the whole report there.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("QUOTA_BYTES quota exceeded")
      );
      errSpy.mockRestore();
      warnSpy.mockRestore();
      done();
    });
  });

  test("keeps the local prompts backup when the sync write fails", (done) => {
    // Prompts moving to sync: the local copy is the only remaining backup until
    // sync confirms, so a failed sync must not take it with it.
    chrome.storage.sync.get.mockImplementation((keys, cb) =>
      cb({ syncBookmarksEnabled: false, syncPromptsEnabled: true }));
    chrome.storage.sync.set.mockImplementationOnce((_, cb) => {
      chrome.runtime.lastError = { message: "QUOTA_BYTES quota exceeded" };
      cb();
      chrome.runtime.lastError = null;
    });

    saveData({ prompts: { P1: { text: "t", timestamp: 1 } } }, (err) => {
      expect(err).toBeTruthy();
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
      done();
    });
  });

  // finishSave only reads the bookmark settings (the gate before a full-tree
  // rebuild) when the write can actually change the mirrored tree. We assert on
  // that read instead of on syncToBookmarksTree so the test stays free of the
  // bookmark API and its module-level in-flight flag.
  function bookmarkSettingsChecked() {
    return chrome.storage.sync.get.mock.calls.some(
      (c) => Array.isArray(c[0]) && c[0].includes('syncBookmarksEnabled')
    );
  }

  test('does not re-sync bookmarks for a UI-only write (openFolders)', (done) => {
    saveData({ openFolders: ['Dev'] }, () => {
      expect(bookmarkSettingsChecked()).toBe(false);
      done();
    });
  });

  test('re-syncs bookmarks when pins change', (done) => {
    saveData({ pinnedFolders: ['Dev'] }, () => {
      expect(bookmarkSettingsChecked()).toBe(true);
      done();
    });
  });

  test('re-syncs bookmarks when folders change', (done) => {
    saveData({ folders: { Dev: [] } }, () => {
      expect(bookmarkSettingsChecked()).toBe(true);
      done();
    });
  });

  test('re-syncs bookmarks when sort order changes', (done) => {
    saveData({ sortPref: 'alphaAsc' }, () => {
      expect(bookmarkSettingsChecked()).toBe(true);
      done();
    });
  });

  test('routes openFolders to local storage and never to sync', (done) => {
    saveData({ openFolders: ['Dev'] }, () => {
      const wroteLocal = chrome.storage.local.set.mock.calls.some(
        (c) => c[0] && Array.isArray(c[0].openFolders)
      );
      const wroteSync = chrome.storage.sync.set.mock.calls.some(
        (c) => c[0] && 'openFolders' in c[0]
      );
      expect(wroteLocal).toBe(true);
      expect(wroteSync).toBe(false);
      done();
    });
  });
});

// ---------------------------------------------------------------------------
// mergeImportData
// ---------------------------------------------------------------------------

describe('mergeImportData', () => {
  beforeEach(() => {
    // Default: empty storage, sync disabled, no bookmarks sync
    chrome.storage.sync.get.mockImplementation((_, cb) =>
      cb({ syncPromptsEnabled: false, syncBookmarksEnabled: false })
    );
    chrome.storage.local.get.mockImplementation((_, cb) =>
      cb({ usageStats: { saves: 0, opens: 0 } })
    );
    chrome.storage.sync.remove.mockImplementation(() => {});
    chrome.storage.local.remove.mockImplementation(() => {});
  });

  function savedFolders() {
    const calls = chrome.storage.sync.set.mock.calls;
    const arg = calls[calls.length - 1]?.[0];
    if (!arg?.fdcN) return null;
    let assembled = '';
    for (let i = 0; i < arg.fdcN; i++) assembled += (arg['fdc' + i] || '');
    return JSON.parse(LZString.decompressFromUTF16(assembled));
  }

  // pinnedFolders is a plain pass-through key, not chunked content.
  function savedPins() {
    const calls = chrome.storage.sync.set.mock.calls;
    const arg = calls.map((c) => c[0]).reverse().find((a) => a && a.pinnedFolders);
    return arg ? arg.pinnedFolders : null;
  }

  function savedPrompts() {
    const calls = chrome.storage.local.set.mock.calls;
    const arg = calls.find((c) => c[0].promptsDataCompressed)?.[0];
    if (!arg) return null;
    return JSON.parse(LZString.decompressFromUTF16(arg.promptsDataCompressed));
  }

  test('rejects null input', async () => {
    await expect(mergeImportData(null)).rejects.toThrow('Invalid Format');
  });

  test('rejects non-object input', async () => {
    await expect(mergeImportData('invalid')).rejects.toThrow('Invalid Format');
  });

  test('rejects chats with javascript: URLs', async () => {
    const importedData = {
      folders: {
        Dev: [{ title: 'XSS', url: 'javascript:alert(1)', timestamp: 1 }],
      },
    };
    await mergeImportData(importedData);
    const folders = savedFolders();
    expect(folders.Dev).toHaveLength(0);
  });

  test('merges new chats into existing folder without duplicating', async () => {
    const existing = { Dev: [{ title: 'Chat 1', url: 'https://gemini.google.com/app/aaa', timestamp: 1 }] };
    chrome.storage.sync.get
      .mockImplementationOnce((_, cb) => cb({ foldersDataCompressed: `C:${JSON.stringify(existing)}` }))
      .mockImplementation((_, cb) => cb({ syncPromptsEnabled: false, syncBookmarksEnabled: false }));

    const importedData = {
      folders: {
        Dev: [
          { title: 'Chat 1', url: 'https://gemini.google.com/app/aaa', timestamp: 1 }, // duplicate
          { title: 'Chat 2', url: 'https://gemini.google.com/app/bbb', timestamp: 2 }, // new
        ],
      },
    };
    await mergeImportData(importedData);
    expect(savedFolders().Dev).toHaveLength(2);
  });

  test('handles legacy format (flat folders object without wrapper)', async () => {
    const legacyData = {
      Dev: [{ title: 'Chat', url: 'https://gemini.google.com/app/abc', timestamp: 1 }],
    };
    await mergeImportData(legacyData);
    expect(savedFolders().Dev).toHaveLength(1);
  });

  test('imports pins from backup', async () => {
    const importedData = {
      folders: { Dev: [{ title: 'Chat', url: 'https://gemini.google.com/app/abc', timestamp: 1 }] },
      pinnedFolders: ['Dev'],
    };
    await mergeImportData(importedData);
    const calls = chrome.storage.sync.set.mock.calls;
    const syncArg = calls[calls.length - 1]?.[0];
    // pinnedFolders is stored uncompressed in sync
    expect(syncArg?.pinnedFolders ?? []).toContain('Dev');
  });

  test('rejects when the merged data cannot actually be saved', async () => {
    // An import that hit the quota used to resolve, so both callers announced
    // "Import successful!" while nothing had been written — the worst possible
    // moment to be wrong, since the user is usually restoring a lost backup.
    chrome.storage.sync.set.mockImplementationOnce((_, cb) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      cb();
      chrome.runtime.lastError = null;
    });
    const importedData = {
      folders: { Dev: [{ title: 'Chat', url: 'https://gemini.google.com/app/x', timestamp: 1 }] },
    };
    await expect(mergeImportData(importedData)).rejects.toThrow(/QUOTA_BYTES/);
  });

  test('rejects array input', async () => {
    await expect(mergeImportData([])).rejects.toThrow('Invalid Format');
  });

  test('skips a folder whose value is not an array without throwing', async () => {
    const importedData = {
      folders: {
        Bad: 'not-an-array',
        Good: [{ title: 'Chat', url: 'https://gemini.google.com/app/x', timestamp: 1 }],
      },
    };
    await expect(mergeImportData(importedData)).resolves.toBeUndefined();
    const folders = savedFolders();
    expect(folders.Bad).toBeUndefined();
    expect(folders.Good).toHaveLength(1);
  });

  // JSON.parse creates OWN "__proto__"/"constructor" properties (unlike a JS object
  // literal, which would set the prototype). This mirrors what the real import does
  // when reading a hand-crafted/corrupt backup file. Without the isUnsafeKey guard,
  // currentFolders["__proto__"] resolves to Object.prototype and `.some` throws,
  // aborting the entire import.
  test('skips a __proto__ folder key without throwing, keeping valid folders', async () => {
    const importedData = JSON.parse(
      '{"folders":{"__proto__":[{"title":"X","url":"https://gemini.google.com/app/x","timestamp":1}],' +
      '"Good":[{"title":"C","url":"https://gemini.google.com/app/g","timestamp":2}]}}'
    );
    await expect(mergeImportData(importedData)).resolves.toBeUndefined();
    const folders = savedFolders();
    expect(folders.Good).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(folders, '__proto__')).toBe(false);
    // Prototype chain must be untouched (no pollution).
    expect(({}).some).toBeUndefined();
  });

  test.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'imports a folder named %s like any other', async (name) => {
      // These are inherited-but-truthy names, not unusable ones: only __proto__
      // genuinely cannot be stored. The old tests asserted the other folders
      // survived but never what became of this one.
      const importedData = JSON.parse(
        '{"folders":{"' + name + '":[{"title":"X","url":"https://gemini.google.com/app/x","timestamp":1}],' +
        '"Good":[{"title":"C","url":"https://gemini.google.com/app/g","timestamp":2}]}}'
      );
      await expect(mergeImportData(importedData)).resolves.toBeUndefined();
      const folders = savedFolders();
      expect(folders.Good).toHaveLength(1);
      expect(Object.prototype.hasOwnProperty.call(folders, name)).toBe(true);
      expect(folders[name]).toHaveLength(1);
      expect(folders[name][0].url).toBe('https://gemini.google.com/app/x');
    });

  test('skips a __proto__ prompt key but imports the rest', async () => {
    const importedData = JSON.parse(
      '{"folders":{},"prompts":{"__proto__":{"text":"bad","timestamp":1},' +
      '"constructor":{"text":"ok2","timestamp":1},"Good":{"text":"ok","timestamp":2}}}'
    );
    await expect(mergeImportData(importedData)).resolves.toBeUndefined();
    const prompts = savedPrompts();
    expect(prompts.Good.text).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(prompts, '__proto__')).toBe(false);
    // constructor is storable, so it must arrive under its own name.
    expect(prompts.constructor.text).toBe('ok2');
  });

  test.each(['toString', 'constructor', 'valueOf'])(
    'imports a prompt named %s under its own name, not suffixed', async (name) => {
      // currentPrompts[name] is inherited and truthy, so the merge read it as a
      // title collision and renamed the incoming prompt to "<name> (Imported)"
      // with nothing to collide with.
      const importedData = JSON.parse(
        '{"folders":{},"prompts":{"' + name + '":{"text":"body","timestamp":1}}}'
      );
      await expect(mergeImportData(importedData)).resolves.toBeUndefined();
      const prompts = savedPrompts();
      expect(Object.prototype.hasOwnProperty.call(prompts, name)).toBe(true);
      expect(prompts[name].text).toBe('body');
      expect(Object.prototype.hasOwnProperty.call(prompts, name + ' (Imported)')).toBe(false);
    });

  test('a pin for a folder that does not exist is not imported', async () => {
    // currentFolders["toString"] is inherited and truthy, so the pin passed the
    // "does that folder exist?" test and landed in the pin list as an orphan.
    const importedData = JSON.parse(
      '{"folders":{"Good":[]},"pinnedFolders":["toString","valueOf","Good"]}'
    );
    await expect(mergeImportData(importedData)).resolves.toBeUndefined();
    expect(savedPins()).toEqual(['Good']);
  });

  test('a pin for a folder named toString IS imported when that folder exists', async () => {
    const importedData = JSON.parse(
      '{"folders":{"toString":[{"title":"X","url":"https://gemini.google.com/app/x","timestamp":1}]},' +
      '"pinnedFolders":["toString"]}'
    );
    await expect(mergeImportData(importedData)).resolves.toBeUndefined();
    expect(savedPins()).toEqual(['toString']);
  });

  test('skips malformed prompt entries, keeping valid ones', async () => {
    const importedData = {
      folders: {},
      prompts: {
        Valid: { text: 'hello', timestamp: 1 },
        Legacy: 'plain string prompt',
        BadNumber: 42,
        BadNoText: { timestamp: 1 },
      },
    };
    await mergeImportData(importedData);
    const prompts = savedPrompts();
    expect(prompts.Valid.text).toBe('hello');
    expect(prompts.Legacy.text).toBe('plain string prompt');
    expect(prompts.BadNumber).toBeUndefined();
    expect(prompts.BadNoText).toBeUndefined();
  });

  test('suffixes conflicting prompt title instead of silently overwriting', async () => {
    const existingPrompts = { 'My Prompt': { text: 'Original', timestamp: 1 } };
    chrome.storage.local.get
      .mockImplementationOnce((_, cb) =>
        cb({ promptsDataCompressed: `C:${JSON.stringify(existingPrompts)}` })
      )
      .mockImplementation((_, cb) => cb({ usageStats: { saves: 0, opens: 0 } }));

    const importedData = {
      folders: {},
      prompts: { 'My Prompt': { text: 'Different text', timestamp: 2 } },
    };
    await mergeImportData(importedData);

    const prompts = savedPrompts();
    expect(prompts['My Prompt'].text).toBe('Original');
    expect(prompts['My Prompt (Imported)'].text).toBe('Different text');
  });
});
