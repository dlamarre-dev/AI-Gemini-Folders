// background.js — Service worker: context menu, keyboard shortcut (quick-save), and bookmark sync triggers.

if (typeof importScripts === 'function') {
  importScripts('lz-string.min.js', 'utils.js', 'site-config.js');
}

// Gemini's Quill editor selectors — single source for the three injection
// paths below (a selector fix must not have to land in three places).
const GEMINI_EDITOR_SELECTORS = ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'];

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

// --- UNINSTALL FEEDBACK SURVEY ---
// The browser opens this page when the user removes the extension. It carries
// non-identifying context (tenure, version, browser, UI language, popup opens)
// as URL params; nothing is transmitted unless the user submits the form there.
// Page: docs/uninstall-gemini-folders.html. Helper: buildUninstallUrl (utils.js).
const UNINSTALL_SURVEY_URL = 'https://aifolders.xyz/uninstall-gemini-folders.html';

// setUninstallURL captures the value at call time and the page may be opened
// months later, so the URL is re-signed whenever the numbers it carries move.
async function refreshUninstallUrl() {
  try {
    const { installedAt, installedAtEstimated, usageStats } =
      await chrome.storage.local.get(['installedAt', 'installedAtEstimated', 'usageStats']);
    await chrome.runtime.setUninstallURL(buildUninstallUrl(UNINSTALL_SURVEY_URL, {
      installedAt,
      estimated: installedAtEstimated,
      opens: (usageStats || {}).opens,
      saves: (usageStats || {}).saves,
      version: chrome.runtime.getManifest().version,
      lang: chrome.i18n.getUILanguage(),
      browser: /Firefox/.test(navigator.userAgent) ? 'firefox' : 'chrome',
    }));
  } catch (_) { /* best-effort: never break the worker over the survey */ }
}

// reason === 'install' is the only case where the date is real. Anything else
// means the extension was already installed when the survey shipped: stamp the
// update date and flag it as estimated rather than report a wrong tenure.
async function recordInstallDate(reason) {
  try {
    const { installedAt } = await chrome.storage.local.get(['installedAt']);
    if (installedAt) return;
    await chrome.storage.local.set({
      installedAt: Date.now(),
      installedAtEstimated: reason !== 'install',
    });
  } catch (_) {}
}

// --- FIRST-RUN PAGE ---
// Chrome hides a freshly installed extension behind the puzzle icon, so nothing on
// screen changes after installing. The uninstall survey (2026-08) found 23% of
// people who removed the extension had never opened the popup once — they never
// found it. This tab is that missing first step; its own step 1 is "pin it".
// Fresh installs only: never on an update or a browser restart.
function openWelcomeTab(reason) {
  if (reason !== 'install') return;
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  } catch (_) { /* best-effort: a failed tab must not break the install */ }
}

// 2. Update the menu on startup and when folders change
chrome.runtime.onInstalled.addListener(async (details) => {
  updateContextMenu();
  await recordInstallDate(details && details.reason);
  refreshUninstallUrl();
  openWelcomeTab(details && details.reason);
});
chrome.runtime.onStartup.addListener(() => { updateContextMenu(); refreshUninstallUrl(); });
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.folders || changes.foldersDataCompressed
      || Object.keys(changes).some(k => k.startsWith('fdc')))) {
    updateContextMenu();
  }
  // usageStats.opens is bumped on every popup open (src/ui.js) — keep the
  // uninstall URL's counter in step with it.
  if (namespace === 'local' && changes.usageStats) {
    refreshUninstallUrl();
  }
});

// Injected into the active Gemini tab to show a transient confirmation toast.
// Text color follows the background's luminance (same helper as AI Folders).
function showToast(msg, bgColor) {
  const r = parseInt(bgColor.slice(1,3), 16) || 0;
  const g = parseInt(bgColor.slice(3,5), 16) || 0;
  const b = parseInt(bgColor.slice(5,7), 16) || 0;
  const textColor = (0.299*r + 0.587*g + 0.114*b) / 255 > 0.6 ? '#000000' : '#ffffff';
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bgColor}; color:${textColor}; padding:12px 24px; border-radius:8px; z-index:99999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.5s ease-in-out;`;
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

// Defence in depth behind prompt-trigger.js's isTrusted gate. These handlers read
// the user's prompt library and write it into the page's MAIN world, so they must
// only ever answer our own content script running in a top-level Gemini document.
// The manifest already scopes the content script to gemini.google.com; this makes
// that guarantee explicit here rather than relying on it from a distance (AF has
// carried the equivalent check since it gained multiple sites).
function isTrustedSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  // frameId is 0 for the main frame. Reject only when we positively know it is a
  // subframe — some Firefox paths omit it, and none of these flows target iframes.
  if (sender.frameId != null && sender.frameId !== 0) return false;
  const url = sender.tab?.url ?? sender.url;
  try {
    if (new URL(url).hostname !== 'gemini.google.com') return false;
  } catch (_) {
    return false;
  }
  return true;
}

// sender.tab is present for manifest-declared content scripts; guard anyway so a
// missing tab yields a clean no-op instead of a TypeError swallowed by try/catch.
function resolveTriggerTabId(sender) {
  return sender.tab?.id ?? null;
}

async function handlePromptTriggerLookup(message, sender) {
  const tabId = resolveTriggerTabId(sender);
  if (tabId == null) return { status: 'no_match' };
  const data = await new Promise(resolve => loadData({ prompts: {} }, resolve));
  const matches = findPromptsByPrefix(data.prompts || {}, message.prefix);
  if (matches.length === 0) return { status: 'no_match' };

  const selectors = GEMINI_EDITOR_SELECTORS;
  const exact = matches.find(m => m.name.toLowerCase() === message.prefix.toLowerCase());

  try {
    if (exact) {
      // Exact match → inject prompt content.
      const r = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [exact.text, selectors],
        func: injectPromptIntoEditor,
      });
      // injectPromptIntoEditor returns false when the focused field isn't a
      // known editor (e.g. editing a previous message) — let the space through.
      return { status: r?.[0]?.result === true ? 'injected' : 'no_match' };
    }

    if (matches.length === 1) {
      // Single match: autocomplete by updating line 1 to #fullName while keeping
      // the suggestion structure stable (no flash).
      const r = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [[matches[0].name], selectors, chrome.i18n.getMessage('appTitle'), '#' + matches[0].name],
        func: insertSuggestionsInEditor,
      });
      return { status: r?.[0]?.result === true ? 'autocompleted' : 'no_match' };
    }

    // Ambiguous prefix → show all matches on next line, cursor stays on first line.
    const suggResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [matches.map(m => m.name), selectors, chrome.i18n.getMessage('appTitle')],
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
  const tabId = resolveTriggerTabId(sender);
  if (tabId == null) return { status: 'cleared' };
  const data = await new Promise(resolve => loadData({ prompts: {} }, resolve));
  const selectors = GEMINI_EDITOR_SELECTORS;
  const names = message.prefix != null
    ? findPromptsByPrefix(data.prompts || {}, message.prefix).map(m => m.name)
    : [];
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [names, selectors, chrome.i18n.getMessage('appTitle')],
      func: insertSuggestionsInEditor,
    });
  } catch (err) {
    console.error('Suggest update failed:', err);
  }
  return { status: names.length > 0 ? 'updated' : 'cleared' };
}

async function handleCycleTab(message, sender) {
  const tabId = resolveTriggerTabId(sender);
  if (tabId == null) return { status: 'error' };
  const selectors = GEMINI_EDITOR_SELECTORS;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [message.allNames, selectors, chrome.i18n.getMessage('appTitle'), '#' + message.name],
      func: insertSuggestionsInEditor,
    });
  } catch (err) {
    console.error('Cycle tab failed:', err);
  }
  return { status: 'cycled' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender)) return false;
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
      if (!tab || !tab.url || new URL(tab.url).hostname !== "gemini.google.com") {
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
          func: showToast
        });
      } else {
        // DUPLICATE ERROR
        const alreadySavedMsg = chrome.i18n.getMessage("toastAlreadySaved") || "⚠️ Already saved!";

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [alreadySavedMsg, "#d93025"],
          func: showToast
        });
      }
    } catch (error) {
      console.error("Critical error during Quick Save :", error);
    }
  }
});
