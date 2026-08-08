// The uninstall URL is the one thing the extension hands to the browser for the
// feedback survey (chrome.runtime.setUninstallURL). It is set once and may be
// opened months later, so what it carries — and what it must never carry — is
// worth locking down.
const { buildUninstallUrl, normalizeUiLang } = require('../src/utils');

const BASE = 'https://aifolders.xyz/uninstall-ai-folders.html';

describe('normalizeUiLang', () => {
  // chrome.i18n.getUILanguage() returns BCP-47; the site's locale codes use '_'
  // and only pt/zh keep a region.
  test.each([
    ['fr', 'fr'],
    ['en-US', 'en'],
    ['pt-BR', 'pt_BR'],
    ['pt', 'pt_PT'],
    ['pt-PT', 'pt_PT'],
    ['zh-CN', 'zh_CN'],
    ['zh', 'zh_CN'],
    ['zh-TW', 'zh_TW'],
    ['zh-HK', 'zh_TW'],
    ['no', 'nb'],          // the site ships nb, not no
    ['nb-NO', 'nb'],
    ['pt_BR', 'pt_BR'],    // already normalized
    ['', 'en'],
    [undefined, 'en'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeUiLang(raw)).toBe(expected);
  });
});

describe('buildUninstallUrl', () => {
  test('carries the full context', () => {
    const url = buildUninstallUrl(BASE, {
      installedAt: Date.UTC(2026, 5, 8, 14, 32),
      version: '1.6.2',
      lang: 'pt-BR',
      browser: 'firefox',
      opens: 63,
      saves: 9,
    });
    expect(url.startsWith(BASE + '?')).toBe(true);
    const p = new URL(url).searchParams;
    expect(p.get('i')).toBe('2026-06-08');   // day precision, no timestamp
    expect(p.get('v')).toBe('1.6.2');
    expect(p.get('l')).toBe('pt_BR');
    expect(p.get('b')).toBe('firefox');
    expect(p.get('o')).toBe('63');
    expect(p.get('s')).toBe('9');
    expect(p.get('ie')).toBeNull();          // date is real → no estimate flag
  });

  test('an inferred install date is flagged, never passed off as exact', () => {
    const p = new URL(buildUninstallUrl(BASE, {
      installedAt: Date.UTC(2026, 6, 25), estimated: true,
    })).searchParams;
    expect(p.get('i')).toBe('2026-07-25');
    expect(p.get('ie')).toBe('1');
  });

  test('an unknown install date is omitted rather than faked', () => {
    const p = new URL(buildUninstallUrl(BASE, { version: '1.6.2' })).searchParams;
    expect(p.has('i')).toBe(false);
    expect(p.has('ie')).toBe(false);
  });

  // Zero is a finding, not a missing value: 'o=0' means the popup was never opened
  // and 's=0' that nothing was ever saved. Both must be sent explicitly.
  test('a fresh profile reports zero opens and zero saves instead of empty values', () => {
    const fresh = new URL(buildUninstallUrl(BASE, {})).searchParams;
    expect(fresh.get('o')).toBe('0');
    expect(fresh.get('s')).toBe('0');
    const undef = new URL(buildUninstallUrl(BASE, { opens: undefined, saves: undefined })).searchParams;
    expect(undef.get('o')).toBe('0');
    expect(undef.get('s')).toBe('0');
  });

  test('nothing beyond the seven known params ever ends up in the URL', () => {
    const url = buildUninstallUrl(BASE, {
      installedAt: Date.UTC(2026, 0, 1), estimated: true, version: '4.5.3',
      lang: 'fr', browser: 'chrome', opens: 12, saves: 3,
      // A caller passing extra state must not leak it into the URL.
      email: 'someone@example.com', folders: ['Work', 'Private'],
    });
    const keys = Array.from(new URL(url).searchParams.keys()).sort();
    expect(keys).toEqual(['b', 'i', 'ie', 'l', 'o', 's', 'v']);
    expect(url).not.toContain('example.com');
    expect(url).not.toContain('Private');
  });

  test('values are URL-encoded, so a stray character cannot break the query', () => {
    const url = buildUninstallUrl(BASE, { version: '1.0 &beta=1', browser: 'chrome' });
    expect(url).not.toContain('&beta=1');
    expect(new URL(url).searchParams.get('v')).toBe('1.0 &beta=1');
  });

  test('stays far under the 1023-char setUninstallURL limit', () => {
    const url = buildUninstallUrl(BASE, {
      installedAt: Date.UTC(2020, 0, 1), estimated: true, version: '10.10.10',
      lang: 'zh-TW', browser: 'firefox', opens: 999999, saves: 999999,
    });
    expect(url.length).toBeLessThan(200);
  });
});
