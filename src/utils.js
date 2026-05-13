// utils.js

// Max characters per sync storage chunk. Chrome enforces 8,192 bytes per key-value pair
// (key UTF-8 + JSON-serialized value UTF-8). At worst-case 3 bytes/char for LZString output,
// 2,500 chars × 3 + key overhead ≈ 7,512 bytes — well under the 8,192 limit.
const SYNC_CHUNK_SIZE = 2500;

function loadData(defaults, callback) {
  chrome.storage.sync.get(null, (syncResult) => {
    chrome.storage.local.get(null, (localResult) => {
      let finalData = Object.assign({}, defaults);
      const combinedResult = { ...localResult, ...syncResult };

      if (combinedResult) {
        for (let key in combinedResult) {
          if (key !== 'folders' && key !== 'foldersDataCompressed' && key !== 'prompts' && key !== 'promptsDataCompressed') {
            finalData[key] = syncResult[key] !== undefined ? syncResult[key] : localResult[key];
          }
        }

        // 1. Folders — chunked format (fdcN + fdc0..N) or legacy single key
        let rawFoldersData = null;
        if (syncResult.fdcN !== undefined) {
          let assembled = '';
          for (let i = 0; i < syncResult.fdcN; i++) assembled += (syncResult['fdc' + i] || '');
          rawFoldersData = assembled || null;
        } else {
          rawFoldersData = syncResult.foldersDataCompressed || syncResult.folders;
        }

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
        let rawPromptsData = null;
        if (syncPromptsEnabled) {
          if (syncResult.pdcN !== undefined) {
            let assembled = '';
            for (let i = 0; i < syncResult.pdcN; i++) assembled += (syncResult['pdc' + i] || '');
            rawPromptsData = assembled || null;
          } else if (syncResult.promptsDataCompressed || syncResult.prompts) {
            rawPromptsData = syncResult.promptsDataCompressed || syncResult.prompts;
          }
        } else if (localResult.promptsDataCompressed || localResult.prompts) {
          rawPromptsData = localResult.promptsDataCompressed || localResult.prompts;
        }

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
    // Local keys to remove ONLY after sync.set confirms success, to prevent data loss on failure.
    const localCleanupAfterSync = [];

    // Pass through all non-data keys (sortPref, openFolders, pinnedFolders, etc.) to sync as-is.
    for (const [k, v] of Object.entries(dataToSave)) {
      if (!['folders', 'foldersDataCompressed', 'prompts', 'promptsDataCompressed'].includes(k)) {
        syncToSet[k] = v;
      }
    }

    // --- Folders → sync, split into chunks to stay under kQuotaBytesPerItem (8 192 B) ---
    if (dataToSave.folders) {
      const compressed = LZString.compressToUTF16(JSON.stringify(dataToSave.folders));
      const newN = Math.ceil(compressed.length / SYNC_CHUNK_SIZE) || 1;
      const oldN = syncState.fdcN || 0;
      syncToSet.fdcN = newN;
      for (let i = 0; i < newN; i++) {
        syncToSet['fdc' + i] = compressed.slice(i * SYNC_CHUNK_SIZE, (i + 1) * SYNC_CHUNK_SIZE);
      }
      for (let i = newN; i < oldN; i++) syncToRemove.push('fdc' + i); // stale chunks
      syncToRemove.push('foldersDataCompressed', 'folders');            // legacy keys
    }

    // --- Prompts → sync (chunked) if enabled, otherwise local (no per-item limit) ---
    if (dataToSave.prompts) {
      const compressed = LZString.compressToUTF16(JSON.stringify(dataToSave.prompts));
      syncToRemove.push('prompts');
      chrome.storage.local.remove(['prompts']);

      if (isPromptsSyncEnabled) {
        const newN = Math.ceil(compressed.length / SYNC_CHUNK_SIZE) || 1;
        const oldN = syncState.pdcN || 0;
        syncToSet.pdcN = newN;
        for (let i = 0; i < newN; i++) {
          syncToSet['pdc' + i] = compressed.slice(i * SYNC_CHUNK_SIZE, (i + 1) * SYNC_CHUNK_SIZE);
        }
        for (let i = newN; i < oldN; i++) syncToRemove.push('pdc' + i);
        syncToRemove.push('promptsDataCompressed'); // remove legacy sync key
        // Defer local cleanup: only delete local copy after sync confirms success.
        localCleanupAfterSync.push('promptsDataCompressed');
      } else {
        localToSet.promptsDataCompressed = compressed;
        const oldSyncPdcN = syncState.pdcN || 0;
        for (let i = 0; i < oldSyncPdcN; i++) syncToRemove.push('pdc' + i);
        syncToRemove.push('pdcN', 'promptsDataCompressed');
      }
    }

    // Fire-and-forget removes (Chrome queues ops, so these land before the subsequent set).
    if (syncToRemove.length > 0) chrome.storage.sync.remove(syncToRemove);

    const doSyncSave = () => {
      chrome.storage.sync.set(syncToSet, () => {
        if (chrome.runtime.lastError) {
          // Local data was NOT deleted (deferred cleanup never ran) — report error to caller.
          if (callback) callback(chrome.runtime.lastError.message || 'Storage error');
          return;
        }
        // Sync succeeded — now safe to remove the local backup of prompts that moved to sync.
        if (localCleanupAfterSync.length > 0) chrome.storage.local.remove(localCleanupAfterSync);
        finishSave(callback, null);
      });
    };

    if (Object.keys(localToSet).length > 0) {
      chrome.storage.local.set(localToSet, () => {
        if (chrome.runtime.lastError) {
          console.error("Local storage write failed:", chrome.runtime.lastError);
          alert("Storage Error (local): " + chrome.runtime.lastError.message);
          if (callback) callback();
          return;
        }
        doSyncSave();
      });
    } else {
      doSyncSave();
    }
  });
}

// err is null on success or an error message string on failure.
// Callers that don't check the param continue to work unchanged.
function finishSave(callback, err = null) {
  chrome.storage.sync.get(['syncBookmarksEnabled', 'pinnedFolders', 'sortPref'], (syncData) => {
    if (syncData.syncBookmarksEnabled) {
      loadData({ folders: {} }, (data) => {
        syncToBookmarksTree(data.folders, syncData.pinnedFolders || [], syncData.sortPref || 'dateAsc');
      });
    }
  });

  chrome.storage.local.get(['usageStats'], (data) => {
    let stats = data.usageStats || { saves: 0, opens: 0 };
    stats.saves += 1;
    chrome.storage.local.set({ usageStats: stats });
  });

  if (callback) callback(err);
}

// --- BOOKMARKS SYNCHRONIZATION (MOBILE) ---
let isSyncingToBookmarks = false;

async function syncToBookmarksTree(folders, pinnedFolders = [], sortPref = 'dateAsc') {
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
    await new Promise(r => setTimeout(r, 50));

    // 4. Master folder creation
    const masterNode = await new Promise(r => chrome.bookmarks.create({ title: MASTER_FOLDER_NAME }, r));

    // --- DYNAMIC SORTING ---
    let finalOrder = Object.keys(folders).sort((a, b) => {
      const aPinned = pinnedFolders.includes(a);
      const bPinned = pinnedFolders.includes(b);

      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (sortPref === 'alphaAsc') {
        return a.localeCompare(b);
      } else {
        const getFolderTime = (folderName) => {
          const chatsList = folders[folderName];
          if (!chatsList || chatsList.length === 0) return 0;
          if (sortPref === 'dateDesc') return Math.max(...chatsList.map(c => c.timestamp || 0));
          return Math.min(...chatsList.map(c => c.timestamp || Date.now()));
        };
        const timeA = getFolderTime(a);
        const timeB = getFolderTime(b);
        if (sortPref === 'dateDesc') return timeB - timeA;
        if (sortPref === 'dateAsc') return timeA - timeB;
      }
      return a.localeCompare(b);
    });

    // 5. Folder and bookmark creation loop
    for (let i = 0; i < finalOrder.length; i++) {
      const folderName = finalOrder[i];
      let displayFolderName = folderName;

      const emojiRegex = /^((?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)\s*/u;
      const match = folderName.match(emojiRegex);
      if (match) {
        const restOfString = folderName.slice(match[0].length);
        displayFolderName = `${match[1]} ${restOfString}`;
      }

      const folderNode = await new Promise(r => chrome.bookmarks.create({
        parentId: masterNode.id,
        title: displayFolderName,
        index: i
      }, r));

      // Sort conversations
      let chats = [...folders[folderName]];
      chats.sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        if (sortPref === 'dateDesc') return timeB - timeA;
        if (sortPref === 'dateAsc') return timeA - timeB;
        if (sortPref === 'alphaAsc') return a.title.localeCompare(b.title);
        return 0;
      });

      for (let j = 0; j < chats.length; j++) {
        const chat = chats[j];
        await new Promise(r => chrome.bookmarks.create({
          parentId: folderNode.id,
          title: chat.title,
          url: chat.url,
          index: j
        }, r));
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

function isSafeUrl(url) {
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
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

function mergeImportData(importedData) {
  return new Promise((resolve, reject) => {
    if (typeof importedData !== 'object' || importedData === null) {
      return reject(new Error("Invalid Format"));
    }

    loadData({ folders: {}, pinnedFolders: [], prompts: {} }, (data) => {
      let currentFolders = data.folders || {};
      let currentPinned = data.pinnedFolders || [];
      let currentPrompts = data.prompts || {};

      // --- BACKWARD COMPATIBILITY MANAGEMENT ---
      let foldersToImport = {};
      let pinsToImport = [];
      let promptsToImport = {};

      if (importedData.folders) {
        foldersToImport = importedData.folders;
        if (Array.isArray(importedData.pinnedFolders)) {
          pinsToImport = importedData.pinnedFolders;
        }
        if (importedData.prompts) {
          promptsToImport = importedData.prompts;
        }
      } else {
        foldersToImport = importedData;
      }

      // 1. Merge folders and conversations
      for (const [folderName, chats] of Object.entries(foldersToImport)) {
        if (!currentFolders[folderName]) currentFolders[folderName] = [];
        chats.forEach(importedChat => {
          if (importedChat.title && importedChat.url && isSafeUrl(importedChat.url)) {
            const cleanTargetUrl = normalizeUrl(importedChat.url);
            const isDuplicate = currentFolders[folderName].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
            if (!isDuplicate) currentFolders[folderName].push(importedChat);
          }
        });
      }

      // 2. Merge pins (without creating duplicates)
      pinsToImport.forEach(pin => {
        if (!currentPinned.includes(pin) && currentFolders[pin]) {
          currentPinned.push(pin);
        }
      });

      // 3. Merge prompts
      for (const [promptTitle, promptData] of Object.entries(promptsToImport)) {
        if (!currentPrompts[promptTitle]) {
          currentPrompts[promptTitle] = promptData;
        } else {
          // Title conflict: keep the existing prompt and suffix-import the incoming one to avoid silent data loss
          if (currentPrompts[promptTitle].text !== promptData.text) {
             currentPrompts[promptTitle + " (Imported)"] = promptData;
          }
        }
      }

      // Final save
      saveData({ folders: currentFolders, pinnedFolders: currentPinned, prompts: currentPrompts }, () => {
        resolve();
      });
    });
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    loadData,
    saveData,
    finishSave,
    syncToBookmarksTree,
    extractTitleLogic,
    isSafeUrl,
    normalizeUrl,
    mergeImportData,
  };
}
