// site-config.js — AI Folders site registry
// Provides:
//   SITES              — metadata for all 6 supported sites
//   getSiteByUrl(url)  — returns site key or null
//   getChatSiteInfo    — hook for folders.js (window global)
//   extractAITitleLogic — injected into page via executeScript

const SITES = {
  gemini: {
    key: 'gemini',
    domain: 'gemini.google.com',
    color: '#1a73e8',
    newConvUrl: 'https://gemini.google.com/app',
    // Gemini uses a Quill editor inside a custom element
    editorSelectors: ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'],
    // Official Gemini SVG mark — gradient defined in popup.html shared defs pool
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M16 8.016A8.522 8.522 0 008.016 16h-.032A8.521 8.521 0 000 8.016v-.032A8.521 8.521 0 007.984 0h.032A8.522 8.522 0 0016 7.984v.032z" fill="url(#gm0)"/></svg>`,
  },
  claude: {
    key: 'claude',
    domain: 'claude.ai',
    color: '#D97757',
    newConvUrl: 'https://claude.ai/new',
    // Claude uses ProseMirror (confirmed via multiple extensions)
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', '.ProseMirror[contenteditable]'],
    // Official Anthropic/Claude SVG mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757"/></svg>`,
  },
  chatgpt: {
    key: 'chatgpt',
    domain: 'chatgpt.com',
    color: '#10a37f',
    newConvUrl: 'https://chatgpt.com/',
    // #prompt-textarea is a contenteditable div (confirmed 2024-2025)
    editorSelectors: ['#prompt-textarea', 'div[contenteditable="true"][data-id="root"]'],
    // Official OpenAI hexagonal logo; original fill #546e7a recoloured to ChatGPT green
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#10a37f" d="M30.7,7.27L28.33,9.1c-1.605-2.067-4.068-3.209-6.697-3.092C17.313,6.2,14,9.953,14,14.277l0,9.143l10.5,6.12l-1,1.72l-11.706-6.827C11.302,24.146,11,23.62,11,23.051l0-8.687C11,8.1,16.129,2.79,22.39,3.007C25.669,3.12,28.68,4.663,30.7,7.27z"/><path fill="#10a37f" d="M12.861,9.833l0.4,2.967c-2.592,0.357-4.813,1.919-6.026,4.254c-1.994,3.837-0.4,8.582,3.345,10.745l7.918,4.571l10.55-6.033l0.99,1.726l-11.765,6.724c-0.494,0.282-1.101,0.281-1.594-0.003l-7.523-4.343C3.73,27.308,1.696,20.211,5.014,14.898C6.752,12.114,9.594,10.279,12.861,9.833z"/><path fill="#10a37f" d="M6.161,26.563l2.77,1.137c-0.987,2.423-0.745,5.128,0.671,7.346c2.326,3.645,7.233,4.638,10.977,2.476l7.918-4.572l0.05-12.153l1.99,0.006l-0.059,13.551c-0.002,0.569-0.307,1.094-0.8,1.379l-7.523,4.343c-5.425,3.132-12.588,1.345-15.531-4.185C5.083,32.994,4.914,29.616,6.161,26.563z"/><path fill="#10a37f" d="M17.3,40.73l2.37-1.83c1.605,2.067,4.068,3.209,6.697,3.092C30.687,41.8,34,38.047,34,33.723l0-9.143l-10.5-6.12l1-1.72l11.706,6.827C36.698,23.854,37,24.38,37,24.949l0,8.687c0,6.264-5.13,11.574-11.39,11.358C22.331,44.88,19.32,43.337,17.3,40.73z"/><path fill="#10a37f" d="M35.139,38.167l-0.4-2.967c2.592-0.357,4.813-1.919,6.026-4.254c1.994-3.837,0.4-8.582-3.345-10.745l-7.918-4.571l-10.55,6.033l-0.99-1.726l11.765-6.724c0.494-0.282,1.101-0.281,1.594,0.003l7.523,4.343c5.425,3.132,7.459,10.229,4.141,15.543C41.248,35.886,38.406,37.721,35.139,38.167z"/><path fill="#10a37f" d="M41.839,21.437l-2.77-1.137c0.987-2.423,0.745-5.128-0.671-7.346c-2.326-3.645-7.233-4.638-10.977-2.476l-7.918,4.572l-0.05,12.153l-1.99-0.006l0.059-13.551c0.002-0.569,0.307-1.094,0.8-1.379l7.523-4.343c5.425-3.132,12.588-1.345,15.531,4.185C42.917,15.006,43.086,18.384,41.839,21.437z"/></svg>`,
  },
  copilot: {
    key: 'copilot',
    domain: 'copilot.microsoft.com',
    color: '#0078d4',
    newConvUrl: 'https://copilot.microsoft.com/',
    // Copilot uses a textarea inside a shadow-DOM web component; selectors need live validation
    editorSelectors: ['textarea#userInput', 'cib-text-input textarea', '#searchbox', 'textarea[name="q"]', 'textarea'],
    // Official Microsoft Copilot SVG — gradients defined in popup.html shared defs pool
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.533 1.829A2.528 2.528 0 0015.11 0h-.737a2.531 2.531 0 00-2.484 2.087l-1.263 6.937.314-1.08a2.528 2.528 0 012.424-1.833h4.284l1.797.706 1.731-.706h-.505a2.528 2.528 0 01-2.423-1.829l-.715-2.453z" fill="url(#cp0)" transform="translate(0 1)"/><path d="M6.726 20.16A2.528 2.528 0 009.152 22h1.566c1.37 0 2.49-1.1 2.525-2.48l.17-6.69-.357 1.228a2.528 2.528 0 01-2.423 1.83h-4.32l-1.54-.842-1.667.843h.497c1.124 0 2.113.75 2.426 1.84l.697 2.432z" fill="url(#cp1)" transform="translate(0 1)"/><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#cp2)" transform="translate(0 1)"/><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#cp3)" transform="translate(0 1)"/><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#cp4)" transform="translate(0 1)"/><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#cp5)" transform="translate(0 1)"/></svg>`,
  },
  perplexity: {
    key: 'perplexity',
    domain: 'perplexity.ai',
    color: '#22B8CD',
    newConvUrl: 'https://www.perplexity.ai/',
    // Perplexity uses a React-controlled textarea; try specific then generic, fall back to contenteditable
    editorSelectors: ['textarea.resize-none', 'textarea[rows]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official Perplexity SVG mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="#22B8CD"/></svg>`,
  },
  local: {
    key: 'local',
    domain: null,
    color: '#6b7280',
    newConvUrl: null,
    editorSelectors: null,
    // Stylized laptop icon representing a local LLM
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><polyline points="1,20 23,20"/><path d="M5 20 C5 17 7 16 12 16 C17 16 19 17 19 20"/></svg>`,
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

function getSiteByUrl(url) {
  if (!url) return null;
  for (const [key, site] of Object.entries(SITES)) {
    if (site.domain && url.includes(site.domain)) return key;
  }
  return null;
}

// Hook for folders.js — returns {key, color, logoSvg} for a saved chat, or null.
// AI Folders defines this; Gemini Folders leaves it undefined.
// Guard: service workers load this file too (via importScripts) but have no `window`.
if (typeof window !== 'undefined') {
  window.getChatSiteInfo = function(chat) {
    if (!chat.site || !SITES[chat.site]) return null;
    const site = SITES[chat.site];
    return { key: chat.site, color: site.color, logoSvg: site.logoSvg };
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
  } else if (siteKey === 'perplexity') {
    strategies = [
      // Perplexity shows the question as an h1 at the top of the page
      () => document.querySelector('h1')?.textContent?.trim() || null,
      () => docTitle(new Set(['perplexity', 'perplexity ai', 'perplexity.ai', ''])),
      () => firstMsg('[data-testid="query-text"], .query, .prose p:first-child'),
    ];
  }

  if (strategies) {
    for (const s of strategies) {
      try {
        const result = s();
        if (result && result.trim().length > 0) return result.trim();
      } catch (_) { /* skip failing strategies */ }
    }
  }
  return defaultFallback || document.title.trim() || 'New conversation';
}

if (typeof module !== 'undefined') {
  module.exports = { SITES, getSiteByUrl, extractAITitleLogic };
}
