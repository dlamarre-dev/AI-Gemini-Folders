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

// --- PROMPT TRIGGER: dynamic content script for local LLM ---

const PROMPT_TRIGGER_SCRIPT_ID = 'prompt-trigger-local';

async function updateLocalLlmContentScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [PROMPT_TRIGGER_SCRIPT_ID] });
  } catch (_) { /* not registered — fine */ }

  const { localLlmUrl } = await chrome.storage.sync.get(['localLlmUrl']);
  if (!localLlmUrl) return;

  try {
    const { protocol, hostname, port } = new URL(localLlmUrl);
    const portPart = port ? `:${port}` : '';
    await chrome.scripting.registerContentScripts([{
      id: PROMPT_TRIGGER_SCRIPT_ID,
      matches: [`${protocol}//${hostname}${portPart}/*`],
      js: ['lz-string.min.js', 'prompt-trigger.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  } catch (err) {
    console.error('Failed to register local LLM prompt-trigger script:', err);
  }
}

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
        const match = folder.match(EMOJI_PREFIX_REGEX);
        const menuTitle = match
          ? `${match[1]} ${folder.replace(EMOJI_PREFIX_REGEX, '')}`
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

chrome.runtime.onInstalled.addListener(() => { updateContextMenu(); updateLocalLlmContentScript(); });
chrome.runtime.onStartup.addListener(() => { updateContextMenu(); updateLocalLlmContentScript(); });
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.folders || changes.foldersDataCompressed || changes.localLlmUrl)) {
    updateContextMenu();
  }
  if (namespace === 'sync' && changes.localLlmUrl) {
    updateLocalLlmContentScript();
  }
});

// --- PROMPT TRIGGER (#trigger + Space → inject prompt via executeScript) ---

async function handlePromptTrigger(message, sender) {
  const { localLlmUrl } = await chrome.storage.sync.get(['localLlmUrl']);
  const siteKey = getSiteByUrl(sender.tab?.url, localLlmUrl);
  const selectors = siteKey ? SITES[siteKey]?.editorSelectors : null;
  if (!selectors) return { matched: false };

  const data = await new Promise(resolve => loadData({ prompts: {} }, resolve));
  const promptText = findPromptByTrigger(data.prompts || {}, message.triggerName);
  if (!promptText) return { matched: false };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      args: [promptText, selectors],
      func: injectPromptIntoEditor,
    });
    return { matched: results?.[0]?.result === true };
  } catch (err) {
    console.error('Prompt trigger inject failed:', err);
    return { matched: false };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'injectPromptTrigger') return false;
  handlePromptTrigger(message, sender)
    .then(sendResponse)
    .catch(() => sendResponse({ matched: false }));
  return true; // keep channel open for async response
});

// --- TOAST ---

const showToast = (msg, bgColor) => {
  const r = parseInt(bgColor.slice(1,3), 16) || 0;
  const g = parseInt(bgColor.slice(3,5), 16) || 0;
  const b = parseInt(bgColor.slice(5,7), 16) || 0;
  const textColor = (0.299*r + 0.587*g + 0.114*b) / 255 > 0.6 ? '#000000' : '#ffffff';
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${bgColor}; color:${textColor}; padding:12px 24px; border-radius:8px; z-index:99999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.5s ease-in-out;`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 2500);
};

// --- CONTEXT MENU ---

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.parentMenuItemId !== "ai-folders-parent") return;
  try {
    const { localLlmUrl } = await chrome.storage.sync.get(['localLlmUrl']);
    const siteKey = getSiteByUrl(tab.url, localLlmUrl);
    const targetFolder = info.menuItemId.replace("folder_", "");
    const fallbackTitle = tab.title || chrome.i18n.getMessage("defaultTitle") || "New conversation";
    const siteColor = SITES[siteKey]?.color || "#1a73e8";

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
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [chrome.i18n.getMessage("toastSaved") || "✅ Saved!", siteColor],
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
    console.error("Error during context menu save:", error);
  }
});

// --- QUICK SAVE (keyboard shortcut) ---

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

    // For local LLM: use the browser tab title directly
    // Extract title via executeScript.
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
