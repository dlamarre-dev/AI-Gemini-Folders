// Side panel mode (#106): the popup page opened as popup.html?panel=1 in
// Chrome/Edge's side panel or Firefox's sidebar. A panel stays open across tab
// switches and for hours, so the behaviours that assumed a short-lived popup
// (fixed size, closing after a click, data read once at open) are switched by
// isPanelMode — and only by it.
const fs = require('fs');
const path = require('path');

global.isUnsafeKey = require('../src/utils').isUnsafeKey;
global.hasEntry = require('../src/utils').hasEntry;
require('../src/ui');
require('../src/popup-core');
const { openConversation } = require('../src/folders');

const setPanel = (on) => window.history.replaceState({}, '', on ? '/popup.html?panel=1' : '/popup.html');
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { setPanel(false); jest.useRealTimers(); });

describe('isPanelMode', () => {
  test('is true only for the ?panel URL the manifests point at', () => {
    setPanel(false);
    expect(window.isPanelMode()).toBe(false);
    setPanel(true);
    expect(window.isPanelMode()).toBe(true);
  });

  test.each(['ai-folders', 'gemini-folders'])('%s: side_panel opens popup.html in panel mode', (ext) => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extensions', ext, 'manifest.json'), 'utf8'));
    expect(m.side_panel.default_path).toBe('popup.html?panel=1');
    expect(m.permissions).toContain('sidePanel');
    // The panel adds no permission that warns: never "tabs" (§7).
    expect(m.permissions).not.toContain('tabs');
  });
});

describe('popup-only behaviours are switched off in the panel', () => {
  beforeEach(() => {
    window.close = jest.fn();
    chrome.tabs.create = jest.fn(() => Promise.resolve({ id: 99 }));
    chrome.tabs.update = jest.fn(() => Promise.resolve());
    chrome.tabs.query = jest.fn(() => Promise.resolve([]));
    chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
    chrome.storage.local.set = jest.fn(() => Promise.resolve());
    window.isSupportedTabUrl = () => true;
  });

  test('opening a conversation closes the popup', async () => {
    await openConversation('https://gemini.google.com/app/aaa');
    expect(window.close).toHaveBeenCalled();
  });

  test('opening a conversation leaves the panel open', async () => {
    setPanel(true);
    await openConversation('https://gemini.google.com/app/aaa');
    expect(chrome.tabs.create).toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  test('fitPopupToWindow does not cap a panel', () => {
    setPanel(true);
    document.body.style.maxHeight = '';
    Object.defineProperty(window, 'innerHeight', { value: 503, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 900, configurable: true });
    window.fitPopupToWindow();
    expect(document.body.style.maxHeight).toBe('');
  });
});

describe('live refresh of the library', () => {
  test('reacts to library keys, not to the panel\'s own UI state', () => {
    expect(window.touchesLibrary({ fdc0: {} })).toBe(true);
    expect(window.touchesLibrary({ fdcN: {} })).toBe(true);
    expect(window.touchesLibrary({ pdc3: {} })).toBe(true);
    expect(window.touchesLibrary({ folderParents: {} })).toBe(true);
    expect(window.touchesLibrary({ promptsDataCompressed: {} })).toBe(true);
    // Written by the panel itself on every chevron click: re-rendering on these
    // would loop.
    expect(window.touchesLibrary({ openFolders: {} })).toBe(false);
    expect(window.touchesLibrary({ openPrompts: {} })).toBe(false);
    expect(window.touchesLibrary({ usageStats: {} })).toBe(false);
  });

  test('renders once, debounced, after a burst of changes', () => {
    jest.useFakeTimers();
    const render = jest.fn();
    const r = window.createLibraryRefresher({ render, isBusy: () => false });
    r.onChanged({ fdc0: {} });
    r.onChanged({ fdcN: {} });
    expect(render).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(render).toHaveBeenCalledTimes(1);
  });

  test('never rebuilds under the user, and catches up once they are done', () => {
    jest.useFakeTimers();
    let busy = true;
    const render = jest.fn();
    const r = window.createLibraryRefresher({ render, isBusy: () => busy });
    r.onChanged({ fdc0: {} });
    jest.advanceTimersByTime(300);
    expect(render).not.toHaveBeenCalled();
    r.retry();                       // still busy: nothing
    jest.advanceTimersByTime(300);
    expect(render).not.toHaveBeenCalled();
    busy = false;
    r.retry();
    jest.advanceTimersByTime(300);
    expect(render).toHaveBeenCalledTimes(1);
    r.retry();                       // nothing pending any more
    jest.advanceTimersByTime(300);
    expect(render).toHaveBeenCalledTimes(1);
  });

  describe('panelIsBusy', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="customModal" style="display:none"></div>
        <input id="searchInput" />
        <div id="folderList"><input id="rename" /></div>
        <div id="promptList"><textarea id="body"></textarea></div>`;
      window.selectedChats = [];
      window.hasPendingPromptEdit = () => false;
    });

    test('is idle when nothing is in progress', () => {
      expect(window.panelIsBusy()).toBe(false);
    });

    test('a focused field inside a list is busy; the search box is not', () => {
      document.getElementById('rename').focus();
      expect(window.panelIsBusy()).toBe(true);
      document.getElementById('body').focus();
      expect(window.panelIsBusy()).toBe(true);
      document.getElementById('searchInput').focus();
      expect(window.panelIsBusy()).toBe(false);
    });

    test('an open modal, a bulk selection or an unwritten prompt edit is busy', () => {
      document.getElementById('customModal').style.display = 'flex';
      expect(window.panelIsBusy()).toBe(true);
      document.getElementById('customModal').style.display = 'none';
      window.selectedChats = [{ url: 'x' }];
      expect(window.panelIsBusy()).toBe(true);
      window.selectedChats = [];
      window.hasPendingPromptEdit = () => true;
      expect(window.panelIsBusy()).toBe(true);
    });
  });
});

describe('the title follows the active tab', () => {
  test('prefills, and a tab change refills, but never over what the user typed', async () => {
    document.body.innerHTML = '<input id="chatTitle" />';
    const input = document.getElementById('chatTitle');
    let title = 'Chat A';
    const run = window.createTitlePrefill(input, async () => title);

    await run(false);
    expect(input.value).toBe('Chat A');

    input.value = 'My own name';
    input.dispatchEvent(new Event('input'));
    title = 'Chat A (renamed by the site)';
    await run(false);
    expect(input.value).toBe('My own name');

    title = 'Chat B';
    await run(true);                 // the user switched tabs
    expect(input.value).toBe('Chat B');
  });

  test('watchActiveTab fires for this window only, and only in the panel', async () => {
    jest.useFakeTimers();
    const listeners = {};
    chrome.tabs.onActivated = { addListener: jest.fn((fn) => { listeners.activated = fn; }) };
    chrome.tabs.onUpdated = { addListener: jest.fn((fn) => { listeners.updated = fn; }) };
    chrome.windows.getCurrent = jest.fn(() => Promise.resolve({ id: 1 }));

    const inPopup = jest.fn();
    window.watchActiveTab(inPopup);
    expect(chrome.tabs.onActivated.addListener).not.toHaveBeenCalled();

    setPanel(true);
    const onChange = jest.fn();
    window.watchActiveTab(onChange);
    await Promise.resolve(); await Promise.resolve();

    listeners.activated({ tabId: 5, windowId: 2 });
    jest.advanceTimersByTime(400);
    expect(onChange).not.toHaveBeenCalled();

    listeners.activated({ tabId: 5, windowId: 1 });
    listeners.updated(5, { status: 'complete' }, { active: true, windowId: 1 });
    jest.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledTimes(1);

    listeners.updated(6, { status: 'complete' }, { active: false, windowId: 1 });
    jest.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('open-in-side-panel button', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="openSidePanelBtn" style="display:none"></button>';
  });

  test('a popup on a browser with the API shows it and opens the panel', async () => {
    chrome.windows.getCurrent = jest.fn(() => Promise.resolve({ id: 7 }));
    chrome.sidePanel = { open: jest.fn(() => Promise.resolve()) };
    window.close = jest.fn();
    window.initSidePanelButton();
    await flush();
    const btn = document.getElementById('openSidePanelBtn');
    expect(btn.style.display).toBe('flex');
    btn.click();
    await flush();
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(window.close).toHaveBeenCalled();
    delete chrome.sidePanel;
  });

  test('stays hidden inside the panel, and without the API', () => {
    setPanel(true);
    chrome.sidePanel = { open: jest.fn() };
    window.initSidePanelButton();
    expect(document.getElementById('openSidePanelBtn').style.display).toBe('none');
    setPanel(false);
    delete chrome.sidePanel;
    window.initSidePanelButton();
    expect(document.getElementById('openSidePanelBtn').style.display).toBe('none');
  });
});
