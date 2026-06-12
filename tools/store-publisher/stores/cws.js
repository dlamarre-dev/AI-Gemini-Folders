// Chrome Web Store driver for the Store Listing Publisher.
//
// Every DOM heuristic for the dev-console "Store listing" page lives in this
// file — if Google redesigns the console, this is the only file to update.
// The page functions (page*) are serialised by chrome.scripting.executeScript
// into the MAIN world, so each one must be fully self-contained: no closures,
// no references to anything outside its own body or its args. That is why the
// small helpers (visible/txt/trail…) are duplicated in each function.
//
// Page facts (probed June 2026):
// - The language selector is a DIV[role=combobox] whose text concatenates the
//   field label and the value: "LanguageEnglish – en (default)". Options are
//   matched by their trailing CWS code ("French – fr"), not by display name.
// - There is exactly one <textarea> on the page: the detailed description.
// - Graphic assets cards in document order: "Graphic assets" (store icon),
//   "Localized assets" (screenshots of the selected language), "Global assets"
//   (international screenshots + small/marquee promo tiles). There is no
//   "Screenshots" sub-heading: elements are assigned to a card when the LAST
//   heading preceding them in document order is that card's heading.
// - Screenshot thumbnails carry buttons aria-labelled "Remove image Screenshot
//   N" (always visible, no hover needed) — counting/deleting goes through
//   them, which also keeps the promo tiles in Global assets out of the way.
// - Each screenshots group has a "Drop image here" button next to its hidden
//   file input; that button anchors the input lookup for uploads.
//
// A future AMO (addons.mozilla.org) driver goes in stores/amo.js and must
// expose the same surface as CwsDriver at the bottom of this file.

const CWS = {
  BASE: 'https://chrome.google.com/webstore/devconsole',
  LOGIN_RE: /accounts\.google|google\.com\/ServiceLogin|SignIn/i,

  // Fallback labels in case an option carries no "– code" suffix.
  ALT_NAMES: {
    en:    ['English (United States)'],
    tl:    ['Tagalog'],
    nb:    ['Norwegian Bokmål', 'Norwegian (Bokmål)'],
    zh_CN: ['Chinese (Simplified)'],
    zh_TW: ['Chinese (Traditional)'],
  },
};

// ── page functions (serialised — self-contained) ─────────────────────────────

// Diagnostic dump of everything the other page functions rely on.
// Run this first when a step fails: its output tells you which heuristic in
// this file needs adjusting.
function pageProbe() {
  const visible = el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
    .filter(visible).filter(h => { const t = txt(h); return t && t.length < 80; });
  const trail = el => headings
    .filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    .map(txt);

  const textareas = Array.from(document.querySelectorAll('textarea')).map(ta => ({
    visible: visible(ta),
    ariaLabel: ta.getAttribute('aria-label'),
    id: ta.id || null,
    size: `${ta.clientWidth}x${ta.clientHeight}`,
    valueStart: (ta.value || '').slice(0, 60),
    trail: trail(ta).slice(-3),
  }));

  const comboboxes = Array.from(document.querySelectorAll('[role="combobox"], select'))
    .filter(visible)
    .map(el => ({ tag: el.tagName, text: txt(el).slice(0, 80) }));

  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(inp => ({
    accept: inp.getAttribute('accept'),
    multiple: inp.multiple,
    trail: trail(inp).slice(-3),
  }));

  const images = Array.from(document.querySelectorAll('img'))
    .filter(visible).filter(i => i.clientWidth >= 40)
    .slice(0, 40)
    .map(i => ({ size: `${i.clientWidth}x${i.clientHeight}`, trail: trail(i).slice(-3) }));

  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter(visible)
    .map(b => (b.getAttribute('aria-label') || txt(b)).slice(0, 50))
    .filter(Boolean)
    .slice(0, 80);

  return {
    url: location.href,
    headings: headings.map(txt).slice(0, 80),
    textareas, comboboxes, fileInputs, images, buttons,
  };
}

// Selects a language in the listing-language combobox.
//   wanted — { code: 'fr' | null, names: ['French', …] }
// Options are matched primarily by their trailing CWS code ("French – fr",
// "English – en (default)"), with display names as fallback.
// Returns {ok, selected, confirmed, trigger} or {ok:false, step, …diagnostics}.
async function pageSelectLanguage(wanted) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

  const code = (wanted.code || '').toLowerCase();
  const names = (wanted.names || []).map(n => n.toLowerCase());
  const esc = code.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const codeEndRe = code ? new RegExp('[–—-]\\s*' + esc + '(\\s*\\(default\\))?$', 'i') : null;
  const codeAnyRe = code ? new RegExp('[–—-]\\s*' + esc + '\\b', 'i') : null;

  const pickOption = options => {
    if (codeEndRe) {
      const byCode = options.find(el => codeEndRe.test(txt(el)));
      if (byCode) return byCode;
    }
    const exact = options.find(el => names.includes(txt(el).toLowerCase()));
    if (exact) return exact;
    return options
      .filter(el => { const t = txt(el).toLowerCase(); return names.some(n => t.startsWith(n)); })
      .sort((a, b) => txt(a).length - txt(b).length)[0] || null;
  };

  const languageCombo = () => Array.from(document.querySelectorAll('[role="combobox"]'))
    .filter(visible).find(el => /^language/i.test(txt(el)));

  // Preferred trigger: the combobox labelled "Language…". Fallback: any combobox.
  const labelled = languageCombo();
  const attempts = labelled
    ? [labelled]
    : Array.from(document.querySelectorAll('[role="combobox"]')).filter(visible);
  if (!attempts.length) return { ok: false, step: 'no-combobox' };

  const seenOptions = [];
  for (const trigger of attempts) {
    trigger.click();
    await sleep(900);
    const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li'))
      .filter(visible)
      .filter(el => { const t = txt(el); return t && t.length < 80; });
    seenOptions.push(...options.map(txt));

    const target = pickOption(options);
    if (target) {
      const selected = txt(target);
      target.click();
      await sleep(1600);
      const after = languageCombo();
      const afterText = after ? txt(after) : '';
      const confirmed = codeAnyRe
        ? codeAnyRe.test(afterText)
        : names.some(n => afterText.toLowerCase().includes(n));
      return { ok: true, selected, confirmed, trigger: afterText.slice(0, 80) };
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
  }

  return {
    ok: false, step: 'language-not-found', wanted,
    optionsSeen: [...new Set(seenOptions)].slice(0, 60),
  };
}

// Finds the detailed-description textarea and (if apply) replaces its content
// using the native value setter + input/change events so the SPA registers it.
// With apply=false it only reports what it would target (dry run).
function pageSetDescription(text, apply) {
  const visible = el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const tas = Array.from(document.querySelectorAll('textarea')).filter(visible);
  if (!tas.length) return { ok: false, step: 'no-textarea' };

  const labelFor = ta => {
    const bits = [ta.getAttribute('aria-label'), ta.getAttribute('placeholder')];
    if (ta.id) bits.push(document.querySelector(`label[for="${CSS.escape(ta.id)}"]`)?.textContent);
    if (ta.labels) for (const l of ta.labels) bits.push(l.textContent);
    let node = ta;
    for (let i = 0; i < 5 && node; i++) {
      node = node.parentElement;
      const lbl = node?.querySelector?.('label, h1, h2, h3, h4, [role="heading"]');
      if (lbl) { bits.push(lbl.textContent); break; }
    }
    return bits.filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim();
  };

  const scored = tas
    .map(ta => ({ ta, label: labelFor(ta), area: ta.clientWidth * ta.clientHeight }))
    .map(x => ({ ...x, score: (/description|détaillée/i.test(x.label) ? 1000 : 0) + Math.min(x.area / 1000, 500) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Refuse to guess between several unlabelled textareas — writing the listing
  // text into the wrong field would be worse than aborting.
  if (scored.length > 1 && !/description|détaillée/i.test(best.label)) {
    return {
      ok: false, step: 'ambiguous-textarea',
      candidates: scored.slice(0, 5).map(x => ({ label: x.label.slice(0, 80), area: x.area })),
    };
  }

  if (!apply) return { ok: true, dryRun: true, label: best.label.slice(0, 80), currentLength: (best.ta.value || '').length };

  const ta = best.ta;
  ta.focus();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  ta.blur();
  return { ok: ta.value === text, step: 'done', label: best.label.slice(0, 80), length: ta.value.length };
}

// Counts screenshots in the given scope ('localized' | 'global') by their
// "Remove image Screenshot N" buttons — immune to the promo tiles that share
// the Global assets card. ok:false only when the card heading is missing.
function pageCountScreenshots(scope) {
  const visible = el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
    .filter(visible).filter(h => { const t = txt(h); return t && t.length < 80; });
  const cardRe = scope === 'global' ? /global assets/i : /localized assets/i;
  if (!headings.some(h => cardRe.test(txt(h)))) {
    return { ok: false, step: 'card-heading-not-found', scope, headingsSeen: headings.map(txt) };
  }
  const trail = el => headings
    .filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    .map(txt);
  const inCard = el => { const t = trail(el); return t.length > 0 && cardRe.test(t[t.length - 1]); };

  const count = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter(visible)
    .filter(b => /remove image screenshot/i.test(b.getAttribute('aria-label') || txt(b)))
    .filter(inCard)
    .length;
  return { ok: true, count, scope };
}

// Deletes the first screenshot of the scope by clicking its "Remove image
// Screenshot N" button (always visible), confirms a dialog if one appears,
// then waits for the count to drop. Returns {ok, before, after}.
async function pageDeleteOneScreenshot(scope) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

  const collect = () => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
      .filter(visible).filter(h => { const t = txt(h); return t && t.length < 80; });
    const trail = el => headings
      .filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
      .map(txt);
    const cardRe = scope === 'global' ? /global assets/i : /localized assets/i;
    const inCard = el => { const t = trail(el); return t.length > 0 && cardRe.test(t[t.length - 1]); };
    return Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(visible)
      .filter(b => /remove image screenshot/i.test(b.getAttribute('aria-label') || txt(b)))
      .filter(inCard);
  };

  const removeBtns = collect();
  const before = removeBtns.length;
  if (before === 0) return { ok: true, before: 0, after: 0, nothingToDelete: true };

  removeBtns[0].click();
  await sleep(600);

  // Confirmation dialog, if the console asks.
  const dlg = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).find(visible);
  if (dlg) {
    const confirm = Array.from(dlg.querySelectorAll('button, [role="button"]'))
      .filter(visible)
      .find(b => /delete|remove|yes|confirm|ok|supprimer/i.test(txt(b) + ' ' + (b.getAttribute('aria-label') || '')));
    if (confirm) { confirm.click(); await sleep(600); }
  }

  // Wait up to 10 s for the remove-button count to drop.
  const deadline = Date.now() + 10000;
  let after = before;
  while (Date.now() < deadline) {
    await sleep(500);
    after = collect().length;
    if (after < before) break;
  }
  return { ok: after < before, before, after };
}

// Injects one PNG into the screenshots file input of the scope via
// DataTransfer. The upload itself is asynchronous — the caller polls
// pageCountScreenshots. The input is hidden, so it is located through the
// visible "Drop image here" button of the card's screenshots group (the
// promo-tile inputs in Global assets have no drop button when filled), with
// the card-scoped inputs in document order as fallback. The "Drop image here"
// button itself is never clicked — that would open the OS file picker.
function pageUploadScreenshot(b64, filename, scope) {
  const visible = el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
    .filter(visible).filter(h => { const t = txt(h); return t && t.length < 80; });
  const trail = el => headings
    .filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    .map(txt);
  const cardRe = scope === 'global' ? /global assets/i : /localized assets/i;
  const inCard = el => { const t = trail(el); return t.length > 0 && cardRe.test(t[t.length - 1]); };

  let input = null;
  const drops = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter(visible)
    .filter(b => /drop image/i.test((b.getAttribute('aria-label') || '') + ' ' + txt(b)))
    .filter(inCard);
  for (const drop of drops) {
    let node = drop;
    for (let i = 0; i < 6 && node && !input; i++) {
      node = node.parentElement;
      input = node?.querySelector?.('input[type="file"]') || null;
    }
    if (input) break;
  }
  if (!input) input = Array.from(document.querySelectorAll('input[type="file"]')).find(inCard) || null;
  if (!input) {
    return {
      ok: false, step: 'no-screenshot-file-input', scope,
      dropButtons: drops.length,
      inputs: Array.from(document.querySelectorAll('input[type="file"]'))
        .map(i => ({ accept: i.getAttribute('accept'), trail: trail(i).slice(-3) })),
    };
  }

  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const file = new File([bytes], filename, { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, filename, size: bytes.length };
}

// ── driver (background context) ───────────────────────────────────────────────

async function cwsExec(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', func, args,
  });
  return results?.[0]?.result;
}

// Interface every store driver must expose (see background.js):
//   listingUrl, isLoginUrl, marketingDirParts, languageNames, probe,
//   selectLanguage, setDescription, countScreenshots, deleteOneScreenshot,
//   uploadScreenshot — screenshot ops take scope 'localized' | 'global'.
const CwsDriver = {
  id: 'cws',

  listingUrl: (config, item) =>
    `${CWS.BASE}/${config.publisher_id}/${item.id}/edit/listing?hl=en`,

  isLoginUrl: url => CWS.LOGIN_RE.test(url),

  // Path components under repo_root where this store's marketing assets live.
  marketingDirParts: item => ['dist', item.slug, 'marketing_chrome'],

  languageNames(locale) {
    return [locale.name, ...(CWS.ALT_NAMES[locale.internal] || [])];
  },

  probe: tabId => cwsExec(tabId, pageProbe),
  selectLanguage: (tabId, locale) =>
    cwsExec(tabId, pageSelectLanguage, [{ code: locale.cws, names: CwsDriver.languageNames(locale) }]),
  setDescription: (tabId, text, apply) =>
    cwsExec(tabId, pageSetDescription, [text, apply]),
  countScreenshots: (tabId, scope) => cwsExec(tabId, pageCountScreenshots, [scope]),
  deleteOneScreenshot: (tabId, scope) => cwsExec(tabId, pageDeleteOneScreenshot, [scope]),
  uploadScreenshot: (tabId, b64, filename, scope) =>
    cwsExec(tabId, pageUploadScreenshot, [b64, filename, scope]),
};
