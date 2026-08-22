// Microsoft caps a store-listing description at 10,000 characters.
//
// 15 of the 86 promo texts are naturally over it — French by 755 — so build.py
// trims version-history lines off the tail for the Edge target only. The history
// sits last and its oldest entries are the least useful, so that is the cheapest
// thing to lose; Chrome (16,000) and AMO have room and are left alone.
//
// This test guards the SOURCE, not the build: it asks whether each promo text can
// still reach the cap by dropping only history. If someone adds three paragraphs
// of features to a long locale, the answer becomes no — and that should surface
// here, in the test job, rather than as a build failure or, worse, as a listing
// with its last section missing. tools/validate_build.py checks the built output.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXTENSIONS = ['ai-folders', 'gemini-folders'];
const EDGE_MAX = 10000;

// A version-history line. The word is translated — Filipino says "Bersyon" — so
// this matches the number, the one part that stays put across all 43 languages.
const HISTORY_LINE = /\d+\.\d/;

const promoFiles = (ext) => {
  const dir = path.join(ROOT, 'Marketing', ext);
  return fs.readdirSync(dir)
    .filter((f) => /^Promo.*\.txt$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
};

// Mirrors build.py's trim_description: drop trailing history lines until it
// fits, and refuse the moment the next line is not history.
function trimmable(text, limit) {
  let lines = text.split('\n');
  let dropped = 0;
  const joined = () => lines.join('\n');
  while (joined().length > limit) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return { ok: false, dropped, blocker: '(empty)' };
    const last = lines[lines.length - 1];
    if (!HISTORY_LINE.test(last)) {
      return { ok: false, dropped, blocker: last.slice(0, 70) };
    }
    lines.pop();
    dropped += 1;
  }
  return { ok: true, dropped };
}

describe.each(EXTENSIONS)('%s promo texts fit the Edge cap', (ext) => {
  const files = promoFiles(ext);

  test('there are 43 of them', () => {
    expect(files).toHaveLength(43);
  });

  test('every one reaches the cap by dropping only version history', () => {
    const blocked = files
      .map(([name, text]) => [name, trimmable(text, EDGE_MAX)])
      .filter(([, r]) => !r.ok)
      .map(([name, r]) => `${name}: ran out of history at "${r.blocker}"`);
    expect(blocked).toEqual([]);
  });

  // Headroom, not just feasibility. Trimming the whole history away to fit would
  // technically pass the test above while leaving a listing with no changelog at
  // all — and would mean the next feature paragraph breaks the build.
  test('no locale has to give up more than half its history', () => {
    const greedy = files
      .map(([name, text]) => {
        const history = text.split('\n').filter((l) => HISTORY_LINE.test(l)).length;
        const { dropped } = trimmable(text, EDGE_MAX);
        return [name, dropped, history];
      })
      .filter(([, dropped, history]) => history > 0 && dropped > history / 2)
      .map(([name, dropped, history]) => `${name}: ${dropped} of ${history} entries`);
    expect(greedy).toEqual([]);
  });

  // The ones that need trimming at all are worth naming: if this set grows a lot,
  // the promo texts are drifting long and the cap is the wrong thing to fix.
  test('the set that needs trimming stays small', () => {
    const trimmed = files.filter(([, text]) => text.length > EDGE_MAX);
    expect(trimmed.length).toBeLessThan(15);
  });
});

describe('build.py owns the cap', () => {
  const buildPy = fs.readFileSync(path.join(ROOT, 'build.py'), 'utf8');

  test('the Edge target declares it, and the other two do not', () => {
    expect(buildPy).toContain('"description_max": 10000,');
    // Two targets with no cap: Chrome's is far higher and AMO has room.
    expect(buildPy.match(/"description_max": None,/g)).toHaveLength(2);
  });

  test('the trim refuses rather than truncating', () => {
    expect(buildPy).toContain('if not HISTORY_LINE.search(lines[-1]):');
    expect(buildPy).toMatch(/Shorten the promo text itself/);
  });
});
