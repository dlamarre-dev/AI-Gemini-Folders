// Which browser the uninstall survey reports.
//
// The `b=` param is what separates a Chrome uninstall from a Firefox one in the
// survey data, and now from an Edge one. Edge is the case worth a test: its user
// agent contains BOTH "Edg/" and "Chrome/", so a naive check reports every Edge
// uninstall as Chrome — silently, and in a way that only shows up as a slow
// contamination of the numbers CLAUDE.md §11 draws conclusions from.
//
// This runs the real onInstalled listener and reads the URL actually handed to
// chrome.runtime.setUninstallURL, rather than testing the helper in isolation:
// the helper is not exported, and what matters is what the browser receives.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXTENSIONS = ['ai-folders', 'gemini-folders'];

// Real user agents, kept verbatim — the whole point is the overlap between them.
const AGENTS = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  edgeAndroid: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
};

const manifestVersion = (ext) => JSON.parse(fs.readFileSync(
  path.join(ROOT, 'extensions', ext, 'manifest.json'), 'utf8')).version;

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua, configurable: true,
  });
}

// Loads a service worker the way the browser does — the top level only registers
// listeners — then fires onInstalled and returns the uninstall URL it set.
async function uninstallUrlFor(ext, ua) {
  jest.resetModules();
  setUserAgent(ua);

  const local = {};
  let onInstalled = null;
  const noop = { addListener: () => {} };

  chrome.runtime.onInstalled = { addListener: (fn) => { onInstalled = fn; } };
  chrome.runtime.onStartup = noop;
  chrome.runtime.onMessage = noop;
  chrome.runtime.getManifest = jest.fn(() => ({ version: manifestVersion(ext) }));
  chrome.runtime.setUninstallURL = jest.fn(async () => {});
  chrome.i18n.getUILanguage = jest.fn(() => 'en-US');
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

  // The real service worker pulls these in with importScripts, so they are
  // plain globals there. Without them refreshUninstallUrl throws a
  // ReferenceError straight into its own best-effort catch, and the failure
  // looks exactly like "the browser was never told" — which is what this test
  // measures, so it would pass or fail for the wrong reason.
  global.buildUninstallUrl = require('../src/utils').buildUninstallUrl;

  require(`../extensions/${ext}/background.js`);
  expect(onInstalled).not.toBeNull();
  await onInstalled({ reason: 'install' });
  // refreshUninstallUrl is fired without await inside the listener.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const calls = chrome.runtime.setUninstallURL.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0];
}

// The context rides in the fragment, never the query — see CLAUDE.md §9.
const browserParam = (url) =>
  new URLSearchParams(new URL(url).hash.slice(1)).get('b');

describe.each(EXTENSIONS)('%s uninstall survey', (ext) => {
  test('Chrome reports chrome', async () => {
    expect(browserParam(await uninstallUrlFor(ext, AGENTS.chrome))).toBe('chrome');
  });

  test('Firefox reports firefox', async () => {
    expect(browserParam(await uninstallUrlFor(ext, AGENTS.firefox))).toBe('firefox');
  });

  // The regression this file exists for. Edge's UA says "Chrome/120" too, so
  // testing Chrome first would swallow every Edge install into the Chrome bucket.
  test('Edge reports edge, not chrome', async () => {
    const value = browserParam(await uninstallUrlFor(ext, AGENTS.edge));
    expect(value).toBe('edge');
    expect(value).not.toBe('chrome');
  });

  test('Edge on Android reports edge as well', async () => {
    expect(browserParam(await uninstallUrlFor(ext, AGENTS.edgeAndroid))).toBe('edge');
  });

  // Three buckets and nothing else: an unrecognised agent must land somewhere
  // known rather than send an empty or invented value to the Form.
  test('every agent lands in one of the three known values', async () => {
    for (const ua of Object.values(AGENTS)) {
      expect(['chrome', 'edge', 'firefox'])
        .toContain(browserParam(await uninstallUrlFor(ext, ua)));
    }
  });
});
