// Store-listing claims must stay true (external audit, 2026-08).
//
// These guard the CONTENT of Marketing/*/Promo*.txt, not the tool that uploads
// it — which is why they stayed here when the store publisher moved out to its
// own repo. They read Marketing/ directly, not dist/, so they run without a build.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const promoFiles = (ext) => {
  const dir = path.join(ROOT, 'Marketing', ext);
  return fs.readdirSync(dir).filter(f => /^Promo.*\.txt$/.test(f))
    .map(f => [ext + '/' + f, fs.readFileSync(path.join(dir, f), 'utf8')]);
};

describe('Promo listings make no false claims', () => {
  const all = [...promoFiles('ai-folders'), ...promoFiles('gemini-folders')];

  test('there are 43 listings per extension', () => {
    expect(promoFiles('ai-folders')).toHaveLength(43);
    expect(promoFiles('gemini-folders')).toHaveLength(43);
  });

  // MV3 blocks remotely hosted code; it does NOT block packaged runtime
  // injection, and both extensions use chrome.scripting.executeScript on
  // purpose. Claiming otherwise in a store listing is a reviewable falsehood.
  test('no listing claims Manifest V3 prevents dynamic script execution', () => {
    const DYNAMIC = /dynami|динамич|動的|ダイナミ|동적|dinâm|dinam|dynamis|δυναμικ|ديناميك|ডায়নামিক|डायनामिक|ไดนามิก|dünaamili|dinamis|dynaamis/i;
    const bad = all
      .filter(([, t]) => (t.split('\n').find(l => /Manifest V3/i.test(l)) || '').match(DYNAMIC))
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  // The AI Folders trigger works on every supported site and on a local LLM.
  // Only Gemini Folders may say "Gemini" here.
  test('the AI Folders trigger bullet does not say the field is Gemini’s', () => {
    const bad = promoFiles('ai-folders')
      .filter(([, t]) => t.split('\n').some(l => /⌨/.test(l) && /#/.test(l) && /Gemini/.test(l)))
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });
});
