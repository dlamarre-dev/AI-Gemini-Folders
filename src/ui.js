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

    const cleanup = () => {
      modal.style.display = 'none';
      btnConfirm.onclick = null;
      btnCancel.onclick = null;
    };

    btnConfirm.onclick = () => {
      cleanup();
      resolve(type === 'prompt' ? inputEl.value.trim() : true);
    };

    btnCancel.onclick = () => {
      cleanup();
      resolve(type === 'prompt' ? null : false);
    };
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
  document.getElementById('reviewTitleTxt').textContent = chrome.i18n.getMessage("reviewTitle") || "⭐ Are you enjoying Gemini Folders?";
  document.getElementById('reviewMessageTxt').textContent = chrome.i18n.getMessage("reviewMessage") || "Your support helps this open-source project immensely!";
  const btnReviewRate = document.getElementById('btnReviewRate');
  btnReviewRate.textContent = chrome.i18n.getMessage("reviewRateBtn") || "Rate 5 stars";
  if (btnReviewRate && navigator.userAgent.toLowerCase().includes('firefox')) {
    btnReviewRate.href = "https://addons.mozilla.org/firefox/addon/gemini_folders/reviews/";
  }
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

    document.getElementById('btnReviewRate').addEventListener('click', () => {
      chrome.storage.local.set({ reviewState: { status: 'rated' } });
      reviewBanner.style.display = 'none';
    });

    document.getElementById('btnReviewLater').addEventListener('click', () => {
      const nextDate = Date.now() + (5 * 24 * 60 * 60 * 1000);
      chrome.storage.local.set({ reviewState: { status: 'later', nextPromptDate: nextDate } });
      reviewBanner.style.display = 'none';
    });

    document.getElementById('btnReviewNo').addEventListener('click', () => {
      chrome.storage.local.set({ reviewState: { status: 'dismissed' } });
      reviewBanner.style.display = 'none';
    });
  });
});
