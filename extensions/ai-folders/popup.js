// popup.js — AI Folders
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
  // RTL support
  const uiLang = chrome.i18n.getUILanguage();
  if (['ar', 'he', 'ur', 'fa'].some(l => uiLang.startsWith(l))) {
    document.body.setAttribute('dir', 'rtl');
  }

  document.getElementById('appTitle').textContent = chrome.i18n.getMessage("appTitle");
  document.getElementById('searchInput').placeholder = chrome.i18n.getMessage("searchPlaceholder");
  document.getElementById('folderName').placeholder = chrome.i18n.getMessage("folderPlaceholder");
  document.getElementById('chatTitle').placeholder = chrome.i18n.getMessage("chatPlaceholder");
  document.getElementById('saveBtn').textContent = chrome.i18n.getMessage("saveBtn");
  document.getElementById('status').textContent = chrome.i18n.getMessage("statusSaved");
  document.getElementById('noResults').textContent = chrome.i18n.getMessage("noResults");
  document.getElementById('exportBtn').textContent = chrome.i18n.getMessage("exportBtn");
  document.getElementById('importBtn').textContent = chrome.i18n.getMessage("importBtn");
  document.getElementById('toggleAddPanelBtn').textContent = "➕ " + chrome.i18n.getMessage("btnToggleAdd");
  document.getElementById('sortNewest').textContent = chrome.i18n.getMessage("sortNewest");
  document.getElementById('sortOldest').textContent = chrome.i18n.getMessage("sortOldest");
  document.getElementById('sortAlpha').textContent = chrome.i18n.getMessage("sortAlpha");
  document.getElementById('promptSearchInput').placeholder = chrome.i18n.getMessage("promptSearchPlaceholder") || "🔍 Search a prompt...";
  document.getElementById('promptSortNewest').textContent = chrome.i18n.getMessage("sortNewest");
  document.getElementById('promptSortOldest').textContent = chrome.i18n.getMessage("sortOldest");
  document.getElementById('promptSortAlpha').textContent = chrome.i18n.getMessage("sortAlpha");
  document.getElementById('modeFolderBtn').title = chrome.i18n.getMessage("folderModeTitle") || "Folder Mode";
  document.getElementById('modePromptBtn').title = chrome.i18n.getMessage("promptModeTitle") || "Prompt Mode";
  document.getElementById('toggleAddPromptPanelBtn').textContent = "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
  document.getElementById('savePromptBtn').textContent = chrome.i18n.getMessage("saveBtn") || "Save";
  document.getElementById('promptTitle').placeholder = chrome.i18n.getMessage("promptTitlePlaceholder") || "Prompt Title";
  document.getElementById('promptText').placeholder = chrome.i18n.getMessage("promptTextPlaceholder") || "Write your prompt here...";

  const saveBtn = document.getElementById('saveBtn');
  const folderNameInput = document.getElementById('folderName');
  const chatTitleInput = document.getElementById('chatTitle');
  const searchInput = document.getElementById('searchInput');
  const statusDiv = document.getElementById('status');
  const newFolderBtn = document.getElementById('newFolderBtn');
  newFolderBtn.title = chrome.i18n.getMessage("btnNewFolder");
  const toggleAddPanelBtn = document.getElementById('toggleAddPanelBtn');
  const addConversationPanel = document.getElementById('addConversationPanel');

  // --- Shared popup wiring: mode toggle, sort, mobile sync, export/import… (src/popup-core.js) ---
  initPopupCommon({ exportFilename: 'ai_folders_backup.json' });

  // --- Per-site new-conversation buttons ---
  let localLlmUrl = '';

  chrome.storage.sync.get(['localLlmUrl'], (data) => {
    localLlmUrl = data.localLlmUrl || '';
    updateLocalBtn();
  });

  function updateLocalBtn() {
    const btn = document.getElementById('newConvLocal');
    if (btn) btn.classList.toggle('local-configured', !!localLlmUrl);
  }

  async function openLocalUrlModal() {
    const url = await window.showCustomModal({
      title: chrome.i18n.getMessage("setLocalUrl") || "Set local LLM URL:",
      type: 'prompt',
      defaultValue: localLlmUrl,
      placeholder: "http://localhost:3000"
    });
    if (url === null) return;

    const trimmed = url.trim();

    // User cleared the URL — revoke permission and clear storage
    if (!trimmed) {
      if (localLlmUrl) {
        try { chrome.permissions.remove({ origins: [new URL(localLlmUrl).origin + '/*'] }); } catch (_) {}
      }
      localLlmUrl = '';
      chrome.storage.sync.set({ localLlmUrl: '' });
      updateLocalBtn();
      return;
    }

    let origin;
    try { origin = new URL(trimmed).origin + '/*'; } catch (_) { return; }

    // Same origin as before — just update stored value, no permission change needed
    try {
      if (localLlmUrl && new URL(trimmed).origin === new URL(localLlmUrl).origin) {
        localLlmUrl = trimmed;
        chrome.storage.sync.set({ localLlmUrl: trimmed });
        updateLocalBtn();
        return;
      }
    } catch (_) {}

    // New or changed URL — request optional host permission.
    // Chrome closes the popup when the permission dialog appears, so we stash the
    // URL in local storage first; the service worker's onAdded listener will
    // activate it if the popup is destroyed before the callback fires.
    chrome.storage.local.set({ pendingLocalLlmUrl: trimmed, pendingLocalLlmPrev: localLlmUrl || '' });

    const granted = await new Promise(resolve => chrome.permissions.request({ origins: [origin] }, resolve));

    // If we reach here, the popup survived the permission dialog.
    chrome.storage.local.remove(['pendingLocalLlmUrl', 'pendingLocalLlmPrev']);
    if (!granted) return;

    // Revoke the previous origin's permission if it changed
    if (localLlmUrl) {
      try { chrome.permissions.remove({ origins: [new URL(localLlmUrl).origin + '/*'] }); } catch (_) {}
    }
    localLlmUrl = trimmed;
    chrome.storage.sync.set({ localLlmUrl: trimmed });
    updateLocalBtn();
  }

  document.querySelectorAll('.site-new-conv-btn').forEach(btn => {
    const siteKey = btn.getAttribute('data-site');
    const site = SITES[siteKey];
    if (!site) return;

    btn.appendChild(new DOMParser().parseFromString(site.logoSvg, 'image/svg+xml').documentElement);
    btn.title = chrome.i18n.getMessage(`newConv_${siteKey}`) || `New ${siteKey} conversation`;

    if (siteKey === 'local') {
      let pressTimer = null;
      btn.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          openLocalUrlModal();
        }, DELAY.AUTOSAVE);
      });
      btn.addEventListener('mouseup', () => {
        if (pressTimer !== null) {
          clearTimeout(pressTimer);
          pressTimer = null;
          if (localLlmUrl) chrome.tabs.create({ url: localLlmUrl });
          else openLocalUrlModal();
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; }
      });
    } else {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: site.newConvUrl });
      });
    }
  });

  // --- Prompt Mode UI (shared: src/prompts.js) ---
  initPromptsUI();

  // Site-specific insert: route a saved prompt into the active AI tab's editor.
  // Returns true on success; shows its own modal on failure. Used by the shared
  // prompt list's insert (▶) button via window.insertPromptIntoActiveTab.
  window.insertPromptIntoActiveTab = async function (promptText) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const siteKey = getSiteByUrl(tab?.url, localLlmUrl);
    const editorSelectors = siteKey ? SITES[siteKey]?.editorSelectors : null;
    if (!siteKey || !editorSelectors) {
      window.showCustomModal({
        title: chrome.i18n.getMessage("alertNotSupported") || "Please use this extension on a supported AI site.",
        type: 'alert'
      });
      return false;
    }
    // Reuse the same injector as the #-trigger (utils.js, loaded before this
    // file). Runs in the page MAIN world and shares the heuristic composer
    // fallback and the Perplexity chip-clearing path, so the ▶ button and the
    // # trigger behave identically across all sites.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [promptText, editorSelectors, siteKey === 'perplexity'],
      func: injectPromptIntoEditor,
    });
    if (results?.[0]?.result) return true;
    window.showCustomModal({
      title: chrome.i18n.getMessage("alertEditorNotFound") || "Couldn't find the text input on this page. Try clicking into the editor first, then use the insert button.",
      type: 'alert'
    });
    return false;
  };


  // Smart title pre-filling based on active tab
  let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentSiteKey = getSiteByUrl(currentTab?.url, localLlmUrl);

  if (currentTab && currentSiteKey) {
    if (currentSiteKey === 'local') {
      // No script injection for local LLM — use the browser tab title directly
      chatTitleInput.value = currentTab.title || chrome.i18n.getMessage("defaultTitle") || "New conversation";
      // Ensure prompt-trigger is active in the local LLM tab. Dynamic registerContentScripts
      // is unreliable in Firefox, so we inject on popup open as a guaranteed fallback.
      // window.__promptTriggerActive guards against double execution.
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['lz-string.min.js', 'prompt-trigger.js'],
      }).catch(() => {});
    } else {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        args: [currentSiteKey, null],
        func: extractAITitleLogic
      }, (injectionResults) => {
        if (injectionResults?.[0]?.result) {
          chatTitleInput.value = injectionResults[0].result;
        } else {
          chatTitleInput.value = chrome.i18n.getMessage("defaultTitle") || "New conversation";
        }
      });
    }
  }


  // --- Save conversation ---
  let isSavingFolder = false;
  saveBtn.addEventListener('click', async () => {
    if (isSavingFolder) return;
    isSavingFolder = true;

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const siteKey = getSiteByUrl(tab?.url, localLlmUrl);
    if (!siteKey) {
      await window.showCustomModal({
        title: chrome.i18n.getMessage("alertNotSupported") || "Please use this extension on a supported AI site.",
        type: 'alert'
      });
      isSavingFolder = false;
      return;
    }

    const folderName = folderNameInput.value.trim() || chrome.i18n.getMessage("defaultFolder");
    const finalChatTitle = chatTitleInput.value.trim() || chrome.i18n.getMessage("defaultTitle");
    const chatUrl = tab.url;

    loadData({ folders: {} }, (data) => {
      let folders = data.folders;
      if (!folders[folderName]) folders[folderName] = [];

      const cleanTargetUrl = normalizeUrl(chatUrl);
      const isDuplicate = folders[folderName].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
      if (!isDuplicate) {
        const chatEntry = { title: finalChatTitle, url: chatUrl, timestamp: Date.now() };
        if (siteKey) chatEntry.site = siteKey;
        folders[folderName].push(chatEntry);
      }

      saveData({ folders }, (err) => {
        isSavingFolder = false;
        if (err) {
          statusDiv.textContent = chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.';
          statusDiv.style.color = 'red';
          statusDiv.style.display = "block";
          setTimeout(() => { statusDiv.style.display = "none"; statusDiv.style.color = ''; statusDiv.textContent = chrome.i18n.getMessage("statusSaved"); }, DELAY.PROMO);
          return;
        }
        folderNameInput.value = "";
        addConversationPanel.style.display = 'none';
        toggleAddPanelBtn.textContent = "➕ " + chrome.i18n.getMessage("btnToggleAdd");
        searchInput.value = "";
        statusDiv.style.display = "block";
        setTimeout(() => { statusDiv.style.display = "none"; }, DELAY.STATUS);
        if (window.displayFolders) window.displayFolders(folderName);
      });
    });
  });

});
