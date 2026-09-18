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

  // The supported-service count is a number in store copy, which is the worst
  // place for a stale claim: it is read by every visitor and it drifts silently
  // every time a site is added or retired. It went unnoticed when You.com was
  // retired precisely because nothing tied it to anything -- and grepping for
  // the old platform count misses it, since the listing counts the local LLM
  // too (17 sites + local = 18). So tie it to the registry instead of to a
  // literal, and let the registry be the only place a number is decided.
  test('the supported-service count matches the SITES registry', () => {
    const { SITES } = require('../extensions/ai-folders/site-config.js');
    // Retired entries survive for their colour and logo only, so they are not
    // services the listing may count; the local LLM is one, and is counted.
    const expected = Object.values(SITES).filter(s => !s.retired).length;

    // Bengali writes the number in Bengali digits. Normalize before reading.
    const toAscii = (s) => s.replace(/[\u09e6-\u09ef]/g,
      (d) => String(d.charCodeAt(0) - 0x09e6));

    const wrong = promoFiles('ai-folders').map(([name, text]) => {
      const heading = text.split('\n').filter(l => l.includes('\u{1F310}'));
      if (heading.length !== 1) return [name, `${heading.length} globe headings`];
      const n = toAscii(heading[0]).match(/\d+/);
      if (!n) return [name, 'no number in the heading'];
      return Number(n[0]) === expected ? null : [name, `says ${n[0]}, expected ${expected}`];
    }).filter(Boolean);

    expect(wrong).toEqual([]);
  });

  // Gemini Folders supports exactly one site and must not carry that heading:
  // a count there would be a claim about the other product.
  test('no Gemini Folders listing carries a service-count heading', () => {
    const bad = promoFiles('gemini-folders')
      .filter(([, t]) => t.includes('\u{1F310}'))
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
