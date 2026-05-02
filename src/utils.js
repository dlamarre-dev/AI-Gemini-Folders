// utils.js

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

        // 1. Folders
        const rawFoldersData = syncResult.foldersDataCompressed || syncResult.folders;
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

        // 2. Prompts
        const syncPromptsEnabled = syncResult.syncPromptsEnabled === true;
        let rawPromptsData = null;
        if (syncPromptsEnabled && (syncResult.promptsDataCompressed || syncResult.prompts)) {
            rawPromptsData = syncResult.promptsDataCompressed || syncResult.prompts;
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
  chrome.storage.sync.get(['syncPromptsEnabled'], (syncState) => {
    const isPromptsSyncEnabled = dataToSave.syncPromptsEnabled !== undefined ? dataToSave.syncPromptsEnabled : syncState.syncPromptsEnabled;
    const finalSaveSync = { ...dataToSave };
    const finalSaveLocal = {};

    if (finalSaveSync.folders) {
      finalSaveSync.foldersDataCompressed = LZString.compressToUTF16(JSON.stringify(finalSaveSync.folders));
      delete finalSaveSync.folders;
      chrome.storage.sync.remove('folders');
    }

    if (finalSaveSync.prompts) {
      const compressedPrompts = LZString.compressToUTF16(JSON.stringify(finalSaveSync.prompts));
      delete finalSaveSync.prompts;
      chrome.storage.sync.remove('prompts');
      chrome.storage.local.remove('prompts');

      if (isPromptsSyncEnabled) {
        finalSaveSync.promptsDataCompressed = compressedPrompts;
        chrome.storage.local.remove('promptsDataCompressed');
      } else {
        finalSaveLocal.promptsDataCompressed = compressedPrompts;
        chrome.storage.sync.remove('promptsDataCompressed');
      }
    }

    chrome.storage.local.set(finalSaveLocal, () => {
      chrome.storage.sync.set(finalSaveSync, () => {
        if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes("QUOTA")) {
          if (isPromptsSyncEnabled && dataToSave.prompts) {
            console.warn("Quota exceeded on sync. Reverting prompts to local.");
            const compressedPrompts = LZString.compressToUTF16(JSON.stringify(dataToSave.prompts));
            chrome.storage.local.set({ promptsDataCompressed: compressedPrompts }, () => {
              chrome.storage.sync.set({ syncPromptsEnabled: false }, () => {
                chrome.storage.sync.remove('promptsDataCompressed');
                alert("Not enough space to sync prompts. They have been saved locally instead. Sync disabled.");
                finishSave(callback);
              });
            });
            return;
          } else {
            alert("Storage Error: " + chrome.runtime.lastError.message);
          }
        }
        finishSave(callback);
      });
    });
  });
}

function finishSave(callback) {
  chrome.storage.sync.get(['syncBookmarksEnabled', 'foldersDataCompressed', 'pinnedFolders', 'sortPref'], (syncData) => {
    if (syncData.syncBookmarksEnabled && syncData.foldersDataCompressed) {
      try {
        const folders = JSON.parse(LZString.decompressFromUTF16(syncData.foldersDataCompressed));
        const pinned = syncData.pinnedFolders || [];
        const sortPref = syncData.sortPref || 'dateAsc';
        syncToBookmarksTree(folders, pinned, sortPref);
      } catch (e) {
        console.error("Bookmark sync skipped — decompression error:", e);
      }
    }
  });

  chrome.storage.local.get(['usageStats'], (data) => {
    let stats = data.usageStats || { saves: 0, opens: 0 };
    stats.saves += 1;
    chrome.storage.local.set({ usageStats: stats });
  });

  if (callback) callback();
}

// --- BOOKMARKS SYNCHRONIZATION (MOBILE) ---
// 🔒 Verrou global pour empêcher la "Race Condition"
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

    // 3. Delete all (Purge absolue de tous les doublons existants)
    for (const node of results) {
      // Security check
      if (!node.url && node.title === MASTER_FOLDER_NAME) {
        await new Promise(r => chrome.bookmarks.removeTree(node.id, r));
      }
    }

    // Let a bit of time to avoid racing condition
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

function extractGeminiTitleLogic(defaultFallback) {
  // Plan A: Official title at the top of the page
  const topTitle = document.querySelector('[data-test-id="conversation-title"]');
  if (topTitle && topTitle.textContent) {
    let text = topTitle.textContent.trim();
    if (text.length > 0) return text;
  }

  // Plan B: Sidebar menu (if Plan A fails or UI changes)
  const currentPath = window.location.pathname;
  if (currentPath && currentPath.includes("/app/")) {
    const links = document.querySelectorAll(`a[href="${currentPath}"]`);
    for (let link of links) {
      let text = link.textContent.trim();
      if (text && text.length > 1) return text.split('\n')[0].trim();
    }
  }

  // Plan C: Tab title
  let docTitle = document.title || "";
  let cleanTitle = docTitle.split(' - ')[0].trim();
  const ignoreList = ["gemini", "google gemini", "discussions", "chats", "nouvelle conversation", "new conversation", "new chat", ""];
  if (!ignoreList.includes(cleanTitle.toLowerCase())) return cleanTitle;

  // Plan D: User's first message
  const firstMsg = document.querySelector('[data-message-author-role="user"], user-query, message-content, .query-text');
  if (firstMsg && firstMsg.textContent) {
    let excerpt = firstMsg.textContent.trim();
    return excerpt.length > 40 ? excerpt.substring(0, 40) + "..." : excerpt;
  }

  return defaultFallback;
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
          if (importedChat.title && importedChat.url) {
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
          // If a prompt with same title exists, we might keep the newest or just append a suffix.
          // Simplest is to keep existing to avoid overwrites, or overwrite. Let's overwrite with imported if we want,
          // but avoiding overwrite is safer. For now let's just keep the existing one if title matches to prevent accidental data loss.
          if (currentPrompts[promptTitle].text !== promptData.text) {
             currentPrompts[promptTitle + " (Imported)"] = promptData;
          }
        }
      }

      // Final save
      saveData({ folders: currentFolders, pinnedFolders: currentPinned, prompts: currentPrompts }, () => {
        resolve(); // Termine la promesse avec succès
      });
    });
  });
}
