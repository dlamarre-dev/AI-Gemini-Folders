// popup-core.js — Shared popup wiring common to both extensions:
// mode toggle (Folder/Prompt), add-conversation panel, new folder, folder sort
// menu, mobile (bookmarks) sync, GitHub link, export, import, search, and the
// initial folder render.
//
// Site-specific behaviour stays in each extension's popup.js: the
// new-conversation buttons, the "save current conversation" button, and the
// active-tab title pre-fill all depend on per-extension site detection.
//
// Loaded as a classic script before popup.js; popup.js calls
// initPopupCommon({ exportFilename }) from its DOMContentLoaded handler.

// Applies the document language, RTL direction, and all the i18n text/title/
// placeholder assignments that are identical in both extensions' popups.
// Extension-specific labels (GF's gem button, new-conversation button, etc.)
// stay in each popup.js. Call once at the start of DOMContentLoaded.
function applyCommonI18n() {
  // Reflect the UI language on the root element for a11y / hyphenation.
  document.documentElement.lang = chrome.i18n.getUILanguage();

  // RTL support — set dir="rtl" on body (not html) to avoid scroll-origin issues.
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
  document.getElementById('newFolderBtn').title = chrome.i18n.getMessage("btnNewFolder");
}
window.applyCommonI18n = applyCommonI18n;

// Wires the "Save current conversation" button. The per-extension differences
// are injected via opts:
//   opts.getSiteKey(tab)       -> a site key string, or null when unsupported
//   opts.unsupportedMessageKey -> i18n key for the "wrong site" alert
//   opts.tagSite               -> when true, stamps the entry with `site: siteKey`
//                                 (AF tags per-service; GF stores no tag)
function initSaveConversation(opts) {
  const saveBtn = document.getElementById('saveBtn');
  const folderNameInput = document.getElementById('folderName');
  const chatTitleInput = document.getElementById('chatTitle');
  const searchInput = document.getElementById('searchInput');
  const statusDiv = document.getElementById('status');
  const toggleAddPanelBtn = document.getElementById('toggleAddPanelBtn');
  const addConversationPanel = document.getElementById('addConversationPanel');

  let isSaving = false;
  saveBtn.addEventListener('click', async () => {
    if (isSaving) return;
    isSaving = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const siteKey = opts.getSiteKey(tab);
    if (!siteKey) {
      await window.showCustomModal({
        title: chrome.i18n.getMessage(opts.unsupportedMessageKey) || "Please use this extension on a supported AI site.",
        type: 'alert'
      });
      isSaving = false;
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
        if (opts.tagSite) chatEntry.site = siteKey;
        folders[folderName].push(chatEntry);
      }

      saveData({ folders }, (err) => {
        isSaving = false;
        if (err) {
          statusDiv.textContent = chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.';
          statusDiv.style.color = 'red';
          statusDiv.style.display = "block";
          setTimeout(() => { statusDiv.style.display = "none"; statusDiv.style.color = ''; statusDiv.textContent = chrome.i18n.getMessage("statusSaved"); }, 4000);
          return;
        }
        folderNameInput.value = "";
        addConversationPanel.style.display = 'none';
        toggleAddPanelBtn.textContent = "➕ " + chrome.i18n.getMessage("btnToggleAdd");
        searchInput.value = "";
        statusDiv.style.display = "block";
        setTimeout(() => { statusDiv.style.display = "none"; }, 2000);
        if (window.displayFolders) window.displayFolders(folderName);
      });
    });
  });
}
window.initSaveConversation = initSaveConversation;

function initPopupCommon(config) {
  const exportFilename = (config && config.exportFilename) || 'folders_backup.json';

  // --- Mode toggle (Folder / Prompt) ---
  const modeFolderBtn = document.getElementById('modeFolderBtn');
  const modePromptBtn = document.getElementById('modePromptBtn');
  const modeTogglePill = document.querySelector('.mode-toggle-pill');
  const folderModeContainer = document.getElementById('folderModeContainer');
  const promptModeContainer = document.getElementById('promptModeContainer');
  const syncBookmarksLabel = document.getElementById('syncBookmarksLabel');
  const syncPromptsLabel = document.getElementById('syncPromptsLabel');
  let currentMode = 'folder';

  function setMode(mode) {
    currentMode = mode;
    const isPrompt = mode === 'prompt';
    folderModeContainer.style.display = isPrompt ? 'none' : 'block';
    promptModeContainer.style.display = isPrompt ? 'block' : 'none';
    if (syncBookmarksLabel) syncBookmarksLabel.style.display = isPrompt ? 'none' : 'flex';
    if (syncPromptsLabel) syncPromptsLabel.style.display = isPrompt ? 'flex' : 'none';
    modeTogglePill.classList.toggle('is-prompt', isPrompt);
    modeFolderBtn.classList.toggle('mode-toggle-btn--active', !isPrompt);
    modePromptBtn.classList.toggle('mode-toggle-btn--active', isPrompt);
    if (isPrompt) displayPrompts();
    chrome.storage.local.set({ lastMode: mode });
  }

  chrome.storage.local.get(['lastMode'], (data) => {
    if (data.lastMode === 'prompt') {
      const toggleEls = [modeTogglePill, modeFolderBtn, modePromptBtn];
      toggleEls.forEach(el => el.style.transition = 'none');
      setMode('prompt');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          toggleEls.forEach(el => el.style.transition = '');
        });
      });
    }
  });

  modeFolderBtn.addEventListener('click', () => { if (currentMode !== 'folder') setMode('folder'); });
  modePromptBtn.addEventListener('click', () => { if (currentMode !== 'prompt') setMode('prompt'); });

  // --- Add-conversation panel toggle ---
  const toggleAddPanelBtn = document.getElementById('toggleAddPanelBtn');
  const addConversationPanel = document.getElementById('addConversationPanel');
  toggleAddPanelBtn.addEventListener('click', () => {
    const isHidden = addConversationPanel.style.display === 'none';
    addConversationPanel.style.display = isHidden ? 'block' : 'none';
    toggleAddPanelBtn.textContent = isHidden
      ? "➖ " + chrome.i18n.getMessage("btnCancel")
      : "➕ " + chrome.i18n.getMessage("btnToggleAdd");
  });

  // --- New folder ---
  const newFolderBtn = document.getElementById('newFolderBtn');
  newFolderBtn.addEventListener('click', async () => {
    const name = await window.showCustomModal({
      title: chrome.i18n.getMessage("promptNewFolder") || "New folder:",
      type: 'prompt',
      placeholder: chrome.i18n.getMessage("emojiTipPlaceholder") || "Tip: Start with an emoji! (Win+. or Cmd+Ctrl+Space)"
    });
    if (name && name.trim()) {
      loadData({ folders: {} }, (data) => {
        if (!data.folders[name.trim()]) {
          data.folders[name.trim()] = [];
          saveData({ folders: data.folders }, (err) => {
            if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
            if (window.displayFolders) window.displayFolders();
          });
        }
      });
    }
  });

  // --- Mobile sync (bookmarks) ---
  const syncBookmarksToggle = document.getElementById('syncBookmarksToggle');
  if (syncBookmarksLabel) {
    syncBookmarksLabel.title = chrome.i18n.getMessage("syncBookmarksTooltip") || "Creates a synced folder in your browser bookmarks.";
  }
  chrome.storage.sync.get(['syncBookmarksEnabled'], (data) => {
    syncBookmarksToggle.checked = !!data.syncBookmarksEnabled;
  });
  syncBookmarksToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.sync.set({ syncBookmarksEnabled: isEnabled }, () => {
      if (isEnabled) {
        loadData({ folders: {}, pinnedFolders: [], sortPref: 'dateAsc' }, (fullData) => {
          if (typeof syncToBookmarksTree === 'function') {
            syncToBookmarksTree(fullData.folders, fullData.pinnedFolders, fullData.sortPref);
          }
        });
      } else {
        // Fallback must match the name used by syncToBookmarksTree() in utils.js
        // so the untoggle finds and removes the same master bookmark folder.
        const masterFolderName = chrome.i18n.getMessage("masterFolderName") || "Gemini Folders (Sync)";
        chrome.bookmarks.search({ title: masterFolderName }, async (results) => {
          for (const node of results) {
            if (!node.url && node.title === masterFolderName) {
              await new Promise(r => chrome.bookmarks.removeTree(node.id, r));
            }
          }
        });
      }
    });
  });

  // --- GitHub link tooltip (version) ---
  const githubLink = document.getElementById('githubLink');
  if (githubLink) githubLink.title = `GitHub - v${chrome.runtime.getManifest().version}`;

  // --- Ko-fi donation link tooltip ---
  const kofiBtn = document.getElementById('kofiBtn');
  if (kofiBtn) kofiBtn.title = chrome.i18n.getMessage('kofiTooltip') || 'Support this extension by buying me a coffee!';

  // --- Folder sort menu ---
  const searchInput = document.getElementById('searchInput');
  const sortToggleBtn = document.getElementById('sortToggleBtn');
  const sortMenu = document.getElementById('sortMenu');
  const sortItems = document.querySelectorAll('#sortMenu .dropdown-item');

  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle('show');
  });
  document.addEventListener('click', () => {
    sortMenu.classList.remove('show');
  });
  loadData({ sortPref: 'dateAsc' }, (data) => {
    const activeItem = document.querySelector(`#sortMenu .dropdown-item[data-value="${data.sortPref}"]`);
    if (activeItem) activeItem.classList.add('active');
    // Mark the toggle when a non-default order is active (dateAsc is the default).
    sortToggleBtn.classList.toggle('has-custom-sort', data.sortPref !== 'dateAsc');
  });
  sortItems.forEach(item => {
    item.addEventListener('click', () => {
      const selectedSort = item.getAttribute('data-value');
      sortItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      sortToggleBtn.classList.toggle('has-custom-sort', selectedSort !== 'dateAsc');
      saveData({ sortPref: selectedSort }, () => {
        let openFolders = [];
        document.querySelectorAll('.folder').forEach(folder => {
          const content = folder.querySelector('.folder-content');
          if (content && content.style.display === 'block') {
            openFolders.push(folder.dataset.folderName);
          }
        });
        if (window.displayFolders) window.displayFolders(openFolders, searchInput.value.toLowerCase());
      });
    });
  });

  // Re-sync bookmarks on init if the feature is enabled (runs once, not per sort item).
  chrome.storage.sync.get(['syncBookmarksEnabled'], (syncData) => {
    if (syncData.syncBookmarksEnabled) {
      loadData({ folders: {}, pinnedFolders: [], sortPref: 'dateAsc' }, (fullData) => {
        if (typeof syncToBookmarksTree === 'function') {
          syncToBookmarksTree(fullData.folders, fullData.pinnedFolders, fullData.sortPref);
        }
      });
    }
  });

  // --- Initial folder render + search ---
  if (window.displayFolders) window.displayFolders();
  // Debounce: each render re-reads + decompresses all storage and rebuilds the
  // list, so coalesce fast typing into one render.
  let searchDebounce;
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (window.displayFolders) window.displayFolders(null, searchTerm);
    }, 150);
  });

  // --- Export ---
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.addEventListener('click', async () => {
    loadData({ folders: {}, pinnedFolders: [], prompts: {} }, async (data) => {
      if (Object.keys(data.folders).length === 0 && Object.keys(data.prompts).length === 0) {
        await window.showCustomModal({
          title: chrome.i18n.getMessage("alertEmptyExport") || "Your folders and prompts are empty, nothing to export!",
          type: 'alert'
        });
        return;
      }
      const dataString = JSON.stringify(data, null, 2);
      const blob = new Blob([dataString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // --- Import ---
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  importBtn.addEventListener('click', (e) => {
    if (navigator.userAgent.includes("Firefox")) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("import.html") });
    } else {
      importFile.click();
    }
  });
  importFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        await mergeImportData(importedData);
        await window.showCustomModal({
          title: chrome.i18n.getMessage("alertImportSuccess") || "Import successful! Your folders and prompts have been merged successfully.",
          type: 'alert'
        });
        importFile.value = "";
        if (window.displayFolders) window.displayFolders();
        if (window.displayPrompts) window.displayPrompts();
      } catch (error) {
        console.error("Import error:", error);
        await window.showCustomModal({
          title: chrome.i18n.getMessage("alertImportError") || "Import error. Make sure it's a valid JSON file generated by this extension.",
          type: 'alert'
        });
        importFile.value = "";
      }
    };
    reader.readAsText(file);
  });
}
window.initPopupCommon = initPopupCommon;
