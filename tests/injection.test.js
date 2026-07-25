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

// Block-based composers (Lexical on Kimi / Meta AI, ProseMirror on Claude /
// Mistral) render each line as its own <p>, so a correctly-injected multi-line
// prompt reads back with different whitespace than the source string. The
// insert fallback must not mistake that for a failed insert and fire a second
// injection on top of the first.
describe('injectPromptIntoEditor (block-based contenteditable)', () => {
  let editor, injectedData;

  // jsdom implements neither isContentEditable, innerText nor execCommand:
  // stand in for a Lexical-style editor that splits the inserted text into <p>.
  function makeBlockEditor({ ignoresInsertText = false } = {}) {
    document.body.innerHTML = '<div id="composer" contenteditable="true" role="textbox"></div>';
    editor = document.getElementById('composer');
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    Object.defineProperty(editor, 'innerText', {
      get: () => Array.from(editor.querySelectorAll('p')).map(p => p.textContent).join('\n'),
    });
    document.execCommand = jest.fn((cmd, _ui, value) => {
      if (ignoresInsertText) return true; // React/ProseMirror reverting the DOM
      if (cmd === 'delete') editor.innerHTML = '';
      if (cmd === 'insertText') {
        editor.innerHTML = '';
        for (const line of String(value).split('\n')) {
          const p = document.createElement('p');
          p.textContent = line;
          editor.appendChild(p);
        }
      }
      return true;
    });
    injectedData = [];
    editor.addEventListener('beforeinput', e => injectedData.push(e.data));
  }

  afterEach(() => { delete document.execCommand; });

  test('a multi-line prompt lands once — the beforeinput fallback stays silent', () => {
    makeBlockEditor();
    expect(injectPromptIntoEditor('line one\nline two\nline three', ['#composer'])).toBe(true);
    expect(Array.from(editor.querySelectorAll('p')).map(p => p.textContent))
      .toEqual(['line one', 'line two', 'line three']);
    expect(injectedData).toEqual([]); // no second injection
  });

  test('an editor that ignores insertText still gets the beforeinput fallback', () => {
    makeBlockEditor({ ignoresInsertText: true });
    expect(injectPromptIntoEditor('hello prompt', ['#composer'])).toBe(true);
    expect(injectedData).toEqual(['hello prompt']);
  });
});

// Lexical (Kimi) owns its selection model and adopts the DOM selection only on the
// browser's async 'selectionchange', so an execCommand replace runs against a
// selection it believes is collapsed at the start of the field: the delete is a
// no-op and the prompt lands *before* the "#name" trigger. The injection must go
// through the editor instance exposed on the root element instead.
describe('injectPromptIntoEditor (Lexical composer)', () => {
  let editor, lex, execSpy;

  const para = line => ({
    type: 'paragraph', version: 1, format: '', indent: 0, direction: 'ltr',
    children: line === '' ? [] : [{
      type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: line,
    }],
  });

  // Stands in for a Lexical editor: an authoritative serialized state rendered as
  // one <p> per paragraph, plus execCommand behaving as it does on Kimi — the
  // selection Lexical uses is collapsed at the start, so delete/selectAll are
  // no-ops and insertText lands *before* the existing text.
  function makeLexicalEditor({ trigger = '#name', unparsable = false } = {}) {
    document.body.innerHTML = '<div id="composer" contenteditable="true" role="textbox"></div>';
    editor = document.getElementById('composer');
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    Object.defineProperty(editor, 'innerText', {
      get: () => Array.from(editor.querySelectorAll('p')).map(p => p.textContent).join('\n'),
    });

    let state = { root: { type: 'root', version: 1, format: '', indent: 0, direction: 'ltr', children: [para(trigger)] } };
    const render = () => {
      editor.innerHTML = '';
      for (const node of state.root.children) {
        const p = document.createElement('p');
        p.textContent = (node.children || []).map(c => c.text ?? '').join('');
        editor.appendChild(p);
      }
    };
    render();

    lex = {
      getEditorState: () => ({ toJSON: () => JSON.parse(JSON.stringify(state)) }),
      parseEditorState: jest.fn(json => {
        if (unparsable) throw new Error('unsupported serialized node');
        return json;
      }),
      setEditorState: jest.fn(next => { state = next; render(); }),
      focus: jest.fn(),
    };
    editor.__lexicalEditor = lex;

    execSpy = jest.fn((cmd, _ui, value) => {
      if (cmd === 'insertText') {
        state.root.children = String(value).split('\n').map(para).concat(state.root.children);
        render();
      }
      return true;
    });
    document.execCommand = execSpy;
  }

  afterEach(() => { delete document.execCommand; });

  test('replaces the whole field — the "#name" trigger is gone', () => {
    makeLexicalEditor();
    expect(injectPromptIntoEditor('the prompt body', ['#composer'])).toBe(true);
    expect(editor.innerText).toBe('the prompt body');
    expect(execSpy).not.toHaveBeenCalled(); // execCommand never entered the picture
    expect(lex.focus).toHaveBeenCalledWith(undefined, { defaultSelection: 'rootEnd' });
  });

  test('a multi-line prompt becomes one paragraph per line', () => {
    makeLexicalEditor();
    expect(injectPromptIntoEditor('line one\nline two\nline three', ['#composer'])).toBe(true);
    expect(Array.from(editor.querySelectorAll('p')).map(p => p.textContent))
      .toEqual(['line one', 'line two', 'line three']);
  });

  test('the injected text carries no formatting inherited from the trigger', () => {
    makeLexicalEditor();
    injectPromptIntoEditor('plain', ['#composer']);
    const [[stateArg]] = lex.setEditorState.mock.calls;
    expect(stateArg.root.children[0].children[0]).toMatchObject({
      text: 'plain', format: 0, style: '', mode: 'normal', detail: 0,
    });
  });

  test('an unexpected Lexical shape falls back to the execCommand path', () => {
    makeLexicalEditor({ unparsable: true });
    expect(injectPromptIntoEditor('the prompt body', ['#composer'])).toBe(true);
    expect(lex.setEditorState).not.toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledWith('insertText', false, 'the prompt body');
  });

  test('forceClear sites keep their validated execCommand path', () => {
    makeLexicalEditor();
    injectPromptIntoEditor('the prompt body', ['#composer'], true);
    expect(lex.setEditorState).not.toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledWith('insertText', false, 'the prompt body');
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
