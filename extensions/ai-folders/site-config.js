// site-config.js — AI Folders site registry
// Provides:
//   SITES              — metadata for all supported sites (17 web platforms + local)
//   getSiteByUrl(url)  — returns site key or null
//   getChatSiteInfo    — hook for folders.js (window global)
//   extractAITitleLogic — injected into page via executeScript
//
// logo / logoLight are PNG paths (icons/), rasterized by
// tools/generate-site-icons.js from the vector sources in assets/site-logos/
// (which stay the reference for marketing: website, screenshots, brag video).
// logoLight exists only for theme-dependent logos; pick it in light mode.

const SITES = {
  gemini: {
    key: 'gemini',
    domain: 'gemini.google.com',
    color: '#1a73e8',
    newConvUrl: 'https://gemini.google.com/app',
    // Gemini uses a Quill editor inside a custom element
    editorSelectors: ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'],
    logo: 'icons/gemini.png',
  },
  claude: {
    key: 'claude',
    domain: 'claude.ai',
    color: '#D97757',
    newConvUrl: 'https://claude.ai/new',
    // Claude uses ProseMirror (confirmed via multiple extensions)
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', '.ProseMirror[contenteditable]'],
    logo: 'icons/claude.png',
  },
  chatgpt: {
    key: 'chatgpt',
    domain: 'chatgpt.com',
    color: '#ffffff',
    newConvUrl: 'https://chatgpt.com/',
    // #prompt-textarea is a contenteditable div (confirmed 2024-2025)
    editorSelectors: ['#prompt-textarea', 'div[contenteditable="true"][data-id="root"]'],
    logo: 'icons/chatgpt.png',
    logoLight: 'icons/chatgpt-light.png',
  },
  copilot: {
    key: 'copilot',
    domain: 'copilot.microsoft.com',
    color: '#0078d4',
    newConvUrl: 'https://copilot.microsoft.com/',
    // Copilot uses a textarea inside a shadow-DOM web component; selectors need live validation
    editorSelectors: ['textarea#userInput', 'cib-text-input textarea', '#searchbox', 'textarea[name="q"]', 'textarea'],
    logo: 'icons/copilot.png',
  },
  deepseek: {
    key: 'deepseek',
    domain: 'chat.deepseek.com',
    color: '#4D6BFE',
    newConvUrl: 'https://chat.deepseek.com/',
    // DeepSeek uses a textarea with a stable id="chat-input"
    editorSelectors: ['#chat-input', 'textarea[placeholder]', 'textarea'],
    logo: 'icons/deepseek.png',
  },
  grok: {
    key: 'grok',
    domain: 'grok.com',
    color: '#ffffff',
    newConvUrl: 'https://grok.com/',
    // Grok has shipped both a plain textarea (aria-label "Ask Grok anything")
    // and a contenteditable composer; try specific then generic fallbacks
    editorSelectors: ['textarea[aria-label*="Grok"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/grok.png',
    logoLight: 'icons/grok-light.png',
  },
  perplexity: {
    key: 'perplexity',
    domain: 'perplexity.ai',
    color: '#22B8CD',
    newConvUrl: 'https://www.perplexity.ai/',
    // Perplexity uses a React-controlled textarea; try specific then generic, fall back to contenteditable
    editorSelectors: ['textarea.resize-none', 'textarea[rows]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // The composer turns #word into non-selectable token chips: wipe the field
    // before injecting and skip inline suggestions (background.js + popup.js)
    forceClear: true,
    logo: 'icons/perplexity.png',
  },
  zai: {
    key: 'zai',
    domain: 'chat.z.ai',
    color: '#ffffff',
    newConvUrl: 'https://chat.z.ai/',
    // chat.z.ai is built on Open WebUI (#chat-input); selectors need live validation
    editorSelectors: ['#chat-input', 'textarea#chat-input', '#chat-textarea', 'textarea[placeholder]', '[contenteditable="true"]'],
    logo: 'icons/zai.png',
  },
  qwen: {
    key: 'qwen',
    domain: 'chat.qwen.ai',
    color: '#615CED',
    newConvUrl: 'https://chat.qwen.ai/',
    // Qwen Chat composer; selectors need live validation
    editorSelectors: ['#chat-input', 'textarea#chat-input', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/qwen.png',
  },
  meta: {
    key: 'meta',
    domain: 'meta.ai',
    color: '#0064E0',
    newConvUrl: 'https://www.meta.ai/',
    // Meta AI uses a Lexical contenteditable composer; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/meta.png',
  },
  mistral: {
    key: 'mistral',
    domain: 'chat.mistral.ai',
    color: '#FA500F',
    newConvUrl: 'https://chat.mistral.ai/chat',
    // Le Chat uses a ProseMirror composer; selectors need live validation
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', 'textarea[name="message.text"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/mistral.png',
  },
  poe: {
    key: 'poe',
    domain: 'poe.com',
    color: '#5D5CDE',
    newConvUrl: 'https://poe.com/',
    // Poe uses hashed CSS-module classes — match by class prefix; selectors need live validation
    editorSelectors: ['textarea[class*="GrowingTextArea_textArea"]', 'footer textarea', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/poe.png',
    logoLight: 'icons/poe-light.png',
  },
  duckai: {
    key: 'duckai',
    // The chat is served on duck.ai directly AND under duckduckgo.com/?ia=chat
    domain: 'duck.ai',
    altDomains: ['duckduckgo.com'],
    // White in dark mode / near-black in light mode (like ChatGPT), overridden
    // in popup-extra.css — the brand orange reads poorly as a title tint
    color: '#ffffff',
    newConvUrl: 'https://duck.ai/',
    // Duck.ai (duckduckgo.com AI chat); selectors need live validation.
    // Note: chats are stateless (no per-conversation URL) — mainly useful in Prompt mode.
    editorSelectors: ['textarea[name="user-prompt"]', 'form textarea', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/duckai.png',
  },
  you: {
    key: 'you',
    domain: 'you.com',
    color: '#3B5BFF',
    newConvUrl: 'https://you.com/chat',
    // You.com chat composer; selectors need live validation
    editorSelectors: ['#search-input-textarea', 'textarea[data-testid="youchat-input"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/you.png',
  },
  pi: {
    key: 'pi',
    domain: 'pi.ai',
    color: '#0E7460',
    newConvUrl: 'https://pi.ai/talk',
    // Pi is one continuous conversation at /talk (no per-thread URLs); selectors need live validation
    editorSelectors: ['textarea[placeholder]', 'main textarea', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/pi.png',
  },
  characterai: {
    key: 'characterai',
    domain: 'character.ai',
    // White/black scheme like ChatGPT (light-mode override in popup-extra.css)
    color: '#ffffff',
    newConvUrl: 'https://character.ai/',
    // Character.AI chat composer; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/characterai.png',
    logoLight: 'icons/characterai-light.png',
  },
  baidu: {
    key: 'baidu',
    domain: 'chat.baidu.com',
    // Lightened brand blue — the official #2932E1 is too dark on the dark
    // theme; light mode gets the true brand blue via popup-extra.css and the
    // -light logo variant.
    color: '#4E5CF2',
    newConvUrl: 'https://chat.baidu.com/',
    // Baidu Chat (usable in English) composer; selectors need live validation
    editorSelectors: ['#chat-input', 'textarea[placeholder]', 'div[contenteditable="true"]', 'textarea'],
    // The composer tokenizes '#' like Perplexity does
    forceClear: true,
    logo: 'icons/baidu.png',
    logoLight: 'icons/baidu-light.png',
  },
  local: {
    key: 'local',
    domain: null,
    color: '#6b7280',
    newConvUrl: null,
    // Open WebUI (#chat-textarea) is the primary target; fallbacks cover LM Studio, AnythingLLM, Jan, etc.
    editorSelectors: ['#chat-textarea', 'textarea#message-input', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    logo: 'icons/local.png',
  },
};

// Backward-compat helper: returns the first editorSelector string, or the array as comma-joined
// (some callers used the old single-string .editorSelector property)
Object.values(SITES).forEach(site => {
  Object.defineProperty(site, 'editorSelector', {
    get() { return this.editorSelectors ? this.editorSelectors[0] : null; },
    enumerable: false,
  });
});

// localUrl: the user-configured local LLM URL (optional). When provided,
// any URL sharing the same origin (scheme+host+port) is matched as 'local'.
function getSiteByUrl(url, localUrl) {
  if (!url) return null;
  let hostname;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    if (localUrl && parsed.origin === new URL(localUrl).origin) return 'local';
  } catch (_) {
    return null;
  }
  for (const [key, site] of Object.entries(SITES)) {
    if (site.domain && (hostname === site.domain || hostname.endsWith('.' + site.domain))) return key;
    if (site.altDomains?.some(d => hostname === d || hostname.endsWith('.' + d))) return key;
  }
  return null;
}

// Hook for folders.js — returns {key, color, logo, logoLight} for a saved chat, or null.
// AI Folders defines this; Gemini Folders leaves it undefined.
// Guard: service workers load this file too (via importScripts) but have no `window`.
if (typeof window !== 'undefined') {
  window.getChatSiteInfo = function(chat) {
    if (!chat.site || !SITES[chat.site]) return null;
    const site = SITES[chat.site];
    return { key: chat.site, color: site.color, logo: site.logo, logoLight: site.logoLight };
  };
}

// Injected into the active page via chrome.scripting.executeScript.
// Tries site-specific DOM strategies in order, falls back to document title.
function extractAITitleLogic(siteKey, defaultFallback) {
  const docTitle = (ignoreSet) => {
    const raw = (document.title || '').trim();
    const clean = raw.split(' - ')[0].split(' | ')[0].split(' — ')[0].trim();
    return (!clean || ignoreSet.has(clean.toLowerCase())) ? null : clean;
  };

  const firstMsg = (selector) => {
    const el = document.querySelector(selector);
    if (!el?.textContent) return null;
    const text = el.textContent.trim();
    return text ? (text.length > 40 ? text.substring(0, 40) + '...' : text) : null;
  };

  // Returns the text of the active sidebar conversation link, tried at several aria patterns
  const activeSidebarLink = () => {
    const selectors = [
      '[aria-current="page"]',
      '[aria-selected="true"]',
      '[aria-current="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // Try a nested paragraph, then a .truncate span, then the element's own text
      const inner = el.querySelector('p, .truncate, span') || el;
      const text = inner.textContent?.trim().split('\n')[0].trim();
      if (text && text.length > 1) return text;
    }
    return null;
  };

  let strategies;
  // Set by the generic branch: titles the final fallback must reject too
  let fallbackIgnores = null;

  if (siteKey === 'gemini') {
    strategies = [
      () => document.querySelector('[data-test-id="conversation-title"]')?.textContent?.trim() || null,
      () => {
        const path = window.location.pathname;
        if (!path.includes('/app/')) return null;
        for (const link of document.querySelectorAll(`a[href="${path}"]`)) {
          const text = link.textContent.trim().split('\n')[0].trim();
          if (text.length > 1) return text;
        }
        return null;
      },
      () => docTitle(new Set(['gemini', 'google gemini', 'discussions', 'chats',
        'nouvelle conversation', 'new conversation', 'new chat', ''])),
      () => firstMsg('[data-message-author-role="user"], user-query, message-content, .query-text'),
    ];
  } else if (siteKey === 'claude') {
    strategies = [
      activeSidebarLink,
      // Claude sets <title> to "Conversation Name - Claude" for named conversations
      () => docTitle(new Set(['claude', 'claude.ai', 'new conversation', ''])),
      // First user turn as last resort
      () => firstMsg('[data-testid="user-message"] .font-body, [data-testid="user-message"]'),
    ];
  } else if (siteKey === 'chatgpt') {
    strategies = [
      activeSidebarLink,
      // ChatGPT sets <title> to "Conversation Name" (no suffix) for named conversations
      () => docTitle(new Set(['chatgpt', 'new chat', 'chatgpt - ask anything', ''])),
      // Path-based sidebar link as extra fallback
      () => {
        const path = window.location.pathname;
        if (!path.startsWith('/c/')) return null;
        const link = document.querySelector(`a[href="${path}"]`);
        const text = link?.textContent?.trim().split('\n')[0].trim();
        return (text && text.length > 1) ? text : null;
      },
      () => firstMsg('[data-message-author-role="user"] p, [data-message-author-role="user"]'),
    ];
  } else if (siteKey === 'copilot') {
    strategies = [
      activeSidebarLink,
      () => docTitle(new Set(['microsoft copilot', 'copilot', ''])),
      () => firstMsg('[data-content="user-message"], .user-message, cib-message[type="user"]'),
    ];
  } else if (siteKey === 'deepseek') {
    strategies = [
      activeSidebarLink,
      () => docTitle(new Set(['deepseek', 'deepseek - into the unknown', 'new chat', ''])),
      () => firstMsg('[class*="user"] [class*="message"], [class*="human"] p'),
    ];
  } else if (siteKey === 'grok') {
    strategies = [
      activeSidebarLink,
      () => docTitle(new Set(['grok', 'grok.com', 'new chat', 'new conversation', ''])),
      () => firstMsg('[class*="user"] [class*="message"], .message-bubble p'),
    ];
  } else if (siteKey === 'perplexity') {
    strategies = [
      // Perplexity shows the question as an h1 at the top of the page
      () => document.querySelector('h1')?.textContent?.trim() || null,
      () => docTitle(new Set(['perplexity', 'perplexity ai', 'perplexity.ai', ''])),
      () => firstMsg('[data-testid="query-text"], .query, .prose p:first-child'),
    ];
  } else if (siteKey === 'baidu') {
    fallbackIgnores = new Set(['baidu', 'baidu chat', 'ai chat', '文心一言', '百度文心助手', '文心助手', 'new chat', '']);
    strategies = [
      // Selected conversation in the sidebar history (对话历史):
      // div.chat-side-list-item.selected > … > span.history-item-text
      () => document.querySelector('.chat-side-list-item.selected .history-item-text')?.textContent?.trim() || null,
      activeSidebarLink,
      () => docTitle(fallbackIgnores),
      () => firstMsg('[data-message-author-role="user"], [class*="user"] [class*="message"]'),
    ];
  } else {
    // Newer sites share the generic strategy chain (sidebar link → document
    // title → first user message); only the per-site generic-title ignore
    // list differs. Promote a site to its own branch above if it needs a
    // dedicated DOM strategy.
    const genericIgnores = {
      zai: ['z.ai', 'chat.z.ai', 'new chat'],
      qwen: ['qwen', 'qwen chat', 'new chat'],
      meta: ['meta ai', 'meta.ai', 'new conversation'],
      mistral: ['le chat', 'le chat - mistral ai', 'mistral ai', 'new chat'],
      poe: ['poe', 'new chat'],
      duckai: ['duckduckgo ai chat', 'duckduckgo', 'ai chat', 'duck.ai'],
      you: ['you.com', 'you', 'new chat'],
      pi: ['pi', 'pi.ai', 'talk with pi', 'pi, your personal ai'],
      characterai: ['character.ai', 'characterai', 'c.ai', 'new chat'],
    }[siteKey];
    if (genericIgnores) {
      fallbackIgnores = new Set([...genericIgnores, '']);
      strategies = [
        activeSidebarLink,
        () => docTitle(fallbackIgnores),
        () => firstMsg('[data-message-author-role="user"], [class*="user"] [class*="message"], [class*="human"] p'),
      ];
    }
  }

  if (strategies) {
    for (const s of strategies) {
      try {
        const result = s();
        if (result && result.trim().length > 0) return result.trim();
      } catch (_) { /* skip failing strategies */ }
    }
  }
  // The caller's fallback is usually tab.title — clean it like docTitle does,
  // and reject known-generic values ('' tells callers to use their localized
  // default) so a failed extraction doesn't save every conversation under the
  // site's own name (e.g. Baidu titles every page 百度文心助手).
  const fbRaw = (defaultFallback || document.title || '').trim();
  const fb = fbRaw.split(' - ')[0].split(' | ')[0].split(' — ')[0].trim();
  if (fallbackIgnores && (!fb || fallbackIgnores.has(fb.toLowerCase()))) return '';
  return fb || 'New conversation';
}

if (typeof module !== 'undefined') {
  module.exports = { SITES, getSiteByUrl, extractAITitleLogic };
}
