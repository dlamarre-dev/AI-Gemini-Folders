// folders.js

// What is being dragged right now. dataTransfer.getData() returns '' during
// dragover by spec, so the payload cannot be inspected while deciding whether a
// drop target should light up — this is read instead. The popup is a single
// document, so one module-level value is enough.
let dragState = { kind: null, folder: null };

function displayFolders(openFoldersArg = [], searchTerm = "") {
  const folderList = document.getElementById('folderList');
  const noResultsDiv = document.getElementById('noResults');
  const folderNameInput = document.getElementById('folderName');
  const searchInput = document.getElementById('searchInput');

  let openFolders = [];
  if (typeof openFoldersArg === 'string') openFolders = [openFoldersArg];
  else if (Array.isArray(openFoldersArg)) openFolders = openFoldersArg;
  
  loadData({ folders: {}, pinnedFolders: [], sortPref: 'dateDesc', openFolders: [], folderParents: {} }, (data) => {
    folderList.textContent = "";
    const folders = data.folders;
    const folderParents = data.folderParents || {};
    const pinnedFolders = data.pinnedFolders;
    const sortPref = data.sortPref;
    let hasResults = false;

    // Everything one folder card needs, so buildFolderElement can recurse into
    // sub-folders without re-reading storage or re-deriving the tree.
    const ctx = {
      folders, folderParents, pinnedFolders, sortPref, searchTerm,
      openFolders,
      savedOpenFolders: data.openFolders, // Memorized state of open folders
      folderNameInput, searchInput,
    };

    // Only root folders are laid out here; a sub-folder is rendered by its
    // parent, inside the parent's content area.
    const rootFolderNames = sortedRootFolders(folders, folderParents, pinnedFolders, sortPref);

    // The way out of a folder, for the drag gesture. Sticky at the top of the
    // list and only shown while a sub-folder is being dragged: "empty space
    // below the folders" stops existing as soon as the list fills the popup.
    const rootZone = document.createElement('div');
    rootZone.className = 'root-drop-zone';
    rootZone.textContent = chrome.i18n.getMessage("dropToRootHint") || "Drop here to move out of its folder";
    rootZone.addEventListener('dragover', (e) => {
      if (dragState.kind !== 'folder') return;
      e.preventDefault();
      rootZone.classList.add('drag-over');
    });
    rootZone.addEventListener('dragleave', () => rootZone.classList.remove('drag-over'));
    rootZone.addEventListener('drop', (e) => {
      e.preventDefault();
      rootZone.classList.remove('drag-over');
      const dragData = e.dataTransfer.getData('text/plain');
      if (!dragData) return;
      const payload = JSON.parse(dragData);
      if (payload.kind === 'folder') unnestFolder(payload.sourceFolder);
    });
    folderList.appendChild(rootZone);

    let hasPinned = false;
    let transitionDone = false;

    rootFolderNames.forEach((folderName) => {
      const folderDiv = buildFolderElement(folderName, ctx, false);
      if (!folderDiv) return;   // filtered out by the search term
      hasResults = true;

      const isPinned = pinnedFolders.includes(folderName);

      if (isPinned) hasPinned = true;
      if (!isPinned && hasPinned && !transitionDone && !searchTerm) {
        const divider = document.createElement('hr');
        divider.className = 'pin-divider';
        folderList.appendChild(divider);
        transitionDone = true;
      }

      folderList.appendChild(folderDiv);
    });

    noResultsDiv.style.display = (searchTerm && !hasResults) ? 'block' : 'none';

    // First-run empty state: no folders at all (distinct from a search miss).
    if (!searchTerm && Object.keys(folders).length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const icon = document.createElement('div');
      icon.className = 'empty-state-icon';
      icon.textContent = '📁';
      const msg = document.createElement('div');
      msg.textContent = chrome.i18n.getMessage('emptyFoldersHint')
        || 'No folders yet — open a conversation on a supported AI site and save it with ➕ or the right-click menu.';
      empty.append(icon, msg);
      folderList.appendChild(empty);
    }
  });
}

// Builds one folder card — header, conversations, and (for a root folder) its
// sub-folders — or returns null when the current search term filters it out.
//
// isChild caps the nesting at one level by construction: a child is built with
// isChild=true and never asks for children of its own, so there is no recursion
// to bound and no depth counter to forget.
function buildFolderElement(folderName, ctx, isChild) {
  const { folders, folderParents, pinnedFolders, sortPref, searchTerm,
    savedOpenFolders, openFolders, folderNameInput, searchInput } = ctx;

  if (!Array.isArray(folders[folderName])) return null;

  const searchState = folderSearchState(folders, folderParents, folderName, searchTerm);
  if (!searchState.show) return null;
  // The folder itself matched (or its parent did): show all of its conversations,
  // not just the matching ones.
  const folderMatches = searchState.showAllChats;

  const chats = sortChats(folders[folderName], sortPref);
  const childNames = isChild ? [] : sortedChildFolders(folders, folderParents, folderName, sortPref);
  const isPinned = pinnedFolders.includes(folderName);

  const folderDiv = document.createElement('div');
  folderDiv.className = isChild ? 'folder folder--child' : 'folder';
  // Store the raw folder name (with any emoji prefix) so open/closed state can
  // be re-collected from the DOM without relying on the displayed name, which
  // strips the emoji prefix and would never match the stored key.
  folderDiv.dataset.folderName = folderName;

  folderDiv.addEventListener('dragover', (e) => {
    e.preventDefault();
    // Hovering a sub-folder must highlight the sub-folder, not both cards. The
    // parent already received dragleave when the pointer entered the child, so
    // its own highlight is cleared by then.
    e.stopPropagation();
    if (folderDiv.classList.contains('is-source-folder')) return;
    // getData() is empty during dragover by spec, so the hover feedback reads
    // the module-level drag state instead of the payload.
    if (dragState.kind === 'folder') {
      const verdict = canNestFolder(folders, folderParents, dragState.folder, folderName);
      folderDiv.classList.toggle('drag-over', verdict.ok);
      folderDiv.classList.toggle('drag-invalid', !verdict.ok && verdict.reason !== 'already');
      return;
    }
    folderDiv.classList.add('drag-over');
  });

  folderDiv.addEventListener('dragleave', () => {
    folderDiv.classList.remove('drag-over');
    folderDiv.classList.remove('drag-invalid');
  });

  folderDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    folderDiv.classList.remove('drag-over');
    folderDiv.classList.remove('drag-invalid');
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;
    // A payload with no `kind` is a conversation: that is what the previous
    // version sent, and a drag can outlive a re-render.
    const payload = JSON.parse(dragData);
    if (payload.kind === 'folder') {
      nestFolder(payload.sourceFolder, folderName);
      return;
    }
    const { sourceFolder, chatUrl } = payload;
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

  // A folder holding only sub-folders is not empty: it has something to
  // expand, something to open as a tab group, and it keeps the full icon.
  const isEmpty = chats.length === 0 && childNames.length === 0;
  // If there is a custom emoji we use it, otherwise default.
  const folderIcon = customIcon ? customIcon : (isEmpty ? '📁' : '🗂️');

  leftPart.textContent = '';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'folder-icon';
  iconSpan.textContent = folderIcon;
  const nameDiv = document.createElement('div');
  nameDiv.className = 'folder-name';
  nameDiv.textContent = displayName;
  leftPart.append(iconSpan, nameDiv);

  const actionsDiv = document.createElement('div');

  if (isChild) {
    // A sub-folder has no pin (see canNestFolder / sortedChildFolders — the
    // pin stays stored and comes back at the top level), so the slot carries
    // the way back out instead. The drag gesture is not discoverable and is
    // unusable from the keyboard; this is.
    const unnestBtn = document.createElement('button');
    unnestBtn.className = 'action-btn unnest-btn';
    unnestBtn.textContent = '⤴';
    unnestBtn.title = chrome.i18n.getMessage("btnUnnestFolder") || "Move out of its folder";
    unnestBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      unnestFolder(folderName);
    });
    actionsDiv.appendChild(unnestBtn);
  } else {
    const pinBtn = document.createElement('button');
    pinBtn.className = `action-btn pin-btn ${isPinned ? 'is-pinned' : ''}`;
    pinBtn.textContent = isPinned ? '📌' : '📍';
    pinBtn.title = chrome.i18n.getMessage(isPinned ? "btnUnpin" : "btnPin");
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(folderName);
    });
    actionsDiv.appendChild(pinBtn);
  }

  if (!isEmpty) {
    const openGroupBtn = document.createElement('button');
    openGroupBtn.className = 'action-btn open-group-btn';
    openGroupBtn.textContent = '📑';
    openGroupBtn.title = chrome.i18n.getMessage("btnOpenGroup") || "Open in Tab Group";
    // A root folder opens its whole subtree; a sub-folder opens only itself.
    const groupChats = isChild ? chats : flattenFolderChats(folders, folderParents, folderName, sortPref);
    openGroupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFolderInTabGroup(folderName, groupChats);
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
    // Deleting a folder takes its sub-folders with it, so an "empty" parent
    // must confirm too — otherwise one click silently removes named folders
    // the user cannot see from the header.
    if (childNames.length > 0) {
      const isSure = await window.showCustomModal({
        title: (chrome.i18n.getMessage("confirmDeleteFolderSub")
          || "This folder, its {count} sub-folder(s) and all their conversations will be deleted. Are you sure?")
          .replace("{count}", childNames.length),
        type: 'confirm'
      });
      if (!isSure) return;
    } else if (chats.length > 0) {
      const isSure = await window.showCustomModal({
        title: chrome.i18n.getMessage("confirmDeleteFolder") || "This folder contains conversations. Are you sure you want to delete it?",
        type: 'confirm'
      });
      if (!isSure) return;
    }
    loadData({ folders: {}, pinnedFolders: [], folderParents: {} }, (data) => {
      const parents = data.folderParents || {};
      const doomed = folderSubtreeNames(data.folders, parents, folderName);
      doomed.forEach(name => { delete data.folders[name]; });
      const updatedPinned = data.pinnedFolders.filter(name => !doomed.includes(name));
      saveData({
        folders: data.folders,
        pinnedFolders: updatedPinned,
        folderParents: pruneFolderParents(data.folders, parents),
      }, (err) => {
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
  // Whether there is anything to expand is only known once the conversations
  // AND the sub-folders have been appended (a search can filter both away),
  // so the disclosure state is applied at the end of this function. The
  // toggle below reads the final value, since it only runs on a user action.
  let hasExpandable = false;

  const toggleFolder = () => {
    folderNameInput.value = folderDisplayPath(folders, folderParents, folderName);
    const isCurrentlyOpen = folderContent.style.display === 'block';
    folderContent.style.display = isCurrentlyOpen ? 'none' : 'block';
    if (hasExpandable) {
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

  // The HEADER is the drag handle, not the whole card: .chat-item must stay
  // the innermost draggable so dragging a conversation is unaffected.
  folderHeader.setAttribute('draggable', 'true');
  folderHeader.addEventListener('dragstart', (e) => {
    if (document.body.classList.contains('bulk-active')) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    dragState = { kind: 'folder', folder: folderName };
    folderDiv.classList.add('dragging-folder', 'is-source-folder');
    // NOT `is-dragging`: that class neutralizes pointer events on every
    // descendant of a .folder, and the header being dragged is one of them —
    // the drag source would stop being hit-testable the instant it started.
    // (That is what the `.dragging` exception exists for on chat items.)
    // Folder drags get their own class, which never touches a header.
    document.body.classList.add('is-dragging-folder');
    // The root drop zone only makes sense for a folder that is nested.
    if (isChild) document.body.classList.add('is-dragging-subfolder');
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'folder', sourceFolder: folderName }));
    e.dataTransfer.effectAllowed = 'move';
  });
  folderHeader.addEventListener('dragend', () => {
    dragState = { kind: null, folder: null };
    folderDiv.classList.remove('dragging-folder', 'is-source-folder');
    document.body.classList.remove('is-dragging-folder', 'is-dragging-subfolder');
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
      dragState = { kind: 'chat', folder: folderName };
      const dataToTransfer = JSON.stringify({ kind: 'chat', sourceFolder: folderName, chatUrl: chat.url });
      e.dataTransfer.setData('text/plain', dataToTransfer);
      e.dataTransfer.effectAllowed = 'move';
    });

    chatItem.addEventListener('dragend', () => {
      chatItem.classList.remove('dragging');
      document.body.classList.remove('is-dragging');
      folderDiv.classList.remove('is-source-folder');
      dragState = { kind: null, folder: null };
    });

    // Allow extensions to decorate chat items with site-specific colors and logos.
    // AI Folders defines window.getChatSiteInfo; Gemini Folders leaves it undefined.
    const siteInfo = window.getChatSiteInfo?.(chat);
    if (siteInfo) {
      chatItem.style.setProperty('--site-color', siteInfo.color);
      chatItem.classList.add(`site-${siteInfo.key}`);
      if (siteInfo.logo) {
        const logo = document.createElement('span');
        logo.className = 'chat-site-logo';
        // Pre-rasterized PNG logos; theme-dependent ones ship a -light variant.
        const logoImg = document.createElement('img');
        logoImg.alt = '';
        logoImg.src = (siteInfo.logoLight && window.matchMedia('(prefers-color-scheme: light)').matches)
          ? siteInfo.logoLight : siteInfo.logo;
        logo.appendChild(logoImg);
        chatItem.appendChild(logo);
      }
    }

    const link = document.createElement('a');
    link.className = 'chat-link';
    link.href = isSafeUrl(chat.url) ? chat.url : 'about:blank';
    link.target = '_blank';
    // The title stays on the first line (it is what makes a truncated title
    // readable); the second advertises the modifier-click gesture, which no
    // one would find otherwise. This tooltip is the whole discoverability
    // budget for it — there is deliberately no setting and no visible control.
    // {k} is filled with the key this platform actually has, so the user reads
    // "Cmd" on a Mac and "Ctrl" on Windows/Linux instead of having to pick.
    const modKey = currentModifierKeyLabel();
    link.title = chat.title + '\n' + (chrome.i18n.getMessage("chatLinkReuseHint")
      || "{k}-click: reuse the last tab").replace('{k}', modKey);
    link.textContent = chat.title;

    // Plain click: reuse the tab already showing this conversation instead of
    // spawning a duplicate. Ctrl/Cmd-click: reuse the last tab we opened.
    // Middle-click (auxclick, never listened to) and Shift-click stay 100%
    // native — that is the escape hatch, so keeping the href/target="_blank"
    // above intact is load-bearing, not decorative.
    link.addEventListener('click', (e) => {
      if (e.button !== 0 || e.shiftKey || e.altKey) return;
      if (link.href === 'about:blank') return;   // URL rejected by isSafeUrl
      e.preventDefault();
      openConversation(chat.url, { reuse: e.ctrlKey || e.metaKey });
    });

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

  // Sub-folders come after the conversations, indented inside the parent.
  let appendedChildCount = 0;
  childNames.forEach((childName) => {
    const childDiv = buildFolderElement(childName, ctx, true);
    if (!childDiv) return;   // filtered out by the search term
    appendedChildCount++;
    folderContent.appendChild(childDiv);
  });

  // Chevron and content area are decided from the SAME counts, so a folder
  // can never advertise something to expand that was filtered away.
  hasExpandable = appendedChatsCount > 0 || appendedChildCount > 0;
  if (hasExpandable) {
    const chevron = document.createElement('span');
    chevron.className = 'folder-chevron';
    chevron.appendChild(new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 6l6 6-6 6z"/></svg>',
      'image/svg+xml').documentElement);
    leftPart.prepend(chevron);
    folderDiv.classList.toggle('is-open', isFolderOpen);
    folderHeader.setAttribute('aria-expanded', String(isFolderOpen));
  }

  folderDiv.appendChild(folderHeader);
  if (hasExpandable) folderDiv.appendChild(folderContent);
  return folderDiv;
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
  loadData({ folders: {}, openFolders: [], folderParents: {} }, (data) => {
    let folders = data.folders;

    const realIndex = folders[sourceFolder].findIndex(c => c.url === chatUrl);
    if (realIndex === -1) return;

    // Remove conversation from source folder
    const chatToMove = folders[sourceFolder].splice(realIndex, 1)[0];

    // Ensure target folder exists
    if (!hasEntry(folders, targetFolder)) folders[targetFolder] = [];

    // Prevent duplicates in target folder
    const cleanTargetUrl = normalizeUrl(chatToMove.url);
    const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
    if (!isDuplicate) {
      folders[targetFolder].push(chatToMove);
    }

    // Memorize all currently open folders
    const openFolders = collectOpenFolders();

    // Ensure destination folder will also be open
    if (!openFolders.includes(targetFolder)) {
      openFolders.push(targetFolder);
    }
    // …and its parent, or a conversation moved into a sub-folder lands inside a
    // collapsed folder and looks lost.
    const targetParent = getFolderParent(folders, data.folderParents || {}, targetFolder);
    if (targetParent && !openFolders.includes(targetParent)) openFolders.push(targetParent);

    saveData({ folders: folders, openFolders: openFolders }, (err) => {
      if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
      const searchInput = document.getElementById('searchInput');
      displayFolders(openFolders, searchInput ? searchInput.value.toLowerCase() : "");
    });
  });
}

// Which folders are expanded right now, read back from the DOM.
//
// `:scope >` matters: .folder now nests, so a plain '.folder-content' lookup
// would happily return a SUB-folder's content area and report the parent's state
// from it.
function collectOpenFolders() {
  const open = [];
  document.querySelectorAll('.folder').forEach(folder => {
    const content = folder.querySelector(':scope > .folder-content');
    if (content && content.style.display === 'block') {
      open.push(folder.dataset.folderName);
    }
  });
  return open;
}

// Drop a folder into another one. The whole validity question lives in
// canNestFolder (utils.js); this only persists the answer.
function nestFolder(childName, parentName) {
  loadData({ folders: {}, folderParents: {}, openFolders: [] }, (data) => {
    const folders = data.folders;
    const parents = data.folderParents || {};
    const verdict = canNestFolder(folders, parents, childName, parentName);
    if (!verdict.ok) {
      // 'self' and 'already' are no-ops the user did not really ask for; only a
      // refusal that needs explaining gets a modal.
      if (verdict.reason === 'depth') {
        window.showCustomModal({
          title: chrome.i18n.getMessage("errorNestTooDeep")
            || "This folder already contains sub-folders. Only one level of nesting is supported.",
          type: 'alert'
        });
      }
      return;
    }

    const openFolders = collectOpenFolders();
    // The parent must be open, or the folder the user just dragged disappears.
    if (!openFolders.includes(parentName)) openFolders.push(parentName);

    saveData({
      folderParents: pruneFolderParents(folders, withFolderParent(parents, childName, parentName)),
      openFolders,
    }, (err) => {
      if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
      const searchInput = document.getElementById('searchInput');
      displayFolders(openFolders, searchInput ? searchInput.value.toLowerCase() : "");
    });
  });
}

// Back to the top level. A pin that was set before the folder was nested becomes
// live again here, because nothing ever removed it.
function unnestFolder(childName) {
  loadData({ folders: {}, folderParents: {} }, (data) => {
    const folders = data.folders;
    const parents = data.folderParents || {};
    if (getFolderParent(folders, parents, childName) === null) return;

    const openFolders = collectOpenFolders();
    saveData({
      folderParents: pruneFolderParents(folders, withFolderParent(parents, childName, null)),
      openFolders,
    }, (err) => {
      if (err) { window.showCustomModal({ title: chrome.i18n.getMessage("storageFullError") || '⚠️ Storage full — not saved.', type: 'alert' }); return; }
      const searchInput = document.getElementById('searchInput');
      displayFolders(openFolders, searchInput ? searchInput.value.toLowerCase() : "");
    });
  });
}

function togglePin(folderName) {
  loadData({ pinnedFolders: [], folders: {}, folderParents: {} }, (data) => {
    let pinned = data.pinnedFolders;

    // A sub-folder shows no pin button; refuse anyway, so a stale DOM cannot pin
    // a folder whose pin would then sit invisible until it returns to the top.
    if (getFolderParent(data.folders, data.folderParents || {}, folderName) !== null) return;

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

  // Renaming TO one of these currently reports "already exists" by accident
  // (Object.prototype is truthy), which is the right refusal for the wrong
  // reason — and the assignment below would reassign the object's prototype.
  // Say what is actually going on instead.
  if (isUnsafeKey(trimmedNewName)) {
    await window.showCustomModal({
      title: chrome.i18n.getMessage("reservedNameError") || 'That name is reserved — please choose another.',
      type: 'alert',
    });
    return;
  }

  loadData({ folders: {}, pinnedFolders: [], folderParents: {} }, async (data) => {
    let folders = data.folders;
    let pinned = data.pinnedFolders;
    const parents = data.folderParents || {};

    // Check we are not overwriting another folder
    if (hasEntry(folders, trimmedNewName)) {
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

    // 4. Follow the rename through the nesting map, in BOTH directions: the key
    //    if this folder is nested, and every entry pointing at it if it is a
    //    parent. Missing either one turns the rename into an accidental un-nest.
    if (hasEntry(parents, oldName)) {
      parents[trimmedNewName] = parents[oldName];
      delete parents[oldName];
    }
    for (const child of Object.keys(parents)) {
      if (parents[child] === oldName) parents[child] = trimmedNewName;
    }

    saveData({ folders: folders, pinnedFolders: pinned, folderParents: pruneFolderParents(folders, parents) }, (err) => {
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

    // 1. Create all tabs in background. Gate on isSafeUrl (defence-in-depth): the
    //    import path already rejects unsafe URLs, but legacy/corrupt storage must
    //    never reach chrome.tabs.create with a javascript:/data: URL.
    for (const chat of chats) {
      if (!isSafeUrl(chat.url)) continue;
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

// Finds an open tab already showing `url`, or null.
//
// SECURITY INVARIANT — do not "fix" this by adding the "tabs" permission (it
// triggers the "read your browsing history" warning and re-prompts every
// installed user). Without it, chrome.tabs.query({}) still lists every tab but
// only populates tab.url for hosts covered by host_permissions, so a tab whose
// URL we cannot read is by construction not one of ours and is never touched.
// The permission model does the filtering for us. isSafeUrl is the second
// filter: it rejects chrome-extension:, so the popup's own page, import.html
// and welcome.html can never be matched.
// The url: filter of tabs.query is off-limits for the same reason — it requires
// "tabs". Filter in JS instead.
// Names the modifier key this platform actually has, for the {k} placeholder in
// chatLinkReuseHint: Cmd on macOS, Ctrl on Windows/Linux. Naming both would make
// the user work out which one is theirs, and hardcoding either into the 43
// translations would be wrong on half the machines — hence the substitution.
// The control key's *name* is localized (German keyboards are labelled "Strg"),
// so it comes from the keyCtrl message; Command is called Cmd in every locale.
// Pure in its inputs so both platforms are testable.
function modifierKeyLabel(platformHint, ctrlLabel) {
  return /Mac|iPhone|iPad/i.test(platformHint || '') ? 'Cmd' : (ctrlLabel || 'Ctrl');
}

function currentModifierKeyLabel() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  // userAgentData.platform is the modern signal; platform/userAgent are the
  // fallbacks (same user-agent sniffing style as welcome.js's Firefox check).
  return modifierKeyLabel(
    nav.userAgentData?.platform || nav.platform || nav.userAgent,
    chrome.i18n.getMessage("keyCtrl"));
}

async function queryAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return Array.isArray(tabs) ? tabs : [];
  } catch (error) {
    return [];   // unreadable → behave as if nothing is open
  }
}

// The tab already showing `url`, or null. Matching goes through normalizeUrl,
// i.e. the same URL identity the save dedup and the import merge already use.
function findTabShowingUrl(tabs, url) {
  const wanted = normalizeUrl(url);
  return tabs.find(t => t && t.url && isSafeUrl(t.url) && normalizeUrl(t.url) === wanted) || null;
}

// Picks the tab a Ctrl/Cmd-click should navigate, or null to open a new one.
//
// A remembered tab id is never trusted on its own: it goes stale the moment the
// tab closes and ids are recycled across a browser restart, so the worst failure
// would be making a page the user cared about disappear. It is only a tiebreaker
// inside a candidate set recomputed on every click — which collapses every
// failure mode (tab closed, moved, navigated elsewhere, pinned, unreadable) into
// the same "no candidate → new tab" branch.
//
// window.isSupportedTabUrl is provided by each extension (AF: getSiteByUrl;
// GF: the gemini.google.com hostname). folders.js stays site-agnostic: without
// the hook, reuse simply never fires.
function pickReusableTab(tabs, activeTab, reuseTabId) {
  const candidates = tabs.filter(t =>
    t && t.url &&                              // readable ⇒ covered by host_permissions
    isSafeUrl(t.url) &&                        // excludes chrome-extension:, about:, file:
    !t.pinned &&                               // never touch a pinned tab
    t.windowId === activeTab?.windowId &&      // current window only
    window.isSupportedTabUrl?.(t.url)          // one of our sites
  );
  return candidates.find(t => t.id === reuseTabId)      // "the last tab"
      || candidates.find(t => t.id === activeTab?.id)   // else the one being looked at
      || null;
}

// Opens a saved conversation.
//   default        activate the tab already showing it, else open a new one
//   reuse: true    (Ctrl/Cmd-click) point the last tab we opened at it instead
// Reuse is opt-in per click by design: the modifier IS the consent, which is why
// there is no setting for it.
async function openConversation(url, { reuse = false } = {}) {
  try {
    const tabs = await queryAllTabs();
    const found = findTabShowingUrl(tabs, url);

    if (found) {
      // Already open somewhere: activate it, even on a Ctrl/Cmd-click —
      // navigating a second tab to a page that is already displayed would be
      // pointless. This one may cross windows; reuse below may not.
      await chrome.tabs.update(found.id, { active: true });
      // Activating a tab in another window doesn't raise that window.
      // windows.update requires no permission.
      if (found.windowId != null && chrome.windows) {
        await chrome.windows.update(found.windowId, { focused: true });
      }
      await rememberReusableTab(found.id);
    } else {
      let target = null;
      if (reuse) {
        const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))?.[0];
        const { reuseTabId } = await chrome.storage.local.get(['reuseTabId']) || {};
        target = pickReusableTab(tabs, activeTab, reuseTabId);
      }
      if (target) {
        await chrome.tabs.update(target.id, { url, active: true });
        await rememberReusableTab(target.id);
      } else {
        // Remembering the tabs we create too is what makes the extension end up
        // owning exactly one tab: the next Ctrl/Cmd-click reuses this one rather
        // than hijacking a tab the user opened.
        const tab = await chrome.tabs.create({ url });
        await rememberReusableTab(tab?.id);
      }
    }
  } catch (error) {
    // The tab died between the query and the update, or the API rejected.
    try { await chrome.tabs.create({ url }); } catch (e) { /* nothing left to try */ }
  }
  // After the awaits, never before: tearing down the popup page can drop
  // in-flight extension API calls.
  window.close();
}

// storage.local, not sync: a tab id means nothing on another machine, and this
// writes on every open (CLAUDE.md §7 — don't burn the sync write quota).
async function rememberReusableTab(tabId) {
  if (tabId == null) return;
  try { await chrome.storage.local.set({ reuseTabId: tabId }); } catch (e) { /* non-fatal */ }
}

window.displayFolders = displayFolders;
window.openConversation = openConversation;

if (typeof module !== 'undefined') {
  // In Node/Jest the sort helpers are globals in the browser (from utils.js),
  // but not available in module scope — pull them from utils for test compatibility.
  const _u = require('./utils');
  /* global sortFolderNames, sortChats, EMOJI_PREFIX_REGEX */
  if (typeof sortFolderNames === 'undefined') global.sortFolderNames = _u.sortFolderNames;
  if (typeof sortChats === 'undefined') global.sortChats = _u.sortChats;
  if (typeof EMOJI_PREFIX_REGEX === 'undefined') global.EMOJI_PREFIX_REGEX = _u.EMOJI_PREFIX_REGEX;
  // Folder-nesting helpers, same reason: globals in the browser, module-scoped here.
  for (const name of ['getFolderParent', 'getChildFolders', 'getRootFolderNames',
    'folderSubtreeNames', 'sortedChildFolders', 'sortedRootFolders', 'flattenFolderChats',
    'canNestFolder', 'withFolderParent', 'pruneFolderParents', 'folderDisplayPath',
    'folderOpenPath', 'folderSearchState']) {
    if (typeof global[name] === 'undefined') global[name] = _u[name];
  }

  module.exports = {
    displayFolders,
    renameChat,
    deleteChat,
    moveChat,
    nestFolder,
    unnestFolder,
    collectOpenFolders,
    togglePin,
    renameFolder,
    openFolderInTabGroup,
    modifierKeyLabel,
    queryAllTabs,
    findTabShowingUrl,
    pickReusableTab,
    openConversation,
  };
}

