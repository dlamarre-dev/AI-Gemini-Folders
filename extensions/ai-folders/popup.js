// popup.js — AI Folders
function parseSVG(svgString) {
  return new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
}

document.addEventListener('DOMContentLoaded', async () => {
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

  // --- Mode Toggle ---
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
    if (url !== null) {
      localLlmUrl = url.trim();
      chrome.storage.sync.set({ localLlmUrl });
      updateLocalBtn();
    }
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
        }, 600);
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

  // --- Prompt Mode Logic ---
  const promptTitleInput = document.getElementById('promptTitle');
  const promptTextInput = document.getElementById('promptText');
  const savePromptBtn = document.getElementById('savePromptBtn');
  const syncPromptsToggle = document.getElementById('syncPromptsToggle');
  const promptListDiv = document.getElementById('promptList');
  const promptStatusDiv = document.getElementById('promptStatus');

  chrome.storage.sync.get(['syncPromptsEnabled'], (data) => {
    syncPromptsToggle.checked = !!data.syncPromptsEnabled;
  });

  syncPromptsToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    loadData({ prompts: {} }, (data) => {
      saveData({ prompts: data.prompts, syncPromptsEnabled: isEnabled }, (err) => {
        if (err) {
          syncPromptsToggle.checked = !isEnabled; // revert toggle
          window.showCustomModal({
            title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.',
            type: 'alert'
          });
          return;
        }
        setTimeout(() => {
          chrome.storage.sync.get(['syncPromptsEnabled'], (res) => {
            syncPromptsToggle.checked = !!res.syncPromptsEnabled;
          });
        }, 500);
      });
    });
  });

  let isSavingPrompt = false;
  savePromptBtn.addEventListener('click', async () => {
    if (isSavingPrompt) return;
    isSavingPrompt = true;

    const title = promptTitleInput.value.trim() || 'Untitled Prompt';
    const text = promptTextInput.value.trim();
    if (!text) {
      promptStatusDiv.textContent = chrome.i18n.getMessage("promptCannotBeEmpty") || 'Prompt cannot be empty!';
      promptStatusDiv.style.color = 'red';
      promptStatusDiv.style.display = 'block';
      setTimeout(() => promptStatusDiv.style.display = 'none', 2000);
      isSavingPrompt = false;
      return;
    }

    loadData({ prompts: {} }, async (data) => {
      if (data.prompts[title]) {
        const confirmed = await window.showCustomModal({
          title: chrome.i18n.getMessage("promptDuplicateWarning") || "A prompt with this title already exists. Overwrite?",
          type: 'confirm'
        });
        if (!confirmed) { isSavingPrompt = false; return; }
      }
      data.prompts[title] = { text, timestamp: Date.now() };
      saveData({ prompts: data.prompts }, (err) => {
        isSavingPrompt = false;
        if (err) {
          promptStatusDiv.textContent = chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — prompt not saved.';
          promptStatusDiv.style.color = 'red';
          promptStatusDiv.style.display = 'block';
          setTimeout(() => promptStatusDiv.style.display = 'none', 4000);
          return;
        }
        promptTitleInput.value = '';
        promptTextInput.value = '';
        promptStatusDiv.textContent = chrome.i18n.getMessage("promptSaved") || 'Prompt saved!';
        promptStatusDiv.style.color = '#1e8e3e';
        promptStatusDiv.style.display = 'block';
        const addPromptPanel = document.getElementById('addPromptPanel');
        const toggleBtn = document.getElementById('toggleAddPromptPanelBtn');
        if (addPromptPanel) {
          addPromptPanel.style.display = 'none';
          if (toggleBtn) toggleBtn.textContent = "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
        }
        setTimeout(() => promptStatusDiv.style.display = 'none', 2000);
        displayPrompts();
      });
    });
  });

  function displayPrompts() {
    const searchQuery = (document.getElementById('promptSearchInput')?.value || '').toLowerCase().trim();
    loadData({ prompts: {}, openPrompts: [], promptSortPref: 'dateDesc' }, (data) => {
      promptListDiv.replaceChildren();
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
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'text-align: center; color: var(--muted-text); font-size: 13px;';
        emptyMsg.textContent = chrome.i18n.getMessage("promptNoSavedYet") || 'No prompts saved yet.';
        promptListDiv.replaceChildren(emptyMsg);
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
        sendBtn.replaceChildren(parseSVG(sendSVG));
        sendBtn.title = chrome.i18n.getMessage("promptInsertBtn") || 'Insert into chat';
        sendBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const siteKey = getSiteByUrl(tab?.url, localLlmUrl);
          const editorSelectors = siteKey ? SITES[siteKey]?.editorSelectors : null;

          if (!siteKey || !editorSelectors) {
            window.showCustomModal({
              title: chrome.i18n.getMessage("alertNotSupported") || "Please use this extension on a supported AI site.",
              type: 'alert'
            });
            return;
          }

          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [textArea.value, editorSelectors],
            func: (promptText, selectors) => {
              // Try the focused element first if it matches, then cascade through selectors
              const active = document.activeElement;
              let editor = null;
              for (const sel of selectors) {
                try {
                  if (active && active.matches(sel)) { editor = active; break; }
                  const found = document.querySelector(sel);
                  if (found) { editor = found; break; }
                } catch (_) { /* invalid selector — skip */ }
              }
              if (!editor) return false;
              editor.focus();

              // Contenteditable editors (Gemini Quill, Claude ProseMirror, ChatGPT, Perplexity)
              if (editor.isContentEditable) {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editor);
                sel.removeAllRanges();
                sel.addRange(range);
                const before = editor.textContent;
                // execCommand is synchronous and works for Quill/ProseMirror/ChatGPT.
                // Try it first so we never need the beforeinput fallback on those editors.
                // beforeinput fires AFTER execCommand only if execCommand had no effect,
                // preventing the double-insert that occurs when React batches its DOM update
                // asynchronously (textContent unchanged → both paths would fire).
                document.execCommand('insertText', false, promptText);
                if (editor.textContent === before) {
                  editor.dispatchEvent(new InputEvent('beforeinput', {
                    bubbles: true, cancelable: true,
                    inputType: 'insertText', data: promptText
                  }));
                }
                return true;
              }

              // React-controlled textarea (Perplexity, Copilot) — must use native setter
              if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
                const proto = editor.tagName === 'TEXTAREA'
                  ? window.HTMLTextAreaElement.prototype
                  : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (nativeSetter) {
                  nativeSetter.call(editor, promptText);
                } else {
                  editor.value = promptText;
                }
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }

              return false;
            }
          });

          if (results?.[0]?.result) {
            sendBtn.textContent = '✅';
            setTimeout(() => { sendBtn.replaceChildren(parseSVG(sendSVG)); }, 1500);
          } else {
            window.showCustomModal({
              title: chrome.i18n.getMessage("alertEditorNotFound") || "Couldn't find the text input on this page. Try clicking into the editor first, then use the insert button.",
              type: 'alert'
            });
          }
        });

        const copySVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.replaceChildren(parseSVG(copySVG));
        copyBtn.title = chrome.i18n.getMessage("promptCopyTitle") || 'Copy';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(textArea.value);
          copyBtn.textContent = '✅';
          setTimeout(() => { copyBtn.replaceChildren(parseSVG(copySVG)); }, 1500);
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
            saveData({ prompts: data.prompts }, () => displayPrompts());
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
          data.folders[name.trim()] = [];
          saveData({ folders: data.folders }, (err) => {
            if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
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

  syncBookmarksLabel.title = chrome.i18n.getMessage("syncBookmarksTooltip") || "Creates a synced folder in your Chrome bookmarks.";

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
        const masterFolderName = chrome.i18n.getMessage("masterFolderName") || "AI Folders (Sync)";
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
  });

  sortItems.forEach(item => {
    item.addEventListener('click', () => {
      const selectedSort = item.getAttribute('data-value');
      sortItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
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

  // Smart title pre-filling based on active tab
  let [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentSiteKey = getSiteByUrl(currentTab?.url, localLlmUrl);

  if (currentTab && currentSiteKey) {
    if (currentSiteKey === 'local') {
      // No script injection for local LLM — use the browser tab title directly
      chatTitleInput.value = currentTab.title || chrome.i18n.getMessage("defaultTitle") || "New conversation";
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

  // Initialize display
  if (window.displayFolders) window.displayFolders();

  // Search listener
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (window.displayFolders) window.displayFolders(null, searchTerm);
  });

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

  // --- Export ---
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
      a.download = "ai_folders_backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // --- Import ---
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
});
