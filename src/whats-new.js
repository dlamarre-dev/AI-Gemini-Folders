// whats-new.js — release-notes page wiring (src/whats-new.html).
//
// Same shape and the same rules as welcome.js: fill in the localized strings,
// mirror RTL, let the CTA close the tab.
// No storage writes, no network, no analytics — the tab is opened for the user
// rather than asked for, so anything that fired here would read as a phone-home
// (the reasoning that governs welcome.html and the uninstall page, CLAUDE.md §9).

// id -> message key. Shared by both extensions, and worded product-neutrally so
// the AI Folders and Gemini Folders strings are byte-identical.
const TEXT = {
  nTitle: 'appTitle',            // reused: no new key for the product name
  nHeading: 'whatsNewHeading',
  nPanelTitle: 'whatsNewPanelTitle',
  nPanelBody: 'whatsNewPanelBody',
  nCta: 'welcomeCta',            // reused: the same "Got it" button
};

const FALLBACK = {
  whatsNewHeading: "What's new",
  whatsNewPanelTitle: 'Now in the side panel',
  whatsNewPanelBody: "Dock the extension in your browser's side panel: it stays open while "
    + 'you switch tabs, with your folders and prompts always at hand. Open it with the new '
    + 'button at the top of the popup.',
  welcomeCta: 'Got it',
};

function msg(key) {
  return chrome.i18n.getMessage(key) || FALLBACK[key] || '';
}

function applyI18n() {
  const uiLang = chrome.i18n.getUILanguage();
  document.documentElement.lang = uiLang;
  // Same list and same target element as welcome.js / applyCommonI18n: dir goes on
  // body, not html, to avoid scroll-origin issues.
  if (['ar', 'he', 'ur', 'fa'].some(l => uiLang.startsWith(l))) {
    document.body.setAttribute('dir', 'rtl');
  }

  for (const [id, key] of Object.entries(TEXT)) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg(key);
  }

  // "{k}" is the modifier key this platform actually has — Cmd on a Mac, the
  // locale's own name for Ctrl anywhere else. Substituted at runtime rather than
  // written into 43 translations, half of which would then be wrong: the same
  // mechanism the popup's chatLinkReuseHint tooltip uses.
  document.title = msg('appTitle') || document.title;
}

function showVersion() {
  const el = document.getElementById('nVersion');
  if (!el) return;
  // From the manifest, so the chip can never disagree with what is installed.
  const version = chrome.runtime.getManifest?.().version;
  if (version) el.textContent = 'v' + version;
  else el.remove();
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  showVersion();
  document.getElementById('nCta').addEventListener('click', () => {
    // Close this tab and leave the user where they were — same two-step as
    // welcome.js: window.close() works for a tab the extension opened, and
    // tabs.remove on the current tab is the fallback (needs no "tabs" permission).
    window.close();
    if (chrome.tabs && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id != null) chrome.tabs.remove(tab.id);
      });
    }
  });
});
