// The 43 store locales shared by both extensions.
//   internal — our repo notation (used in dist/ filenames)
//   cws      — Chrome Web Store language code (differs for nb/he/tl and uses
//              dashes for regional variants)
//   amo      — addons.mozilla.org code, or null when the locale is not in
//              AMO's production language list (PROD_LANGUAGES in
//              addons-server) and listing translations can't be saved for it.
//   name     — label the CWS dev console shows in its language dropdown
//              (English console, hl=en); matched with tolerance, so a close
//              prefix like "English (United States)" still resolves.
// This table is the single source of truth: the CWS extension loads it as a
// script, Jest requires it, and tools/store-publisher/amo_publish.py parses
// the LOCALES rows textually — keep the one-line-per-locale format.

const LOCALES = [
  { internal: 'ar',    cws: 'ar',    amo: null,     name: 'Arabic' },
  { internal: 'bg',    cws: 'bg',    amo: null,     name: 'Bulgarian' },
  { internal: 'bn',    cws: 'bn',    amo: null,     name: 'Bengali' },
  { internal: 'ca',    cws: 'ca',    amo: null,     name: 'Catalan' },
  { internal: 'cs',    cws: 'cs',    amo: 'cs',     name: 'Czech' },
  { internal: 'da',    cws: 'da',    amo: null,     name: 'Danish' },
  { internal: 'de',    cws: 'de',    amo: 'de',     name: 'German' },
  { internal: 'el',    cws: 'el',    amo: 'el',     name: 'Greek' },
  { internal: 'en',    cws: 'en',    amo: 'en-US',  name: 'English' },
  { internal: 'es',    cws: 'es',    amo: 'es-ES',  name: 'Spanish' },
  { internal: 'et',    cws: 'et',    amo: null,     name: 'Estonian' },
  { internal: 'fi',    cws: 'fi',    amo: 'fi',     name: 'Finnish' },
  { internal: 'fr',    cws: 'fr',    amo: 'fr',     name: 'French' },
  { internal: 'he',    cws: 'iw',    amo: 'he',     name: 'Hebrew' },
  { internal: 'hi',    cws: 'hi',    amo: null,     name: 'Hindi' },
  { internal: 'hr',    cws: 'hr',    amo: 'hr',     name: 'Croatian' },
  { internal: 'hu',    cws: 'hu',    amo: 'hu',     name: 'Hungarian' },
  { internal: 'id',    cws: 'id',    amo: null,     name: 'Indonesian' },
  { internal: 'it',    cws: 'it',    amo: 'it',     name: 'Italian' },
  { internal: 'ja',    cws: 'ja',    amo: 'ja',     name: 'Japanese' },
  { internal: 'ko',    cws: 'ko',    amo: 'ko',     name: 'Korean' },
  { internal: 'lt',    cws: 'lt',    amo: null,     name: 'Lithuanian' },
  { internal: 'lv',    cws: 'lv',    amo: null,     name: 'Latvian' },
  { internal: 'ms',    cws: 'ms',    amo: null,     name: 'Malay' },
  { internal: 'nb',    cws: 'no',    amo: 'nb-NO',  name: 'Norwegian' },
  { internal: 'nl',    cws: 'nl',    amo: 'nl',     name: 'Dutch' },
  { internal: 'pl',    cws: 'pl',    amo: 'pl',     name: 'Polish' },
  { internal: 'pt_BR', cws: 'pt-BR', amo: 'pt-BR',  name: 'Portuguese (Brazil)' },
  { internal: 'pt_PT', cws: 'pt-PT', amo: 'pt-PT',  name: 'Portuguese (Portugal)' },
  { internal: 'ro',    cws: 'ro',    amo: 'ro',     name: 'Romanian' },
  { internal: 'ru',    cws: 'ru',    amo: 'ru',     name: 'Russian' },
  { internal: 'sk',    cws: 'sk',    amo: 'sk',     name: 'Slovak' },
  { internal: 'sl',    cws: 'sl',    amo: 'sl',     name: 'Slovenian' },
  { internal: 'sr',    cws: 'sr',    amo: null,     name: 'Serbian' },
  { internal: 'sv',    cws: 'sv',    amo: 'sv-SE',  name: 'Swedish' },
  { internal: 'sw',    cws: 'sw',    amo: null,     name: 'Swahili' },
  { internal: 'th',    cws: 'th',    amo: null,     name: 'Thai' },
  { internal: 'tl',    cws: 'fil',   amo: null,     name: 'Filipino' },
  { internal: 'tr',    cws: 'tr',    amo: 'tr',     name: 'Turkish' },
  { internal: 'uk',    cws: 'uk',    amo: 'uk',     name: 'Ukrainian' },
  { internal: 'vi',    cws: 'vi',    amo: 'vi',     name: 'Vietnamese' },
  { internal: 'zh_CN', cws: 'zh-CN', amo: 'zh-CN',  name: 'Chinese (China)' },
  { internal: 'zh_TW', cws: 'zh-TW', amo: 'zh-TW',  name: 'Chinese (Taiwan)' },
];

// dist/<slug>/marketing_chrome/Promo<XX>.txt — historical quirk: zh_CN is
// PromoCN.txt, every other locale is the uppercased internal code.
function promoTxtName(internal) {
  return internal === 'zh_CN' ? 'PromoCN.txt' : `Promo${internal.toUpperCase()}.txt`;
}

// dist/<slug>/marketing_chrome/screenshots/Promo_<n>_<internal>.png, n = 1..5
function screenshotName(internal, index) {
  return `Promo_${index}_${internal}.png`;
}

const SCREENSHOTS_PER_LOCALE = 5;

// Parses the popup's locale-filter field:
//   ""            → all locales
//   "fr, de"      → only those (internal codes)
//   "from:pl"     → pl and everything after it (resume an aborted run)
function filterLocales(filterText) {
  const text = (filterText || '').trim().toLowerCase();
  if (!text) return LOCALES.slice();

  const fromMatch = text.match(/^from:\s*(\S+)$/);
  if (fromMatch) {
    const idx = LOCALES.findIndex(l => l.internal.toLowerCase() === fromMatch[1]);
    if (idx === -1) throw new Error(`Unknown locale in "from:" filter: ${fromMatch[1]}`);
    return LOCALES.slice(idx);
  }

  const wanted = text.split(',').map(s => s.trim()).filter(Boolean);
  const result = wanted.map(code => {
    const loc = LOCALES.find(l => l.internal.toLowerCase() === code);
    if (!loc) throw new Error(`Unknown locale in filter: ${code}`);
    return loc;
  });
  if (!result.length) throw new Error('Locale filter parsed to an empty list.');
  return result;
}

if (typeof module !== 'undefined') {
  module.exports = { LOCALES, promoTxtName, screenshotName, SCREENSHOTS_PER_LOCALE, filterLocales };
}
