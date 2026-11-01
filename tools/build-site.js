// Pre-renders aifolders.xyz: one home page and one privacy page per language.
//
//   node tools/build-site.js          write docs/**/index.html, privacy.html, sitemap.xml
//   node tools/build-site.js --check  exit 1 if any of them is out of date
//
// Why: the site used to ship an empty <main id="app"> filled by app.js from
// navigator.language. Crawlers saw English at best and nothing at worst, and the
// other 42 languages had no address at all, so no search engine could index them.
// Now every language has its own URL (/, /fr/, /pt-br/, ...), with its own
// title, description, Open Graph image, structured data and the full text in the
// HTML, all cross-linked with hreflang.
//
// The markup still comes from docs/site/app.js — the same builders, run here in a
// sandbox — so there is one template, not two. tests/site-pages.test.js fails
// when a committed page no longer matches what this script produces: after
// editing app.js, an i18n file or this script, run it and commit the output.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const SITE = path.join(DOCS, 'site');

function loadSite() {
  const window = { AF_SITE_PRERENDER: true };
  const ctx = vm.createContext({ window });
  for (const f of ['i18n-data.js', 'i18n-manual.js', 'logos.js', 'privacy-i18n.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(SITE, f), 'utf8'), ctx, { filename: f });
  }
  return window.AF_SITE;
}

// og:locale wants language_TERRITORY. Facebook's own list, where it has one.
const OG_LOCALE = {
  en: 'en_US', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', it: 'it_IT', pt_BR: 'pt_BR', pt_PT: 'pt_PT',
  nl: 'nl_NL', pl: 'pl_PL', ru: 'ru_RU', uk: 'uk_UA', cs: 'cs_CZ', sk: 'sk_SK', sl: 'sl_SI',
  hr: 'hr_HR', sr: 'sr_RS', bg: 'bg_BG', ro: 'ro_RO', hu: 'hu_HU', el: 'el_GR', tr: 'tr_TR',
  sv: 'sv_SE', da: 'da_DK', nb: 'nb_NO', fi: 'fi_FI', et: 'et_EE', lv: 'lv_LV', lt: 'lt_LT',
  ca: 'ca_ES', ar: 'ar_AR', he: 'he_IL', ja: 'ja_JP', ko: 'ko_KR', zh_CN: 'zh_CN', zh_TW: 'zh_TW',
  hi: 'hi_IN', bn: 'bn_IN', th: 'th_TH', vi: 'vi_VN', id: 'id_ID', ms: 'ms_MY', tl: 'tl_PH', sw: 'sw_KE',
};

// Google Fonts families per script. Each page asks only for its own script:
// the old single request pulled eleven Noto families on every page, all of it
// render-blocking. Language names in other scripts (the switcher) fall back to
// system fonts, which every OS has for them.
const FONT_FAMILY = {
  'Noto Sans Arabic': 'Noto+Sans+Arabic', 'Noto Sans Hebrew': 'Noto+Sans+Hebrew',
  'Noto Sans JP': 'Noto+Sans+JP', 'Noto Sans KR': 'Noto+Sans+KR', 'Noto Sans SC': 'Noto+Sans+SC',
  'Noto Sans TC': 'Noto+Sans+TC', 'Noto Sans Thai': 'Noto+Sans+Thai',
  'Noto Sans Devanagari': 'Noto+Sans+Devanagari', 'Noto Sans Bengali': 'Noto+Sans+Bengali',
};

const VERIFICATION = [
  'rfPHCbZ3tsxTSPoknHYfnFUnBYPO8C-VKSdT2DqbBoM',
  'YPsDagRrYCQLrg5bFf02P5PPEheCoVONuji9t34Qqs8',
];

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; object-src 'none'";

// A description longer than a result snippet is cut by the engine mid-word;
// cut it ourselves, on a word, so it ends cleanly.
function clip(text, max = 160) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

function fontsHref(S, lang) {
  const fams = ['Schibsted+Grotesk:wght@400;500;600;700;800;900', 'JetBrains+Mono:wght@400;500;600', 'Noto+Sans:wght@400;500;700'];
  const script = (S.SFONT[lang] || '').replace(/'/g, '');
  if (FONT_FAMILY[script]) fams.push(FONT_FAMILY[script] + ':wght@400;500;700');
  return 'https://fonts.googleapis.com/css2?' + fams.map((f) => 'family=' + f).join('&') + '&display=swap';
}

function jsonLd(obj) {
  // "</" cannot appear inside a <script> block.
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/')}\n</script>`;
}

function structuredData(S, lang, kind, url, title, description) {
  const o = S.SITE_ORIGIN;
  const hl = S.hreflang(lang);
  const website = { '@type': 'WebSite', '@id': `${o}/#website`, url: `${o}/`, name: 'AI Folders', inLanguage: hl };
  const page = {
    '@type': 'WebPage', '@id': url, url, name: title, description, inLanguage: hl,
    isPartOf: { '@id': `${o}/#website` },
  };
  if (kind === 'privacy') return { '@context': 'https://schema.org', '@graph': [website, page] };

  page.about = { '@id': `${o}/#ai-folders` };
  const storeUrls = (which) => S.stores(which).map((s) => S.LINKS[which === 'gem' ? s.gem : s.key]);
  const author = { '@type': 'Person', name: 'David Fugère-Lamarre', url: 'https://github.com/dlamarre-dev' };
  const browsers = S.stores().map((s) => s.label).join(', ');
  const name = S.appName(lang);
  const af = {
    '@type': 'SoftwareApplication', '@id': `${o}/#ai-folders`, name: 'AI Folders',
    ...(name !== 'AI Folders' ? { alternateName: name } : {}),
    description, url: `${o}${S.homeUrl(lang)}`,
    applicationCategory: 'BrowserApplication', applicationSubCategory: 'Productivity',
    operatingSystem: browsers,
    installUrl: S.LINKS.chrome, downloadUrl: S.LINKS.chrome,
    sameAs: [...storeUrls(), S.LINKS.github],
    screenshot: `${o}/site/assets/shots/folder-mode_${lang}.png`,
    image: `${o}/site/assets/icon-128.png`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    author,
    featureList: ['customFolders', 'promptLibrary', 'promptTrigger', 'oneClickInject', 'cloudSync',
      'mobileSync', 'tabGroups', 'multiSelect', 'dragDrop', 'quickSave', 'pinnedPrompts']
      .map((k) => S.dpath(lang, `feat.${k}.t`)).filter(Boolean),
    inLanguage: S.LANG_ORDER.map(S.hreflang),
  };
  const gf = {
    '@type': 'SoftwareApplication', '@id': `${o}/#gemini-folders`, name: 'Gemini Folders',
    ...(S.man(lang, 'gfName') !== 'Gemini Folders' ? { alternateName: S.man(lang, 'gfName') } : {}),
    applicationCategory: 'BrowserApplication', applicationSubCategory: 'Productivity',
    operatingSystem: S.stores('gem').map((s) => s.label).join(', '),
    installUrl: S.LINKS.gemChrome, downloadUrl: S.LINKS.gemChrome,
    sameAs: [...storeUrls('gem'), S.LINKS.github],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    author,
  };
  return { '@context': 'https://schema.org', '@graph': [website, page, af, gf] };
}

function renderPage(S, lang, kind) {
  const o = S.SITE_ORIGIN;
  const rel = kind === 'privacy' ? S.privacyUrl : S.homeUrl;
  const url = o + rel(lang);
  const hl = S.hreflang(lang);
  const dir = S.RTL.includes(lang) ? 'rtl' : 'ltr';
  const appName = S.appName(lang);

  let title, description, body;
  if (kind === 'privacy') {
    const p = S.privacy(lang);
    title = p.pageTitle;
    description = clip(p.intro);
    body = S.buildPrivacy(lang);
  } else {
    title = `${appName} — ${S.man(lang, 'heroTitle')}`;
    description = clip(`${S.dpath(lang, 'ui.extDesc')} ${S.dpath(lang, 'feat.promptLibrary.t')} · ` +
      `${S.man(lang, 'free')} · ${S.man(lang, 'openSource')}`, 170);
    body = S.build(lang);
  }
  const image = `${o}/site/assets/shots/folder-mode_${lang}.png`;
  const imageAlt = `${appName} — ${S.dpath(lang, 'ui.folderModeTitle')}`;
  const font = S.SFONT[lang];
  const e = S.esc;

  const alternates = S.LANG_ORDER.map((l) =>
    `<link rel="alternate" hreflang="${S.hreflang(l)}" href="${o}${rel(l)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${o}${rel('en')}">`).join('\n');

  // Search Console only looks for its token on the root page.
  const verify = kind === 'home' && lang === 'en'
    ? VERIFICATION.map((v) => `<meta name="google-site-verification" content="${v}">`).join('\n') + '\n' : '';

  const scripts = ['i18n-manual.js', 'app.js'].map((f) => `<script src="/site/${f}" defer></script>`).join('\n');

  return `<!doctype html>
<!-- Generated by tools/build-site.js from docs/site/app.js — do not edit by hand. -->
<html lang="${hl}" dir="${dir}" data-lang="${lang}" data-page="${kind}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
${alternates}
${verify}<meta name="theme-color" content="#0f1117">

<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="AI Folders">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="800">
<meta property="og:image:alt" content="${e(imageAlt)}">
<meta property="og:locale" content="${OG_LOCALE[lang] || hl.replace('-', '_')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${e(imageAlt)}">

${jsonLd(structuredData(S, lang, kind, url, title, description))}

<link rel="icon" type="image/svg+xml" href="/site/assets/icon.svg">
<link rel="icon" type="image/png" sizes="128x128" href="/site/assets/icon-128.png">
<link rel="apple-touch-icon" href="/site/assets/icon-128.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsHref(S, lang).replace(/&/g, '&amp;')}" rel="stylesheet">
<link rel="stylesheet" href="/site/styles.css">
<noscript><style>.reveal{opacity:1;transform:none}</style></noscript>
</head>
<body${font ? ` style="--font-script:${e(font)}"` : ''}>
<div class="bg-field"></div>
<div class="bg-stars" id="stars"></div>

${S.headerHTML(lang)}

<main id="app">${body}</main>

${scripts}
</body>
</html>
`;
}

function renderSitemap(S) {
  const urls = [];
  for (const rel of [S.homeUrl, S.privacyUrl]) {
    for (const l of S.LANG_ORDER) urls.push(S.SITE_ORIGIN + rel(l));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by tools/build-site.js. Language alternates are declared with hreflang in each page. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
}

// Map of path relative to docs/ -> content.
function renderAll() {
  const S = loadSite();
  const out = {};
  for (const lang of S.LANG_ORDER) {
    const dir = lang === 'en' ? '' : S.pathCode(lang) + '/';
    out[dir + 'index.html'] = renderPage(S, lang, 'home');
    out[dir + 'privacy.html'] = renderPage(S, lang, 'privacy');
  }
  out['sitemap.xml'] = renderSitemap(S);
  return out;
}

// Git may check these out with CRLF on Windows; compare content, not line endings.
const normalize = (s) => s.replace(/\r\n/g, '\n');

function stale(pages) {
  return Object.keys(pages).filter((rel) => {
    const file = path.join(DOCS, rel);
    return !fs.existsSync(file) || normalize(fs.readFileSync(file, 'utf8')) !== pages[rel];
  });
}

if (require.main === module) {
  const pages = renderAll();
  if (process.argv.includes('--check')) {
    const bad = stale(pages);
    if (bad.length) {
      console.error(`${bad.length} site page(s) out of date — run: node tools/build-site.js\n  ` + bad.join('\n  '));
      process.exit(1);
    }
    console.log(`Site pages up to date (${Object.keys(pages).length} files).`);
  } else {
    for (const [rel, content] of Object.entries(pages)) {
      const file = path.join(DOCS, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    console.log(`Wrote ${Object.keys(pages).length} files under docs/.`);
  }
}

module.exports = { renderAll, stale, normalize, OG_LOCALE };
