// welcome.js — first-run page wiring (src/welcome.html).
//
// Deliberately tiny: fill in the localized strings, build the two data-driven
// illustrations, mirror RTL, and let the CTA close the tab. No storage writes, no
// network, no analytics — the page's only job is to get the user to pin the
// toolbar button, which the uninstall survey (2026-08) identified as the missing
// first step for 23% of churned installs.

// id -> message key. The Gemini-vs-supported-sites wording lives in each
// extension's own _locales, so this file stays shared.
// Firefox 109+ behaves like Chrome — a newly installed extension lands in the
// unified Extensions panel rather than on the toolbar — so step 1 is needed there
// too. Only the gesture differs: the panel row carries a gear that opens a context
// menu, instead of Chrome's pin toggle. Same UA test as background.js.
const IS_FIREFOX = /Firefox/.test(navigator.userAgent);

const TEXT = {
  wTitle: 'appTitle',            // reused: no new key needed for the product name
  wReady: 'welcomeReady',
  wPinTitle: 'welcomePinTitle',
  wPinBody: IS_FIREFOX ? 'welcomePinBodyFirefox' : 'welcomePinBody',
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
  welcomePinBodyFirefox: 'Click the Extensions icon at the top right of the browser, then '
    + 'the gear ⚙ beside this extension and choose “Pin to Toolbar”.',
  welcomeOpenTitle: 'Open a conversation',
  welcomeOpenBody: 'Open a conversation on one of the supported AI sites.',
  welcomeSaveTitle: 'Save it to a folder',
  welcomeSaveBody: 'Click the extension icon, type a folder name and press {b}.',
  welcomeCta: 'Got it',
  saveBtn: 'Save',
  btnToggleAdd: 'Add conversation',
};

function msg(key) {
  return chrome.i18n.getMessage(key) || FALLBACK[key] || '';
}

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
    if (el) el.textContent = msg(key);
  }

  // "{b}" is the popup's own Save button label. Substituted at runtime rather than
  // written into each translation so the two can never drift: whatever the button
  // says in this locale is exactly what the instruction quotes.
  const save = document.getElementById('wSaveBody');
  if (save) save.textContent = msg('welcomeSaveBody').split('{b}').join(msg('saveBtn'));

  // The tab title is not localized anywhere else; keep it in step with the header.
  document.title = msg('appTitle') || document.title;
}

// AI Folders ships a SITES registry in site-config.js; Gemini Folders has none
// because it supports exactly one site. Entries without a domain (the
// user-configured local LLM) are not sites you can go and open, so they are left
// out of a row that says "open a conversation on one of these".
function supportedSites() {
  if (typeof SITES !== 'undefined' && SITES) {
    return Object.values(SITES).filter(s => s && s.domain && s.logo);
  }
  return [{ key: 'gemini', logo: 'icons/gemini.png' }];
}

function buildSiteRow() {
  const row = document.getElementById('wSites');
  if (!row) return;
  const sites = supportedSites();
  // Idempotent: appending would otherwise duplicate the row if this ever ran twice.
  row.replaceChildren();
  // One site gets a single larger mark; a row of one 26px icon would look broken.
  row.classList.toggle('site-row-single', sites.length === 1);
  for (const site of sites) {
    const img = document.createElement('img');
    // Always the dark variant: this page has no light theme (see welcome.css).
    img.src = site.logo;
    img.alt = '';
    row.appendChild(img);
  }
}

// The two browsers draw their extensions button differently, so the page ships both
// glyphs and keeps only the one that matches — same branch as the pin wording.
function pickExtensionsGlyph() {
  const drop = document.querySelector(IS_FIREFOX ? '.ico-chrome' : '.ico-firefox');
  if (drop) drop.remove();
}

function buildAddButton() {
  const btn = document.getElementById('wAddBtn');
  // Matches how the popup composes the same label (popup-core.js).
  if (btn) btn.textContent = '➕ ' + msg('btnToggleAdd');
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  pickExtensionsGlyph();
  buildSiteRow();
  buildAddButton();
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
