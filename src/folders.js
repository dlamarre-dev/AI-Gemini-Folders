// folders.js

function displayFolders(openFoldersArg = [], searchTerm = "") {
  const folderList = document.getElementById('folderList');
  const noResultsDiv = document.getElementById('noResults');
  const folderNameInput = document.getElementById('folderName');
  const searchInput = document.getElementById('searchInput');

  let openFolders = [];
  if (typeof openFoldersArg === 'string') openFolders = [openFoldersArg];
  else if (Array.isArray(openFoldersArg)) openFolders = openFoldersArg;
  
  loadData({ folders: {}, pinnedFolders: [], sortPref: 'dateAsc', openFolders: [] }, (data) => {
    folderList.textContent = "";
    const folders = data.folders;
    const pinnedFolders = data.pinnedFolders;
    const sortPref = data.sortPref;
    let savedOpenFolders = data.openFolders; // Memorized state of open folders
    let hasResults = false;

    // Folder sorting
    const sortedFolderNames = sortFolderNames(folders, pinnedFolders, sortPref);

    let hasPinned = false;
    let transitionDone = false;

    sortedFolderNames.forEach((folderName) => {
      if (!Array.isArray(folders[folderName])) return;
      const chats = sortChats(folders[folderName], sortPref);

      const folderMatches = folderName.toLowerCase().includes(searchTerm);
      const matchingChats = chats.filter(chat => chat.title.toLowerCase().includes(searchTerm));

      if (searchTerm && !folderMatches && matchingChats.length === 0) return;
      hasResults = true;

      const isPinned = pinnedFolders.includes(folderName);

      if (isPinned) hasPinned = true;
      if (!isPinned && hasPinned && !transitionDone && !searchTerm) {
        const divider = document.createElement('hr');
        divider.className = 'pin-divider';
        folderList.appendChild(divider);
        transitionDone = true;
      }

      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder';
      // Store the raw folder name (with any emoji prefix) so open/closed state can
      // be re-collected from the DOM without relying on the displayed name, which
      // strips the emoji prefix and would never match the stored key.
      folderDiv.dataset.folderName = folderName;

      folderDiv.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!folderDiv.classList.contains('is-source-folder')) {
          folderDiv.classList.add('drag-over');
        }
      });

      folderDiv.addEventListener('dragleave', () => {
        folderDiv.classList.remove('drag-over');
      });

      folderDiv.addEventListener('drop', (e) => {
        e.preventDefault();
        folderDiv.classList.remove('drag-over');
        const dragData = e.dataTransfer.getData('text/plain');
        if (!dragData) return;
        const { sourceFolder, chatUrl } = JSON.parse(dragData);
        if (sourceFolder === folderName) return;
        moveChat(sourceFolder, folderName, chatUrl);
      });

      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-header';
      folderHeader.style.display = 'flex';
      folderHeader.style.justifyContent = 'space-between';
      // Keyboard-accessible disclosure: the header acts as a button.
      folderHeader.setAttribute('role', 'button');
      folderHeader.setAttribute('tabindex', '0');

      const leftPart = document.createElement('div');
      leftPart.style.display = 'flex';

      // --- Different folder icon if empty (📁) or full (🗂️) ---
      const match = folderName.match(EMOJI_PREFIX_REGEX);
      const customIcon = match ? match[1] : null;
      const displayName = match ? folderName.replace(EMOJI_PREFIX_REGEX, '') : folderName;

      const isEmpty = chats.length === 0;
      // If there is a custom emoji we use it, otherwise default.
      const folderIcon = customIcon ? customIcon : (isEmpty ? '📁' : '🗂️');

      leftPart.textContent = '';
      // Expansion chevron — only for folders that have something to expand.
      // Rotates via the .folder.is-open CSS rule.
      if (!isEmpty) {
        const chevron = document.createElement('span');
        chevron.className = 'folder-chevron';
        chevron.appendChild(new DOMParser().parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 6l6 6-6 6z"/></svg>',
          'image/svg+xml').documentElement);
        leftPart.appendChild(chevron);
      }
      const iconSpan = document.createElement('span');
      iconSpan.className = 'folder-icon';
      iconSpan.textContent = folderIcon;
      const nameDiv = document.createElement('div');
      nameDiv.className = 'folder-name';
      nameDiv.textContent = displayName;
      leftPart.append(iconSpan, nameDiv);

      const actionsDiv = document.createElement('div');

      const pinBtn = document.createElement('button');
      pinBtn.className = `action-btn pin-btn ${isPinned ? 'is-pinned' : ''}`;
      pinBtn.textContent = isPinned ? '📌' : '📍';
      pinBtn.title = chrome.i18n.getMessage(isPinned ? "btnUnpin" : "btnPin");
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin(folderName);
      });
      actionsDiv.appendChild(pinBtn);

      if (!isEmpty) {
        const openGroupBtn = document.createElement('button');
        openGroupBtn.className = 'action-btn open-group-btn';
        openGroupBtn.textContent = '📑';
        openGroupBtn.title = chrome.i18n.getMessage("btnOpenGroup") || "Open in Tab Group";
        openGroupBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openFolderInTabGroup(folderName, chats);
        });
        actionsDiv.appendChild(openGroupBtn);
      }

      const editFolderBtn = document.createElement('button');
      editFolderBtn.className = 'action-btn edit-btn';
      editFolderBtn.textContent = '✏️';
      editFolderBtn.title = chrome.i18n.getMessage("btnRenameFolder");
      editFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renameFolder(folderName);
      });
      actionsDiv.appendChild(editFolderBtn);

      const delFolderBtn = document.createElement('button');
      delFolderBtn.className = 'action-btn delete-btn';
      delFolderBtn.textContent = '🗑️';
      delFolderBtn.title = chrome.i18n.getMessage("btnDeleteFolder");
      delFolderBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (chats.length > 0) {
          const isSure = await window.showCustomModal({
            title: chrome.i18n.getMessage("confirmDeleteFolder") || "This folder contains conversations. Are you sure you want to delete it?",
            type: 'confirm'
          });
          if (!isSure) return;
        }
        loadData({ folders: {}, pinnedFolders: [] }, (data) => {
          delete data.folders[folderName];
          let updatedPinned = data.pinnedFolders.filter(name => name !== folderName);
          saveData({ folders: data.folders, pinnedFolders: updatedPinned }, (err) => {
            if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); displayFolders(); return; }
            displayFolders(null, searchInput ? searchInput.value.toLowerCase() : "");
          });
        });
      });
      actionsDiv.appendChild(delFolderBtn);

      folderHeader.appendChild(leftPart);
      folderHeader.appendChild(actionsDiv);

      const folderContent = document.createElement('div');
      folderContent.className = 'folder-content';

      // --- Smart Open/Closed state management ---
      let isFolderOpen = false;

      if (searchTerm) {
        // If searching, open automatically if it matches
        isFolderOpen = true;
      } else {
        // Otherwise, rely on memorized history (default is closed unless saved)
        isFolderOpen = savedOpenFolders.includes(folderName) || openFolders.includes(folderName);
      }

      // Fix double-click bug by explicitly setting block or none upon creation
      folderContent.style.display = isFolderOpen ? 'block' : 'none';
      if (!isEmpty) {
        folderDiv.classList.toggle('is-open', isFolderOpen);
        folderHeader.setAttribute('aria-expanded', String(isFolderOpen));
      }

      const toggleFolder = () => {
        folderNameInput.value = folderName;
        const isCurrentlyOpen = folderContent.style.display === 'block';
        folderContent.style.display = isCurrentlyOpen ? 'none' : 'block';
        if (!isEmpty) {
          folderDiv.classList.toggle('is-open', !isCurrentlyOpen);
          folderHeader.setAttribute('aria-expanded', String(!isCurrentlyOpen));
        }

        // Save new state in Chrome Sync only if not searching
        if (!searchTerm) {
          loadData({ openFolders: [] }, (storageData) => {
            let currentOpen = storageData.openFolders;
            if (isCurrentlyOpen) {
              // Close it: remove from the list
              currentOpen = currentOpen.filter(name => name !== folderName);
            } else {
              // Open it: add to the list
              if (!currentOpen.includes(folderName)) currentOpen.push(folderName);
            }
            saveData({ openFolders: currentOpen });
          });
        }
      };
      folderHeader.addEventListener('click', toggleFolder);
      folderHeader.addEventListener('keydown', (e) => {
        // Ignore keys bubbling up from the action buttons inside the header.
        if (e.target !== folderHeader) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFolder();
        }
      });
      // ----------------------------------------------------------------

      let appendedChatsCount = 0;

      chats.forEach((chat, index) => {
        if (searchTerm && !chat.title.toLowerCase().includes(searchTerm) && !folderMatches) return;

        appendedChatsCount++;
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';

        //Multiple selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'chat-checkbox';
        checkbox.dataset.folder = folderName;
        checkbox.dataset.url = chat.url;
        // Restore checked state after a re-render
        if (window.selectedChats && window.selectedChats.some(c => c.url === chat.url)) checkbox.checked = true;

        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            if (window.selectedChats) window.selectedChats.push({ folder: folderName, url: chat.url, chatObj: chat });
          } else {
            if (window.selectedChats) window.selectedChats = window.selectedChats.filter(c => c.url !== chat.url);
          }
          if (window.updateBulkActionBar) window.updateBulkActionBar();
        });

        chatItem.appendChild(checkbox);

        // Make the element draggable
        chatItem.setAttribute('draggable', 'true');

        chatItem.addEventListener('dragstart', (e) => {
          if (document.body.classList.contains('bulk-active')) {
            e.preventDefault();
            return;
          }
          chatItem.classList.add('dragging');
          document.body.classList.add('is-dragging');
          folderDiv.classList.add('is-source-folder');
          const dataToTransfer = JSON.stringify({ sourceFolder: folderName, chatUrl: chat.url });
          e.dataTransfer.setData('text/plain', dataToTransfer);
          e.dataTransfer.effectAllowed = 'move';
        });

        chatItem.addEventListener('dragend', () => {
          chatItem.classList.remove('dragging');
          document.body.classList.remove('is-dragging');
          folderDiv.classList.remove('is-source-folder');
        });

        // Allow extensions to decorate chat items with site-specific colors and logos.
        // AI Folders defines window.getChatSiteInfo; Gemini Folders leaves it undefined.
        const siteInfo = window.getChatSiteInfo?.(chat);
        if (siteInfo) {
          chatItem.style.setProperty('--site-color', siteInfo.color);
          chatItem.classList.add(`site-${siteInfo.key}`);
          if (siteInfo.logoSvg) {
            const logo = document.createElement('span');
            logo.className = 'chat-site-logo';
            logo.appendChild(new DOMParser().parseFromString(siteInfo.logoSvg, 'image/svg+xml').documentElement);
            chatItem.appendChild(logo);
          }
        }

        const link = document.createElement('a');
        link.className = 'chat-link';
        link.href = isSafeUrl(chat.url) ? chat.url : 'about:blank';
        link.target = '_blank';
        link.title = chat.title;
        link.textContent = chat.title;

        link.setAttribute('draggable', 'false');

        // Container for conversation buttons
        const chatActionsDiv = document.createElement('div');
        chatActionsDiv.className = 'chat-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit-btn';
        editBtn.textContent = '✏️';
        editBtn.title = chrome.i18n.getMessage("btnRename");
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          renameChat(folderName, chat.url, chat.title);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.textContent = '🗑️';
        delBtn.title = chrome.i18n.getMessage("btnDelete");
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteChat(folderName, chat.url);
        });

        chatActionsDiv.appendChild(editBtn);
        chatActionsDiv.appendChild(delBtn);

        chatItem.appendChild(link);
        chatItem.appendChild(chatActionsDiv);
        folderContent.appendChild(chatItem);
      });

      folderDiv.appendChild(folderHeader);
      if (appendedChatsCount > 0) folderDiv.appendChild(folderContent);
      folderList.appendChild(folderDiv);

    }); // End of forEach

    noResultsDiv.style.display = (searchTerm && !hasResults) ? 'block' : 'none';
  });
}

async function renameChat(folderName, chatUrl, currentTitle) {
  const newTitle = await window.showCustomModal({
    title: chrome.i18n.getMessage("promptRename") || "New conversation name:",
    type: 'prompt',
    defaultValue: currentTitle
  });
  if (newTitle !== null && newTitle.trim() !== "") {
    loadData({ folders: {} }, (data) => {
      let folders = data.folders;
      // Find the real index in the database via URL
      const realIndex = folders[folderName].findIndex(c => c.url === chatUrl);
      if (realIndex !== -1) {
        folders[folderName][realIndex].title = newTitle.trim();
        saveData({ folders: folders }, (err) => {
          if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
          const searchInput = document.getElementById('searchInput');
          displayFolders(folderName, searchInput ? searchInput.value.toLowerCase() : "");
        });
      }
    });
  }
}

function deleteChat(folderName, chatUrl) {
  loadData({ folders: {} }, (data) => {
    let folders = data.folders;
    const realIndex = folders[folderName].findIndex(c => c.url === chatUrl);
    if (realIndex !== -1) {
      folders[folderName].splice(realIndex, 1);
      saveData({ folders: folders }, (err) => {
        if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
        const searchInput = document.getElementById('searchInput');
        displayFolders(folderName, searchInput ? searchInput.value.toLowerCase() : "");
      });
    }
  });
}

function moveChat(sourceFolder, targetFolder, chatUrl) {
  loadData({ folders: {}, openFolders: [] }, (data) => {
    let folders = data.folders;

    const realIndex = folders[sourceFolder].findIndex(c => c.url === chatUrl);
    if (realIndex === -1) return;

    // Remove conversation from source folder
    const chatToMove = folders[sourceFolder].splice(realIndex, 1)[0];

    // Ensure target folder exists
    if (!folders[targetFolder]) folders[targetFolder] = [];

    // Prevent duplicates in target folder
    const cleanTargetUrl = normalizeUrl(chatToMove.url);
    const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
    if (!isDuplicate) {
      folders[targetFolder].push(chatToMove);
    }

    // Memorize all currently open folders
    let openFolders = [];
    document.querySelectorAll('.folder').forEach(folder => {
      const content = folder.querySelector('.folder-content');
      if (content && content.style.display === 'block') {
        openFolders.push(folder.dataset.folderName);
      }
    });

    // Ensure destination folder will also be open
    if (!openFolders.includes(targetFolder)) {
      openFolders.push(targetFolder);
    }

    saveData({ folders: folders, openFolders: openFolders }, (err) => {
      if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
      const searchInput = document.getElementById('searchInput');
      displayFolders(openFolders, searchInput ? searchInput.value.toLowerCase() : "");
    });
  });
}

function togglePin(folderName) {
  loadData({ pinnedFolders: [] }, (data) => {
    let pinned = data.pinnedFolders;

    if (pinned.includes(folderName)) {
      // If already pinned, remove from list
      pinned = pinned.filter(name => name !== folderName);
    } else {
      // Otherwise, add it
      pinned.push(folderName);
    }

    saveData({ pinnedFolders: pinned }, () => {
      // Refresh display while keeping search active
      const searchInput = document.getElementById('searchInput');
      displayFolders(null, searchInput ? searchInput.value.toLowerCase() : "");
    });
  });
}

async function renameFolder(oldName) {
  const newName = await window.showCustomModal({
    title: chrome.i18n.getMessage("promptRenameFolder") || "New name:",
    type: 'prompt',
    defaultValue: oldName,
    placeholder: chrome.i18n.getMessage("emojiTipPlaceholder") || "Tip: Start with an emoji! (Win+. or Cmd+Ctrl+Space)"
  });

  // If user cancels, leaves empty, or doesn't change name
  if (!newName || newName.trim() === "" || newName.trim() === oldName) return;

  const trimmedNewName = newName.trim();

  loadData({ folders: {}, pinnedFolders: [] }, async (data) => {
    let folders = data.folders;
    let pinned = data.pinnedFolders;

    // Check we are not overwriting another folder
    if (folders[trimmedNewName]) {
      await window.showCustomModal({
        title: chrome.i18n.getMessage("errorFolderExists") || "A folder with this name already exists.",
        type: 'alert'
      });
      return;
    }

    // 1. Transfer all conversations to the new name
    folders[trimmedNewName] = folders[oldName];
    // 2. Delete the old folder
    delete folders[oldName];

    // 3. Update pin list if this folder was in it
    const pinIndex = pinned.indexOf(oldName);
    if (pinIndex !== -1) {
      pinned[pinIndex] = trimmedNewName;
    }

    saveData({ folders: folders, pinnedFolders: pinned }, (err) => {
      if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); displayFolders(); return; }
      const searchInput = document.getElementById('searchInput');
      displayFolders(trimmedNewName, searchInput ? searchInput.value.toLowerCase() : "");
    });
  });
}

async function openFolderInTabGroup(folderName, chats) {
  if (chats.length === 0) return;

  if (chats.length > 10) {
    let confirmMsg = chrome.i18n.getMessage("confirmOpenManyTabs");
    if (confirmMsg) {
      confirmMsg = confirmMsg.replace("{count}", chats.length);
    } else {
      confirmMsg = `Open ${chats.length} tabs?`;
    }

    const isSure = await window.showCustomModal({
      title: confirmMsg,
      type: 'confirm'
    });

    if (!isSure) {
      return;
    }
  }

  try {
    const tabIds = [];

    // 1. Create all tabs in background
    for (const chat of chats) {
      const tab = await chrome.tabs.create({ url: chat.url, active: false });
      tabIds.push(tab.id);
    }

    // 2. Group tabs
    if (tabIds.length > 0) {
      const groupId = await chrome.tabs.group({ tabIds: tabIds });

      // 3. Customize group
      await chrome.tabGroups.update(groupId, {
        title: folderName,
        color: "blue", // Options: grey, blue, red, yellow, green, pink, purple, cyan, orange
        collapsed: false
      });

      // 4. Focus on first tab
      await chrome.tabs.update(tabIds[0], { active: true });
    }
  } catch (error) {
    console.error("Tab Group Creation Error:", error);
    const alertMsg = chrome.i18n.getMessage("errorTabGroup") || "Error creating tab group. Check permissions.";
    await window.showCustomModal({
      title: alertMsg,
      type: 'alert'
    });
  }
}

window.displayFolders = displayFolders;

if (typeof module !== 'undefined') {
  // In Node/Jest the sort helpers are globals in the browser (from utils.js),
  // but not available in module scope — pull them from utils for test compatibility.
  const _u = require('./utils');
  /* global sortFolderNames, sortChats, EMOJI_PREFIX_REGEX */
  if (typeof sortFolderNames === 'undefined') global.sortFolderNames = _u.sortFolderNames;
  if (typeof sortChats === 'undefined') global.sortChats = _u.sortChats;
  if (typeof EMOJI_PREFIX_REGEX === 'undefined') global.EMOJI_PREFIX_REGEX = _u.EMOJI_PREFIX_REGEX;

  module.exports = {
    displayFolders,
    renameChat,
    deleteChat,
    moveChat,
    togglePin,
    renameFolder,
    openFolderInTabGroup,
  };
}

