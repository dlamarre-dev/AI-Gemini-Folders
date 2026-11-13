// popup.js — Gemini Folders
// autoResize and the whole prompt-library UI live in the shared
// src/prompts.js (loaded before this file); popup.js wires the rest.

document.addEventListener('DOMContentLoaded', async () => {
  // Shared language/RTL/i18n wiring (src/popup-core.js).
  applyCommonI18n();

  // GF-specific labels not covered by the shared wiring.
  document.getElementById('newGeminiConvBtn').title = chrome.i18n.getMessage("newConversationBtn") || "New Conversation";
  document.getElementById('syncPromptsLabel').title = chrome.i18n.getMessage("syncPromptsTooltip") || "Sync prompts";

  const chatTitleInput = document.getElementById('chatTitle');

  // --- Shared popup wiring: mode toggle, sort, mobile sync, export/import… (src/popup-core.js) ---
  initPopupCommon({ exportFilename: 'gemini_folders_backup.json' });

  const newGeminiConvBtn = document.getElementById('newGeminiConvBtn');

  // --- Prompt Mode UI (shared: src/prompts.js) ---
  initPromptsUI();

  // Site-specific insert: route a saved prompt into the active Gemini editor.
  // Returns true on success; shows its own modal on failure. Used by the shared
  // prompt list's insert (▶) button via window.insertPromptIntoActiveTab.
  window.insertPromptIntoActiveTab = async function (promptText) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || new URL(tab.url).hostname !== 'gemini.google.com') {
      window.showCustomModal({
        title: chrome.i18n.getMessage("alertNotGemini") || "Please use this extension on a Gemini page.",
        type: 'alert'
      });
      return false;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [promptText],
      func: (promptText) => {
        const editor =
          document.querySelector('rich-textarea .ql-editor') ||
          document.querySelector('[contenteditable="true"].ql-editor');
        if (!editor) return false;
        editor.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        const contentBefore = editor.textContent;
        editor.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: promptText
        }));
        // Fall back to execCommand if InputEvent wasn't handled
        if (editor.textContent === contentBefore) {
          document.execCommand('insertText', false, promptText);
        }
        return true;
      }
    });
    if (results?.[0]?.result) return true;
    window.showCustomModal({
      title: chrome.i18n.getMessage("alertNotGemini") || "Please use this extension on a Gemini page.",
      type: 'alert'
    });
    return false;
  };

  newGeminiConvBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://gemini.google.com/app' });
  });


  // Smart title pre-filling. In the side panel it runs again whenever the
  // active tab changes (watchActiveTab, popup-core.js), so Save never pairs one
  // tab's URL with another tab's title.
  const defaultTitle = () => chrome.i18n.getMessage("defaultTitle") || "New conversation";
  const prefillTitle = window.createTitlePrefill(chatTitleInput, async () => {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let onGemini = false;
    try { onGemini = !!currentTab && new URL(currentTab.url).hostname === "gemini.google.com"; } catch (e) {}
    if (!onGemini) return '';
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        args: [null],
        func: extractGeminiTitleLogic
      });
      return results?.[0]?.result || defaultTitle();
    } catch (e) {
      return defaultTitle();
    }
  });
  prefillTitle(false);
  window.watchActiveTab(() => prefillTitle(true));


  // --- Save conversation (shared flow; GF only accepts gemini.google.com and
  //     stores no per-site tag) ---
  // Which tabs openConversation (src/folders.js) may navigate on a Ctrl/Cmd-click.
  // folders.js stays site-agnostic; without this hook reuse never fires.
  window.isSupportedTabUrl = (url) => {
    try { return new URL(url).hostname === 'gemini.google.com'; }
    catch { return false; }
  };

  initSaveConversation({
    getSiteKey: (tab) => {
      try { return new URL(tab?.url).hostname === 'gemini.google.com' ? 'gemini' : null; }
      catch { return null; }
    },
    unsupportedMessageKey: 'alertNotGemini',
    tagSite: false,
  });


  // --- AF PROMO BANNER ---
  const afPromoBanner = document.getElementById('afPromoBanner');
  if (afPromoBanner) {
    document.getElementById('afPromoTitleTxt').textContent   = chrome.i18n.getMessage('afPromoTitle')       || 'Discover AI Folders';
    document.getElementById('afPromoMessageTxt').textContent = chrome.i18n.getMessage('afPromoMessage')     || 'Do you also use other AIs?';
    document.getElementById('btnAfPromoDownload').textContent = chrome.i18n.getMessage('afPromoDownloadBtn') || 'Download';
    document.getElementById('btnAfPromoLater').textContent   = chrome.i18n.getMessage('reviewLaterBtn')     || 'Maybe later';
    document.getElementById('btnAfPromoNo').textContent      = chrome.i18n.getMessage('reviewNoBtn')        || 'No thanks';

    const OPENS_THRESHOLD = 5;
    const ONE_DAY  = 24 * 60 * 60 * 1000;
    const FIVE_DAYS = 5 * ONE_DAY;

    // Not needed for the first frame (afterFirstRender, ui.js). It reads
    // usageStats on its own, so it may see the opens count from before this
    // open's increment — one open late on the threshold, harmless.
    const runPromoCheck = window.afterFirstRender || ((fn) => fn());
    runPromoCheck(() => chrome.storage.local.get(['usageStats', 'afPromoState', 'afPromoRatingDate'], (data) => {
      const stats      = data.usageStats    || { opens: 0 };
      const state      = data.afPromoState  || { status: 'pending', nextPromptDate: 0 };
      const ratingDate = data.afPromoRatingDate || 0;

      if (state.status === 'dismissed') return;
      if (stats.opens < OPENS_THRESHOLD) return;

      // Never show while the review banner is visible
      const reviewBanner = document.getElementById('reviewBanner');
      if (reviewBanner && reviewBanner.style.display !== 'none') return;

      // Wait 1 day after any rating-banner interaction
      if (ratingDate && Date.now() - ratingDate < ONE_DAY) return;

      // Respect the "later" snooze
      if (state.status === 'later' && Date.now() < state.nextPromptDate) return;

      afPromoBanner.style.display = 'block';
    }));

    document.getElementById('btnAfPromoDownload').addEventListener('click', () => {
      chrome.storage.local.set({ afPromoState: { status: 'dismissed' } });
      afPromoBanner.style.display = 'none';
    });

    document.getElementById('btnAfPromoLater').addEventListener('click', () => {
      chrome.storage.local.set({ afPromoState: { status: 'later', nextPromptDate: Date.now() + FIVE_DAYS } });
      afPromoBanner.style.display = 'none';
    });

    document.getElementById('btnAfPromoNo').addEventListener('click', () => {
      chrome.storage.local.set({ afPromoState: { status: 'dismissed' } });
      afPromoBanner.style.display = 'none';
    });
  }
});