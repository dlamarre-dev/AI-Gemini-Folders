/* uninstall.js — renders the uninstall feedback form for both extensions.
   Loaded by uninstall-ai-folders.html / uninstall-gemini-folders.html, which set
   window.UF_PRODUCT to 'af' or 'gf' before this script runs.

   Nothing is transmitted on load. The URL params written by the extension
   (see buildUninstallUrl in src/utils.js) stay on the device until the user
   presses Send:
     l  UI language      v  extension version     b  chrome | firefox
     i  install date (YYYY-MM-DD)                 ie 1 when that date is estimated
     o  popup opens        s  conversations saved

   Adding a reason here means adding the same option to BOTH Google Forms first:
   Google silently drops a whole response that carries an option it does not know.

   Responses go to a Google Form (no database to maintain), wired up in
   uninstall-forms.js. The Form is the schema: its checkbox options MUST be
   exactly the English reason values below — Google silently rejects a response
   carrying an option it does not know, and translated labels would make the
   response sheet unanalyzable. */
(function () {
  'use strict';

  const GITHUB = 'https://github.com/dlamarre-dev/AI-Gemini-Folders';
  // Guards against a second POST if the same page is submitted twice (double
  // click, reload). Deliberately sessionStorage, not localStorage: a no-cors
  // response is opaque, so a rejected submission (a 401 from an unpublished Form,
  // a server error) still resolves and gets marked as sent. In localStorage that
  // verdict would be permanent — a later, genuine uninstall would silently never
  // reach us. Per-tab is the right lifetime for "already answered on this page".
  const SENT_KEY = 'af_uninstall_sent';

  // Stable submitted values ↔ localized label keys. The order is the display order.
  const COMMON_REASONS = [
    { value: 'not-what-expected',   key: 'optNotExpected' },
    { value: 'dont-understand-how', key: 'optDontUnderstand' },
    { value: 'wanted-in-page-ui',   key: 'optWantedInPage' },
    { value: 'found-bugs',          key: 'optFoundBugs' },
    // Added 2026-08: a quarter of respondents submitted with nothing checked and
    // most who ticked 'other' left the text box empty — the list was missing their
    // reason. These two are the usual suspects behind a silent 'other'.
    { value: 'no-longer-needed',    key: 'optNoLongerNeeded' },
    { value: 'found-alternative',   key: 'optFoundAlternative' },
    { value: 'other',               key: 'optOther' },
  ];

  // Gemini Folders only, and shown first: leaving for AI Folders is an upgrade,
  // not a complaint, and lumping it in with the grievances would misread the
  // numbers. `afName` makes the label name the *other* product, so it stays
  // "AI Folders" even though this page is about Gemini Folders.
  const SWITCH_REASON = { value: 'switched-to-ai-folders', key: 'optSwitchedToAf', afName: true };

  const I18N = window.UF_I18N || {};
  const NAMES = window.UF_NAMES || {};
  const LANGS = window.AF_LANGS || { en: 'English' };
  const RTL = window.AF_RTL || [];
  const SFONT = window.AF_SCRIPT_FONT || {};
  const LOGOS = window.AF_LOGOS || {};
  const product = window.UF_PRODUCT === 'gf' ? 'gf' : 'af';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Per-key English fallback, same contract as app.js's man()/dpath().
  function t(lang, key) {
    return (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || '';
  }
  function nameOf(lang, which) {
    const n = NAMES[lang] || NAMES.en || {};
    return n[which] || (NAMES.en || {})[which] || 'AI Folders';
  }
  function productName(lang) { return nameOf(lang, product); }
  // "{p}" is the only placeholder in the strings.
  function fill(str, name) { return String(str).split('{p}').join(name); }

  // The reason list, in display order, for the product being uninstalled.
  // A reason whose label resolves to nothing is dropped rather than rendered as a
  // blank checkbox: uninstall.js and uninstall-i18n.js are separate files, so a
  // browser holding a stale copy of one can pair a known value with a missing
  // string. An option nobody can read is worse than one option fewer.
  function reasons(lang) {
    const all = product === 'gf' ? [SWITCH_REASON].concat(COMMON_REASONS) : COMMON_REASONS;
    // t() already falls back to English per key, so an empty label here means the
    // string is missing everywhere — nothing sensible left to show.
    return all.filter(r => reasonLabel(lang, r));
  }
  function reasonLabel(lang, r) {
    return fill(t(lang, r.key), nameOf(lang, r.afName ? 'af' : product)).trim();
  }

  // --- URL context -----------------------------------------------------------

  // Read the fragment, not the query: the browser opens this page unprompted, so
  // anything in the query string would have been transmitted to the host before
  // the user consented to anything. Fragments never leave the browser.
  // The query is still accepted as a fallback — setUninstallURL captures its value
  // long before the page opens, so an extension that has not run since the switch
  // still holds a '?' URL. Remove the fallback once that has aged out.
  const params = new URLSearchParams(
    window.location.hash.slice(1) || window.location.search
  );

  // The extension already normalizes the tag ('pt-BR' → 'pt_BR'); this also
  // covers hand-typed URLs and direct visits with no param at all.
  function resolveLang() {
    const raw = params.get('l');
    if (raw && LANGS[raw]) return raw;
    if (raw) {
      const base = raw.replace('-', '_').split('_')[0];
      if (LANGS[base]) return base;
    }
    const nav = (navigator.language || 'en').toLowerCase();
    const map = { 'pt-br': 'pt_BR', pt: 'pt_PT', 'zh-cn': 'zh_CN', zh: 'zh_CN', 'zh-tw': 'zh_TW', no: 'nb' };
    if (map[nav] && LANGS[map[nav]]) return map[nav];
    const base = nav.split('-')[0];
    return LANGS[base] ? base : 'en';
  }

  // Days are derived here rather than baked into the URL: the uninstall URL is
  // set long before the browser opens it, so a stored count would be stale.
  function tenureDays() {
    const iso = params.get('i');
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const then = Date.parse(iso + 'T00:00:00Z');
    if (isNaN(then)) return null;
    return Math.max(0, Math.floor((Date.now() - then) / 86400000));
  }

  const ctx = {
    days: tenureDays(),
    daysExact: params.get('ie') === '1' ? 'no' : 'yes',
    opens: params.get('o') || '',
    // '0' is a string, so it survives the falsy check below and is reported: a
    // zero here is the whole point (installed, never saved anything).
    saves: params.get('s') || '',
    version: params.get('v') || '',
    browser: params.get('b') || '',
  };

  // --- Markup ----------------------------------------------------------------

  // The mark is sized by its container (34px in the header, 24px in the footer),
  // so the img must fill it — .logo-img, the same class LOGOS.firefox uses. Fixed
  // width/height attributes here overflowed the 24px footer slot and pushed the
  // AI Folders icon below the baseline. The GF mark is an inline SVG, already
  // covered by styles.css's `.brand .mark svg` rule.
  function mark() {
    return product === 'gf'
      ? (LOGOS.geminiFolders || '')
      : '<img src="site/assets/icon.svg" alt="" class="logo-img">';
  }

  function build(lang) {
    const name = productName(lang);
    const opts = reasons(lang).map((r, idx) => `
          <label class="uf-opt">
            <input type="checkbox" value="${esc(r.value)}" data-reason="${idx}">
            <span>${esc(reasonLabel(lang, r))}</span>
          </label>`).join('');

    return `
    <div class="container">
      <div class="hero-lang-row">
        <div class="lang" id="langWrap">
          <button class="lang-btn" id="langBtn" aria-haspopup="true" aria-expanded="false">
            <span class="globe">🌐</span><span id="langLabel">${esc(LANGS[lang])}</span><span class="chev">▾</span>
          </button>
          <div class="lang-menu" id="langMenu" role="menu"></div>
        </div>
      </div>
    </div>

    <section class="privacy-page">
      <div class="container privacy-page-inner">
        <div class="uf-brand"><span class="uf-mark">${mark()}</span>${esc(name)}</div>
        <!-- The ask is hidden once answered: "two short questions" makes no sense
             above a thank-you panel. The product line above it stays. -->
        <div id="ufAsk">
          <h1 class="h1">${esc(t(lang, 'heading'))}</h1>
          <p class="privacy-intro">${esc(fill(t(lang, 'intro'), name))}</p>
        </div>

        <form id="ufForm" novalidate>
          <h2 class="h3">${esc(fill(t(lang, 'q1'), name))}</h2>
          <p class="uf-hint">${esc(t(lang, 'q1Hint'))}</p>
          <div class="uf-opts">${opts}</div>
          <input type="text" id="ufOther" class="uf-input" hidden
                 placeholder="${esc(t(lang, 'otherPlaceholder'))}"
                 aria-label="${esc(t(lang, 'otherPlaceholder'))}" maxlength="500">

          <h2 class="h3">${esc(t(lang, 'q2'))}</h2>
          <textarea id="ufComments" class="uf-textarea" rows="5" maxlength="3000"
                    placeholder="${esc(t(lang, 'q2Placeholder'))}"
                    aria-label="${esc(t(lang, 'q2'))}"></textarea>

          <div class="uf-privacy">
            <div class="uf-privacy-title">${esc(t(lang, 'privacyTitle'))}</div>
            <p>${esc(t(lang, 'privacyBody'))}</p>
          </div>

          <!-- Honeypot: off-screen and unlabeled, so only bots fill it. -->
          <input type="text" id="ufHp" class="uf-hp" tabindex="-1" autocomplete="off" aria-hidden="true">

          <button type="submit" class="btn btn-md btn-primary uf-submit" id="ufSubmit">${esc(t(lang, 'submit'))}</button>
        </form>

        <div class="uf-result" id="ufResult" hidden></div>
      </div>
    </section>

    <footer class="footer">
      <div class="container footer-inner">
        <div class="brand"><span class="mark">${mark()}</span>${esc(name)}</div>
        <div class="footer-links">
          <a href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
          <a href="/privacy.html">${esc(privacyLink(lang))}</a>
        </div>
      </div>
    </footer>`;
  }

  function privacyLink(lang) {
    const p = window.AF_PRIVACY || {};
    return ((p[lang] || p.en) || {}).navLink || 'Privacy Policy';
  }

  function thanksMarkup(lang) {
    return `<h2 class="h3 uf-result-title">${esc(t(lang, 'thanksTitle'))}</h2>
      <p>${esc(t(lang, 'thanksBody'))}</p>
      <a class="btn btn-md btn-ghost" href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>`;
  }

  function failMarkup(lang) {
    return `<h2 class="h3 uf-result-title">${esc(t(lang, 'failTitle'))}</h2>
      <p>${esc(t(lang, 'failBody'))}</p>
      <div class="uf-result-actions">
        <button type="button" class="btn btn-md btn-ghost" id="ufCopy">${esc(t(lang, 'copyBtn'))}</button>
        <a class="btn btn-md btn-ghost" href="${GITHUB}/issues/new" target="_blank" rel="noopener">GitHub</a>
      </div>`;
  }

  // --- Submission ------------------------------------------------------------

  function collect() {
    const reasons = Array.from(document.querySelectorAll('.uf-opt input:checked')).map(el => el.value);
    return {
      reasons,
      other: reasons.includes('other') ? document.getElementById('ufOther').value.trim() : '',
      comments: document.getElementById('ufComments').value.trim(),
    };
  }

  // Plain-text version of the answer, for the clipboard fallback.
  function asText(lang, answer) {
    const labels = {};
    reasons(lang).forEach(r => { labels[r.value] = reasonLabel(lang, r); });
    const lines = [productName(lang), ''];
    if (answer.reasons.length) lines.push(answer.reasons.map(v => '- ' + (labels[v] || v)).join('\n'));
    if (answer.other) lines.push(answer.other);
    if (answer.comments) lines.push('', answer.comments);
    return lines.join('\n');
  }

  function send(answer) {
    const cfg = (window.UF_FORMS || {})[product];
    if (!cfg || !cfg.formId || cfg.formId.indexOf('PASTE') === 0) {
      // Not wired up yet. Never surface this to the user — it is a maintainer
      // problem, and the survey is not worth an error message on the way out.
      console.warn('[uninstall survey] Google Form ids are not configured yet — nothing was sent.');
      return Promise.resolve();
    }
    const f = cfg.fields;
    const body = new URLSearchParams();
    // Checkboxes repeat the same entry key, once per checked option.
    answer.reasons.forEach(v => body.append(f.reasons, v));
    if (answer.other) body.append(f.other, answer.other);
    if (answer.comments) body.append(f.comments, answer.comments);
    if (ctx.days != null) body.append(f.days, String(ctx.days));
    body.append(f.daysExact, ctx.daysExact);
    if (ctx.opens) body.append(f.opens, ctx.opens);
    // Guarded on the field id too, so this page is safe to ship before the `saves`
    // question exists on the Form: an entry key the Form does not know would cost
    // us the whole response, not just this value.
    if (ctx.saves && f.saves && f.saves.indexOf('PASTE') !== 0) body.append(f.saves, ctx.saves);
    if (ctx.version) body.append(f.version, ctx.version);
    if (ctx.browser) body.append(f.browser, ctx.browser);
    body.append(f.lang, current);
    body.append('fvv', '1');
    body.append('pageHistory', '0');

    // no-cors: Google Forms sends no CORS headers, so the response is opaque and
    // success cannot be read back. A rejection here means the request never left
    // (offline, content blocker) — that is the only case worth reporting.
    return fetch('https://docs.google.com/forms/d/e/' + cfg.formId + '/formResponse',
                 { method: 'POST', mode: 'no-cors', body });
  }

  function showResult(lang, html) {
    const form = document.getElementById('ufForm');
    const out = document.getElementById('ufResult');
    form.hidden = true;
    document.getElementById('ufAsk').hidden = true;
    out.innerHTML = html;
    out.hidden = false;
    out.setAttribute('tabindex', '-1');
    out.focus();
  }

  function wire(lang) {
    const form = document.getElementById('ufForm');
    const other = document.getElementById('ufOther');
    const otherBox = document.querySelector('.uf-opt input[value="other"]');

    otherBox.addEventListener('change', () => {
      other.hidden = !otherBox.checked;
      if (otherBox.checked) other.focus();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = document.getElementById('ufSubmit');
      if (btn.disabled) return;
      // A bot filled the honeypot: pretend it worked, send nothing.
      if (document.getElementById('ufHp').value) { showResult(lang, thanksMarkup(lang)); return; }

      const answer = collect();
      btn.disabled = true;
      btn.textContent = t(lang, 'sending');

      let already = false;
      try { already = sessionStorage.getItem(SENT_KEY) === product; } catch (_) {}
      const done = already ? Promise.resolve() : send(answer);

      done.then(() => {
        try { sessionStorage.setItem(SENT_KEY, product); } catch (_) {}
        showResult(lang, thanksMarkup(lang));
      }).catch(() => {
        showResult(lang, failMarkup(lang));
        const copy = document.getElementById('ufCopy');
        copy.addEventListener('click', () => {
          const text = asText(lang, answer);
          const mark = () => { copy.textContent = t(lang, 'copiedBtn'); };
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(mark, mark);
          else mark();
        });
      });
    });
  }

  // --- Language switcher (same markup/behaviour as the rest of the site) ------

  let current = 'en';

  function buildMenu(lang) {
    const menu = document.getElementById('langMenu');
    menu.innerHTML = Object.keys(LANGS).map(l =>
      `<button class="lang-opt${l === lang ? ' active' : ''}" data-lang="${l}">` +
      `<span>${esc(LANGS[l])}</span><span class="code">${l.replace('_', '-')}</span></button>`).join('');
    menu.querySelectorAll('.lang-opt').forEach(b =>
      b.addEventListener('click', () => render(b.getAttribute('data-lang'))));
    document.getElementById('langBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('langWrap').classList.toggle('open');
    });
  }

  function applyLangMeta(lang) {
    const html = document.documentElement;
    html.setAttribute('lang', lang.replace('_', '-'));
    html.setAttribute('dir', RTL.indexOf(lang) !== -1 ? 'rtl' : 'ltr');
    document.body.style.setProperty('--font-script', SFONT[lang] || "'Schibsted Grotesk'");
  }

  function render(lang) {
    if (!LANGS[lang]) lang = 'en';
    current = lang;
    applyLangMeta(lang);
    document.getElementById('app').innerHTML = build(lang);
    document.title = productName(lang) + ' — ' + t(lang, 'heading');
    const brand = document.getElementById('brandName');
    if (brand) brand.textContent = productName(lang);
    buildMenu(lang);
    wire(lang);
  }

  function init() {
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('langWrap');
      if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
    });
    render(resolveLang());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
