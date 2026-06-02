const {
  findPromptsByPrefix,
  injectPromptIntoEditor,
  insertSuggestionsInEditor,
} = require('../src/utils');

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
