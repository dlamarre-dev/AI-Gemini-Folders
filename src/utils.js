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
      Object.assign(syncToSet, makeChunks(compressed, 'fdc'));
      const newN = syncToSet.fdcN;
      for (let i = newN; i < (syncState.fdcN || 0); i++) syncToRemove.push('fdc' + i);
      syncToRemove.push('foldersDataCompressed', 'folders');
    }

    // --- Prompts → sync (chunked) if enabled, otherwise local (no per-item limit) ---
    if (dataToSave.prompts) {
      const compressed = LZString.compressToUTF16(JSON.stringify(dataToSave.prompts));
      syncToRemove.push('prompts');
      chrome.storage.local.remove(['prompts']);

      if (isPromptsSyncEnabled) {
        Object.assign(syncToSet, makeChunks(compressed, 'pdc'));
        const newN = syncToSet.pdcN;
        for (let i = newN; i < (syncState.pdcN || 0); i++) syncToRemove.push('pdc' + i);
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
          const localErrMsg = "Storage Error (local): " + chrome.runtime.lastError.message;
          if (typeof window !== 'undefined' && window.showCustomModal) {
            window.showCustomModal({ title: localErrMsg, type: 'alert' });
          } else { console.warn(localErrMsg); }
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
    await new Promise(r => setTimeout(r, BOOKMARK_PROPAGATION_DELAY));

    // 4. Master folder creation
    const masterNode = await new Promise(r => chrome.bookmarks.create({ title: MASTER_FOLDER_NAME }, r));

    // 5. Folder and bookmark creation loop (sorted)
    const finalOrder = sortFolderNames(folders, pinnedFolders, sortPref);
    for (let i = 0; i < finalOrder.length; i++) {
      const folderName = finalOrder[i];
      const match = folderName.match(EMOJI_PREFIX_REGEX);
      const displayFolderName = match
        ? `${match[1]} ${folderName.slice(match[0].length)}`
        : folderName;

      const folderNode = await new Promise(r => chrome.bookmarks.create({
        parentId: masterNode.id,
        title: displayFolderName,
        index: i
      }, r));

      const chats = sortChats(folders[folderName], sortPref);

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

// ---------------------------------------------------------------------------
// Prompt trigger helpers (used by background.js for #trigger + Space injection)
// ---------------------------------------------------------------------------

// Finds a saved prompt whose title matches triggerName (case-insensitive, leading emoji stripped).
function findPromptByTrigger(prompts, triggerName) {
  const EMOJI_RE = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?\s*/u;
  const needle = triggerName.toLowerCase();
  for (const [title, data] of Object.entries(prompts)) {
    const stripped = title.replace(EMOJI_RE, '').trim().toLowerCase();
    if (stripped === needle) return typeof data === 'string' ? data : (data.text || '');
  }
  return null;
}

// Returns all prompts whose stripped title starts with prefix (case-insensitive).
// Each result: { name: stripped-title, text: prompt-body }
function findPromptsByPrefix(prompts, prefix) {
  const EMOJI_RE = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?\s*/u;
  const needle = prefix.toLowerCase();
  const results = [];
  for (const [title, data] of Object.entries(prompts)) {
    const stripped = title.replace(EMOJI_RE, '').trim();
    if (stripped.toLowerCase().startsWith(needle)) {
      results.push({ name: stripped, text: typeof data === 'string' ? data : (data.text || '') });
    }
  }
  return results;
}

// Injected into the AI page via executeScript (runs in PAGE context).
// Idempotent: always reconstructs content from the first line + new suggestions.
// Pass an empty array to clear the suggestion line (keeps only line 1).
function insertSuggestionsInEditor(suggestions, selectors) {
  const active = document.activeElement;
  let editor = null;
  for (const sel of selectors) {
    try {
      if (active && active.matches(sel)) { editor = active; break; }
      const found = document.querySelector(sel);
      if (found) { editor = found; break; }
    } catch (_) {}
  }
  if (!editor) return false;
  editor.focus();

  if (editor.isContentEditable) {
    // innerText respects <p>/<br> as \n (unlike textContent which concatenates).
    const firstLine = (editor.innerText ?? editor.textContent).split('\n')[0].trim();
    const newContent = suggestions.length > 0
      ? firstLine + '\n' + suggestions.map(n => '#' + n).join('  ')
      : firstLine;
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, newContent);
    // Place cursor at the end of the first block element (the first line).
    // Targeting the first <p> / <div> directly is more reliable than a full
    // TreeWalker traversal, which can be thrown off by invisible nodes or <br>.
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
    const newContent = suggestions.length > 0
      // Textarea editors (e.g. Perplexity) process '#word' as their own tokens, so
      // omit the '#' prefix in suggestion names to avoid triggering that system.
      ? firstLine + '\n' + suggestions.join('  ')
      : firstLine;
    const proto = editor.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) nativeSetter.call(editor, newContent); else editor.value = newContent;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.setSelectionRange(firstLine.length, firstLine.length);
    return true;
  }

  return false;
}

// Injected into the AI page via chrome.scripting.executeScript (runs in PAGE context).
// Finds the chat editor with the given CSS selectors and replaces its full content.
// Returns true if the editor was found and the injection was attempted; false otherwise.
function injectPromptIntoEditor(promptText, selectors, forceClear) {
  const active = document.activeElement;
  let editor = null;
  for (const sel of selectors) {
    try {
      if (active && active.matches(sel)) { editor = active; break; }
      const found = document.querySelector(sel);
      if (found) { editor = found; break; }
    } catch (_) {}
  }
  if (!editor) return false;
  editor.focus();

  if (editor.isContentEditable) {
    // Some editors (e.g. Perplexity) convert #word into non-selectable token chips
    // that survive selectAll+delete. Clearing textContent first removes them.
    if (forceClear) editor.textContent = '';
    // Three-step replace: select all → delete → insert.
    // This is more reliable than selectAll+insertText in one step for long text,
    // because some editors (e.g. Perplexity) don't replace the selection when
    // execCommand('insertText') receives a very long string.
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, promptText);

    // If the content still doesn't match (editor overrode our change), try the
    // beforeinput approach that some React/ProseMirror editors listen to.
    if (editor.textContent.trim() !== promptText.trim()) {
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

if (typeof module !== 'undefined') {
  module.exports = {
    EMOJI_PREFIX_REGEX,
    assembleChunks,
    makeChunks,
    sortFolderNames,
    sortChats,
    loadData,
    saveData,
    finishSave,
    syncToBookmarksTree,
    extractTitleLogic,
    isSafeUrl,
    normalizeUrl,
    mergeImportData,
    findPromptByTrigger,
    findPromptsByPrefix,
    injectPromptIntoEditor,
    insertSuggestionsInEditor,
  };
}
