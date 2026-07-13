// Guard: Serbian (sr) is standardized on Latin script across this project.
// Cyrillic kept creeping back into the AF Serbian copy, so this test fails if any
// Cyrillic character reappears in a Serbian-facing file — both extensions' store
// locale and both Promo listings. Serbian Latin uses đ/ž/ć/č/š + lj/nj/dž digraphs;
// none of those are Cyrillic, so a clean Latin file matches zero of this range.
const fs = require('fs');
const path = require('path');

// Cyrillic + Cyrillic Supplement blocks.
const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/g;

const ROOT = path.join(__dirname, '..');
const SR_FILES = [
  'extensions/ai-folders/_locales/sr/messages.json',
  'extensions/gemini-folders/_locales/sr/messages.json',
  'Marketing/ai-folders/PromoSR.txt',
  'Marketing/gemini-folders/PromoSR.txt',
];

describe('Serbian stays in Latin script', () => {
  test.each(SR_FILES)('%s contains no Cyrillic', (rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = text.match(CYRILLIC) || [];
    // Surface a sample so a failure points straight at the offending characters.
    expect({ file: rel, cyrillicCount: hits.length, sample: hits.slice(0, 20).join('') })
      .toEqual({ file: rel, cyrillicCount: 0, sample: '' });
  });
});
