const {
  findPromptsByPrefix,
  injectPromptIntoEditor,
  insertSuggestionsInEditor,
} = require('../src/utils');

// jsdom has no layout, so getBoundingClientRect returns zeros. Stub a rect big
// enough to pass the composer heuristic's size filter, at a given vertical pos.
function stubRect(el, bottom) {
  el.getBoundingClientRect = () => ({
    width: 400, height: 40, top: bottom - 40, bottom, left: 0, right: 400, x: 0, y: bottom - 40, toJSON() {},
  });
}

describe('findPromptsByPrefix', () => {
  const prompts = {
    'Review': { text: 'review body' },
    '🚀 Deploy': { text: 'deploy body' },
    'review code': { text: 'rc body' },
    'Legacy': 'plain string body',
  };

  test('case-insensitive prefix match', () => {
    const names = findPromptsByPrefix(prompts, 'rev').map(r => r.name).sort();
    expect(names).toEqual(['Review', 'review code']);
  });

  test('matches after stripping a leading emoji from the title', () => {
    expect(findPromptsByPrefix(prompts, 'dep')).toEqual([{ name: 'Deploy', text: 'deploy body' }]);
  });

  test('empty prefix returns all prompts', () => {
    expect(findPromptsByPrefix(prompts, '')).toHaveLength(4);
  });

  test('legacy string prompt value is read as its text', () => {
    expect(findPromptsByPrefix(prompts, 'legacy')).toEqual([{ name: 'Legacy', text: 'plain string body' }]);
  });

  test('no match returns an empty array', () => {
    expect(findPromptsByPrefix(prompts, 'zzz')).toEqual([]);
  });
});

// These run in the page (MAIN world) in production; here jsdom stands in. The
// key behaviour under test is editor *targeting* — the fix that stops the
// trigger from hijacking the main composer when the user is focused elsewhere.
describe('injectPromptIntoEditor (editor targeting)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<textarea id="main"></textarea><textarea id="other"></textarea>';
  });

  test('injects into the focused main editor', () => {
    const main = document.getElementById('main');
    main.focus();
    expect(injectPromptIntoEditor('hello prompt', ['#main'])).toBe(true);
    expect(main.value).toBe('hello prompt');
  });

  test('does NOT hijack: focused in a non-matching editable -> no-op', () => {
    const main = document.getElementById('main');
    const other = document.getElementById('other');
    other.value = 'my edit in progress';
    other.focus();
    expect(injectPromptIntoEditor('hello prompt', ['#main'])).toBe(false);
    expect(main.value).toBe('');                 // main composer untouched
    expect(other.value).toBe('my edit in progress'); // edit field untouched
  });

  test('falls back to the page editor when nothing editable is focused', () => {
    const main = document.getElementById('main');
    // No element focused → activeElement is <body> (not editable) → fallback.
    expect(injectPromptIntoEditor('hello prompt', ['#main'])).toBe(true);
    expect(main.value).toBe('hello prompt');
  });
});

describe('insertSuggestionsInEditor (editor targeting)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<textarea id="main"></textarea><textarea id="other"></textarea>';
  });

  test('writes the suggestion block into the focused main editor', () => {
    const main = document.getElementById('main');
    main.value = '#rev';
    main.focus();
    expect(insertSuggestionsInEditor(['review', 'revert'], ['#main'], 'AI Folders')).toBe(true);
    expect(main.value).toBe('#rev\n== AI Folders ==\nreview  revert');
  });

  test('does NOT hijack when focused in a non-matching editable', () => {
    const main = document.getElementById('main');
    document.getElementById('other').focus();
    expect(insertSuggestionsInEditor(['review'], ['#main'], 'AI Folders')).toBe(false);
    expect(main.value).toBe('');
  });
});

// Graceful degradation: when a site changes its DOM and the specific selectors
// stop matching, the trigger should still target the main chat box heuristically
// (the lowest sizeable text field) — without ever hijacking a different field.
describe('editor targeting: heuristic fallback when selectors are stale', () => {
  let warnSpy;
  beforeEach(() => {
    // The fallback intentionally console.warns (the stale-selector signal); mock
    // it to keep the test output clean and assert below that it actually fires.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<textarea id="top"></textarea><textarea id="composer"></textarea>';
    stubRect(document.getElementById('top'), 100);       // higher on the page
    stubRect(document.getElementById('composer'), 600);  // lowest = the chat composer
  });
  afterEach(() => warnSpy.mockRestore());

  test('focused composer + stale selectors -> still injects via fallback (and warns)', () => {
    const composer = document.getElementById('composer');
    composer.focus();
    expect(injectPromptIntoEditor('hi', ['#does-not-exist'])).toBe(true);
    expect(composer.value).toBe('hi');
    expect(warnSpy).toHaveBeenCalled(); // stale-selector signal fired
  });

  test('no focus + stale selectors -> injects into the bottom-most composer (and warns)', () => {
    expect(injectPromptIntoEditor('hi', ['#does-not-exist'])).toBe(true);
    expect(document.getElementById('composer').value).toBe('hi');
    expect(document.getElementById('top').value).toBe('');
    expect(warnSpy).toHaveBeenCalled();
  });

  test('focused in a NON-composer field -> still no hijack, and does NOT warn', () => {
    const top = document.getElementById('top'); // e.g. an "edit previous message" box, higher up
    top.value = 'editing';
    top.focus();
    expect(injectPromptIntoEditor('hi', ['#does-not-exist'])).toBe(false);
    expect(document.getElementById('composer').value).toBe(''); // composer untouched
    expect(top.value).toBe('editing');                          // edit field untouched
    expect(warnSpy).not.toHaveBeenCalled(); // no fallback used → no warning
  });
});
