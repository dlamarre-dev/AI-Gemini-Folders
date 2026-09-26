const { SITES, getSiteByUrl, canSaveSite, extractAITitleLogic, normalizeLocalLlmUrl } = require('../extensions/ai-folders/site-config.js');

// Site detection is core and brittle — it gates save, title extraction, and the
// #-trigger. These lock down the URL → site-key mapping.
describe('getSiteByUrl', () => {
  test.each([
    ['https://chatgpt.com/c/abc', 'chatgpt'],
    ['https://claude.ai/chat/x', 'claude'],
    ['https://gemini.google.com/app', 'gemini'],
    // Copilot answers at four addresses and each one had to be added to the
    // manifest before it worked at all: the consumer host, the unified
    // copilot.com a new conversation now opens at, the commercial
    // m365.cloud.microsoft, and the copilot.cloud.microsoft it redirects to.
    ['https://copilot.microsoft.com/', 'copilot'],
    ['https://copilot.com/chat', 'copilot'],
    ['https://www.copilot.com/chat', 'copilot'],
    ['https://m365.cloud.microsoft/chat', 'copilot'],
    ['https://copilot.cloud.microsoft/chat', 'copilot'],
    ['https://chat.deepseek.com/', 'deepseek'],
    ['https://grok.com/', 'grok'],
    ['https://grok.com/chat/abc', 'grok'],
    ['https://perplexity.ai/', 'perplexity'],
    ['https://www.perplexity.ai/search', 'perplexity'],
    ['https://chat.z.ai/c/abc', 'zai'],
    // Moonshot split Kimi: kimi.com serves China, kimi.ai the rest. Both must
    // resolve to one key or a conversation saved before the split stops being
    // recognized -- the Baidu lesson.
    ['https://www.kimi.com/', 'kimi'],
    ['https://kimi.com/chat/abc', 'kimi'],
    ['https://kimi.ai/chat/abc', 'kimi'],
    ['https://www.kimi.ai/', 'kimi'],
    ['https://chat.qwen.ai/c/abc', 'qwen'],
    ['https://meta.ai/', 'meta'],
    ['https://www.meta.ai/c/abc', 'meta'],
    ['https://chat.mistral.ai/chat/abc', 'mistral'],
    ['https://poe.com/chat/abc', 'poe'],
    ['https://duckduckgo.com/?q=x&ia=chat', 'duckai'],
    ['https://duck.ai/', 'duckai'],
    ['https://pi.ai/talk', 'pi'],
    ['https://character.ai/chat/abc', 'characterai'],
    ['https://chat.baidu.com/', 'baidu'],
    // chat.baidu.com now 302s here; both must resolve to the same site key so
    // conversations saved before and after the move behave identically.
    ['https://wenxin.baidu.com/?enter_type=chat_site', 'baidu'],
    ['https://wenxin.baidu.com/chat/0', 'baidu'],
  ])('%s -> %s', (url, key) => {
    expect(getSiteByUrl(url)).toBe(key);
  });

  test('the Mistral marketing site (not chat.) does not match', () => {
    expect(getSiteByUrl('https://www.mistral.ai/')).toBeNull();
    expect(getSiteByUrl('https://mistral.ai/news')).toBeNull();
  });

  test('the Baidu search engine (not chat.) does not match', () => {
    expect(getSiteByUrl('https://www.baidu.com/')).toBeNull();
  });

  test('a subdomain of a supported site matches', () => {
    expect(getSiteByUrl('https://sub.gemini.google.com/')).toBe('gemini');
  });

  test('unsupported site -> null', () => {
    expect(getSiteByUrl('https://example.com/')).toBeNull();
  });

  test('invalid / empty url -> null', () => {
    expect(getSiteByUrl('')).toBeNull();
    expect(getSiteByUrl('not a url')).toBeNull();
    expect(getSiteByUrl(undefined)).toBeNull();
  });

  test('local LLM URL matches by exact origin', () => {
    expect(getSiteByUrl('http://localhost:3000/chat', 'http://localhost:3000')).toBe('local');
  });

  test('a different port is NOT the configured local LLM', () => {
    expect(getSiteByUrl('http://localhost:8080/', 'http://localhost:3000')).toBeNull();
  });

  test('a supported site still wins when a local URL is also configured', () => {
    expect(getSiteByUrl('https://claude.ai/', 'http://localhost:3000')).toBe('claude');
  });
});

// A site the registry knows but the manifest cannot touch fails at runtime with
// "Cannot access contents of url … must request permission to access this host"
// — invisible to every other test. Baidu shipped in that state after it moved to
// wenxin.baidu.com, so the lists are checked against the registry here.
//
// The three lists do NOT cover the same set, and that is the point:
//   host_permissions + content_scripts  -> every live site (injection needs the
//       first, the #-trigger the second), so a `noSave` site keeps both.
//   SUPPORTED_URL_PATTERNS              -> only sites you can save on. That
//       constant feeds nothing but the save menu's documentUrlPatterns, so
//       Duck.ai's absence from it IS the feature, not a gap.
describe('host permissions cover every registered domain', () => {
  const fs = require('fs');
  const path = require('path');
  const extDir = path.join(__dirname, '..', 'extensions', 'ai-folders');
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  const backgroundSrc = fs.readFileSync(path.join(extDir, 'background.js'), 'utf8');
  const contentMatches = manifest.content_scripts[0].matches;

  const hosts = (s) => [s.domain, ...(s.altDomains ?? [])].filter(Boolean);
  // The local LLM is deliberately absent: its origin is granted at runtime. A
  // retired site is absent for the opposite reason -- its permissions were
  // removed on purpose, and this check would demand them back.
  const live = Object.values(SITES).filter(s => !s.retired);

  test.each(live.flatMap(hosts))('%s is reachable and carries the content script', (domain) => {
    const pattern = `*://${domain}/*`;
    expect(manifest.host_permissions).toContain(pattern);
    expect(contentMatches).toContain(pattern);
  });

  test.each(live.filter(s => !s.noSave).flatMap(hosts))('%s can be saved from', (domain) => {
    expect(backgroundSrc).toContain(`*://${domain}/*`);
  });

  test('a noSave site is absent from the save menu patterns', () => {
    const noSave = Object.values(SITES).filter(s => s.noSave && !s.retired);
    // If this ever empties, the assertion below stops proving anything.
    expect(noSave.map(s => s.key)).toEqual(['duckai']);
    const patterns = backgroundSrc.slice(backgroundSrc.indexOf('SUPPORTED_URL_PATTERNS'),
                                         backgroundSrc.indexOf('];'));
    for (const domain of noSave.flatMap(hosts)) {
      expect(patterns).not.toContain(`*://${domain}/*`);
    }
  });
});

// The #-trigger reads these two flags out of the registry (background.js), so a
// silent rename/removal would bring back the bugs they encode.
describe('composer flags', () => {
  test('kimi targets its Lexical composer and opts out of inline suggestions', () => {
    expect(SITES.kimi.editorSelectors[0]).toBe('div.chat-input-editor[contenteditable="true"]');
    expect(SITES.kimi.noSuggestions).toBe(true);
    // Not forceClear: the destructive textContent wipe desyncs Lexical's model.
    expect(SITES.kimi.forceClear).toBeUndefined();
  });

  // Moonshot split Kimi across two domains. Which one is primary is a decision
  // about this extension's audience -- 43 locales, very few of them in China --
  // and not about which redirect happens to fire, so it is pinned here rather
  // than left to be "corrected" by whoever next reads the redirect chain.
  test('kimi.ai is the default, kimi.com still resolves', () => {
    expect(SITES.kimi.domain).toBe('kimi.ai');
    expect(SITES.kimi.newConvUrl).toBe('https://www.kimi.ai/');
    expect(SITES.kimi.altDomains).toContain('kimi.com');
    expect(getSiteByUrl('https://www.kimi.com/')).toBe('kimi');
  });

  test('copilot targets the Fluent composer and opts out of inline suggestions', () => {
    // Confirmed live on m365.cloud.microsoft (09/2026). The five Bing-chat era
    // selectors that used to sit here matched nothing at all, so only the
    // positional fallback kept the popup's insert button working.
    expect(SITES.copilot.editorSelectors[0]).toBe('#m365-chat-editor-target-element');
    // An inline <span> composer: insertParagraph has no block to split, so the
    // three-line suggestion list cannot render cleanly there.
    expect(SITES.copilot.noSuggestions).toBe(true);
    // Not forceClear: the destructive wipe would also change the popup path,
    // which is the one that works there today.
    expect(SITES.copilot.forceClear).toBeUndefined();
  });

  test('the chip-tokenizing composers still force a clear before injecting', () => {
    expect(SITES.perplexity.forceClear).toBe(true);
    expect(SITES.baidu.forceClear).toBe(true);
    expect(SITES.meta.forceClear).toBe(true);
  });

  test('every editorSelectors entry is a valid CSS selector', () => {
    for (const [key, site] of Object.entries(SITES)) {
      for (const sel of site.editorSelectors ?? []) {
        expect(() => document.querySelector(sel)).not.toThrow(`${key}: ${sel}`);
      }
    }
  });
});

// extractAITitleLogic runs in the page; here we drive it over jsdom fixtures.
// Only the DOM-based strategies are exercised (the location-based ones need a
// real document URL).
describe('extractAITitleLogic', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  test('gemini: reads the conversation-title element', () => {
    document.body.innerHTML = '<div data-test-id="conversation-title">My Gemini Chat</div>';
    expect(extractAITitleLogic('gemini', 'fallback')).toBe('My Gemini Chat');
  });

  test('claude: uses the document <title>, stripping the " - Claude" suffix', () => {
    document.title = 'My Conversation - Claude';
    expect(extractAITitleLogic('claude', 'fallback')).toBe('My Conversation');
  });

  test('claude: ignores the generic site title and returns the fallback', () => {
    document.title = 'Claude';
    expect(extractAITitleLogic('claude', 'New conversation')).toBe('New conversation');
  });

  test('chatgpt: reads the active sidebar conversation link', () => {
    document.body.innerHTML = '<a aria-current="page"><p>Sidebar Title</p></a>';
    expect(extractAITitleLogic('chatgpt', 'fallback')).toBe('Sidebar Title');
  });

  test('grok: reads the active sidebar conversation link', () => {
    document.body.innerHTML = '<a aria-current="page"><span>Grok Sidebar Title</span></a>';
    expect(extractAITitleLogic('grok', 'fallback')).toBe('Grok Sidebar Title');
  });

  test('grok: ignores the generic site title and returns the fallback', () => {
    document.title = 'Grok';
    expect(extractAITitleLogic('grok', 'New conversation')).toBe('New conversation');
  });

  test('perplexity: reads the question <h1>', () => {
    document.body.innerHTML = '<h1>What is the capital of France?</h1>';
    expect(extractAITitleLogic('perplexity', 'fallback')).toBe('What is the capital of France?');
  });

  // Each Copilot host serves its own generic tagline, and docTitle only cuts at
  // " - " / " | " / " — " — so the colon form has to be ignored whole.
  test('copilot: ignores the consumer tagline and returns the fallback', () => {
    document.title = 'Microsoft Copilot: Your AI companion';
    expect(extractAITitleLogic('copilot', 'New conversation')).toBe('New conversation');
  });

  test('copilot: ignores the work-chat tagline and returns the fallback', () => {
    document.title = 'Copilot | AI chat for work';
    expect(extractAITitleLogic('copilot', 'New conversation')).toBe('New conversation');
  });

  test('returns the fallback when no strategy yields a title', () => {
    expect(extractAITitleLogic('claude', 'My Fallback')).toBe('My Fallback');
  });

  // The newer sites share the generic chain: sidebar → title → first message.
  test('zai: reads the active sidebar conversation link', () => {
    document.body.innerHTML = '<a aria-current="page"><span>Z Chat Title</span></a>';
    expect(extractAITitleLogic('zai', 'fallback')).toBe('Z Chat Title');
  });

  test('mistral: uses the document <title>, stripping the suffix', () => {
    document.title = 'My Mistral Chat - Le Chat';
    expect(extractAITitleLogic('mistral', 'fallback')).toBe('My Mistral Chat');
  });

  test('duckai: ignores the generic site title and returns the fallback', () => {
    document.title = 'DuckDuckGo AI Chat';
    expect(extractAITitleLogic('duckai', 'New conversation')).toBe('New conversation');
  });

  test('characterai: ignores the generic site title and returns the fallback', () => {
    document.title = 'Character.AI';
    expect(extractAITitleLogic('characterai', 'New conversation')).toBe('New conversation');
  });

  test('meta: does NOT read the sidebar date group header ("Today")', () => {
    document.body.innerHTML = '<a aria-current="page"><span>Today</span></a>';
    expect(extractAITitleLogic('meta', 'fallback')).toBe('fallback');
  });

  test('meta: reads the active sidebar conversation link', () => {
    document.body.innerHTML =
      '<a href="/prompt/x" data-sidebar="menu-button"><span class="min-w-0 flex-1 truncate">Autre</span></a>' +
      '<a href="/prompt/y" data-sidebar="menu-button" data-active="true"><span class="min-w-0 flex-1 truncate">Quick Hello</span></a>';
    expect(extractAITitleLogic('meta', 'fallback')).toBe('Quick Hello');
  });

  test('meta: reads the header title button, skipping generic labels', () => {
    document.body.innerHTML =
      '<header><button data-slot="button"><span class="truncate">Quick Hello</span></button></header>';
    expect(extractAITitleLogic('meta', 'fallback')).toBe('Quick Hello');
  });

  test('meta: uses the document <title> when it is a real conversation name', () => {
    document.title = 'Trip planning - Meta AI';
    expect(extractAITitleLogic('meta', 'fallback')).toBe('Trip planning');
  });

  test('zai: reads the selected sidebar conversation button', () => {
    document.body.innerHTML =
      '<button draggable="false"><div class="flex"><div class="text-left truncate leading-5">Autre</div></div></button>' +
      '<button draggable="false" data-selected="true" class="w-full flex">' +
      '  <div class="flex self-center flex-1"><div dir="auto" class="text-left self-center min-w-0 w-full truncate leading-5">Hello Greeting</div></div></button>';
    expect(extractAITitleLogic('zai', 'fallback')).toBe('Hello Greeting');
  });

  test('qwen: reads the active sidebar chat item', () => {
    document.body.innerHTML =
      '<div class="chat-item"><div class="chat-item-drag-link-content-tip-text">Autre</div></div>' +
      '<div class="chat-item chat-item-active"><div class="chat-item-drag-link-content">' +
      '  <div class="chat-item-drag-link-content-tip-text chat-item-drag-link-content-tip">Hello Conversation</div></div></div>';
    expect(extractAITitleLogic('qwen', 'fallback')).toBe('Hello Conversation');
  });

  test('qwen: ignores the generic "Qwen Studio" document title', () => {
    document.title = 'Qwen Studio';
    expect(extractAITitleLogic('qwen', 'New conversation')).toBe('New conversation');
  });

  test('pi: reads the active sidebar conversation entry', () => {
    document.body.innerHTML =
      '<div role="button" class="flex items-center"><span class="text-body-s truncate">Autre</span></div>' +
      '<div role="button" class="flex items-center bg-fill-default text-text-secondary">' +
      '  <div><span class="text-body-s truncate text-text-secondary">Greetings from Pi</span></div></div>';
    expect(extractAITitleLogic('pi', 'fallback')).toBe('Greetings from Pi');
  });

  test('baidu: reads the selected sidebar history item', () => {
    document.body.innerHTML =
      '<div class="chat-side-list-item">' +
      '  <span class="history-item-text cos-space-mr-xxs">Autre conversation</span></div>' +
      '<div class="chat-side-list-item chat-side-list-item-sample no-hover selected">' +
      '  <div class="history-item-content"><div class="history-item-content-left">' +
      '    <span class="history-item-text cos-space-mr-xxs">Hello how are you?</span>' +
      '  </div></div></div>';
    expect(extractAITitleLogic('baidu', 'fallback')).toBe('Hello how are you?');
  });

  test('baidu: ignores the generic Chinese site title and returns the fallback', () => {
    document.title = '百度文心助手';
    expect(extractAITitleLogic('baidu', 'New conversation')).toBe('New conversation');
  });

  test('baidu: a known-generic tab title (with suffix) yields "" so callers use their default', () => {
    document.title = '百度文心助手 - 办公学习一站解决';
    expect(extractAITitleLogic('baidu', '百度文心助手 - 办公学习一站解决')).toBe('');
  });

  test('the fallback tab title is cleaned of its " - suffix" before being used', () => {
    expect(extractAITitleLogic('baidu', 'Ma vraie conversation - 百度文心助手')).toBe('Ma vraie conversation');
  });
});

// A retired site is the one case where an entry must be half-alive: its colour
// and logo still have to resolve, because conversations saved from it are keyed
// by URL (CLAUDE.md §6) and cannot be migrated, while every forward-looking
// path must treat the site as gone. Each half is asserted separately here
// because each is served by a different call site.
describe('retired sites (You.com, 09/2026)', () => {
  test('the entry is still there, with the visuals saved conversations need', () => {
    expect(SITES.you).toBeDefined();
    expect(SITES.you.retired).toBe(true);
    expect(SITES.you.color).toBe('#3B5BFF');
    expect(SITES.you.logo).toBe('icons/you.png');
  });

  test('nothing new can be saved or injected: the URL no longer resolves', () => {
    // getSiteByUrl is the single gate on both the save flow and the #-trigger,
    // so this one expectation is what switches both off.
    expect(getSiteByUrl('https://you.com/')).toBeNull();
    expect(getSiteByUrl('https://you.com/chat')).toBeNull();
    expect(getSiteByUrl('https://www.you.com/chat')).toBeNull();
  });

  test('it offers no new-conversation target and no editor to inject into', () => {
    expect(SITES.you.newConvUrl).toBeUndefined();
    expect(SITES.you.editorSelectors).toBeUndefined();
  });

  test('its host permissions are gone, not merely unused', () => {
    const fs = require('fs');
    const path = require('path');
    const extDir = path.join(__dirname, '..', 'extensions', 'ai-folders');
    const manifest = fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8');
    const background = fs.readFileSync(path.join(extDir, 'background.js'), 'utf8');
    expect(manifest).not.toContain('you.com');
    expect(background).not.toContain('you.com');
  });

  test('the popup renders no button for it (and still does for local)', () => {
    // popup.js filters on !retired, not on a missing domain: 'local' has no
    // domain either and must keep its button.
    const shown = Object.values(SITES).filter(s => !s.retired).map(s => s.key);
    expect(shown).not.toContain('you');
    expect(shown).toContain('local');
  });

  test('the welcome page leaves it out of the supported-sites row', () => {
    // Mirrors supportedSites() in src/welcome.js.
    const row = Object.values(SITES).filter(s => s && s.domain && s.logo && !s.retired);
    expect(row.map(s => s.key)).not.toContain('you');
  });

  test('site-diagnostics skips it, having nothing to open', () => {
    // Mirrors SITES_TO_TEST in tools/site-diagnostics/diagnostics.js.
    const probed = Object.values(SITES).filter(s => s.domain && s.newConvUrl);
    expect(probed.map(s => s.key)).not.toContain('you');
  });
});

// Duck.ai stopped giving each conversation its own address (09/2026). That is a
// narrower failure than a retirement: the site is alive, so injection and the
// #-trigger must keep working, and only the save path goes. Each half is
// asserted, because a flag that switched off too much would be invisible here.
describe('unsaveable sites (Duck.ai, 09/2026)', () => {
  test('canSaveSite refuses a noSave site and allows the rest', () => {
    expect(SITES.duckai.noSave).toBe(true);
    expect(canSaveSite('duckai')).toBe(false);
    expect(canSaveSite('claude')).toBe(true);
    expect(canSaveSite('local')).toBe(true);
    expect(canSaveSite(null)).toBe(false);
    expect(canSaveSite(undefined)).toBe(false);
    expect(canSaveSite('nosuchsite')).toBe(true);   // unknown key: not a noSave site
  });

  test('the site itself stays fully supported: it still resolves and still injects', () => {
    // Not retired -- the URL must keep resolving, or the #-trigger and the
    // popup's insert button would stop working along with the save.
    expect(SITES.duckai.retired).toBeUndefined();
    expect(getSiteByUrl('https://duck.ai/')).toBe('duckai');
    expect(getSiteByUrl('https://duckduckgo.com/?q=x&ia=chat')).toBe('duckai');
    expect(SITES.duckai.editorSelectors.length).toBeGreaterThan(0);
    expect(SITES.duckai.newConvUrl).toBe('https://duck.ai/');
  });

  test('its own message exists in all 43 locales, and names no site', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'extensions', 'ai-folders', '_locales');
    const locales = fs.readdirSync(dir);
    expect(locales).toHaveLength(43);
    // Reusing alertNotSupported here would tell someone on a site the extension
    // DOES support to go and use a supported site. Hence a key of its own.
    const missing = locales.filter((l) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, l, 'messages.json'), 'utf8'));
      return !m.alertNoConversationUrl?.message;
    });
    expect(missing).toEqual([]);
    // Generic on purpose: the next site to lose its per-chat URLs reuses it.
    const named = locales.filter((l) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, l, 'messages.json'), 'utf8'));
      return /Duck\.ai|DuckDuckGo/i.test(m.alertNoConversationUrl.message);
    });
    expect(named).toEqual([]);
  });

  test('Gemini Folders does not carry the key it can never show', () => {
    // Same reasoning as the whats-new Baidu card (CLAUDE.md §10b): Gemini has
    // real per-conversation URLs, so the string would be dead weight in 43 files.
    const fs = require('fs');
    const path = require('path');
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extensions',
      'gemini-folders', '_locales', 'en', 'messages.json'), 'utf8'));
    expect(en.alertNoConversationUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeLocalLlmUrl — what the user types into the local-LLM box
// ---------------------------------------------------------------------------

describe('normalizeLocalLlmUrl', () => {
  // The two most common ways to type the address: "localhost:3000" parsed as
  // scheme "localhost:" (origin "null"), and an IP with a port threw.
  test.each([
    ['localhost:3000', 'http://localhost:3000'],
    ['192.168.1.5:8080', 'http://192.168.1.5:8080'],
    ['  localhost:11434/chat  ', 'http://localhost:11434/chat'],
    ['my-box.lan', 'http://my-box.lan'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['https://llm.example.com/ui', 'https://llm.example.com/ui'],
    ['HTTP://LOCALHOST:3000', 'HTTP://LOCALHOST:3000'],
  ])('%s → %s', (typed, expected) => {
    expect(normalizeLocalLlmUrl(typed)).toBe(expected);
    expect(new URL(normalizeLocalLlmUrl(typed)).origin).not.toBe('null');
  });

  test.each(['', '   ', 'ftp://host/x', 'file:///etc/passwd', 'javascript://alert(1)', 'http://', 'not a url'])(
    'rejects %p', (typed) => {
      expect(normalizeLocalLlmUrl(typed)).toBeNull();
    });
});
