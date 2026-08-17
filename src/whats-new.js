// whats-new.js — release-notes page wiring (src/whats-new.html).
//
// Same shape and the same rules as welcome.js: fill in the localized strings,
// build the one data-driven illustration, mirror RTL, let the CTA close the tab.
// No storage writes, no network, no analytics — the tab is opened for the user
// rather than asked for, so anything that fired here would read as a phone-home
// (the reasoning that governs welcome.html and the uninstall page, CLAUDE.md §9).

// id -> message key. Shared by both extensions; the two Baidu keys exist only in
// AI Folders' _locales, because Gemini Folders never shows that card.
const TEXT = {
  nTitle: 'appTitle',            // reused: no new key for the product name
  nHeading: 'whatsNewHeading',
  nNestedTitle: 'whatsNewNestedTitle',
  nNestedBody: 'whatsNewNestedBody',
  nReuseTitle: 'whatsNewReuseTitle',
  nReuseBody: 'whatsNewReuseBody',
  nBaiduTitle: 'whatsNewBaiduTitle',
  nBaiduBody: 'whatsNewBaiduBody',
  nCta: 'welcomeCta',            // reused: the same "Got it" button
};

// A blank card would read as a broken update, so every string has a fallback.
const FALLBACK = {
  whatsNewHeading: "What's new",
  whatsNewNestedTitle: 'Folders inside folders',
  whatsNewNestedBody: 'Drag a folder onto another one to place it inside. Open the parent '
    + 'as a tab group and everything it contains opens with it.',
  whatsNewReuseTitle: 'Fewer tabs',
  whatsNewReuseBody: 'Clicking a saved conversation switches to the tab already showing it. '
    + '{k}-click reuses the last tab this extension opened instead of adding another.',
  whatsNewBaiduTitle: 'Baidu Chat still works',
  whatsNewBaiduBody: 'Baidu moved its chat to a new address. Saving and prompt injection '
    + 'work there again.',
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
  const modKey = currentModifierKeyLabel();
  const reuse = document.getElementById('nReuseBody');
  if (reuse) reuse.textContent = msg('whatsNewReuseBody').split('{k}').join(modKey);
  const cap = document.getElementById('nModKey');
  if (cap) cap.textContent = modKey;

  // The tab title is not localized anywhere else; keep it in step with the header.
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

// The Baidu card is about a site AI Folders supports and Gemini Folders does not,
// so the site registry decides — no per-product flag to keep in step.
function buildBaiduCard() {
  const card = document.getElementById('nBaiduCard');
  if (!card) return;
  const site = (typeof SITES !== 'undefined' && SITES) ? SITES.baidu : null;
  if (!site || !site.logo) {
    card.remove();
    return;
  }
  const row = document.getElementById('nBaiduLogo');
  if (row) {
    const img = document.createElement('img');
    // Always the dark variant: this page has no light theme (see welcome.css).
    img.src = site.logo;
    img.alt = '';
    row.replaceChildren(img);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  buildBaiduCard();   // before applyI18n, so a removed card is never filled in
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
