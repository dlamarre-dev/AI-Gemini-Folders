// Global mocks shared across all test files.
// Jest clears mock state between tests (clearMocks: true in jest.config.js),
// but these objects are re-used as-is — only their implementations are reset.

global.chrome = {
  storage: {
    sync: {
      get:          jest.fn(),
      set:          jest.fn((_, cb) => cb && cb()),
      remove:       jest.fn(),
      getBytesInUse: jest.fn(),
      QUOTA_BYTES:  102400,
    },
    local: {
      get:    jest.fn(),
      set:    jest.fn((_, cb) => cb && cb()),
      remove: jest.fn(),
    },
    onChanged: { addListener: jest.fn() },
  },
  runtime: {
    lastError: null,
    getManifest: jest.fn(() => ({ version: '3.5.0' })),
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
  },
  bookmarks: {
    search:     jest.fn(),
    create:     jest.fn(),
    removeTree: jest.fn(),
  },
  tabs: {
    create: jest.fn(),
    group:  jest.fn(),
    update: jest.fn(),
    query:  jest.fn(),
  },
  tabGroups: {
    update: jest.fn(),
  },
  i18n: {
    getMessage:    jest.fn((key) => key),
    getUILanguage: jest.fn(() => 'en'),
  },
  contextMenus: {
    removeAll: jest.fn((cb) => cb && cb()),
    create:    jest.fn(),
  },
  commands: {
    onCommand: { addListener: jest.fn() },
  },
  scripting: {
    executeScript: jest.fn(),
  },
};

// Transparent LZString mock: compress prepends 'C:', decompress strips it.
// Passing anything that doesn't start with 'C:' simulates a corrupt payload (returns null).
global.LZString = {
  compressToUTF16:     jest.fn((str) => `C:${str}`),
  decompressFromUTF16: jest.fn((str) => {
    if (typeof str === 'string' && str.startsWith('C:')) return str.slice(2);
    return null;
  }),
};
