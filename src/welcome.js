// welcome.js — first-run page wiring (src/welcome.html).
//
// Deliberately tiny: fill in the localized strings, mirror RTL, and let the CTA
// close the tab. No storage writes, no network, no analytics — the page's only job
// is to get the user to pin the toolbar button, which the uninstall survey
// (2026-08) identified as the missing first step for 23% of churned installs.

// id -> message key. The Gemini-vs-supported-sites wording lives in each
// extension's own _locales, so this file stays shared.
const TEXT = {
  wTitle: 'appTitle',            // reused: no new key needed for the product name
  wReady: 'welcomeReady',
  wPinTitle: 'welcomePinTitle',
  wPinBody: 'welcomePinBody',
  wOpenTitle: 'welcomeOpenTitle',
  wOpenBody: 'welcomeOpenBody',  // the one product-specific string
  wSaveTitle: 'welcomeSaveTitle',
  wSaveBody: 'welcomeSaveBody',
  wCta: 'welcomeCta',
};

// Fallbacks matter more here than elsewhere: this page is the first thing a new
// user sees, and a blank step would read as a broken install.
const FALLBACK = {
  welcomeReady: "You're all set.",
  welcomePinTitle: 'Pin it to your toolbar',
  welcomePinBody: 'Click the puzzle icon at the top right of the browser, then the pin '
    + 'beside this extension. Until you do, the browser keeps it hidden in that menu.',
  welcomeOpenTitle: 'Open a conversation',
  welcomeOpenBody: 'Open a conversation on one of the supported AI sites.',
  welcomeSaveTitle: 'Save it to a folder',
  welcomeSaveBody: 'Click the extension icon, type a folder name and press ➕. '
    + 'Right-clicking the page works too.',
  welcomeCta: 'Got it',
};

function applyI18n() {
  const uiLang = chrome.i18n.getUILanguage();
  document.documentElement.lang = uiLang;
  // Same list and same target element as applyCommonI18n (popup-core.js): dir goes
  // on body, not html, to avoid scroll-origin issues.
  if (['ar', 'he', 'ur', 'fa'].some(l => uiLang.startsWith(l))) {
    document.body.setAttribute('dir', 'rtl');
  }

  for (const [id, key] of Object.entries(TEXT)) {
    const el = document.getElementById(id);
    if (el) el.textContent = chrome.i18n.getMessage(key) || FALLBACK[key] || '';
  }
  // The tab title is not localized anywhere else; keep it in step with the heading.
  document.title = chrome.i18n.getMessage('appTitle') || document.title;
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  document.getElementById('wCta').addEventListener('click', () => {
    // Close this tab and leave the user where they were. window.close() is allowed
    // for a tab the extension opened itself; the tabs.remove path is the fallback
    // when it is not (and needs no "tabs" permission for the current tab).
    window.close();
    if (chrome.tabs && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id != null) chrome.tabs.remove(tab.id);
      });
    }
  });
});
