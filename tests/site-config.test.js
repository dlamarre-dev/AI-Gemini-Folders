const { getSiteByUrl, extractAITitleLogic } = require('../extensions/ai-folders/site-config.js');

// Site detection is core and brittle — it gates save, title extraction, and the
// #-trigger. These lock down the URL → site-key mapping.
describe('getSiteByUrl', () => {
  test.each([
    ['https://chatgpt.com/c/abc', 'chatgpt'],
    ['https://claude.ai/chat/x', 'claude'],
    ['https://gemini.google.com/app', 'gemini'],
    ['https://copilot.microsoft.com/', 'copilot'],
    ['https://chat.deepseek.com/', 'deepseek'],
    ['https://grok.com/', 'grok'],
    ['https://grok.com/chat/abc', 'grok'],
    ['https://perplexity.ai/', 'perplexity'],
    ['https://www.perplexity.ai/search', 'perplexity'],
    ['https://chat.z.ai/c/abc', 'zai'],
    ['https://chat.qwen.ai/c/abc', 'qwen'],
    ['https://meta.ai/', 'meta'],
    ['https://www.meta.ai/c/abc', 'meta'],
    ['https://chat.mistral.ai/chat/abc', 'mistral'],
    ['https://poe.com/chat/abc', 'poe'],
    ['https://duckduckgo.com/?q=x&ia=chat', 'duckai'],
    ['https://you.com/', 'you'],
    ['https://pi.ai/talk', 'pi'],
    ['https://character.ai/chat/abc', 'characterai'],
    ['https://chat.baidu.com/', 'baidu'],
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
});
