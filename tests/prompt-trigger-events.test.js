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

const press = (key) =>
  document.getElementById('ta').dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true })
  );
const release = (key) =>
  document.getElementById('ta').dispatchEvent(
    new KeyboardEvent('keyup', { key, bubbles: true })
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
