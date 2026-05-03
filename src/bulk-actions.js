// bulk-actions.js

window.selectedChats = [];

document.addEventListener('DOMContentLoaded', () => {
  const bulkActionBar = document.getElementById('bulkActionBar');
  const bulkCount = document.getElementById('bulkCount');
  const bulkMoveSelect = document.getElementById('bulkMoveSelect');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const bulkCancelBtn = document.getElementById('bulkCancelBtn');
  const searchInput = document.getElementById('searchInput');

  bulkCancelBtn.title = chrome.i18n.getMessage("bulkCancel") || "Cancel";

  function updateBulkActionBar() {
    if (window.selectedChats.length > 0) {
      bulkActionBar.style.display = 'flex';
      document.body.classList.add('bulk-active');

      // Update text
      let countMsg = chrome.i18n.getMessage("bulkSelected") || "{count} selected";
      bulkCount.textContent = countMsg.replace("{count}", window.selectedChats.length);

      // Refresh folder list
      loadData({ folders: {} }, (data) => {
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        defaultOption.textContent = chrome.i18n.getMessage("bulkMove") || "Move to...";
        bulkMoveSelect.textContent = '';
        bulkMoveSelect.appendChild(defaultOption);

        Object.keys(data.folders).sort().forEach(folder => {
          // Prepend default folder icon if the name has no custom leading emoji
          const emojiRegex = /^((?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)\s*/u;
          const hasCustomEmoji = emojiRegex.test(folder);
          const iconPrefix = hasCustomEmoji ? '' : '📁 ';

          const option = document.createElement('option');
          option.value = folder;
          option.textContent = `${iconPrefix}${folder}`;
          bulkMoveSelect.appendChild(option);
        });
      });
    } else {
      bulkActionBar.style.display = 'none';
      document.body.classList.remove('bulk-active');
      bulkMoveSelect.replaceChildren();
    }
  }

  window.updateBulkActionBar = updateBulkActionBar;

  // Cancel selection
  bulkCancelBtn.addEventListener('click', () => {
    window.selectedChats = [];
    if (window.displayFolders) {
      window.displayFolders(null, searchInput.value.toLowerCase());
    }
    updateBulkActionBar();
  });

  // Delete selected
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

  // Move selected
  bulkMoveSelect.addEventListener('change', (e) => {
    const targetFolder = e.target.value;
    if (!targetFolder) return;

    loadData({ folders: {}, openFolders: [] }, (data) => {
      let folders = data.folders;
      let openFolders = data.openFolders;

      if (!folders[targetFolder]) folders[targetFolder] = [];

      window.selectedChats.forEach(item => {
        // 1. Remove from source folder
        if (folders[item.folder]) {
          folders[item.folder] = folders[item.folder].filter(c => c.url !== item.url);
        }
        // 2. Add to target folder (no duplicate)
        const cleanTargetUrl = normalizeUrl(item.url);
        const isDuplicate = folders[targetFolder].some(chat => normalizeUrl(chat.url) === cleanTargetUrl);
        if (!isDuplicate) {
          folders[targetFolder].push(item.chatObj);
        }
      });

      // Open target folder
      if (!openFolders.includes(targetFolder)) openFolders.push(targetFolder);

      saveData({ folders: folders, openFolders: openFolders }, () => {
        window.selectedChats = []; // Empty selection
        if (window.displayFolders) {
          window.displayFolders(openFolders, searchInput.value.toLowerCase());
        }
        updateBulkActionBar();
      });
    });
  });
});
