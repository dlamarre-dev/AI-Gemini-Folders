// Edge calls them Favorites, not bookmarks.
//
// chrome.bookmarks really does manipulate Favorites on Edge, so the mobile-sync
// tooltip was wrong twice over there: wrong brand and wrong noun. The brand is a
// language-independent swap build.py already does; the noun is not, which is why
// it lives as a second translated string rather than a substitution.
//
// syncFavoritesTooltip is a BUILD-ONLY key: build.py copies its message over
// syncBookmarksTooltip for the Edge target and then deletes it, so it must never
// reach a shipped locale. These tests cover the source side; the built side is
// covered by validate_build.py walking the three targets.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXTENSIONS = ['ai-folders', 'gemini-folders'];
const SHIPPED = 'syncBookmarksTooltip';
const BUILD_ONLY = 'syncFavoritesTooltip';

const localesOf = (ext) => {
  const dir = path.join(ROOT, 'extensions', ext, '_locales');
  return fs.readdirSync(dir).map((loc) => [loc, JSON.parse(
    fs.readFileSync(path.join(dir, loc, 'messages.json'), 'utf8'))]);
};

describe.each(EXTENSIONS)('%s Edge favorites wording', (ext) => {
  const locales = localesOf(ext);

  test('every locale carries the Edge variant', () => {
    expect(locales).toHaveLength(43);
    const missing = locales.filter(([, m]) => !m[BUILD_ONLY]).map(([loc]) => loc);
    expect(missing).toEqual([]);
  });

  // The stored string keeps "Chrome" on purpose: build.py's Edge swap turns it
  // into "Microsoft Edge". Storing it pre-branded would make the swap a no-op
  // here and leave the two keys differing in two places instead of one, which is
  // exactly what makes a translation reviewable.
  test('the Edge variant still says Chrome, for the brand swap to catch', () => {
    const wrong = locales
      .filter(([, m]) => !m[BUILD_ONLY].message.includes('Chrome'))
      .map(([loc]) => loc);
    expect(wrong).toEqual([]);
  });

  test('it never mentions another browser', () => {
    for (const [loc, m] of locales) {
      expect(m[BUILD_ONLY].message).not.toMatch(/Firefox|Microsoft Edge/);
      expect(loc).toBeTruthy();
    }
  });

  // Three languages already use Edge's own word for this — French, Italian and
  // Brazilian Portuguese all say favoris / preferiti / favoritos in Chrome too.
  // Everywhere else the two strings must actually differ, or the substitution
  // silently did nothing.
  test('it differs from the shipped string except where the word is already Edge\'s', () => {
    const IDENTICAL_BY_DESIGN = ['fr', 'it', 'pt_BR'];
    for (const [loc, m] of locales) {
      const same = m[BUILD_ONLY].message === m[SHIPPED].message;
      if (IDENTICAL_BY_DESIGN.includes(loc)) {
        expect(same).toBe(true);
      } else {
        expect(same).toBe(false);
      }
    }
  });

  // A substitution that dropped a clause would be invisible in a language nobody
  // on the team reads. Lengths cannot match exactly — the words differ — but an
  // order-of-magnitude change means something other than a noun was replaced.
  test('only a noun changed: the two strings stay comparable in length', () => {
    for (const [loc, m] of locales) {
      const shipped = m[SHIPPED].message.length;
      const variant = m[BUILD_ONLY].message.length;
      const ratio = variant / shipped;
      expect({ loc, ratio: Math.round(ratio * 100) / 100 })
        .toEqual({ loc, ratio: expect.any(Number) });
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.6);
    }
  });
});

// The two extensions share this string, so they must share its Edge variant too
// — a divergence would mean one of them was edited and the other forgotten.
test('both extensions carry the same Edge variant in every locale', () => {
  const [af, gf] = EXTENSIONS.map(localesOf);
  const byLocale = Object.fromEntries(gf.map(([loc, m]) => [loc, m[BUILD_ONLY].message]));
  for (const [loc, m] of af) {
    expect([loc, m[BUILD_ONLY].message]).toEqual([loc, byLocale[loc]]);
  }
});
