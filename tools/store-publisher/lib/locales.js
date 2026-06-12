// The 43 store locales shared by both extensions.
//   internal — our repo notation (used in dist/ filenames)
//   cws      — Chrome Web Store language code (differs for nb/he/tl and uses
//              dashes for regional variants)
//   name     — label the CWS dev console shows in its language dropdown
//              (English console, hl=en); matched with tolerance, so a close
//              prefix like "English (United States)" still resolves.
// A future AMO driver adds its own code column here if Firefox notation
// diverges; everything else reads locales through the helpers below.

const LOCALES = [
  { internal: 'ar',    cws: 'ar',    name: 'Arabic' },
  { internal: 'bg',    cws: 'bg',    name: 'Bulgarian' },
  { internal: 'bn',    cws: 'bn',    name: 'Bengali' },
  { internal: 'ca',    cws: 'ca',    name: 'Catalan' },
  { internal: 'cs',    cws: 'cs',    name: 'Czech' },
  { internal: 'da',    cws: 'da',    name: 'Danish' },
  { internal: 'de',    cws: 'de',    name: 'German' },
  { internal: 'el',    cws: 'el',    name: 'Greek' },
  { internal: 'en',    cws: 'en',    name: 'English' },
  { internal: 'es',    cws: 'es',    name: 'Spanish' },
  { internal: 'et',    cws: 'et',    name: 'Estonian' },
  { internal: 'fi',    cws: 'fi',    name: 'Finnish' },
  { internal: 'fr',    cws: 'fr',    name: 'French' },
  { internal: 'he',    cws: 'iw',    name: 'Hebrew' },
  { internal: 'hi',    cws: 'hi',    name: 'Hindi' },
  { internal: 'hr',    cws: 'hr',    name: 'Croatian' },
  { internal: 'hu',    cws: 'hu',    name: 'Hungarian' },
  { internal: 'id',    cws: 'id',    name: 'Indonesian' },
  { internal: 'it',    cws: 'it',    name: 'Italian' },
  { internal: 'ja',    cws: 'ja',    name: 'Japanese' },
  { internal: 'ko',    cws: 'ko',    name: 'Korean' },
  { internal: 'lt',    cws: 'lt',    name: 'Lithuanian' },
  { internal: 'lv',    cws: 'lv',    name: 'Latvian' },
  { internal: 'ms',    cws: 'ms',    name: 'Malay' },
  { internal: 'nb',    cws: 'no',    name: 'Norwegian' },
  { internal: 'nl',    cws: 'nl',    name: 'Dutch' },
  { internal: 'pl',    cws: 'pl',    name: 'Polish' },
  { internal: 'pt_BR', cws: 'pt-BR', name: 'Portuguese (Brazil)' },
  { internal: 'pt_PT', cws: 'pt-PT', name: 'Portuguese (Portugal)' },
  { internal: 'ro',    cws: 'ro',    name: 'Romanian' },
  { internal: 'ru',    cws: 'ru',    name: 'Russian' },
  { internal: 'sk',    cws: 'sk',    name: 'Slovak' },
  { internal: 'sl',    cws: 'sl',    name: 'Slovenian' },
  { internal: 'sr',    cws: 'sr',    name: 'Serbian' },
  { internal: 'sv',    cws: 'sv',    name: 'Swedish' },
  { internal: 'sw',    cws: 'sw',    name: 'Swahili' },
  { internal: 'th',    cws: 'th',    name: 'Thai' },
  { internal: 'tl',    cws: 'fil',   name: 'Filipino' },
  { internal: 'tr',    cws: 'tr',    name: 'Turkish' },
  { internal: 'uk',    cws: 'uk',    name: 'Ukrainian' },
  { internal: 'vi',    cws: 'vi',    name: 'Vietnamese' },
  { internal: 'zh_CN', cws: 'zh-CN', name: 'Chinese (China)' },
  { internal: 'zh_TW', cws: 'zh-TW', name: 'Chinese (Taiwan)' },
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
