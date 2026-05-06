// background.js — Service worker: multi-site context menu, keyboard shortcut (quick-save), bookmark sync triggers.

if (typeof importScripts === 'function') {
  importScripts('lz-string.min.js', 'utils.js', 'site-config.js');
}

const SUPPORTED_URL_PATTERNS = [
  "*://gemini.google.com/*",
  "*://claude.ai/*",
  "*://chatgpt.com/*",
  "*://copilot.microsoft.com/*",
  "*://perplexity.ai/*",
  "*://*.perplexity.ai/*",
];

// --- CONTEXT MENU ---

// Returns SUPPORTED_URL_PATTERNS plus a pattern for the user's configured local LLM URL if any.
async function getUrlPatterns() {
  const { localLlmUrl } = await chrome.storage.sync.get(['localLlmUrl']);
  if (!localLlmUrl) return SUPPORTED_URL_PATTERNS;
  try {
    const { protocol, hostname, port } = new URL(localLlmUrl);
    const portPart = port ? `:${port}` : '';
    return [...SUPPORTED_URL_PATTERNS, `${protocol}//${hostname}${portPart}/*`];
  } catch (_) {
    return SUPPORTED_URL_PATTERNS;
  }
}

async function updateContextMenu() {
  const patterns = await getUrlPatterns();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "ai-folders-parent",
      title: chrome.i18n.getMessage("ctxMenuSave"),
      contexts: ["page"],
      documentUrlPatterns: patterns
    });

    loadData({ folders: {} }, (data) => {
      const folderNames = Object.keys(data.folders);

      if (folderNames.length === 0) {
        chrome.contextMenus.create({
          id: "no-folder",
          parentId: "ai-folders-parent",
          title: chrome.i18n.getMessage("ctxMenuNoFolder"),
          contexts: ["page"],
          enabled: false
        });
        return;
      }

      folderNames.sort().forEach(folder => {
        const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u;
        const match = folder.match(emojiRegex);
        const menuTitle = match
          ? `${match[1]} ${folder.replace(emojiRegex, '')}`
          : `📁 ${folder}`;

        chrome.contextMenus.create({
          id: `folder_${folder}`,
          parentId: "ai-folders-parent",
          title: menuTitle,
          contexts: ["page"]
        });
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(updateContextMenu);
chrome.runtime.onStartup.addListener(updateContextMenu);
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.folders || changes.foldersDataCompressed || changes.localLlmUrl)) {
    updateContextMenu();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.parentMenuItemId !== "ai-folders-parent") return;
  try {
    const { localLlmUrl } = await chrome.storage.sync.get(['localLlmUrl']);
    const siteKey = getSiteByUrl(tab.url, localLlmUrl);
    const targetFolder = info.menuItemId.replace("folder_", "");
    const fallbackTitle = tab.title || chrome.i18n.getMessage("defaultTitle") || "New conversation";

    let finalTitle = fallbackTitle;
    if (siteKey && siteKey !== 'local') {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [siteKey, fallbackTitle],
        func: extractAITitleLogic
      });
      if (results?.[0]?.result) finalTitle = results[0].result;
    }

    const data = await new Promise(resolve => loadData({ folders: {} }, resolve));
    let folders = data.folders || {};
    if (!folders[targetFolder]) folders[targetFolder] = [];

    const cleanTargetUrl = normalizeUrl(tab.url);
    const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
    if (!isDuplicate) {
      const chatEntry = { title: finalTitle, url: tab.url, timestamp: Date.now() };
      if (siteKey) chatEntry.site = siteKey;
      folders[targetFolder].push(chatEntry);
      await new Promise(resolve => saveData({ folders }, resolve));
    }
  } catch (error) {
    console.error("Error during context menu save:", error);
  }
});


// --- QUICK SAVE (keyboard shortcut) ---

const showToast = (msg, bgColor) => {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bgColor}; color:white; padding:12px 24px; border-radius:8px; z-index:99999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.5s ease-in-out;`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 2500);
};

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick-save") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const { localLlmUrl } = await chrome.storage.sync.get(['localLlmUrl']);
    const siteKey = getSiteByUrl(tab?.url, localLlmUrl);
    if (!siteKey) return;

    const targetFolder = chrome.i18n.getMessage("quickSaveFolder") || "⚡ Quick Saves";
    const fallbackTitle = tab?.title || chrome.i18n.getMessage("defaultTitle") || "New conversation";
    const toastMsg = chrome.i18n.getMessage("toastSaved") || "✅ Saved!";
    const siteColor = SITES[siteKey]?.color || "#1a73e8";

    // For local LLM: use the browser tab title directly — no script injection needed or wanted.
    // For all other sites: extract title via executeScript.
    let finalTitle = fallbackTitle;
    if (siteKey !== 'local') {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [siteKey, fallbackTitle],
        func: extractAITitleLogic
      });
      if (results?.[0]?.result) finalTitle = results[0].result;
    }

    const data = await new Promise(resolve => loadData({ folders: {} }, resolve));
    let folders = data.folders || {};
    if (!folders[targetFolder]) folders[targetFolder] = [];

    const cleanTargetUrl = normalizeUrl(tab.url);
    const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);

    if (!isDuplicate) {
      const chatEntry = { title: finalTitle, url: tab.url, timestamp: Date.now() };
      if (siteKey) chatEntry.site = siteKey;
      folders[targetFolder].push(chatEntry);
      await new Promise(resolve => saveData({ folders }, resolve));

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [toastMsg, siteColor],
        func: showToast
      });
    } else {
      const alreadySavedMsg = chrome.i18n.getMessage("toastAlreadySaved") || "⚠️ Already saved!";
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [alreadySavedMsg, "#d93025"],
        func: showToast
      });
    }
  } catch (error) {
    console.error("Error during Quick Save:", error);
  }
});
