// popup.js — Gemini Folders
// parseSVG/autoResize and the whole prompt-library UI live in the shared
// src/prompts.js (loaded before this file); popup.js wires the rest.

document.addEventListener('DOMContentLoaded', async () => {
  const DELAY = {
    FOCUS:    100,
    SYNC:     500,
    AUTOSAVE: 600,
    ICON:    1500,
    STATUS:  2000,
    PROMO:   4000,
  };
  // Shared language/RTL/i18n wiring (src/popup-core.js).
  applyCommonI18n();

  // GF-specific labels not covered by the shared wiring.
  document.getElementById('newGeminiConvBtn').title = chrome.i18n.getMessage("newConversationBtn") || "New Conversation";
  document.getElementById('gemBtn').title = chrome.i18n.getMessage("setGemBtnTooltip") || "Set custom Gem link";
  document.getElementById('syncPromptsLabel').title = chrome.i18n.getMessage("syncPromptsTooltip") || "Sync prompts";

  const chatTitleInput = document.getElementById('chatTitle');

  // --- Shared popup wiring: mode toggle, sort, mobile sync, export/import… (src/popup-core.js) ---
  initPopupCommon({ exportFilename: 'gemini_folders_backup.json' });

  const newGeminiConvBtn = document.getElementById('newGeminiConvBtn');
  const gemBtn = document.getElementById('gemBtn');

  let useGemEnabled = false;
  let currentGemLink = '';
  let gemPressTimer = null;

  function updateGemBtn() {
      gemBtn.classList.toggle('gem-btn--active', useGemEnabled && !!currentGemLink);
  }

  async function openGemModal() {
      const link = await window.showCustomModal({
          title: chrome.i18n.getMessage("promptSetGemLink") || "Set custom Gem link:",
          type: 'prompt',
          defaultValue: currentGemLink,
          placeholder: "https://gemini.google.com/gem/..."
      });
      if (link !== null) {
          const trimmedLink = link.trim();
          if (trimmedLink !== "" && !trimmedLink.startsWith("https://gemini.google.com/")) {
              await window.showCustomModal({
                  title: chrome.i18n.getMessage("promptInvalidGemLink") || "Invalid link. It must start with https://gemini.google.com/",
                  type: 'alert'
              });
              return;
          }
          currentGemLink = trimmedLink;
          useGemEnabled = !!trimmedLink;
          chrome.storage.sync.set({ gemLink: trimmedLink, useGemEnabled });
          updateGemBtn();
      }
  }

  chrome.storage.sync.get(['gemLink', 'useGemEnabled'], (data) => {
    useGemEnabled = !!data.useGemEnabled;
    currentGemLink = data.gemLink || '';
    updateGemBtn();
  });

  gemBtn.addEventListener('mousedown', () => {
      gemPressTimer = setTimeout(() => {
          gemPressTimer = null;
          openGemModal();
      }, DELAY.AUTOSAVE);
  });

  gemBtn.addEventListener('mouseup', () => {
      if (gemPressTimer !== null) {
          clearTimeout(gemPressTimer);
          gemPressTimer = null;
          if (!currentGemLink) {
              openGemModal();
          } else {
              useGemEnabled = !useGemEnabled;
              chrome.storage.sync.set({ useGemEnabled });
              updateGemBtn();
          }
      }
  });

  gemBtn.addEventListener('mouseleave', () => {
      if (gemPressTimer !== null) {
          clearTimeout(gemPressTimer);
          gemPressTimer = null;
      }
  });

  // Right-click is a second, more discoverable way to set the Gem link
  // (the long-press is easy to miss).
  gemBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openGemModal();
  });

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
      let url = 'https://gemini.google.com/app';
      if (useGemEnabled && currentGemLink) {
          url = currentGemLink;
      }
      chrome.tabs.create({ url: url });
  });


  // Smart title pre-filling
  let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (currentTab && currentTab.url && new URL(currentTab.url).hostname === "gemini.google.com") {
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      args: [null],
      func: extractGeminiTitleLogic
    }, (injectionResults) => {
      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        chatTitleInput.value = injectionResults[0].result;
      } else {
        chatTitleInput.value = chrome.i18n.getMessage("defaultTitle") || "New conversation";
      }
    });
  }


  // --- Save conversation (shared flow; GF only accepts gemini.google.com and
  //     stores no per-site tag) ---
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

    chrome.storage.local.get(['usageStats', 'afPromoState', 'afPromoRatingDate'], (data) => {
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
    });

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