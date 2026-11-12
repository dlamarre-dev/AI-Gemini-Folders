// icons.js — the one registry of interface glyphs, shared by both extensions.
//
// Every icon in the popup used to be an emoji. Emoji are drawn by the operating
// system, so the same button was a different picture — different size, colour
// and baseline — on Windows, macOS, Linux and Android, and none of them followed
// the theme. These are monochrome 24×24 shapes filled with `currentColor`, the
// style the prompt list's insert (play) and copy buttons always had, so an icon
// takes the colour of the text around it in both themes and looks the same
// everywhere.
//
// What deliberately stays an emoji:
//   - an emoji the USER typed in front of a folder name (EMOJI_PREFIX_REGEX):
//     that is their data, shown as they wrote it;
//   - the browser's own surfaces — the right-click menu and the bookmark
//     mirror — which take plain text only;
//   - the localized quick-save folder name: it is a storage key (see CLAUDE.md
//     §6), so changing it would split every existing user's folder in two.
//
// The in-page toast (showToast in each background.js) cannot load this file —
// it is a function injected into the site's page — so it carries its own copy
// of `checkCircle` and `warning`. tests/icons.test.js keeps the copies equal.
//
// Loaded as a classic script before ui.js (popup.html), and by welcome.html
// and import.html;
// nothing here touches the DOM at load time.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Path data only, 24×24 viewBox. Mostly Material Icons (Apache 2.0), like the
// two glyphs this set is modelled on; `levelUp` is drawn for this project.
const ICON_PATHS = {
  // Row actions
  play: 'M8 5v14l11-7z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  // Unpinned is the outline, pinned the solid shape: state without colour.
  pin: 'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z',
  pinFilled: 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z',
  tabs: 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10z',
  // An arrow leaving a nested row upwards: "one level up".
  levelUp: 'M9 5l5 5h-4v6h10v2H8v-8H4z',
  chevron: 'M9 6l6 6-6 6z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',

  // Status. The only two glyphs with a colour of their own (popup.css): they
  // replaced the ✅ and ⚠️ that used to open the translated messages.
  checkCircle: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',

  // Folders: an empty one is the outline, one holding something is solid.
  folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  folderEmpty: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z',
  folderAdd: 'M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z',

  // Toolbar and footer
  prompt: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  remove: 'M19 13H5v-2h14v2z',
  sort: 'M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
  phone: 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
  cloud: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  // The one outline in the set: a bare diamond, empty inside. `{ stroke }`
  // draws the path as a line instead of filling it.
  gem: { stroke: 'M6.5 4h11L22 9.5 12 20.5 2 9.5z' },
};

// Builds one glyph. `data-icon` names it, which is what the tests (and anything
// that has to tell two icon-only buttons apart) look for instead of a character.
function icon(name, size) {
  const d = ICON_PATHS[name];
  if (!d) throw new Error('Unknown icon: ' + name);
  const px = String(size || 14);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', px);
  svg.setAttribute('height', px);
  const outline = typeof d === 'object';
  svg.setAttribute('fill', outline ? 'none' : 'currentColor');
  if (outline) {
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('data-icon', name);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', outline ? d.stroke : d);
  svg.appendChild(path);
  return svg;
}

// An icon-only control: replaces whatever the element holds with the glyph.
function setIcon(el, name, size) {
  el.replaceChildren(icon(name, size));
}

// A glyph followed by a label ("+ Add conversation"). The text stays a real
// text node, so textContent is the label alone.
function setIconLabel(el, name, text, size) {
  el.classList.add('icon-text');
  el.replaceChildren(icon(name, size), document.createTextNode(text));
}

// Static markup declares its glyph with data-ic="name" (and data-ic-size), so
// the path data lives here once instead of being pasted into both popup.html.
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-ic]').forEach((el) => {
    if (el.querySelector(':scope > svg.icon')) return;   // already done
    el.prepend(icon(el.getAttribute('data-ic'), el.getAttribute('data-ic-size')));
  });
}

if (typeof window !== 'undefined') {
  window.icon = icon;
  window.setIcon = setIcon;
  window.setIconLabel = setIconLabel;
  window.hydrateIcons = hydrateIcons;
}
if (typeof module !== 'undefined') {
  module.exports = { ICON_PATHS, icon, setIcon, setIconLabel, hydrateIcons };
}
