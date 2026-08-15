// Event-handler coverage for prompt-trigger.js (content script). The IIFE wires
// keydown/keyup listeners onto document; we drive them with a focused textarea
// and a mocked chrome.runtime.sendMessage. classifyTriggerField/parseSuggestionNames
// (pure) are covered separately in prompt-trigger.test.js.

require('../src/prompt-trigger.js'); // attaches the listeners to document

const flush = () => new Promise((r) => setTimeout(r, 0));

function focusedTextarea(value) {
  document.body.innerHTML = '<textarea id="ta"></textarea>';
  const ta = document.getElementById('ta');
  ta.value = value;
  ta.focus();
  ta.setSelectionRange(value.length, value.length);
  return ta;
}

// The listeners drop anything with isTrusted false, and jsdom cannot produce a
// trusted event, so behaviour is driven through the exported handlers. The gate
// itself is covered by the "synthetic events" block below, which dispatches real
// events through the listeners and asserts nothing happens.
const { onSpaceKeydown, onSpaceKeyup, onArrowKeydown, onTypingKeyup } = require('../src/prompt-trigger.js');

const fakeEvent = (key) => ({
  key,
  preventDefault: jest.fn(),
  stopImmediatePropagation: jest.fn(),
});

const press = (key) =>
  (key === 'ArrowDown' || key === 'ArrowUp')
    ? onArrowKeydown(fakeEvent(key))
    : onSpaceKeydown(fakeEvent(key));
const release = (key) =>
  key === ' ' ? onSpaceKeyup(fakeEvent(key)) : onTypingKeyup(fakeEvent(key));

// Real synthetic events, as hostile page JS would forge them.
const dispatch = (type, key) =>
  document.getElementById('ta').dispatchEvent(
    new KeyboardEvent(type, { key, bubbles: true })
  );

beforeEach(() => {
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({ status: 'no_match' });
});

describe('Space → trigger lookup', () => {
  test('sends a lookup with the name after # when the line is injectable', async () => {
    focusedTextarea('#Review');
    press(' ');
    await flush();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'promptTriggerLookup', prefix: 'Review' })
    );
  });

  test('re-inserts the space on a no_match', async () => {
    const ta = focusedTextarea('#Review');
    chrome.runtime.sendMessage.mockResolvedValue({ status: 'no_match' });
    press(' ');
    await flush();
    expect(ta.value).toBe('#Review ');
  });

  test('does NOT re-insert the space when the prompt was injected', async () => {
    const ta = focusedTextarea('#Review');
    chrome.runtime.sendMessage.mockResolvedValue({ status: 'injected' });
    press(' ');
    await flush();
    expect(ta.value).toBe('#Review');
  });

  test('ignores normal text that does not start with #', async () => {
    focusedTextarea('hello');
    press(' ');
    await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('Arrow keys → cycle suggestions', () => {
  const field = '#Review\n== Prompts ==\n#Review  #Refactor';

  test('ArrowDown moves to the next suggestion', () => {
    focusedTextarea(field);
    press('ArrowDown');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'promptTriggerCycleTab',
      name: 'Refactor',
      allNames: ['Review', 'Refactor'],
    });
  });

  test('ArrowUp wraps around to the last suggestion', () => {
    focusedTextarea(field);
    press('ArrowUp');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'promptTriggerCycleTab', name: 'Refactor' })
    );
  });

  test('does nothing without a visible suggestion block', () => {
    focusedTextarea('#Review'); // no "== label ==" line below
    press('ArrowDown');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('Live suggestion update (debounced)', () => {
  afterEach(() => jest.useRealTimers());

  test('asks for an updated suggestion list 80ms after a content key', () => {
    jest.useFakeTimers();
    focusedTextarea('#Rev');
    release('v');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled(); // debounced
    jest.advanceTimersByTime(80);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'promptTriggerSuggestUpdate', prefix: 'Rev' })
    );
  });

  test('does not fire inside a normal multi-line prompt', () => {
    jest.useFakeTimers();
    focusedTextarea('Some long prompt\nwith several lines\nof normal prose');
    release('e');
    jest.advanceTimersByTime(200);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SECURITY: page-forged events must never reach the prompt library
// ---------------------------------------------------------------------------

describe('synthetic events are ignored (isTrusted gate)', () => {
  afterEach(() => jest.useRealTimers());

  // Without the gate, script on a supported AI site could forge these keys to
  // enumerate every prompt title and then read each prompt's full body back out
  // of the composer — the whole library, with no user interaction.
  test('a forged Space on an injectable line asks for nothing', async () => {
    focusedTextarea('#Review');
    dispatch('keydown', ' ');
    await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('a forged bare "#" cannot enumerate the whole library', async () => {
    // An empty prefix matches every prompt (findPromptsByPrefix uses startsWith),
    // which is what made this the cheapest possible exfiltration primitive.
    focusedTextarea('#');
    dispatch('keydown', ' ');
    await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('forged arrow keys cannot cycle suggestions', () => {
    focusedTextarea('#Review\n== Prompts ==\n#Review  #Refactor');
    dispatch('keydown', 'ArrowDown');
    dispatch('keydown', 'ArrowUp');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('forged typing cannot drive live suggestions', () => {
    jest.useFakeTimers();
    focusedTextarea('#Rev');
    dispatch('keyup', 'v');
    jest.advanceTimersByTime(500);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('a forged Space is not swallowed either — the page keeps its own event', () => {
    // The suppression path must stay inert too, otherwise the gate would still
    // let a page interfere with its own key handling through us.
    focusedTextarea('#Review');
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.getElementById('ta').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
