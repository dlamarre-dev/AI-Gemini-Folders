// Which tab opens on install, and which on update.
//
// Both background.js call openWelcomeTab and openWhatsNewTab from the same
// onInstalled listener, one line apart, and only their `reason` guards keep them
// apart. That is a property no other test covers: the existing ones check each
// guard's source text, so a refactor that made both fire — or neither — would go
// unnoticed. This one runs the real listener and counts the tabs.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifestVersion = (ext) => JSON.parse(fs.readFileSync(
  path.join(ROOT, 'extensions', ext, 'manifest.json'), 'utf8')).version;

// Loads a service worker the way the browser does — top level only registers
// listeners — and hands back the onInstalled one.
const notesVersion = (ext) => fs.readFileSync(
  path.join(ROOT, 'extensions', ext, 'background.js'), 'utf8')
  .match(/const WHATS_NEW_VERSION = '([^']+)'/)[1];

function loadBackground(ext, { version = manifestVersion(ext) } = {}) {
  jest.resetModules();

  const local = {};   // in-memory storage.local, so whatsNewSeenFor survives
  let onInstalled = null;
  const noop = { addListener: () => {} };

  chrome.runtime.onInstalled = { addListener: (fn) => { onInstalled = fn; } };
  chrome.runtime.onStartup = noop;
  chrome.runtime.onMessage = noop;
  chrome.runtime.getManifest = jest.fn(() => ({ version }));
  chrome.runtime.setUninstallURL = jest.fn(async () => {});
  chrome.storage.onChanged = noop;
  chrome.storage.local.get = jest.fn(async (keys) =>
    Object.fromEntries([].concat(keys).filter(k => k in local).map(k => [k, local[k]])));
  chrome.storage.local.set = jest.fn(async (obj) => { Object.assign(local, obj); });
  chrome.storage.sync.get = jest.fn(async () => ({}));
  chrome.contextMenus = { removeAll: jest.fn(), create: jest.fn(), onClicked: noop };
  chrome.commands = { onCommand: noop };
  chrome.permissions = { onAdded: noop, contains: jest.fn((_p, cb) => cb && cb(false)) };
  chrome.scripting = {
    registerContentScripts: jest.fn(async () => {}),
    unregisterContentScripts: jest.fn(async () => {}),
  };
  chrome.tabs.create = jest.fn();

  require(`../extensions/${ext}/background.js`);
  expect(onInstalled).not.toBeNull();
  return onInstalled;
}

const openedPages = () => chrome.tabs.create.mock.calls
  .map(([arg]) => String(arg.url).split('/').pop());

describe.each(['ai-folders', 'gemini-folders'])('%s: install vs update', (ext) => {
  test('a fresh install opens the welcome page, and only that', async () => {
    const onInstalled = loadBackground(ext);

    await onInstalled({ reason: 'install' });

    // A new user has nothing to catch up on: release notes for versions they
    // never had would be noise, and the thing they DO need is to pin the button.
    expect(openedPages()).toEqual(['welcome.html']);
  });

  // Anchored on WHATS_NEW_VERSION rather than on the manifest, because these two
  // are about the MECHANISM: an update to the version the notes were written for
  // opens them. Anchoring them on the manifest quietly made them assert something
  // else as well — that every release has notes — so a patch release with nothing
  // to say broke them.
  test('an update to the version the notes describe opens them, and only them',
    async () => {
      const onInstalled = loadBackground(ext, { version: notesVersion(ext) });

      await onInstalled({ reason: 'update', previousVersion: '1.0.0' });

      expect(openedPages()).toEqual(['whats-new.html']);
    });

  test('a second update event does not reopen it, the seen marker holds', async () => {
    // Reloading an unpacked extension fires onInstalled with reason 'update' too.
    const onInstalled = loadBackground(ext, { version: notesVersion(ext) });

    await onInstalled({ reason: 'update' });
    await onInstalled({ reason: 'update' });

    expect(openedPages()).toEqual(['whats-new.html']);
  });

  // And this one says what the CURRENTLY SHIPPED pair does, without hardcoding
  // which release we are on: notes open exactly when the two versions agree. It
  // is the line to read when a release goes out and nobody can remember whether
  // the page was meant to appear.
  test('what the shipped version and the notes version add up to', async () => {
    const onInstalled = loadBackground(ext);

    await onInstalled({ reason: 'update', previousVersion: '1.0.0' });

    expect(openedPages()).toEqual(
      notesVersion(ext) === manifestVersion(ext) ? ['whats-new.html'] : []);
  });


  test('an update to a version with no release notes opens nothing', async () => {
    // WHATS_NEW_VERSION is left alone for a minor release; the page then belongs
    // to a version that is no longer the one installed.
    const onInstalled = loadBackground(ext, { version: '99.0.0' });

    await onInstalled({ reason: 'update' });

    expect(openedPages()).toEqual([]);
  });

  test.each(['chrome_update', 'shared_module_update'])(
    'a %s event opens nothing', async (reason) => {
      const onInstalled = loadBackground(ext);

      await onInstalled({ reason });

      expect(openedPages()).toEqual([]);
    });

  test('neither page can open without a reason at all', async () => {
    const onInstalled = loadBackground(ext);

    await onInstalled({});

    expect(openedPages()).toEqual([]);
  });
});
