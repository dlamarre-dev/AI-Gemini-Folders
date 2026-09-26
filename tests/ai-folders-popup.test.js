// AI Folders' popup.js: the local-LLM button.
//
// popup.js wires everything inside DOMContentLoaded and leans on globals from
// the shared scripts loaded before it (utils.js, site-config.js, popup-core.js,
// prompts.js). Those are stubbed here; only the button handlers are under test.

const { SITES, getSiteByUrl, canSaveSite, normalizeLocalLlmUrl } = require('../extensions/ai-folders/site-config.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mountPopup({ localLlmUrl = '' } = {}) {
  document.body.innerHTML = `
    <input id="chatTitle" />
    <div id="siteNewConvRow"></div>`;
  Object.assign(global, {
    SITES, getSiteByUrl, canSaveSite, normalizeLocalLlmUrl,
    applyCommonI18n: jest.fn(),
    initPopupCommon: jest.fn(),
    initPromptsUI: jest.fn(),
    initSaveConversation: jest.fn(),
    extractAITitleLogic: jest.fn(),
    injectPromptIntoEditor: jest.fn(),
  });
  window.matchMedia = jest.fn(() => ({ matches: false }));
  window.showCustomModal = jest.fn(() => Promise.resolve(null));
  chrome.storage.sync.get = jest.fn((_keys, cb) => cb({ localLlmUrl }));
  chrome.tabs.query = jest.fn(() => Promise.resolve([]));
  chrome.tabs.create = jest.fn();

  jest.isolateModules(() => require('../extensions/ai-folders/popup.js'));
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
  return document.getElementById('newConvLocal');
}

const mouse = (el, type, button) => el.dispatchEvent(new MouseEvent(type, { button, bubbles: true }));

describe('local LLM button', () => {
  afterEach(() => jest.useRealTimers());

  test('a short left click opens the configured local LLM', async () => {
    const btn = await mountPopup({ localLlmUrl: 'http://localhost:3000' });
    mouse(btn, 'mousedown', 0);
    mouse(btn, 'mouseup', 0);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'http://localhost:3000' });
  });

  // A right-click also fires mousedown/mouseup with button 2. The mouseup used
  // to take it for a short click: the URL box flashed open, then a new tab
  // opened and closed the popup.
  test('a right-click opens the URL box and never a new tab', async () => {
    const btn = await mountPopup({ localLlmUrl: 'http://localhost:3000' });
    mouse(btn, 'mousedown', 2);
    btn.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    mouse(btn, 'mouseup', 2);
    await flush();
    expect(window.showCustomModal).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('a long right-press does not open the URL box a second time', async () => {
    const btn = await mountPopup({ localLlmUrl: 'http://localhost:3000' });
    jest.useFakeTimers();
    mouse(btn, 'mousedown', 2);
    btn.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
    jest.advanceTimersByTime(2000);
    mouse(btn, 'mouseup', 2);
    expect(window.showCustomModal).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
