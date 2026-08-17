// utils.js

// Max characters per sync storage chunk. Chrome enforces 8,192 bytes per key-value pair
// (key UTF-8 + JSON-serialized value UTF-8). At worst-case 3 bytes/char for LZString output,
// 2,500 chars × 3 + key overhead ≈ 7,512 bytes — well under the 8,192 limit.
const SYNC_CHUNK_SIZE = 2500;

// Shared emoji-prefix regex — matches one leading emoji (with optional variation selector)
// followed by optional whitespace. Used to extract custom folder icons.
const EMOJI_PREFIX_REGEX = /^((?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?)\s*/u;

// Brief delay after removing Chrome bookmarks before rebuilding the tree, to let
// the browser propagate the deletion before new nodes are created.
const BOOKMARK_PROPAGATION_DELAY = 50;

// Storage keys that hold the actual user content (folders/prompts). They are
// handled specially (compressed + chunked) and must NOT be passed through as
// plain key/value pairs alongside settings like sortPref/openFolders.
const DATA_KEYS = ['folders', 'foldersDataCompressed', 'prompts', 'promptsDataCompressed'];

// UI-state keys kept in storage.local instead of sync: they change on every
// folder/prompt expand/collapse, which would otherwise burn the sync write
// quota (chrome.storage.sync allows only ~1800 writes/hour, 120/min). They are
// device-local by design — open/closed state no longer follows across devices.
const LOCAL_UI_KEYS = ['openFolders', 'openPrompts'];

// ---------------------------------------------------------------------------
// Storage chunk helpers
// ---------------------------------------------------------------------------

// Reassemble a value stored as prefix+0, prefix+1 … prefix+N chunks.
// Returns null when no chunks exist (caller falls back to legacy single-key format).
function assembleChunks(source, prefix) {
  const n = source[prefix + 'N'];
  if (n === undefined) return null;
  let result = '';
  for (let i = 0; i < n; i++) result += (source[prefix + i] || '');
  return result || null;
}

// Split a compressed string into a chunk object ready to merge into syncToSet.
function makeChunks(compressed, prefix) {
  const n = Math.ceil(compressed.length / SYNC_CHUNK_SIZE) || 1;
  const obj = { [prefix + 'N']: n };
  for (let i = 0; i < n; i++) {
    obj[prefix + i] = compressed.slice(i * SYNC_CHUNK_SIZE, (i + 1) * SYNC_CHUNK_SIZE);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Sorting helpers (shared by folders.js and syncToBookmarksTree)
// ---------------------------------------------------------------------------

function sortFolderNames(folders, pinnedFolders, sortPref) {
  const pinned = pinnedFolders || [];
  const getFolderTime = (name) => {
    const chats = folders[name];
    if (!chats || chats.length === 0) return 0;
    if (sortPref === 'dateDesc') return Math.max(...chats.map(c => c.timestamp || 0));
    return Math.min(...chats.map(c => c.timestamp || Date.now()));
  };
  return Object.keys(folders).sort((a, b) => {
    const aPinned = pinned.includes(a);
    const bPinned = pinned.includes(b);
    if (aPinned !== bPinned) return bPinned ? 1 : -1;
    if (sortPref === 'alphaAsc') return a.localeCompare(b);
    const timeA = getFolderTime(a);
    const timeB = getFolderTime(b);
    if (sortPref === 'dateDesc') return timeB - timeA;
    if (sortPref === 'dateAsc') return timeA - timeB;
    return a.localeCompare(b);
  });
}

function sortChats(chats, sortPref) {
  return [...chats].sort((a, b) => {
    const tA = a.timestamp || 0;
    const tB = b.timestamp || 0;
    if (sortPref === 'dateDesc') return tB - tA;
    if (sortPref === 'dateAsc') return tA - tB;
    if (sortPref === 'alphaAsc') return (a.title || '').localeCompare(b.title || '');
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Folder nesting — ONE level (root → sub-folder), stored in `folderParents`
// ---------------------------------------------------------------------------
//
// `folderParents` is a plain sync key, sibling of `pinnedFolders`:
//     { [childFolderName]: parentFolderName }     absent entry = root folder
//
// It is deliberately NOT stored on the folder itself: `folders[name]` is a bare
// array and every consumer relies on Array.isArray() holding, so turning it into
// an object would mean a data migration — which this codebase has no mechanism
// for. A missing key simply defaults to {} through loadData, exactly like
// pinnedFolders, so old installs and old backups need no conversion.
//
// Child→parent rather than parent→children: a parent→children map can express
// "this folder has two parents", a child→parent map cannot.
//
// Nesting never touches `pinnedFolders`. A pinned folder dragged into another
// keeps its pin dormant (the pin button is not rendered on a sub-folder, and
// children are sorted with no pin list) and gets it back the moment it returns
// to the top level. That is a requirement, and it holds by doing nothing.

// Does this folder carry a usable parent entry? Non-recursive on purpose: with a
// corrupt a→b/b→a pair, recursion would never terminate. Here both folders
// simply read as nested-under-something and getFolderParent sends both back to
// the root level, which is visible and repairable by the user.
function hasParentEntry(folders, folderParents, name) {
  if (!folderParents || !hasEntry(folderParents, name)) return false;
  const parent = folderParents[name];
  return typeof parent === 'string' && parent !== name && hasEntry(folders, parent);
}

// The folder's parent, or null when it is (or must be treated as) a root folder.
// Returns null for an ORPHAN — a recorded parent that no longer exists — without
// deleting anything: a read must not write, and the parent may come back from
// another device on the next sync, which should restore the nesting.
function getFolderParent(folders, folderParents, name) {
  if (!hasParentEntry(folders, folderParents, name)) return null;
  const parent = folderParents[name];
  // The parent is itself nested: honouring this would be depth 2. Drop the
  // grandchild to the top level rather than silently rendering a third level.
  if (hasParentEntry(folders, folderParents, parent)) return null;
  return parent;
}

function getChildFolders(folders, folderParents, name) {
  if (!folders) return [];
  return Object.keys(folders).filter(n => getFolderParent(folders, folderParents, n) === name);
}

function getRootFolderNames(folders, folderParents) {
  if (!folders) return [];
  return Object.keys(folders).filter(n => getFolderParent(folders, folderParents, n) === null);
}

// The folder plus its children — what a delete must remove, in one list.
function folderSubtreeNames(folders, folderParents, name) {
  return [name, ...getChildFolders(folders, folderParents, name)];
}

// A shallow { name: chats } view of a subset, so the existing sortFolderNames can
// order a subset without being modified (and without its callers changing).
function pickFolders(folders, names) {
  const subset = {};
  for (const n of names) if (hasEntry(folders, n)) subset[n] = folders[n];
  return subset;
}

// Children in display order. The pin list is deliberately NOT passed: a dormant
// pin on a nested folder must not reorder its siblings.
function sortedChildFolders(folders, folderParents, name, sortPref) {
  return sortFolderNames(pickFolders(folders, getChildFolders(folders, folderParents, name)), [], sortPref);
}

// Every conversation under a folder: its own first, then each child's, each set
// sorted by the current preference. Used by the tab-group button and by the root
// sort below.
function flattenFolderChats(folders, folderParents, name, sortPref) {
  const own = Array.isArray(folders[name]) ? sortChats(folders[name], sortPref) : [];
  const out = [...own];
  for (const child of sortedChildFolders(folders, folderParents, name, sortPref)) {
    if (Array.isArray(folders[child])) out.push(...sortChats(folders[child], sortPref));
  }
  return out;
}

// Root folders in display order. Each root is ranked on its WHOLE subtree, so a
// parent whose only recent activity happened inside a sub-folder still sorts as
// recent under dateDesc instead of sinking to the bottom.
function sortedRootFolders(folders, folderParents, pinnedFolders, sortPref) {
  const view = {};
  for (const name of getRootFolderNames(folders, folderParents)) {
    view[name] = flattenFolderChats(folders, folderParents, name, sortPref);
  }
  return sortFolderNames(view, pinnedFolders, sortPref);
}

// May `child` be dropped into `parent`? Returns { ok: true } or a reason the
// caller turns into a message: 'missing' | 'self' | 'depth' | 'already'.
function canNestFolder(folders, folderParents, child, parent) {
  if (typeof child !== 'string' || typeof parent !== 'string') return { ok: false, reason: 'missing' };
  if (child === parent) return { ok: false, reason: 'self' };
  if (isUnsafeKey(child) || isUnsafeKey(parent)) return { ok: false, reason: 'missing' };
  if (!hasEntry(folders, child) || !hasEntry(folders, parent)) return { ok: false, reason: 'missing' };
  // Only one level: the target must be a root folder, and the dragged folder
  // must not already be a parent itself.
  if (getFolderParent(folders, folderParents, parent) !== null) return { ok: false, reason: 'depth' };
  if (getChildFolders(folders, folderParents, child).length > 0) return { ok: false, reason: 'depth' };
  if (getFolderParent(folders, folderParents, child) === parent) return { ok: false, reason: 'already' };
  return { ok: true };
}

// New map with `child` nested under `parent`, or moved back to the top level
// when parent is null. Pure — the caller decides when to persist.
function withFolderParent(folderParents, child, parent) {
  const next = { ...(folderParents || {}) };
  if (typeof child !== 'string' || isUnsafeKey(child)) return next;
  if (parent === null || parent === undefined) delete next[child];
  else next[child] = parent;
  return next;
}

// Self-healing copy: drops orphans, self-references and depth-2 entries. Run it
// before every save that carries folderParents, so a parent deleted on another
// device cannot leave the map growing forever.
function pruneFolderParents(folders, folderParents) {
  const next = {};
  for (const child of Object.keys(folderParents || {})) {
    if (!hasEntry(folders, child)) continue;
    const parent = getFolderParent(folders, folderParents, child);
    if (parent !== null) next[child] = parent;
  }
  return next;
}

// "Parent/Child" for the folder-name box, or just the name at the top level.
// Raw names on both sides (emoji prefixes included) so the value round-trips
// through resolveFolderPath — the input already carries the raw name today.
function folderDisplayPath(folders, folderParents, name) {
  const parent = getFolderParent(folders, folderParents, name);
  return parent ? `${parent}/${name}` : name;
}

// Which folders must be expanded for `name` to be visible after a re-render.
function folderOpenPath(folders, folderParents, name) {
  const parent = getFolderParent(folders, folderParents, name);
  return parent ? [parent, name] : [name];
}

// What the folder-name box means. Returns
//   { name, parent, created: string[], error: null | 'nestTooDeep' | 'exists' }
// with name === null when the caller should fall back to its own default.
//
// Rule 1 is load-bearing: an existing folder literally named "a/b" must keep
// working, so an exact match always beats the path interpretation. Every cut
// point is tried, not just the first, so a name containing a slash on either
// side still resolves.
function resolveFolderPath(folders, folderParents, typed) {
  const value = (typed || '').trim();
  const empty = { name: null, parent: null, created: [], error: null };
  if (!value) return empty;

  if (hasEntry(folders, value)) {
    return { name: value, parent: getFolderParent(folders, folderParents, value), created: [], error: null };
  }

  const cuts = [];
  for (let i = value.indexOf('/'); i !== -1; i = value.indexOf('/', i + 1)) {
    const left = value.slice(0, i).trim();
    const right = value.slice(i + 1).trim();
    if (!left || !right || isUnsafeKey(left) || isUnsafeKey(right)) continue;
    cuts.push({ left, right });
  }

  // An existing pair wins over creating anything.
  for (const { left, right } of cuts) {
    if (hasEntry(folders, left) && hasEntry(folders, right)
        && getFolderParent(folders, folderParents, right) === left) {
      return { name: right, parent: left, created: [], error: null };
    }
  }

  if (cuts.length > 0) {
    const { left, right } = cuts[0];
    if (getFolderParent(folders, folderParents, left) !== null) {
      return { name: null, parent: null, created: [], error: 'nestTooDeep' };
    }
    // The child name is taken somewhere else — refuse rather than silently
    // re-parenting a folder the user did not drag.
    if (hasEntry(folders, right)) {
      return { name: null, parent: null, created: [], error: 'exists' };
    }
    const created = [];
    if (!hasEntry(folders, left)) created.push(left);
    created.push(right);
    return { name: right, parent: left, created, error: null };
  }

  return { name: value, parent: null, created: hasEntry(folders, value) ? [] : [value], error: null };
}

// What a search term makes visible for one folder — computed without the DOM so
// it can be unit-tested. `show` false means the folder is filtered out entirely;
// `showAllChats` means the folder itself matched, so all of its conversations
// stay visible (the pre-existing behaviour for a name match).
//
// A root must also surface when only a CHILD matches: the parent is filtered
// first, so without that clause a matching sub-folder would be unreachable.
function folderSearchState(folders, folderParents, name, term) {
  const needle = (term || '').toLowerCase();
  if (!needle) return { show: true, showAllChats: true };

  const nameMatches = (n) => n.toLowerCase().includes(needle);
  const chatMatches = (n) => Array.isArray(folders[n])
    && folders[n].some(c => (c.title || '').toLowerCase().includes(needle));

  const parent = getFolderParent(folders, folderParents, name);
  const self = nameMatches(name);

  if (parent) {
    const viaParent = nameMatches(parent);
    return { show: viaParent || self || chatMatches(name), showAllChats: viaParent || self };
  }

  const viaChild = getChildFolders(folders, folderParents, name)
    .some(child => nameMatches(child) || chatMatches(child));
  return { show: self || chatMatches(name) || viaChild, showAllChats: self };
}

// The two-level context menu, as data. Both background.js build their menu from
// this so the two copies (deliberately unshared, CLAUDE.md §6) cannot drift, and
// so the shape is unit-testable — there is no test suite for background.js.
//
// A contextMenus item that has children is not clickable itself, hence the
// explicit "save here" entry under a parent. Ids stay `folder_<name>` at BOTH
// levels: folder names are unique keys of one flat object, so the id already
// identifies the target unambiguously and survives a service-worker restart.
// Only the submenu containers take a `sub_` prefix, which the click handler
// never accepts as a save target.
function buildContextMenuModel(folders, folderParents, opts = {}) {
  const rootId = opts.rootId;
  const saveHereTitle = opts.saveHereTitle || '';
  const label = (name) => {
    const match = name.match(EMOJI_PREFIX_REGEX);
    return match ? `${match[1]} ${name.replace(EMOJI_PREFIX_REGEX, '')}` : `📁 ${name}`;
  };

  const items = [];
  for (const root of getRootFolderNames(folders, folderParents).sort()) {
    const children = getChildFolders(folders, folderParents, root).sort();
    if (children.length === 0) {
      items.push({ id: `folder_${root}`, parentId: rootId, title: label(root) });
      continue;
    }
    const subId = `sub_${root}`;
    items.push({ id: subId, parentId: rootId, title: label(root) });
    items.push({ id: `folder_${root}`, parentId: subId, title: saveHereTitle });
    items.push({ id: `sep_${root}`, parentId: subId, type: 'separator' });
    for (const child of children) {
      items.push({ id: `folder_${child}`, parentId: subId, title: label(child) });
    }
  }
  return items;
}

function loadData(defaults, callback) {
  chrome.storage.sync.get(null, (syncResult) => {
    chrome.storage.local.get(null, (localResult) => {
      let finalData = Object.assign({}, defaults);
      const combinedResult = { ...localResult, ...syncResult };

      if (combinedResult) {
        for (let key in combinedResult) {
          if (!DATA_KEYS.includes(key)) {
            finalData[key] = syncResult[key] !== undefined ? syncResult[key] : localResult[key];
          }
        }

        // open/closed UI state now lives in storage.local; let it win over any
        // stale synced copy left behind by older versions.
        for (const k of LOCAL_UI_KEYS) {
          if (localResult[k] !== undefined) finalData[k] = localResult[k];
        }

        // 1. Folders — chunked format (fdcN + fdc0..N) or legacy single key
        const rawFoldersData = assembleChunks(syncResult, 'fdc')
          ?? syncResult.foldersDataCompressed
          ?? syncResult.folders
          ?? null;

        if (rawFoldersData) {
          if (typeof rawFoldersData === 'string') {
            try {
              const decompressed = LZString.decompressFromUTF16(rawFoldersData);
              if (decompressed === null) throw new Error("LZString returned null.");
              finalData.folders = JSON.parse(decompressed);
            } catch (error) {
              console.error("🚨 Folders decompression error:", error);
              finalData.folders = defaults.folders || {};
            }
          } else {
            finalData.folders = rawFoldersData;
          }
        }

        // 2. Prompts — chunked sync (pdcN + pdc0..N), legacy sync key, or local
        const syncPromptsEnabled = syncResult.syncPromptsEnabled === true;
        const rawPromptsData = syncPromptsEnabled
          ? (assembleChunks(syncResult, 'pdc') ?? syncResult.promptsDataCompressed ?? syncResult.prompts ?? null)
          : (localResult.promptsDataCompressed ?? localResult.prompts ?? null);

        if (rawPromptsData) {
          if (typeof rawPromptsData === 'string') {
            try {
              const decompressed = LZString.decompressFromUTF16(rawPromptsData);
              if (decompressed === null) throw new Error("LZString returned null.");
              finalData.prompts = JSON.parse(decompressed);
            } catch (error) {
              console.error("🚨 Prompts decompression error:", error);
              finalData.prompts = defaults.prompts || {};
            }
          } else {
            finalData.prompts = rawPromptsData;
          }
        }
      }
      callback(finalData);
    });
  });
}

function saveData(dataToSave, callback) {
  // Also fetch current chunk counts so we can clean up stale chunks from previous larger saves.
  chrome.storage.sync.get(['syncPromptsEnabled', 'fdcN', 'pdcN'], (syncState) => {
    const isPromptsSyncEnabled = dataToSave.syncPromptsEnabled !== undefined
      ? dataToSave.syncPromptsEnabled
      : syncState.syncPromptsEnabled;

    const syncToSet = {};
    const syncToRemove = [];
    const localToSet = {};
    // Keys superseded by this save. NOTHING here is deleted until every write has
    // been confirmed — see runCleanup below.
    const localToRemove = [];

    // Pass through non-data keys (sortPref, pinnedFolders, etc.) to sync as-is,
    // except the device-local UI-state keys which go to storage.local.
    for (const [k, v] of Object.entries(dataToSave)) {
      if (DATA_KEYS.includes(k)) continue;
      if (LOCAL_UI_KEYS.includes(k)) {
        localToSet[k] = v;
      } else {
        syncToSet[k] = v;
      }
    }

    // Only an actual content write (a conversation or prompt) counts toward the
    // usage stats that drive the review prompt — not UI-state writes like
    // open/closed folders, sort preference, or sync toggles.
    const isContentSave = !!(dataToSave.folders || dataToSave.prompts);

    // The bookmark mirror only reflects folders, pins and sort order. Skip the
    // (expensive, full-tree) rebuild for pure UI-state writes like open/closed
    // folders or open/closed prompts. NOTE: this is deliberately broader than
    // isContentSave — pinning a folder or changing the sort order must still
    // re-sync the bookmark order even though no conversation/prompt changed.
    // folderParents belongs here for the same reason: nesting a folder rewrites
    // the shape of the mirrored tree while writing no `folders` at all, so
    // without it the bookmark tree would keep showing the old layout until the
    // next conversation was saved.
    const affectsBookmarks = !!(dataToSave.folders || dataToSave.pinnedFolders
      || dataToSave.sortPref || dataToSave.folderParents);

    // --- Folders → sync, split into chunks to stay under kQuotaBytesPerItem (8 192 B) ---
    if (dataToSave.folders) {
      const compressed = LZString.compressToUTF16(JSON.stringify(dataToSave.folders));
      Object.assign(syncToSet, makeChunks(compressed, 'fdc'));
      const newN = syncToSet.fdcN;
      for (let i = newN; i < (syncState.fdcN || 0); i++) syncToRemove.push('fdc' + i);
      syncToRemove.push('foldersDataCompressed', 'folders');
    }

    // --- Prompts → sync (chunked) if enabled, otherwise local (no per-item limit) ---
    if (dataToSave.prompts) {
      const compressed = LZString.compressToUTF16(JSON.stringify(dataToSave.prompts));
      syncToRemove.push('prompts');
      localToRemove.push('prompts');

      if (isPromptsSyncEnabled) {
        Object.assign(syncToSet, makeChunks(compressed, 'pdc'));
        const newN = syncToSet.pdcN;
        for (let i = newN; i < (syncState.pdcN || 0); i++) syncToRemove.push('pdc' + i);
        syncToRemove.push('promptsDataCompressed'); // remove legacy sync key
        // The local copy is the only remaining backup until sync confirms.
        localToRemove.push('promptsDataCompressed');
      } else {
        localToSet.promptsDataCompressed = compressed;
        const oldSyncPdcN = syncState.pdcN || 0;
        for (let i = 0; i < oldSyncPdcN; i++) syncToRemove.push('pdc' + i);
        syncToRemove.push('pdcN', 'promptsDataCompressed');
      }
    }

    // Delete the superseded keys only once the replacement has actually landed.
    //
    // These removes used to fire here, before the set, on the assumption that
    // Chrome queues operations in order. That holds — but ordering was never the
    // problem: if the set then FAILS (quota, write-rate), the old chunks are
    // already gone while the surviving fdcN still points at them. assembleChunks
    // concatenates the missing keys as '', LZString fails to decompress, and
    // loadData silently falls back to {} — every folder appears empty. The same
    // reasoning already governed the local copy of prompts moving to sync; it
    // simply was never applied to the sync side.
    //
    // Safe to fire-and-forget once we are here: a failed cleanup only leaves a
    // stale chunk behind, and assembleChunks reads 0..N-1, so it is never seen.
    const runCleanup = () => {
      if (syncToRemove.length > 0) chrome.storage.sync.remove(syncToRemove);
      if (localToRemove.length > 0) chrome.storage.local.remove(localToRemove);
    };

    const doSyncSave = () => {
      // Nothing to write to sync (e.g. a local-only UI-state save like expanding
      // a folder) — skip the sync.set so it no longer counts against the quota.
      if (Object.keys(syncToSet).length === 0) {
        runCleanup();
        finishSave(callback, null, isContentSave, affectsBookmarks);
        return;
      }
      // The new chunks AND their fdcN/pdcN pointer go out in this one set, whose
      // quota check Chrome evaluates as a unit — so this call is the commit point.
      chrome.storage.sync.set(syncToSet, () => {
        if (chrome.runtime.lastError) {
          // Nothing was deleted, so the previous state is still intact and readable.
          if (callback) callback(chrome.runtime.lastError.message || 'Storage error');
          return;
        }
        runCleanup();
        finishSave(callback, null, isContentSave, affectsBookmarks);
      });
    };

    if (Object.keys(localToSet).length > 0) {
      chrome.storage.local.set(localToSet, () => {
        if (chrome.runtime.lastError) {
          console.error("Local storage write failed:", chrome.runtime.lastError);
          const localErrMsg = "Storage Error (local): " + chrome.runtime.lastError.message;
          if (typeof window !== 'undefined' && window.showCustomModal) {
            window.showCustomModal({ title: localErrMsg, type: 'alert' });
          } else { console.warn(localErrMsg); }
          // Report the failure: callers check `err` to decide between a success
          // message and an error one, so calling back empty made a failed write
          // look like a successful save.
          if (callback) callback(localErrMsg);
          return;
        }
        doSyncSave();
      });
    } else {
      doSyncSave();
    }
  });
}

// Promise wrapper around saveData that REJECTS on a storage failure. Both
// background.js used `new Promise(resolve => saveData(data, resolve))`, which
// resolves *with* the error string and then discards it — so a quota-failed
// quick-save still showed "✅ Saved!". There is no window in a service worker
// either, so utils.js's modal fallback never fires there: the write failed
// completely silently. Use this instead of hand-rolling the wrapper.
function saveDataAsync(dataToSave) {
  return new Promise((resolve, reject) => {
    saveData(dataToSave, (err) => (err ? reject(new Error(err)) : resolve()));
  });
}

// err is null on success or an error message string on failure.
// countSave: when true (default), increment the saved-content counter that gates
// the review prompt. Callers pass false for pure UI-state writes so toggling a
// folder open or changing the sort order doesn't inflate the count.
// affectsBookmarks: when true (default), re-mirror folders to bookmarks if the
// mobile-sync feature is on. Callers pass false for UI-state writes that don't
// change the bookmark tree (open/closed state) to avoid a full rebuild.
// Callers that don't pass the extra params continue to work unchanged.
function finishSave(callback, err = null, countSave = true, affectsBookmarks = true) {
  if (affectsBookmarks) {
    chrome.storage.sync.get(['syncBookmarksEnabled', 'pinnedFolders', 'sortPref', 'folderParents'], (syncData) => {
      if (syncData.syncBookmarksEnabled) {
        loadData({ folders: {} }, (data) => {
          syncToBookmarksTree(data.folders, syncData.pinnedFolders || [], syncData.sortPref || 'dateDesc',
            syncData.folderParents || {});
        });
      }
    });
  }

  if (countSave) {
    chrome.storage.local.get(['usageStats'], (data) => {
      let stats = data.usageStats || { saves: 0, opens: 0 };
      stats.saves += 1;
      chrome.storage.local.set({ usageStats: stats });
    });
  }

  if (callback) callback(err);
}

// --- BOOKMARKS SYNCHRONIZATION (MOBILE) ---
let isSyncingToBookmarks = false;

async function syncToBookmarksTree(folders, pinnedFolders = [], sortPref = 'dateDesc', folderParents = {}) {
  // 1. Stop if a sync is ongoing
  if (isSyncingToBookmarks) {
    return;
  }

  isSyncingToBookmarks = true;

  try {
    const MASTER_FOLDER_NAME = chrome.i18n.getMessage("masterFolderName") || "Gemini Folders (Sync)";

    // 2. Look for all folders
    const results = await new Promise(r => chrome.bookmarks.search({ title: MASTER_FOLDER_NAME }, r));

    // 3. Remove all existing master trees to eliminate stale duplicates
    for (const node of results) {
      if (!node.url && node.title === MASTER_FOLDER_NAME) {
        await new Promise(r => chrome.bookmarks.removeTree(node.id, r));
      }
    }

    // Brief delay to let bookmark removals propagate before rebuilding the tree
    await new Promise(r => setTimeout(r, BOOKMARK_PROPAGATION_DELAY));

    // 4. Master folder creation
    const masterNode = await new Promise(r => chrome.bookmarks.create({ title: MASTER_FOLDER_NAME }, r));

    // 5. Folder and bookmark creation loop (sorted).
    //
    // The mirror is nested exactly like the popup: a sub-folder becomes a real
    // bookmark folder inside its parent, after the parent's own conversations.
    // Flattening it to "Parent / Child" at the top level would both lose the
    // layout the feature exists to give and collide on names.
    const createFolderNode = async (parentId, folderName, index) => {
      const match = folderName.match(EMOJI_PREFIX_REGEX);
      const displayFolderName = match
        ? `${match[1]} ${folderName.slice(match[0].length)}`
        : folderName;

      const folderNode = await new Promise(r => chrome.bookmarks.create({
        parentId,
        title: displayFolderName,
        index
      }, r));

      const chats = sortChats(folders[folderName] || [], sortPref);
      let childIndex = 0;
      for (const chat of chats) {
        // Defence-in-depth: never mirror an unsafe URL into the bookmark tree,
        // even if legacy/corrupt storage carries one (import already gates on this).
        if (!isSafeUrl(chat.url)) continue;
        await new Promise(r => chrome.bookmarks.create({
          parentId: folderNode.id,
          title: chat.title,
          url: chat.url,
          index: childIndex++
        }, r));
      }
      return { folderNode, nextIndex: childIndex };
    };

    const finalOrder = sortedRootFolders(folders, folderParents, pinnedFolders, sortPref);
    for (let i = 0; i < finalOrder.length; i++) {
      const folderName = finalOrder[i];
      const { folderNode, nextIndex } = await createFolderNode(masterNode.id, folderName, i);

      // Sub-folders continue the parent's index sequence, so they land after its
      // conversations rather than being interleaved with them.
      let subIndex = nextIndex;
      for (const child of sortedChildFolders(folders, folderParents, folderName, sortPref)) {
        await createFolderNode(folderNode.id, child, subIndex++);
      }
    }
  } catch (error) {
    console.error("Critical error during sync :", error);
  } finally {
    isSyncingToBookmarks = false;
  }
}

// Generic title extractor: runs a list of strategy functions in order, injected
// into the target page via executeScript. Each strategy returns a string or null.
// Site-specific implementations live in extensions/<name>/site-config.js.
function extractTitleLogic(strategies, defaultFallback) {
  for (const strategy of strategies) {
    const result = strategy();
    if (result && result.trim().length > 0) return result.trim();
  }
  return defaultFallback;
}

// Does this container really hold an entry called `name`?
//
// Folders and prompts are keyed by user-typed names on ordinary objects, so
// `folders[name]` is truthy for EVERY member of Object.prototype — not just the
// three that used to be blacklisted here. A folder named "toString", "valueOf"
// or "hasOwnProperty" therefore skipped its "create it if missing" guard and
// then threw on `.some()`, wedging the save button exactly like "__proto__"
// did. Blacklisting was the wrong shape of fix: the list can never be complete.
//
// An ownership test is complete, and it also makes those names simply *work* as
// ordinary folder titles instead of being refused.
function hasEntry(container, name) {
  return !!container && Object.prototype.hasOwnProperty.call(container, name);
}

// The one name an ownership check cannot rescue: assigning to "__proto__" on a
// plain object invokes the prototype setter instead of creating a property, so
// the entry is never stored and JSON.stringify emits {} — the folder or prompt
// silently disappears. Every other inherited name is fine once lookups go
// through hasEntry, so this is now a list of exactly one.
function isUnsafeKey(k) {
  return k === '__proto__';
}

function isSafeUrl(url) {
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Names the modifier key this platform actually has, for the {k} placeholder in
// chatLinkReuseHint (folders.js) and in the what's-new page: Cmd on macOS, Ctrl on
// Windows/Linux. Naming both would make the user work out which one is theirs, and
// hardcoding either into the 43 translations would be wrong on half the machines —
// hence the substitution. The control key's *name* is localized (German keyboards
// are labelled "Strg"), so it comes from the keyCtrl message; Command is called
// Cmd in every locale.
//
// Lives here rather than in folders.js because whats-new.js needs it too and must
// not load the whole folder renderer to get it. Pure in its inputs so both
// platforms are testable.
function modifierKeyLabel(platformHint, ctrlLabel) {
  return /Mac|iPhone|iPad/i.test(platformHint || '') ? 'Cmd' : (ctrlLabel || 'Ctrl');
}

function currentModifierKeyLabel() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  // userAgentData.platform is the modern signal; platform/userAgent are the
  // fallbacks (same user-agent sniffing style as welcome.js's Firefox check).
  return modifierKeyLabel(
    nav.userAgentData?.platform || nav.platform || nav.userAgent,
    chrome.i18n.getMessage("keyCtrl"));
}

function normalizeUrl(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    return urlObj.origin + urlObj.pathname;
  } catch (error) {
    // Security Fallback
    return rawUrl.split('?')[0].split('#')[0];
  }
}

// Normalizes an imported prompt value to { text, ... }, or returns null if it
// carries no usable text. Accepts the legacy plain-string shape and the current
// object shape; anything else (numbers, arrays, missing text) is rejected.
function normalizePromptData(promptData) {
  if (typeof promptData === 'string') return { text: promptData };
  if (promptData && typeof promptData === 'object' && !Array.isArray(promptData)
      && typeof promptData.text === 'string') {
    return { ...promptData, text: promptData.text };
  }
  return null;
}

function mergeImportData(importedData) {
  return new Promise((resolve, reject) => {
    // A backup is always a plain object; reject null, primitives, and arrays.
    if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
      return reject(new Error("Invalid Format"));
    }

    loadData({ folders: {}, pinnedFolders: [], prompts: {}, folderParents: {} }, (data) => {
      let currentFolders = data.folders || {};
      let currentPinned = data.pinnedFolders || [];
      let currentPrompts = data.prompts || {};
      let currentParents = data.folderParents || {};

      const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

      // --- BACKWARD COMPATIBILITY MANAGEMENT ---
      // Current format wraps content in { folders, pinnedFolders, prompts };
      // the legacy format is a flat { folderName: chats[] } object.
      let foldersToImport = {};
      let pinsToImport = [];
      let promptsToImport = {};
      let parentsToImport = {};

      if (isPlainObject(importedData.folders)) {
        foldersToImport = importedData.folders;
        if (Array.isArray(importedData.pinnedFolders)) {
          pinsToImport = importedData.pinnedFolders;
        }
        if (isPlainObject(importedData.prompts)) {
          promptsToImport = importedData.prompts;
        }
        // Backups written before nesting existed simply carry no map: everything
        // they contain imports at the top level, which is what it was.
        if (isPlainObject(importedData.folderParents)) {
          parentsToImport = importedData.folderParents;
        }
      } else if (!('folders' in importedData) && !('prompts' in importedData)) {
        // Legacy flat format: the object itself maps folder names to chat arrays.
        foldersToImport = importedData;
      }

      // 1. Merge folders and conversations. Skip entries whose value isn't an
      //    array of chats, and validate each chat's shape before storing it.
      for (const [folderName, chats] of Object.entries(foldersToImport)) {
        if (typeof folderName !== 'string' || isUnsafeKey(folderName) || !Array.isArray(chats)) continue;
        if (!hasEntry(currentFolders, folderName)) currentFolders[folderName] = [];
        chats.forEach(importedChat => {
          if (isPlainObject(importedChat)
              && typeof importedChat.title === 'string'
              && typeof importedChat.url === 'string'
              && isSafeUrl(importedChat.url)) {
            const cleanTargetUrl = normalizeUrl(importedChat.url);
            const isDuplicate = currentFolders[folderName].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
            if (!isDuplicate) currentFolders[folderName].push(importedChat);
          }
        });
      }

      // 2. Merge pins (without creating duplicates). hasEntry, not truthiness:
      //    currentFolders['toString'] is inherited and truthy, so a backup could
      //    pin a folder that does not exist and leave an orphan in the pin list.
      pinsToImport.forEach(pin => {
        if (typeof pin === 'string' && !isUnsafeKey(pin) && !currentPinned.includes(pin)
            && hasEntry(currentFolders, pin)) {
          currentPinned.push(pin);
        }
      });

      // 3. Merge prompts
      for (const [promptTitle, promptData] of Object.entries(promptsToImport)) {
        if (typeof promptTitle !== 'string' || isUnsafeKey(promptTitle)) continue;
        const normalized = normalizePromptData(promptData);
        if (!normalized) continue; // skip malformed prompt entries
        // hasEntry, not truthiness: currentPrompts['toString'] is inherited and
        // truthy, so importing a prompt by that name looked like a collision and
        // arrived renamed to "toString (Imported)" with nothing to collide with.
        if (!hasEntry(currentPrompts, promptTitle)) {
          currentPrompts[promptTitle] = normalized;
        } else {
          // Title conflict: keep the existing prompt and suffix-import the incoming one to avoid silent data loss
          if (currentPrompts[promptTitle].text !== normalized.text) {
             currentPrompts[promptTitle + " (Imported)"] = normalized;
          }
        }
      }

      // 4. Merge the nesting, AFTER the folders so both ends can be checked
      //    against the merged result. An entry is taken only when it is safe on
      //    its own terms; a folder that already has a local placement keeps it,
      //    the same "existing entry wins" policy the prompt merge uses.
      for (const [child, parent] of Object.entries(parentsToImport)) {
        if (typeof child !== 'string' || typeof parent !== 'string') continue;
        if (hasEntry(currentParents, child)) continue;
        if (!canNestFolder(currentFolders, currentParents, child, parent).ok) continue;
        currentParents[child] = parent;
      }

      // Final save. Reject on a storage failure instead of resolving blindly:
      // an import that hit the quota was reporting "Import successful!" while
      // nothing had been written — the worst possible moment to be wrong, since
      // the user is likely restoring a backup after losing data.
      saveData({
        folders: currentFolders,
        pinnedFolders: currentPinned,
        prompts: currentPrompts,
        folderParents: pruneFolderParents(currentFolders, currentParents),
      }, (err) => {
        if (err) reject(new Error(err));
        else resolve();
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Prompt trigger helpers (used by background.js for #trigger + Space injection)
// ---------------------------------------------------------------------------

// Returns all prompts whose stripped title starts with prefix (case-insensitive).
// Each result: { name: stripped-title, text: prompt-body }
function findPromptsByPrefix(prompts, prefix) {
  const needle = prefix.toLowerCase();
  const results = [];
  for (const [title, data] of Object.entries(prompts)) {
    const stripped = title.replace(EMOJI_PREFIX_REGEX, '').trim();
    if (stripped.toLowerCase().startsWith(needle)) {
      results.push({ name: stripped, text: typeof data === 'string' ? data : (data.text || '') });
    }
  }
  return results;
}

// Injected into the AI page via executeScript (runs in PAGE context).
// Idempotent: always reconstructs content from the first line + new suggestions.
// Pass an empty array to clear the suggestion lines (keeps only line 1).
// extensionLabel: optional string shown on line 2; suggestions appear on line 3.
// newFirstLine: optional override for line 1 (used by autocomplete to update the
//   trigger while keeping the suggestion structure stable in one operation).
function insertSuggestionsInEditor(suggestions, selectors, extensionLabel, newFirstLine) {
  // Runs in the page MAIN world (serialized standalone) — keep self-contained.
  const active = document.activeElement;
  const activeEditable = !!active &&
    (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
  // Heuristic fallback shared with injectPromptIntoEditor: lowest sizeable visible
  // textarea/contenteditable, used only when the site's selectors match nothing.
  // (No console.warn here — this runs on every keystroke; the warning lives in
  // injectPromptIntoEditor to avoid log spam.)
  const findComposer = () => {
    const els = Array.from(document.querySelectorAll('textarea, [contenteditable=""], [contenteditable="true"]'))
      .filter(el => {
        if (el.getAttribute('contenteditable') === 'false') return false;
        const r = el.getBoundingClientRect();
        return r.width > 120 && r.height > 12;
      });
    if (!els.length) return null;
    return els.reduce((lo, el) => el.getBoundingClientRect().bottom > lo.getBoundingClientRect().bottom ? el : lo);
  };
  let editor = null;
  if (activeEditable) {
    for (const sel of selectors) {
      try { if (active.matches(sel)) { editor = active; break; } } catch (_) {}
    }
    if (!editor && active === findComposer()) editor = active;
  } else {
    for (const sel of selectors) {
      try { const found = document.querySelector(sel); if (found) { editor = found; break; } } catch (_) {}
    }
    if (!editor) editor = findComposer();
  }
  if (!editor) return false;
  editor.focus();

  if (editor.isContentEditable) {
    // innerText respects <p>/<br> as \n (unlike textContent which concatenates).
    const firstLine = (editor.innerText ?? editor.textContent).split('\n')[0].trim();

    if (editor.classList.contains('ql-editor')) {
      // Quill (Gemini): use a single insertText with '\n' because Quill's Delta format
      // treats '\n' as a paragraph break natively. Using insertParagraph desynchronises
      // Quill's model from the DOM in Firefox MAIN world (wrong element type inserted).
      const line1 = newFirstLine !== undefined ? newFirstLine : firstLine;
      const label = extensionLabel ? '== ' + extensionLabel + ' ==' : '';
      const labelPart = (label && suggestions.length > 0) ? '\n' + label : '';
      const newContent = line1 + (suggestions.length > 0 ? labelPart + '\n' + suggestions.map(n => '#' + n).join('  ') : '');
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, newContent);
      // Quill updates its selection asynchronously after insertText. Defer cursor
      // repositioning so Quill has settled before we set the cursor position.
      return new Promise(resolve => setTimeout(() => {
        // Prefer Quill's own setSelection API: authoritative and not overridable.
        const qlContainer = editor.parentElement;
        const qlRoot = qlContainer?.parentElement;
        const quill = qlRoot?.__quill ?? qlContainer?.__quill;
        if (quill?.setSelection) {
          quill.setSelection(line1.length, 0, 'api');
        } else {
          // Fallback Range API — Quill has settled so our Range won't be overridden.
          const firstBlock = editor.querySelector('p') ?? editor;
          const lastText = Array.from(firstBlock.childNodes).filter(n => n.nodeType === 3).pop();
          const range = document.createRange();
          if (lastText) {
            range.setStart(lastText, lastText.textContent.length);
            range.collapse(true);
          } else {
            range.selectNodeContents(firstBlock);
            range.collapse(false);
          }
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        resolve(true);
      }, 0));
    }

    // ProseMirror (Claude) / React (ChatGPT): use insertParagraph for a reliable
    // paragraph break — '\n' in insertText is not guaranteed to split paragraphs.
    const line1 = newFirstLine !== undefined ? newFirstLine : firstLine;
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, line1);
    if (suggestions.length > 0) {
      document.execCommand('insertParagraph', false, null);
      if (extensionLabel) {
        document.execCommand('insertText', false, '== ' + extensionLabel + ' ==');
        document.execCommand('insertParagraph', false, null);
      }
      document.execCommand('insertText', false, suggestions.map(n => '#' + n).join('  '));
    }

    // Place cursor at the end of the first block element (the first line).
    const firstBlock = editor.querySelector('p, div') ?? editor;
    const lastText = Array.from(firstBlock.childNodes).filter(n => n.nodeType === 3).pop();
    const range = document.createRange();
    if (lastText) {
      range.setStart(lastText, lastText.textContent.length);
    } else {
      range.selectNodeContents(firstBlock);
      range.collapse(false);
    }
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
    const firstLine = editor.value.split('\n')[0];
    const line1 = newFirstLine !== undefined ? newFirstLine : firstLine;
    // Textarea editors (e.g. Open WebUI) omit the '#' prefix in suggestion names
    // to avoid triggering site-specific token processors.
    let newContent = line1;
    if (suggestions.length > 0) {
      if (extensionLabel) newContent += '\n== ' + extensionLabel + ' ==';
      newContent += '\n' + suggestions.join('  ');
    }
    const proto = editor.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) nativeSetter.call(editor, newContent); else editor.value = newContent;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.setSelectionRange(line1.length, line1.length);
    return true;
  }

  return false;
}

// Injected into the AI page via chrome.scripting.executeScript (runs in PAGE context).
// Finds the chat editor with the given CSS selectors and replaces its full content.
// Returns true if the editor was found and the injection was attempted; false otherwise.
//
// Editor targeting & a known limitation: when the user is focused in an editable
// element, we act on it only if it matches `selectors` OR is the page's main
// composer by heuristic — never a different field (that would steal the caret).
// Consequence: while editing a *previous* message, the #-trigger is a no-op on
// sites with specific selectors (ChatGPT / Gemini / Claude) but works in place on
// sites with generic-fallback selectors (DeepSeek / Grok / Perplexity / local LLM). If a
// site changes its DOM, the positional fallback keeps the main composer working
// and logs a console warning. Both behaviours are harmless — neither hijacks the
// main composer. Same targeting logic in insertSuggestionsInEditor.
function injectPromptIntoEditor(promptText, selectors, forceClear) {
  // Runs in the page MAIN world (serialized standalone) — keep self-contained.
  const active = document.activeElement;
  const activeEditable = !!active &&
    (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
  // Heuristic fallback: the lowest sizeable visible textarea/contenteditable
  // (chat composers sit at the bottom). Used ONLY when the site's own selectors
  // match nothing, so a DOM redesign degrades gracefully instead of breaking.
  const findComposer = () => {
    const els = Array.from(document.querySelectorAll('textarea, [contenteditable=""], [contenteditable="true"]'))
      .filter(el => {
        if (el.getAttribute('contenteditable') === 'false') return false;
        const r = el.getBoundingClientRect();
        return r.width > 120 && r.height > 12;
      });
    if (!els.length) return null;
    return els.reduce((lo, el) => el.getBoundingClientRect().bottom > lo.getBoundingClientRect().bottom ? el : lo);
  };
  let editor = null;
  let viaFallback = false;
  if (activeEditable) {
    // Act on the focused element only when it's a recognized main editor — never
    // a different field (e.g. editing a previous message), which would steal the caret.
    for (const sel of selectors) {
      try { if (active.matches(sel)) { editor = active; break; } } catch (_) {}
    }
    // Selectors may be stale: still act on the focused field if it's the page's
    // main composer (heuristic) — but never on a different field.
    if (!editor && active === findComposer()) { editor = active; viaFallback = true; }
  } else {
    for (const sel of selectors) {
      try { const found = document.querySelector(sel); if (found) { editor = found; break; } } catch (_) {}
    }
    if (!editor) { editor = findComposer(); viaFallback = !!editor; }
  }
  if (!editor) return false;
  if (viaFallback) {
    console.warn('[Folders extension] composer selectors matched nothing — used a positional fallback. The site DOM likely changed; selectors need updating.');
  }
  editor.focus();

  if (editor.isContentEditable) {
    if (forceClear) {
      // Dispatch beforeinput BEFORE the actual delete so Perplexity's React handler
      // can clear its chip/token state first. In Chrome, execCommand('delete') also
      // fires beforeinput — the duplicate is harmless. In Firefox, execCommand may not
      // fire it at all, so we do it manually here before touching the DOM.
      document.execCommand('selectAll', false, null);
      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, inputType: 'deleteContentBackward',
      }));
      document.execCommand('delete', false, null);
      editor.textContent = '';
      // Do NOT dispatch 'input' here: that would trigger a React re-render that
      // restores the chip from state, undoing the DOM clear we just performed.
    }
    // Text as the user sees it (innerText keeps <p>/<br> as \n; jsdom has neither).
    const readText = () => (editor.innerText ?? editor.textContent ?? '').trim();

    // --- Lexical (Kimi): drive the editor's own API instead of execCommand ---
    // Lexical owns its selection model and only adopts the DOM selection when the
    // browser fires 'selectionchange' — an async task, so it lands after this
    // function has returned. Every execCommand replace therefore runs against a
    // selection Lexical believes is collapsed at the start of the field: the
    // delete is a no-op and the prompt is inserted *before* the "#name" trigger
    // instead of replacing it. Neither a synthetic 'selectionchange' nor repeated
    // deletes fix that — the selection is the problem, so we bypass it and swap
    // the whole editor state. The editor instance is exposed on its own root
    // element, the same escape hatch used for Quill's __quill below.
    // Skipped on forceClear sites (Meta AI): their chip-clearing path is
    // validated live and must keep behaving exactly as it does today.
    const lex = forceClear ? null : editor.__lexicalEditor;
    if (lex && typeof lex.parseEditorState === 'function'
            && typeof lex.setEditorState === 'function') {
      try {
        const json = lex.getEditorState().toJSON();
        // Reuse the shape of the nodes already in the field: the serialized node
        // format gained fields across Lexical versions, and cloning what this
        // build just produced keeps us compatible with all of them.
        const kids = json.root.children || [];
        const paraProto = kids.find(c => c.type === 'paragraph')
          || { type: 'paragraph', version: 1, format: '', indent: 0, direction: 'ltr' };
        const textProto = (paraProto.children || []).find(c => c.type === 'text')
          || { type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '' };
        // Styling fields are reset to plain text so the prompt doesn't inherit
        // whatever formatting the "#name" trigger happened to carry.
        const mkText = line => Object.assign({}, textProto,
          { text: line, detail: 0, format: 0, mode: 'normal', style: '' });
        json.root.children = promptText.split('\n').map(line => Object.assign({}, paraProto,
          { children: line === '' ? [] : [mkText(line)], textFormat: 0, textStyle: '' }));
        lex.setEditorState(lex.parseEditorState(json));
        // Caret at the end of the injected prompt, via Lexical's own focus API.
        if (typeof lex.focus === 'function') {
          lex.focus(undefined, { defaultSelection: 'rootEnd' });
        }
        // The state swap replaced the content outright — no execCommand needed,
        // and re-running the path below would inject the prompt a second time.
        return true;
      } catch (_) { /* unexpected Lexical shape — fall through to execCommand */ }
    }

    // Three-step replace: select all → delete → insert.
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, promptText);

    // Fallback for editors that ignore execCommand('insertText') (some React/ProseMirror
    // implementations revert DOM changes via their own state). Skipped when forceClear
    // is true (e.g. Perplexity): their beforeinput handler already acts on the
    // execCommand above, so dispatching it again causes double injection.
    //
    // The comparison is whitespace-normalized: block-based editors (Lexical on
    // Kimi/Meta AI, ProseMirror on Claude/Mistral) render each line as its own
    // <p>, so a multi-line prompt that landed *correctly* still reads back with
    // different whitespace — a raw compare would take it for a failure and
    // inject the prompt a second time.
    const landed = readText().replace(/\s+/g, ' ');
    if (!forceClear && landed !== promptText.replace(/\s+/g, ' ').trim()) {
      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true,
        inputType: 'insertText', data: promptText,
      }));
    }
    return true;
  }

  if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
    const proto = editor.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (forceClear) {
      // Clear to empty first so the framework can flush any chip/token state before
      // the final value is set — prevents Firefox from re-rendering stale chips.
      if (nativeSetter) nativeSetter.call(editor, ''); else editor.value = '';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (nativeSetter) {
      nativeSetter.call(editor, promptText);
    } else {
      editor.value = promptText;
    }
    // Dispatch both input and change: React listens to input, Svelte/Vue also use change.
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Uninstall survey URL (chrome.runtime.setUninstallURL)
// ---------------------------------------------------------------------------

// chrome.i18n.getUILanguage() returns BCP-47 tags ('pt-BR', 'zh-CN', 'en-US').
// Only pt and zh have regional variants among the site's 43 locales; everything
// else collapses to its base tag. Deliberately does NOT validate against the
// list of 43 codes — that list belongs to the website (AF_LANGS), which does the
// final check with an English fallback. Keeping it out of here avoids shipping a
// second copy of the language list in the extension.
function normalizeUiLang(raw) {
  const [base, region] = String(raw || '').replace('_', '-').toLowerCase().split('-');
  if (base === 'pt') return region === 'br' ? 'pt_BR' : 'pt_PT';
  if (base === 'zh') return (region === 'tw' || region === 'hk' || region === 'mo') ? 'zh_TW' : 'zh_CN';
  if (base === 'no') return 'nb';           // the site ships nb, not no
  return base || 'en';
}

// Builds the URL the browser opens when the extension is removed. Pure by
// design: the callers (both background.js) read storage/manifest and pass the
// values in, so the whole thing stays unit-testable.
//
// The install *date* is sent, never a day count: the uninstall URL is set long
// before it is opened, so a precomputed count would be stale. The page derives
// the tenure itself. Date is UTC day-precision — no timestamp, nothing that
// could single out a user.
//
// PRIVACY: the values go in the URL *fragment*, never the query string. The
// browser opens this page on its own when the extension is removed, so anything
// in the query would already be in the request line — logged by the host, and
// leaked onward via Referer — before the user had a say. Fragments are never
// sent to the server, which is what makes the page's own promise ("nothing
// leaves your device until you press Send") and the privacy policy's "its
// address carries six non-identifying details" both literally true. Do not
// "simplify" this back to '?'.
function buildUninstallUrl(base, opts) {
  const o = opts || {};
  const p = new URLSearchParams();
  if (o.lang) p.set('l', normalizeUiLang(o.lang));
  if (o.version) p.set('v', String(o.version));
  if (o.browser) p.set('b', String(o.browser));
  // Omitted rather than faked when unknown; 'ie' flags a date inferred at update
  // time for users who were already installed when the survey shipped.
  if (o.installedAt) {
    p.set('i', new Date(o.installedAt).toISOString().slice(0, 10));
    if (o.estimated) p.set('ie', '1');
  }
  p.set('o', String(Number(o.opens) || 0));
  // 's' is what makes 'o' interpretable: opens alone cannot tell "opened the popup
  // four times and saved nothing" from "actually used it". saves === 0 means the
  // user never got the core action to work.
  p.set('s', String(Number(o.saves) || 0));
  return base + '#' + p.toString();
}

if (typeof module !== 'undefined') {
  module.exports = {
    EMOJI_PREFIX_REGEX,
    assembleChunks,
    makeChunks,
    sortFolderNames,
    sortChats,
    getFolderParent,
    getChildFolders,
    getRootFolderNames,
    folderSubtreeNames,
    pickFolders,
    sortedChildFolders,
    sortedRootFolders,
    flattenFolderChats,
    canNestFolder,
    withFolderParent,
    pruneFolderParents,
    folderDisplayPath,
    folderOpenPath,
    resolveFolderPath,
    folderSearchState,
    buildContextMenuModel,
    loadData,
    saveData,
    finishSave,
    syncToBookmarksTree,
    extractTitleLogic,
    isSafeUrl,
    modifierKeyLabel,
    currentModifierKeyLabel,
    normalizeUrl,
    normalizePromptData,
    mergeImportData,
    findPromptsByPrefix,
    injectPromptIntoEditor,
    insertSuggestionsInEditor,
    normalizeUiLang,
    buildUninstallUrl,
    saveDataAsync,
    isUnsafeKey,
    hasEntry,
  };
}
