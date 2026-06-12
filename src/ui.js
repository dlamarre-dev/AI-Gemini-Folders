// ui.js

function updateStorageBar() {
  chrome.storage.sync.getBytesInUse(null, (bytesInUse) => {
    if (chrome.runtime.lastError) {
      console.error("[StorageBar] API error:", chrome.runtime.lastError);
      return;
    }

    const currentBytes = bytesInUse || 0;
    const maxBytes = chrome.storage.sync.QUOTA_BYTES || 102400;
    const percentage = (currentBytes / maxBytes) * 100;

    const storageFill = document.getElementById('storageFill');
    const storageTooltip = document.getElementById('storageTooltip');

    if (!storageFill || !storageTooltip) {
      return;
    }

    storageFill.style.width = `${Math.min(percentage, 100)}%`;

    const kbUsed = (currentBytes / 1024).toFixed(1);
    const kbMax = (maxBytes / 1024).toFixed(0);

    let infoTemplate = chrome.i18n.getMessage("storageInfo");

    if (infoTemplate) {
      storageTooltip.title = infoTemplate
        .replace("{used}", kbUsed)
        .replace("{max}", kbMax)
        .replace("{pct}", percentage.toFixed(1));
    } else {
      storageTooltip.title = `${kbUsed} Ko / ${kbMax} Ko (${percentage.toFixed(1)}%)`;
    }

    if (percentage > 90) {
      storageFill.classList.add('warning');
    } else {
      storageFill.classList.remove('warning');
    }
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    setTimeout(updateStorageBar, 100);
  }
});

function showCustomModal({ title, message = '', type = 'confirm', defaultValue = '', placeholder = '' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const inputEl = document.getElementById('modalInput');
    const btnCancel = document.getElementById('modalBtnCancel');
    const btnConfirm = document.getElementById('modalBtnConfirm');

    titleEl.textContent = title;

    if (message) {
      msgEl.textContent = message;
      msgEl.style.display = 'block';
    } else {
      msgEl.style.display = 'none';
    }

    if (type === 'prompt') {
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
      inputEl.style.display = 'block';
      setTimeout(() => inputEl.focus(), 100);
    } else {
      inputEl.style.display = 'none';
    }

    if (type === 'alert') {
      btnCancel.style.display = 'none';
      btnConfirm.textContent = 'OK';
    } else {
      btnCancel.style.display = 'inline-block';
      btnCancel.textContent = chrome.i18n.getMessage("modalBtnCancel") || "Cancel";
      btnConfirm.textContent = chrome.i18n.getMessage("modalBtnConfirm") || "Confirm";
    }

    modal.style.display = 'flex';

    const confirm = () => {
      cleanup();
      resolve(type === 'prompt' ? inputEl.value.trim() : true);
    };

    const cancel = () => {
      cleanup();
      resolve(type === 'prompt' ? null : false);
    };

    // Enter confirms (also from inside the prompt input), Escape cancels.
    // Capture phase so we act before any field-level key handling.
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    // Clicking the dimmed backdrop (not the dialog box itself) dismisses the modal.
    const onOverlayClick = (e) => {
      if (e.target === modal) cancel();
    };

    const cleanup = () => {
      modal.style.display = 'none';
      btnConfirm.onclick = null;
      btnCancel.onclick = null;
      document.removeEventListener('keydown', onKeydown, true);
      modal.removeEventListener('click', onOverlayClick);
    };

    document.addEventListener('keydown', onKeydown, true);
    modal.addEventListener('click', onOverlayClick);

    btnConfirm.onclick = confirm;
    btnCancel.onclick = cancel;
  });
}

window.showCustomModal = showCustomModal;
window.updateStorageBar = updateStorageBar;

document.addEventListener('DOMContentLoaded', () => {
  const storageTooltip = document.getElementById('storageTooltip');
  if (storageTooltip) {
    storageTooltip.title = chrome.i18n.getMessage("storageCalc") || "Calcul...";
  }

  updateStorageBar();

  // --- REVIEW BANNER ---
  const reviewBanner = document.getElementById('reviewBanner');
  if (reviewBanner) {
    document.getElementById('reviewTitleTxt').textContent = chrome.i18n.getMessage("reviewTitle");
    document.getElementById('reviewMessageTxt').textContent = chrome.i18n.getMessage("reviewMessage") || "Your support helps this open-source project immensely!";
    const btnReviewRate = document.getElementById('btnReviewRate');
    btnReviewRate.textContent = chrome.i18n.getMessage("reviewRateBtn") || "Rate 5 stars";
    document.getElementById('btnReviewLater').textContent = chrome.i18n.getMessage("reviewLaterBtn") || "Maybe later";
    document.getElementById('btnReviewNo').textContent = chrome.i18n.getMessage("reviewNoBtn") || "No thanks";

    chrome.storage.local.get(['usageStats', 'reviewState'], (data) => {
      let stats = data.usageStats || { saves: 0, opens: 0 };
      let reviewState = data.reviewState || { status: 'pending', nextPromptDate: 0 };

      stats.opens += 1;
      chrome.storage.local.set({ usageStats: stats });

      if (reviewState.status === 'rated' || reviewState.status === 'dismissed') return;

      const meetsThreshold = stats.saves >= 15 || stats.opens >= 50;
      const isTimeForLater = reviewState.status === 'later' && Date.now() > reviewState.nextPromptDate;

      if ((reviewState.status === 'pending' && meetsThreshold) || isTimeForLater) {
        reviewBanner.style.display = 'block';
      }

      const markRatingInteraction = () => chrome.storage.local.set({ afPromoRatingDate: Date.now() });

      document.getElementById('btnReviewRate').addEventListener('click', () => {
        chrome.storage.local.set({ reviewState: { status: 'rated' } });
        markRatingInteraction();
        reviewBanner.style.display = 'none';
      });

      document.getElementById('btnReviewLater').addEventListener('click', () => {
        const nextDate = Date.now() + (5 * 24 * 60 * 60 * 1000);
        chrome.storage.local.set({ reviewState: { status: 'later', nextPromptDate: nextDate } });
        markRatingInteraction();
        reviewBanner.style.display = 'none';
      });

      document.getElementById('btnReviewNo').addEventListener('click', () => {
        chrome.storage.local.set({ reviewState: { status: 'dismissed' } });
        markRatingInteraction();
        reviewBanner.style.display = 'none';
      });
    });
  }
});
