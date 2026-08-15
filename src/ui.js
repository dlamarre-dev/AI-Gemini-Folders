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

    // Dialog semantics. The markup is a plain <div> pair, so a screen reader had
    // no way to know a dialog had opened or what it was called.
    const dialog = modal.querySelector('.modal-content') || modal;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'modalTitle');
    if (message) dialog.setAttribute('aria-describedby', 'modalMessage');
    else dialog.removeAttribute('aria-describedby');

    // Return focus where it came from once we're done — otherwise dismissing the
    // modal drops the user at the top of the popup.
    const previouslyFocused = document.activeElement;

    modal.style.display = 'flex';

    // Focus something inside the dialog. Without this, confirm/alert left focus
    // on the background control, so Tab walked the page behind the overlay and
    // Enter only worked because the key handler is global.
    if (type !== 'prompt') {
      setTimeout(() => btnConfirm.focus(), 0);
    }

    // Keep Tab inside the dialog. The overlay only hides the popup visually
    // (display toggling), so everything behind it stays focusable.
    // Visibility is checked on the inline style rather than offsetParent: this
    // modal hides its optional parts with style.display, and offsetParent is
    // always null under jsdom, which would silently empty the list in tests.
    const focusables = () => Array.from(
      dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(el => el.style.display !== 'none' && !el.hidden && !el.disabled);

    const onTrapKeydown = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

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
      document.removeEventListener('keydown', onTrapKeydown, true);
      modal.removeEventListener('click', onOverlayClick);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('keydown', onTrapKeydown, true);
    modal.addEventListener('click', onOverlayClick);

    btnConfirm.onclick = confirm;
    btnCancel.onclick = cancel;
  });
}

// Makes a custom dropdown reachable without a mouse.
//
// The toggles were real <button>s, so keyboard users could open these menus —
// and then hit a dead end, because the options were <div>/<li> with a click
// listener and nothing else: not focusable, not announced, not activatable.
// Follows the WAI menu-button pattern: roles, arrow-key roving focus, Enter or
// Space to choose, Escape to close and hand focus back to the toggle.
//
// Open state is read from the existing `.show` class rather than owned here, so
// each caller keeps its own show/hide logic untouched.
//
// options.radio marks the menu as a single-choice group (the sort menus):
// items become menuitemradio and their aria-checked mirrors options.selectedClass
// (default 'active'), so a screen reader can tell which ordering is in effect —
// with role="menuitem" the current choice was visual only.
function makeMenuAccessible(toggleBtn, menu, getItems, options) {
  if (!toggleBtn || !menu) return;

  const opts = options || {};
  const isRadioGroup = !!opts.radio;
  const selectedClass = opts.selectedClass || 'active';
  const items = () => Array.from(getItems ? getItems() : menu.children);
  // Two conventions in the codebase: the sort menus toggle a `.show` class, the
  // bulk-move list toggles the `hidden` attribute. Pick one at wiring time —
  // testing `!menu.hidden` on a plain <div> is always true, which would make the
  // menu look permanently open.
  const usesHidden = menu.hasAttribute('hidden');
  const isOpen = () => usesHidden ? !menu.hidden : menu.classList.contains('show');

  const itemRole = isRadioGroup ? 'menuitemradio' : 'menuitem';
  toggleBtn.setAttribute('aria-haspopup', 'menu');
  toggleBtn.setAttribute('aria-expanded', 'false');
  menu.setAttribute('role', 'menu');
  const tagItems = () => {
    for (const item of items()) {
      item.setAttribute('role', itemRole);
      item.setAttribute('tabindex', '-1');
      if (isRadioGroup) {
        item.setAttribute('aria-checked', String(item.classList.contains(selectedClass)));
      }
    }
  };
  tagItems();

  // The selected class is applied asynchronously (loadData) and again on every
  // choice, so watch for it instead of asking each caller to report it.
  if (isRadioGroup && typeof MutationObserver !== 'undefined') {
    new MutationObserver(tagItems).observe(menu, {
      attributes: true, attributeFilter: ['class'], subtree: true, childList: true,
    });
  }

  // The class/hidden flip happens in the caller's own click handler, so mirror
  // it into aria-expanded afterwards rather than trying to own the state.
  const syncExpanded = () => toggleBtn.setAttribute('aria-expanded', String(isOpen()));
  toggleBtn.addEventListener('click', () => setTimeout(syncExpanded, 0));
  document.addEventListener('click', () => setTimeout(syncExpanded, 0));
  // Choosing an item closes the menu, but the bulk-move list stops propagation
  // on its <li> clicks, so the document listener above never sees them and
  // aria-expanded stayed "true" on a closed menu. Capture fires regardless.
  menu.addEventListener('click', () => setTimeout(syncExpanded, 0), true);

  const focusItem = (i) => {
    const list = items();
    if (list.length === 0) return;
    const idx = ((i % list.length) + list.length) % list.length;
    list[idx].focus();
  };

  const close = (refocus) => {
    if (usesHidden) menu.hidden = true;
    else menu.classList.remove('show');
    syncExpanded();
    if (refocus) toggleBtn.focus();
  };

  toggleBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // Let the caller's click handler open the menu, then move into it.
      if (!isOpen()) toggleBtn.click();
      setTimeout(() => { syncExpanded(); focusItem(e.key === 'ArrowDown' ? 0 : -1); }, 0);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      close(true);
    }
  });

  // Enter and Space fire the button's native click, which opens the menu — but
  // focus stayed on the toggle while every item is tabindex="-1", so the menu
  // was open with nowhere to go. The WAI pattern puts focus on the first item.
  // detail === 0 marks a keyboard-generated click, so a real mouse click still
  // leaves focus alone. preventDefault is not an option here: it would suppress
  // the very click that opens the menu.
  toggleBtn.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    setTimeout(() => { if (isOpen()) focusItem(0); }, 0);
  });

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const current = list.indexOf(document.activeElement);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusItem(current + 1); break;
      case 'ArrowUp':   e.preventDefault(); focusItem(current - 1); break;
      case 'Home':      e.preventDefault(); focusItem(0); break;
      case 'End':       e.preventDefault(); focusItem(-1); break;
      case 'Escape':    e.preventDefault(); close(true); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (document.activeElement && list.includes(document.activeElement)) {
          document.activeElement.click();
          close(true);
        }
        break;
      default: break;
    }
  });
}

window.showCustomModal = showCustomModal;
window.updateStorageBar = updateStorageBar;
window.makeMenuAccessible = makeMenuAccessible;

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
