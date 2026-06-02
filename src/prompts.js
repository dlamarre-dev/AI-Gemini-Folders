// prompts.js — Shared Prompt-library UI for both extensions' popups.
//
// Covers the prompt list, inline editing/auto-save, save, search, sort, sync
// toggle, and the per-prompt action buttons (pin / insert / copy / rename /
// delete). The only site-specific piece — inserting a prompt into the active AI
// tab's editor — is delegated to window.insertPromptIntoActiveTab(text), which
// each extension defines in its own popup.js. That hook returns true on success
// and owns its own "not supported / editor not found" messaging.
//
// Loaded as a classic script before popup.js, so these top-level declarations
// are globals; popup.js calls initPromptsUI() from its DOMContentLoaded handler.

function parseSVG(svgString) {
  return new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
}

const PROMPT_DELAY = { AUTOSAVE: 600, ICON: 1500 };

function buildPromptItem(title, p, openPrompts) {
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
    // Delegated to the extension: handles site detection, injection, and any
    // failure messaging. Returns true only if the prompt was inserted.
    const inserted = await window.insertPromptIntoActiveTab(textArea.value);
    if (inserted) {
      sendBtn.textContent = '✅';
      setTimeout(() => { sendBtn.replaceChildren(parseSVG(sendSVG)); }, PROMPT_DELAY.ICON);
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
    setTimeout(() => { copyBtn.replaceChildren(parseSVG(copySVG)); }, PROMPT_DELAY.ICON);
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
    }, PROMPT_DELAY.AUTOSAVE);
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
  if (isPromptOpen) requestAnimationFrame(() => autoResize(textArea));
  return item;
}

function displayPrompts() {
  const promptListDiv = document.getElementById('promptList');
  if (!promptListDiv) return;
  const searchQuery = (document.getElementById('promptSearchInput')?.value || '').toLowerCase().trim();
  loadData({ prompts: {}, openPrompts: [], promptSortPref: 'dateDesc' }, (data) => {
    promptListDiv.replaceChildren();
    const { prompts, openPrompts, promptSortPref: sortPref } = data;
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
      const emptyMsg = Object.assign(document.createElement('div'), {
        style: 'text-align:center;color:var(--muted-text);font-size:13px;',
        textContent: chrome.i18n.getMessage("promptNoSavedYet") || 'No prompts saved yet.',
      });
      promptListDiv.replaceChildren(emptyMsg);
      return;
    }
    let hasPinned = false, transitionDone = false;
    titles.forEach(title => {
      const p = prompts[title];
      if (p.pinned) hasPinned = true;
      if (!p.pinned && hasPinned && !transitionDone && !searchQuery) {
        promptListDiv.appendChild(Object.assign(document.createElement('hr'), { className: 'pin-divider' }));
        transitionDone = true;
      }
      promptListDiv.appendChild(buildPromptItem(title, p, openPrompts));
    });
  });
}
window.displayPrompts = displayPrompts;

// Wires up all the prompt-mode controls. Call once from popup.js on DOMContentLoaded.
function initPromptsUI() {
  const promptTitleInput = document.getElementById('promptTitle');
  const promptTextInput = document.getElementById('promptText');
  const savePromptBtn = document.getElementById('savePromptBtn');
  const syncPromptsToggle = document.getElementById('syncPromptsToggle');
  const promptStatusDiv = document.getElementById('promptStatus');
  const toggleAddPromptPanelBtn = document.getElementById('toggleAddPromptPanelBtn');
  const addPromptPanel = document.getElementById('addPromptPanel');

  // --- Prompt sync toggle ---
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

  // --- Save prompt ---
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
        if (addPromptPanel) {
          addPromptPanel.style.display = 'none';
          if (toggleAddPromptPanelBtn) toggleAddPromptPanelBtn.textContent = "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
        }
        setTimeout(() => promptStatusDiv.style.display = 'none', 2000);
        displayPrompts();
      });
    });
  });

  // --- Prompt search ---
  document.getElementById('promptSearchInput').addEventListener('input', () => displayPrompts());

  // --- Prompt sort ---
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

  // --- Add-prompt panel toggle ---
  if (toggleAddPromptPanelBtn && addPromptPanel) {
    toggleAddPromptPanelBtn.addEventListener('click', () => {
      const isHidden = addPromptPanel.style.display === 'none';
      addPromptPanel.style.display = isHidden ? 'block' : 'none';
      toggleAddPromptPanelBtn.textContent = isHidden
        ? "➖ " + (chrome.i18n.getMessage("btnCancel") || "Cancel")
        : "➕ " + (chrome.i18n.getMessage("promptAddBtn") || "Add Prompt");
    });
  }
}
window.initPromptsUI = initPromptsUI;
