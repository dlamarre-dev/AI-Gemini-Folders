// bulk-actions.js

window.selectedChats = [];

document.addEventListener('DOMContentLoaded', () => {
  const bulkActionBar   = document.getElementById('bulkActionBar');
  const bulkCount       = document.getElementById('bulkCount');
  const bulkMoveTrigger = document.getElementById('bulkMoveTrigger');
  const bulkMoveList    = document.getElementById('bulkMoveList');
  const bulkDeleteBtn   = document.getElementById('bulkDeleteBtn');
  const bulkCancelBtn   = document.getElementById('bulkCancelBtn');
  const searchInput     = document.getElementById('searchInput');

  bulkCancelBtn.title = chrome.i18n.getMessage("bulkCancel") || "Cancel";
  bulkDeleteBtn.title = chrome.i18n.getMessage("btnDelete") || "Delete";

  const placeholderText = () => chrome.i18n.getMessage("bulkMove") || "Move to...";

  // ── Custom dropdown open / close ────────────────────────────────────────────

  function openDropdown() {
    bulkMoveList.hidden = false;
    bulkMoveTrigger.classList.add('open');
  }

  function closeDropdown() {
    bulkMoveList.hidden = true;
    bulkMoveTrigger.classList.remove('open');
    bulkMoveTrigger.textContent = placeholderText();
  }

  bulkMoveTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    bulkMoveList.hidden ? openDropdown() : closeDropdown();
  });

  // Keyboard + screen-reader access for the folder list (src/ui.js).
  if (window.makeMenuAccessible) {
    window.makeMenuAccessible(bulkMoveTrigger, bulkMoveList,
      () => bulkMoveList.querySelectorAll('li'));
  }

  // Close on click outside
  document.addEventListener('click', () => {
    if (!bulkMoveList.hidden) closeDropdown();
  });

  // ── Move logic ──────────────────────────────────────────────────────────────

  function moveTo(targetFolder) {
    if (!targetFolder) return;
    closeDropdown();

    loadData({ folders: {}, openFolders: [], folderParents: {} }, (data) => {
      let folders    = data.folders;
      let openFolders = data.openFolders;

      if (!hasEntry(folders, targetFolder)) folders[targetFolder] = [];

      window.selectedChats.forEach(item => {
        // hasEntry, not truthiness: a folder legitimately named "toString" is
        // an own property, but if it were removed meanwhile the lookup would
        // fall back to the inherited function and .filter would throw.
        // Move the entry as it is stored NOW, not item.chatObj: that snapshot was
        // taken when the box was ticked, so a rename made since was undone by the
        // move. The popup hides the action buttons in bulk mode, so that rename
        // comes from another device through sync. The snapshot is only the
        // fallback for an entry that has vanished from its folder meanwhile.
        let stored = null;
        if (hasEntry(folders, item.folder)) {
          stored = folders[item.folder].find(c => c.url === item.url) || null;
          folders[item.folder] = folders[item.folder].filter(c => c.url !== item.url);
        }
        const cleanTargetUrl = normalizeUrl(item.url);
        const isDuplicate = folders[targetFolder].some(
          chat => normalizeUrl(chat.url) === cleanTargetUrl
        );
        if (!isDuplicate) folders[targetFolder].push(stored || item.chatObj);
      });

      if (!openFolders.includes(targetFolder)) openFolders.push(targetFolder);
      // …and every folder above it, or conversations moved into a sub-folder
      // land inside a collapsed folder and look lost.
      for (const name of folderOpenPath(folders, data.folderParents || {}, targetFolder)) {
        if (!openFolders.includes(name)) openFolders.push(name);
      }

      saveData({ folders: folders, openFolders: openFolders }, () => {
        window.selectedChats = [];
        if (window.displayFolders) {
          window.displayFolders(openFolders, searchInput.value.toLowerCase());
        }
        updateBulkActionBar();
      });
    });
  }

  // ── Update bar ──────────────────────────────────────────────────────────────

  function updateBulkActionBar() {
    if (window.selectedChats.length > 0) {
      bulkActionBar.style.display = 'flex';
      document.body.classList.add('bulk-active');

      let countMsg = chrome.i18n.getMessage("bulkSelected") || "{count} selected";
      bulkCount.textContent = countMsg.replace("{count}", window.selectedChats.length);

      // Reset trigger label and list
      bulkMoveTrigger.textContent = placeholderText();
      bulkMoveList.innerHTML = '';

      loadData({ folders: {}, folderParents: {} }, (data) => {
        const folderParents = data.folderParents || {};

        const addItem = (folder, depth) => {
          const match = folder.match(EMOJI_PREFIX_REGEX);
          const icon = match ? match[1] : '📁';
          const displayName = match ? folder.slice(match[0].length) : folder;

          const li = document.createElement('li');
          // Sub-folders are shown under their parent, indented by level, but the
          // list stays FLAT: makeMenuAccessible drives roving focus off
          // querySelectorAll('li'), so a nested <ul> would break the keyboard.
          li.textContent = depth > 1 ? `↳ ${icon} ${displayName}` : `${icon} ${displayName}`;
          if (depth > 1) {
            li.classList.add('is-child');
            li.style.paddingInlineStart = `${12 * (depth - 1) + 12}px`;
          }
          // Focusable and announced: these were click-only <li>, so the folder
          // list was unreachable without a mouse.
          li.setAttribute('role', 'menuitem');
          li.setAttribute('tabindex', '-1');
          li.addEventListener('click', (e) => { e.stopPropagation(); moveTo(folder); });
          bulkMoveList.appendChild(li);
        };

        // Depth-first, so each folder sits right under its parent. Bounded:
        // getFolderParent never places anything below MAX_FOLDER_DEPTH.
        const addTree = (folder, depth) => {
          addItem(folder, depth);
          getChildFolders(data.folders, folderParents, folder).sort()
            .forEach(child => addTree(child, depth + 1));
        };
        getRootFolderNames(data.folders, folderParents).sort().forEach(root => addTree(root, 1));
      });
    } else {
      bulkActionBar.style.display = 'none';
      document.body.classList.remove('bulk-active');
      bulkMoveList.innerHTML = '';
      closeDropdown();
    }
  }

  window.updateBulkActionBar = updateBulkActionBar;

  // ── Cancel ──────────────────────────────────────────────────────────────────

  bulkCancelBtn.addEventListener('click', () => {
    window.selectedChats = [];
    if (window.displayFolders) {
      window.displayFolders(null, searchInput.value.toLowerCase());
    }
    updateBulkActionBar();
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  bulkDeleteBtn.addEventListener('click', async () => {
    let confirmMsg = chrome.i18n.getMessage("confirmBulkDelete") || "Delete these {count} conversations?";
    const isSure = await window.showCustomModal({
      title: confirmMsg.replace("{count}", window.selectedChats.length),
      type: 'confirm'
    });
    if (!isSure) return;

    loadData({ folders: {} }, (data) => {
      let folders = data.folders;
      window.selectedChats.forEach(item => {
        // hasEntry, not truthiness: a folder legitimately named "toString" is
        // an own property, but if it were removed meanwhile the lookup would
        // fall back to the inherited function and .filter would throw.
        if (hasEntry(folders, item.folder)) {
          folders[item.folder] = folders[item.folder].filter(c => c.url !== item.url);
        }
      });
      saveData({ folders: folders }, () => {
        window.selectedChats = [];
        if (window.displayFolders) {
          window.displayFolders(null, searchInput.value.toLowerCase());
        }
        updateBulkActionBar();
      });
    });
  });
});
