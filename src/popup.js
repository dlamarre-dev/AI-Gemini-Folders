// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  // RTL support — set dir="rtl" on body (not html) to avoid scroll-origin issues
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
  document.getElementById('newGeminiConvBtn').title = chrome.i18n.getMessage("newConversationBtn") || "New Conversation";
  document.getElementById('toggleAddPromptPanelBtn').textContent = "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
  document.getElementById('savePromptBtn').textContent = chrome.i18n.getMessage("saveBtn") || "Save";
  document.getElementById('promptTitle').placeholder = chrome.i18n.getMessage("promptTitlePlaceholder") || "Prompt Title";
  document.getElementById('promptText').placeholder = chrome.i18n.getMessage("promptTextPlaceholder") || "Write your prompt here...";
  document.getElementById('gemBtn').title = chrome.i18n.getMessage("setGemBtnTooltip") || "Set custom Gem link";
  document.getElementById('syncPromptsLabel').title = chrome.i18n.getMessage("syncPromptsTooltip") || "Sync prompts";

  const saveBtn = document.getElementById('saveBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const folderNameInput = document.getElementById('folderName');
  const chatTitleInput = document.getElementById('chatTitle');
  const searchInput = document.getElementById('searchInput');
  const statusDiv = document.getElementById('status');
  const newFolderBtn = document.getElementById('newFolderBtn');
  newFolderBtn.title = chrome.i18n.getMessage("btnNewFolder");
  const toggleAddPanelBtn = document.getElementById('toggleAddPanelBtn');
  const addConversationPanel = document.getElementById('addConversationPanel');

  // --- Prompt Mode Logic ---
  const modeFolderBtn = document.getElementById('modeFolderBtn');
  const modePromptBtn = document.getElementById('modePromptBtn');
  const modeTogglePill = document.querySelector('.mode-toggle-pill');
  const folderModeContainer = document.getElementById('folderModeContainer');
  const promptModeContainer = document.getElementById('promptModeContainer');

  let currentMode = 'folder';
  const syncBookmarksLabel = document.getElementById('syncBookmarksLabel');
  const syncPromptsLabel = document.getElementById('syncPromptsLabel');

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

  const promptTitleInput = document.getElementById('promptTitle');
  const promptTextInput = document.getElementById('promptText');
  const savePromptBtn = document.getElementById('savePromptBtn');
  const newGeminiConvBtn = document.getElementById('newGeminiConvBtn');
  const gemBtn = document.getElementById('gemBtn');
  const syncPromptsToggle = document.getElementById('syncPromptsToggle');
  const promptListDiv = document.getElementById('promptList');
  const promptStatusDiv = document.getElementById('promptStatus');

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

  chrome.storage.sync.get(['syncPromptsEnabled', 'gemLink', 'useGemEnabled'], (data) => {
    syncPromptsToggle.checked = !!data.syncPromptsEnabled;
    useGemEnabled = !!data.useGemEnabled;
    currentGemLink = data.gemLink || '';
    updateGemBtn();
  });

  gemBtn.addEventListener('mousedown', () => {
      gemPressTimer = setTimeout(() => {
          gemPressTimer = null;
          openGemModal();
      }, 600);
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

  syncPromptsToggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      loadData({ prompts: {} }, (data) => {
          saveData({ prompts: data.prompts, syncPromptsEnabled: isEnabled }, () => {
              setTimeout(() => {
                  chrome.storage.sync.get(['syncPromptsEnabled'], (res) => {
                      syncPromptsToggle.checked = !!res.syncPromptsEnabled;
                  });
              }, 500);
          });
      });
  });

  savePromptBtn.addEventListener('click', async () => {
      const title = promptTitleInput.value.trim() || 'Untitled Prompt';
      const text = promptTextInput.value.trim();
      if (!text) {
         promptStatusDiv.textContent = chrome.i18n.getMessage("promptCannotBeEmpty") || 'Prompt cannot be empty!';
         promptStatusDiv.style.color = 'red';
         promptStatusDiv.style.display = 'block';
         setTimeout(() => promptStatusDiv.style.display = 'none', 2000);
         return;
      }

      loadData({ prompts: {} }, async (data) => {
          if (data.prompts[title]) {
              const confirmed = await window.showCustomModal({
                  title: chrome.i18n.getMessage("promptDuplicateWarning") || "A prompt with this title already exists. Overwrite?",
                  type: 'confirm'
              });
              if (!confirmed) return;
          }
          data.prompts[title] = { text: text, timestamp: Date.now() };
          saveData({ prompts: data.prompts }, () => {
              promptTitleInput.value = '';
              promptTextInput.value = '';
              promptStatusDiv.textContent = chrome.i18n.getMessage("promptSaved") || 'Prompt saved!';
              promptStatusDiv.style.color = '#1e8e3e';
              promptStatusDiv.style.display = 'block';
              if (addPromptPanel) {
                  addPromptPanel.style.display = 'none';
                  if (toggleAddPromptPanelBtn) toggleAddPromptPanelBtn.textContent = "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
              }
              setTimeout(() => promptStatusDiv.style.display = 'none', 2000);
              displayPrompts();
          });
      });
  });

  newGeminiConvBtn.addEventListener('click', () => {
      let url = 'https://gemini.google.com/app';
      if (useGemEnabled && currentGemLink) {
          url = currentGemLink;
      }
      chrome.tabs.create({ url: url });
  });

  function displayPrompts() {
      const searchQuery = (document.getElementById('promptSearchInput')?.value || '').toLowerCase().trim();
      loadData({ prompts: {}, openPrompts: [], promptSortPref: 'dateDesc' }, (data) => {
          promptListDiv.innerHTML = '';
          const prompts = data.prompts;
          const openPrompts = data.openPrompts;
          const sortPref = data.promptSortPref;

          let titles = Object.keys(prompts);
          if (searchQuery) {
              titles = titles.filter(t =>
                  t.toLowerCase().includes(searchQuery) ||
                  (prompts[t].text || '').toLowerCase().includes(searchQuery)
              );
          }
          titles.sort((a, b) => {
              const aPinned = !!prompts[a].pinned;
              const bPinned = !!prompts[b].pinned;
              if (aPinned !== bPinned) return bPinned ? 1 : -1;
              if (sortPref === 'alphaAsc') return a.localeCompare(b);
              if (sortPref === 'dateAsc') return (prompts[a].timestamp || 0) - (prompts[b].timestamp || 0);
              return (prompts[b].timestamp || 0) - (prompts[a].timestamp || 0);
          });
          
          if (titles.length === 0) {
              promptListDiv.innerHTML = `<div style="text-align: center; color: var(--muted-text); font-size: 13px;">${chrome.i18n.getMessage("promptNoSavedYet") || 'No prompts saved yet.'}</div>`;
              return;
          }

          let hasPinned = false;
          let transitionDone = false;

          titles.forEach(title => {
              const p = prompts[title];
              if (p.pinned) hasPinned = true;
              if (!p.pinned && hasPinned && !transitionDone && !searchQuery) {
                  const divider = document.createElement('hr');
                  divider.className = 'pin-divider';
                  promptListDiv.appendChild(divider);
                  transitionDone = true;
              }

              const item = document.createElement('div');
              item.className = 'prompt-item' + (p.pinned ? ' prompt-item--pinned' : '');

              const header = document.createElement('div');
              header.className = 'prompt-header';

              const titleEl = document.createElement('div');
              titleEl.className = 'prompt-title';
              titleEl.textContent = title;

              const actions = document.createElement('div');
              actions.className = 'prompt-actions';

              const pinBtn = document.createElement('button');
              pinBtn.className = `action-btn pin-btn ${p.pinned ? 'is-pinned' : ''}`;
              pinBtn.textContent = p.pinned ? '📌' : '📍';
              pinBtn.title = chrome.i18n.getMessage(p.pinned ? "btnUnpin" : "btnPin") || (p.pinned ? 'Unpin' : 'Pin');
              pinBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  loadData({ prompts: {} }, (data) => {
                      if (data.prompts[title]) {
                          data.prompts[title].pinned = !data.prompts[title].pinned;
                          saveData({ prompts: data.prompts }, () => displayPrompts());
                      }
                  });
              });

              const sendSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
              const sendBtn = document.createElement('button');
              sendBtn.className = 'action-btn prompt-insert-btn';
              sendBtn.innerHTML = sendSVG;
              sendBtn.title = chrome.i18n.getMessage("promptInsertBtn") || 'Insert into Gemini';
              sendBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                  if (!tab || !tab.url || !tab.url.includes('gemini.google.com')) {
                      window.showCustomModal({
                          title: chrome.i18n.getMessage("alertNotGemini") || "Please use this extension on a Gemini page.",
                          type: 'alert'
                      });
                      return;
                  }
                  const results = await chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      args: [textArea.value],
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
                          document.execCommand('insertText', false, promptText);
                          return true;
                      }
                  });
                  if (results?.[0]?.result) {
                      sendBtn.textContent = '✅';
                      setTimeout(() => { sendBtn.innerHTML = sendSVG; }, 1500);
                  } else {
                      window.showCustomModal({
                          title: chrome.i18n.getMessage("alertNotGemini") || "Please use this extension on a Gemini page.",
                          type: 'alert'
                      });
                  }
              });

              const copySVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
              const copyBtn = document.createElement('button');
              copyBtn.className = 'action-btn';
              copyBtn.innerHTML = copySVG;
              copyBtn.title = chrome.i18n.getMessage("promptCopyTitle") || 'Copy';
              copyBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(textArea.value);
                  copyBtn.textContent = '✅';
                  setTimeout(() => { copyBtn.innerHTML = copySVG; }, 1500);
              });

              const renameBtn = document.createElement('button');
              renameBtn.className = 'action-btn';
              renameBtn.textContent = '✏️';
              renameBtn.title = chrome.i18n.getMessage("btnRename") || 'Rename';
              renameBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  const newTitle = await window.showCustomModal({
                      title: chrome.i18n.getMessage("promptRenamePrompt") || "New prompt name:",
                      type: 'prompt',
                      defaultValue: title,
                  });
                  if (!newTitle || newTitle.trim() === '' || newTitle.trim() === title) return;
                  const trimmed = newTitle.trim();
                  loadData({ prompts: {}, openPrompts: [] }, (data) => {
                      if (data.prompts[trimmed] && trimmed !== title) {
                          window.showCustomModal({
                              title: chrome.i18n.getMessage("promptDuplicateWarning") || "A prompt with this title already exists. Overwrite?",
                              type: 'confirm',
                          }).then(confirmed => {
                              if (!confirmed) return;
                              doRename(data, trimmed);
                          });
                      } else {
                          doRename(data, trimmed);
                      }
                      function doRename(d, newName) {
                          d.prompts[newName] = { ...d.prompts[title], timestamp: Date.now() };
                          delete d.prompts[title];
                          let open = d.openPrompts;
                          const idx = open.indexOf(title);
                          if (idx !== -1) { open[idx] = newName; }
                          saveData({ prompts: d.prompts, openPrompts: open }, () => displayPrompts());
                      }
                  });
              });

              const deleteBtn = document.createElement('button');
              deleteBtn.className = 'action-btn delete-btn';
              deleteBtn.textContent = '🗑️';
              deleteBtn.title = chrome.i18n.getMessage("promptDeleteTitle") || 'Delete';
              deleteBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  const isSure = await window.showCustomModal({
                      title: chrome.i18n.getMessage("confirmDeletePrompt") || "Delete this prompt?",
                      type: 'confirm'
                  });
                  if (!isSure) return;
                  loadData({ prompts: {} }, (data) => {
                      delete data.prompts[title];
                      saveData({ prompts: data.prompts }, () => {
                          displayPrompts();
                      });
                  });
              });

              actions.appendChild(pinBtn);
              actions.appendChild(sendBtn);
              actions.appendChild(copyBtn);
              actions.appendChild(renameBtn);
              actions.appendChild(deleteBtn);
              header.appendChild(titleEl);
              header.appendChild(actions);

              const textArea = document.createElement('textarea');
              textArea.className = 'prompt-text-edit';
              textArea.value = p.text;
              textArea.setAttribute('writingsuggestions', 'false');
              textArea.setAttribute('spellcheck', 'false');

              function autoResize(ta) {
                  ta.style.height = 'auto';
                  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
              }

              let saveTimeout;
              textArea.addEventListener('input', () => {
                  autoResize(textArea);
                  clearTimeout(saveTimeout);
                  saveTimeout = setTimeout(() => {
                      loadData({ prompts: {} }, (data) => {
                          if (data.prompts[title]) {
                              data.prompts[title].text = textArea.value;
                              data.prompts[title].timestamp = Date.now();
                              saveData({ prompts: data.prompts });
                          }
                      });
                  }, 600);
              });

              textArea.addEventListener('click', (e) => e.stopPropagation());

              let isPromptOpen = openPrompts.includes(title);
              textArea.style.display = isPromptOpen ? 'block' : 'none';

              header.addEventListener('click', () => {
                  const isCurrentlyOpen = textArea.style.display === 'block';
                  textArea.style.display = isCurrentlyOpen ? 'none' : 'block';
                  if (!isCurrentlyOpen) autoResize(textArea);

                  loadData({ openPrompts: [] }, (storageData) => {
                      let currentOpen = storageData.openPrompts;
                      if (isCurrentlyOpen) {
                          currentOpen = currentOpen.filter(name => name !== title);
                      } else {
                          if (!currentOpen.includes(title)) currentOpen.push(title);
                      }
                      saveData({ openPrompts: currentOpen });
                  });
              });

              item.appendChild(header);
              item.appendChild(textArea);
              promptListDiv.appendChild(item);
              if (isPromptOpen) autoResize(textArea);
          });
      });
  }
  
  window.displayPrompts = displayPrompts;

  // --- Prompt Search ---
  document.getElementById('promptSearchInput').addEventListener('input', () => displayPrompts());

  // --- Prompt Sort ---
  const promptSortToggleBtn = document.getElementById('promptSortToggleBtn');
  const promptSortMenu = document.getElementById('promptSortMenu');

  promptSortToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptSortMenu.classList.toggle('show');
  });

  loadData({ promptSortPref: 'dateDesc' }, (data) => {
      const activeItem = document.querySelector(`#promptSortMenu .dropdown-item[data-value="${data.promptSortPref}"]`);
      if (activeItem) activeItem.classList.add('active');
  });

  document.querySelectorAll('#promptSortMenu .dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
          const value = item.getAttribute('data-value');
          document.querySelectorAll('#promptSortMenu .dropdown-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          promptSortMenu.classList.remove('show');
          saveData({ promptSortPref: value }, () => displayPrompts());
      });
  });

  const toggleAddPromptPanelBtn = document.getElementById('toggleAddPromptPanelBtn');
  const addPromptPanel = document.getElementById('addPromptPanel');
  if (toggleAddPromptPanelBtn && addPromptPanel) {
      toggleAddPromptPanelBtn.addEventListener('click', () => {
          const isHidden = addPromptPanel.style.display === 'none';
          addPromptPanel.style.display = isHidden ? 'block' : 'none';
          toggleAddPromptPanelBtn.textContent = isHidden
              ? "➖ " + (chrome.i18n.getMessage("btnCancel") || "Cancel")
              : "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
      });
  }

  toggleAddPanelBtn.addEventListener('click', () => {
    const isHidden = addConversationPanel.style.display === 'none';
    addConversationPanel.style.display = isHidden ? 'block' : 'none';

    // Change text and icon based on panel state
    toggleAddPanelBtn.textContent = isHidden
      ? "➖ " + chrome.i18n.getMessage("btnCancel")
      : "➕ " + chrome.i18n.getMessage("btnToggleAdd");
  });

  newFolderBtn.addEventListener('click', async () => {
    const name = await window.showCustomModal({
        title: chrome.i18n.getMessage("promptNewFolder") || "New folder:",
        type: 'prompt',
        placeholder: chrome.i18n.getMessage("emojiTipPlaceholder") || "Tip: Start with an emoji! (Win+. or Cmd+Ctrl+Space)"
    });
    if (name && name.trim()) {
      loadData({ folders: {} }, (data) => {
        if (!data.folders[name.trim()]) {
          data.folders[name.trim()] = []; // Create empty folder
          saveData({ folders: data.folders }, () => {
            if (window.displayFolders) window.displayFolders();
          });
        }
      });
    }
  });

  const sortToggleBtn = document.getElementById('sortToggleBtn');
  const sortMenu = document.getElementById('sortMenu');
  const sortItems = document.querySelectorAll('#sortMenu .dropdown-item');

  // --- MOBILE SYNC (BOOKMARKS) ---
  const syncBookmarksToggle = document.getElementById('syncBookmarksToggle');

  syncBookmarksLabel.title = chrome.i18n.getMessage("syncBookmarksTooltip") || "Creates a synced folder in your Chrome bookmarks to access your conversations on your phone.";

  // Load toggle state
  chrome.storage.sync.get(['syncBookmarksEnabled'], (data) => {
    syncBookmarksToggle.checked = !!data.syncBookmarksEnabled;
  });

  // When user clicks on toggle
  syncBookmarksToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.sync.set({ syncBookmarksEnabled: isEnabled }, () => {
      if (isEnabled) {
        // Immediate sync
        loadData({ folders: {}, pinnedFolders: [], sortPref: 'dateAsc' }, (fullData) => {
          if (typeof syncToBookmarksTree === 'function') {
            syncToBookmarksTree(fullData.folders, fullData.pinnedFolders, fullData.sortPref);
          }
        });
      } else {
        // Clear bookmarks when user untoggles
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

  const githubLink = document.getElementById('githubLink');
  const manifestData = chrome.runtime.getManifest();
  githubLink.title = `GitHub - v${manifestData.version}`;

  // 1. Open/Close menu on click
  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent click from propagating and closing the menu immediately
    sortMenu.classList.toggle('show');
  });

  // 2. Close menu if clicking anywhere else on the page
  document.addEventListener('click', () => {
    sortMenu.classList.remove('show');
  });

  // 3. Load saved preference and highlight active option
  loadData({ sortPref: 'dateAsc' }, (data) => {
    const activeItem = document.querySelector(`#sortMenu .dropdown-item[data-value="${data.sortPref}"]`);
    if (activeItem) activeItem.classList.add('active');
  });

  // 4. Handle click on a sort option
  sortItems.forEach(item => {
    item.addEventListener('click', () => {
      const selectedSort = item.getAttribute('data-value');

      // Visually update the active option
      sortItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Save and refresh while keeping folders open
      saveData({ sortPref: selectedSort }, () => {
        let openFolders = [];
        document.querySelectorAll('.folder').forEach(folder => {
          const content = folder.querySelector('.folder-content');
          if (content && content.style.display === 'block') {
            openFolders.push(folder.querySelector('.folder-name').textContent);
          }
        });
        if (window.displayFolders) window.displayFolders(openFolders, searchInput.value.toLowerCase());
      });
    });
    
    // --- Start mobile sync if activated ---
    chrome.storage.sync.get(['syncBookmarksEnabled'], (syncData) => {
      if (syncData.syncBookmarksEnabled) {
        loadData({ folders: {}, pinnedFolders: [], sortPref: 'dateAsc' }, (fullData) => {
          if (typeof syncToBookmarksTree === 'function') {
            syncToBookmarksTree(fullData.folders, fullData.pinnedFolders, fullData.sortPref);
          }
        });
      }
    });
  });

  // Smart title pre-filling
  let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (currentTab && currentTab.url && currentTab.url.includes("gemini.google.com")) {
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

  // Initialize display
  if (window.displayFolders) window.displayFolders();

  // Search listener
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (window.displayFolders) window.displayFolders(null, searchTerm);
  });

  // 1. Save
  saveBtn.addEventListener('click', async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes("gemini.google.com")) {
      await window.showCustomModal({
        title: chrome.i18n.getMessage("alertNotGemini") || "Please use this extension on a Gemini page.",
        type: 'alert'
      });
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
        folders[folderName].push({
          title: finalChatTitle,
          url: chatUrl,
          timestamp: Date.now()
        });
      }

      saveData({ folders: folders }, () => {
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

  // 2. Export (Updated to include pins)
  exportBtn.addEventListener('click', async () => {
      loadData({ folders: {}, pinnedFolders: [], prompts: {} }, async (data) => {
        if (Object.keys(data.folders).length === 0 && Object.keys(data.prompts).length === 0) {
          await window.showCustomModal({
            title: chrome.i18n.getMessage("alertEmptyExport") || "Your folders and prompts are empty, nothing to export!",
            type: 'alert'
          });
          return;
        }
      // Export the global "data" object containing both keys
      const dataString = JSON.stringify(data, null, 2);
      const blob = new Blob([dataString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "gemini_folders_backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // 3. Import (Updated for backward compatibility)
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
        console.error("Erreur d'importation :", error);
        await window.showCustomModal({
          title: chrome.i18n.getMessage("alertImportError") || "Import error. Make sure it's a valid JSON file generated by this extension.",
          type: 'alert'
        });
        importFile.value = "";
      }
    };
    reader.readAsText(file);
  });
});