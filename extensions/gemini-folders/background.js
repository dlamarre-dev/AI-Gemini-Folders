// background.js — Service worker: context menu, keyboard shortcut (quick-save), and bookmark sync triggers.

if (typeof importScripts === 'function') {
  importScripts('lz-string.min.js', 'utils.js', 'site-config.js');
}

// --- CONTEXT MENU ---

// Serialize rebuilds: removeAll + create runs across async callbacks, so two
// overlapping calls (onInstalled + onStartup, or several storage-change events
// from one save) would each recreate the same ids and throw "duplicate id".
// While a rebuild is in flight, extra requests are coalesced into a single
// follow-up run once the current one finishes.
let isUpdatingMenu = false;
let menuUpdateQueued = false;

// 1. Rebuild the context menu from current folder data
function updateContextMenu() {
  if (isUpdatingMenu) { menuUpdateQueued = true; return; }
  isUpdatingMenu = true;

  chrome.contextMenus.removeAll(() => {
    // Create the main parent menu with translation
    chrome.contextMenus.create({
      id: "gemini-folders-parent",
      title: chrome.i18n.getMessage("ctxMenuSave"),
      contexts: ["page"],
      documentUrlPatterns: ["*://gemini.google.com/*"]
    });

    // Fetch the user's folders
    loadData({ folders: {} }, (data) => {
      const folderNames = Object.keys(data.folders);

      if (folderNames.length === 0) {
        chrome.contextMenus.create({
          id: "no-folder",
          parentId: "gemini-folders-parent",
          title: chrome.i18n.getMessage("ctxMenuNoFolder"),
          contexts: ["page"],
          enabled: false
        });
      } else {
        // Create a submenu for each folder
        folderNames.sort().forEach(folder => {
          const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u;
          const match = folder.match(emojiRegex);

          let menuTitle = folder;
          if (match) {
            const customIcon = match[1];
            const displayName = folder.replace(emojiRegex, '');
            menuTitle = `${customIcon} ${displayName}`;
          } else {
            menuTitle = `📁 ${folder}`;
          }

          chrome.contextMenus.create({
            id: `folder_${folder}`,
            parentId: "gemini-folders-parent",
            title: menuTitle,
            contexts: ["page"]
          });
        });
      }

      // Done — run one more time if requests arrived during this rebuild.
      isUpdatingMenu = false;
      if (menuUpdateQueued) { menuUpdateQueued = false; updateContextMenu(); }
    });
  });
}

// 2. Update the menu on startup and when folders change
chrome.runtime.onInstalled.addListener(updateContextMenu);
chrome.runtime.onStartup.addListener(updateContextMenu);
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.folders || changes.foldersDataCompressed
      || Object.keys(changes).some(k => k.startsWith('fdc')))) {
    updateContextMenu();
  }
});

// Injected into the active Gemini tab to show a transient confirmation toast.
function showToast(msg, bgColor) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bgColor}; color:white; padding:12px 24px; border-radius:8px; z-index:99999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.5s ease-in-out;`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 2500);
}

// 3. Listen for menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.parentMenuItemId === "gemini-folders-parent") {
    try {
      const targetFolder = info.menuItemId.replace("folder_", "");
      const fallbackTitle = chrome.i18n.getMessage("defaultTitle") || "New conversation";

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [fallbackTitle],
        func: extractGeminiTitleLogic
      });

      let finalTitle = fallbackTitle;
      if (results && results[0] && results[0].result) {
        finalTitle = results[0].result;
      }

      const data = await new Promise(resolve => loadData({ folders: {} }, resolve));
      let folders = data.folders || {};

      if (!folders[targetFolder]) folders[targetFolder] = [];
      const cleanTargetUrl = normalizeUrl(tab.url);
      const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
      if (!isDuplicate) {
        folders[targetFolder].push({
          title: finalTitle,
          url: tab.url,
          timestamp: Date.now()
        });

        await new Promise(resolve => saveData({ folders: folders }, resolve));

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [chrome.i18n.getMessage("toastSaved") || "✅ Saved!", "#1a73e8"],
          func: showToast
        });
      } else {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [chrome.i18n.getMessage("toastAlreadySaved") || "⚠️ Already saved!", "#d93025"],
          func: showToast
        });
      }
    } catch (error) {
      console.error("Critical error during save through context menu:", error);
    }
  }
});


// --- PROMPT TRIGGER (#prefix + Space → bash-like autocomplete/injection) ---

async function handlePromptTriggerLookup(message, sender) {
  const data = await new Promise(resolve => loadData({ prompts: {} }, resolve));
  const matches = findPromptsByPrefix(data.prompts || {}, message.prefix);
  if (matches.length === 0) return { status: 'no_match' };

  const selectors = ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'];
  const exact = matches.find(m => m.name.toLowerCase() === message.prefix.toLowerCase());

  try {
    if (exact) {
      // Exact match → inject prompt content.
      await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        args: [exact.text, selectors],
        func: injectPromptIntoEditor,
      });
      return { status: 'injected' };
    }

    if (matches.length === 1) {
      // Single match: autocomplete by updating line 1 to #fullName while keeping
      // the suggestion structure stable (no flash).
      await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        args: [[matches[0].name], selectors, chrome.i18n.getMessage('extName'), '#' + matches[0].name],
        func: insertSuggestionsInEditor,
      });
      return { status: 'autocompleted' };
    }

    // Ambiguous prefix → show all matches on next line, cursor stays on first line.
    const suggResults = await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      args: [matches.map(m => m.name), selectors, chrome.i18n.getMessage('extName')],
      func: insertSuggestionsInEditor,
    });
    // insertSuggestionsInEditor returns false for non-Quill editors → fall back to space.
    return { status: suggResults?.[0]?.result === true ? 'suggestions' : 'no_match' };
  } catch (err) {
    console.error('Prompt trigger lookup failed:', err);
    return { status: 'no_match' };
  }
}

async function handleSuggestUpdate(message, sender) {
  const data = await new Promise(resolve => loadData({ prompts: {} }, resolve));
  const selectors = ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'];
  const names = message.prefix != null
    ? findPromptsByPrefix(data.prompts || {}, message.prefix).map(m => m.name)
    : [];
  try {
    await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      args: [names, selectors, chrome.i18n.getMessage('extName')],
      func: insertSuggestionsInEditor,
    });
  } catch (err) {
    console.error('Suggest update failed:', err);
  }
  return { status: names.length > 0 ? 'updated' : 'cleared' };
}

async function handleCycleTab(message, sender) {
  const selectors = ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'];
  try {
    await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      args: [message.allNames, selectors, chrome.i18n.getMessage('extName'), '#' + message.name],
      func: insertSuggestionsInEditor,
    });
  } catch (err) {
    console.error('Cycle tab failed:', err);
  }
  return { status: 'cycled' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'promptTriggerLookup') {
    handlePromptTriggerLookup(message, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ status: 'no_match' }));
    return true;
  }
  if (message.action === 'promptTriggerSuggestUpdate') {
    handleSuggestUpdate(message, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ status: 'cleared' }));
    return true;
  }
  if (message.action === 'promptTriggerCycleTab') {
    handleCycleTab(message, sender)
      .then(sendResponse)
      .catch(() => sendResponse({ status: 'error' }));
    return true;
  }
  return false;
});

// 4. Listen to keyboard shortcuts (Commands)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "quick-save") {
    try {
      // 1. Get active tab
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // 2. Check if we are on Gemini
      if (!tab || !tab.url || !tab.url.includes("gemini.google.com")) {
        return;
      }

      const targetFolder = chrome.i18n.getMessage("quickSaveFolder") || "⚡ Quick Saves";
      const fallbackTitle = chrome.i18n.getMessage("defaultTitle") || "New conversation";
      const toastMsg = chrome.i18n.getMessage("toastSaved") || "✅ Saved!";

      // 3. Extract title
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [fallbackTitle],
        func: extractGeminiTitleLogic
      });

      let finalTitle = fallbackTitle;
      if (results && results[0] && results[0].result) {
        finalTitle = results[0].result;
      }

      // 4. Load data
      const data = await new Promise(resolve => loadData({ folders: {} }, resolve));

      let folders = data.folders || {};
      if (!folders[targetFolder]) folders[targetFolder] = [];

      const cleanTargetUrl = normalizeUrl(tab.url);
      const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);

      if (!isDuplicate) {
        folders[targetFolder].push({
          title: finalTitle,
          url: tab.url,
          timestamp: Date.now()
        });

        await new Promise(resolve => saveData({ folders: folders }, resolve));

        // SUCCESS
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [toastMsg, "#1a73e8"],
          func: (msg, bgColor) => {
            const toast = document.createElement('div');
            toast.textContent = msg;
            toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bgColor}; color:white; padding:12px 24px; border-radius:8px; z-index:99999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.5s ease-in-out;`;
            document.body.appendChild(toast);
            setTimeout(() => {
              toast.style.opacity = '0';
              setTimeout(() => toast.remove(), 500);
            }, 2500);
          }
        });
      } else {
        // DUPLICATE ERROR
        const alreadySavedMsg = chrome.i18n.getMessage("toastAlreadySaved") || "⚠️ Already saved!";

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [alreadySavedMsg, "#d93025"],
          func: (msg, bgColor) => {
            const toast = document.createElement('div');
            toast.textContent = msg;
            toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bgColor}; color:white; padding:12px 24px; border-radius:8px; z-index:99999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.5s ease-in-out;`;
            document.body.appendChild(toast);
            setTimeout(() => {
              toast.style.opacity = '0';
              setTimeout(() => toast.remove(), 500);
            }, 2500);
          }
        });
      }
    } catch (error) {
      console.error("Critical error during Quick Save :", error);
    }
  }
});
