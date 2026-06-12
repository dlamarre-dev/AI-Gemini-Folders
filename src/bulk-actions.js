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

  // Close on click outside
  document.addEventListener('click', () => {
    if (!bulkMoveList.hidden) closeDropdown();
  });

  // ── Move logic ──────────────────────────────────────────────────────────────

  function moveTo(targetFolder) {
    if (!targetFolder) return;
    closeDropdown();

    loadData({ folders: {}, openFolders: [] }, (data) => {
      let folders    = data.folders;
      let openFolders = data.openFolders;

      if (!folders[targetFolder]) folders[targetFolder] = [];

      window.selectedChats.forEach(item => {
        if (folders[item.folder]) {
          folders[item.folder] = folders[item.folder].filter(c => c.url !== item.url);
        }
        const cleanTargetUrl = normalizeUrl(item.url);
        const isDuplicate = folders[targetFolder].some(
          chat => normalizeUrl(chat.url) === cleanTargetUrl
        );
        if (!isDuplicate) folders[targetFolder].push(item.chatObj);
      });

      if (!openFolders.includes(targetFolder)) openFolders.push(targetFolder);

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

      loadData({ folders: {} }, (data) => {
        Object.keys(data.folders).sort().forEach(folder => {
          const match = folder.match(EMOJI_PREFIX_REGEX);
          const icon = match ? match[1] : '📁';
          const displayName = match ? folder.slice(match[0].length) : folder;

          const li = document.createElement('li');
          li.textContent = `${icon} ${displayName}`;
          li.addEventListener('click', (e) => { e.stopPropagation(); moveTo(folder); });
          bulkMoveList.appendChild(li);
        });
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
        if (folders[item.folder]) {
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
