// site-config.js — Gemini Folders (browser global + Node/Jest export)
// Defines Gemini-specific title extraction and registers it as the global
// extractGeminiTitleLogic expected by background.js and popup.js.

// Injected into the Gemini page via executeScript. Tries four DOM strategies
// in order, falling back to defaultFallback if none yield a usable title.
function extractGeminiTitleLogic(defaultFallback) {
  const strategies = [
    // Plan A: Official title element at the top of the page
    () => {
      const el = document.querySelector('[data-test-id="conversation-title"]');
      return el?.textContent?.trim() || null;
    },
    // Plan B: Sidebar link matching the current /app/<id> path
    () => {
      const path = window.location.pathname;
      if (!path.includes('/app/')) return null;
      for (const link of document.querySelectorAll(`a[href="${path}"]`)) {
        const text = link.textContent.trim().split('\n')[0].trim();
        if (text.length > 1) return text;
      }
      return null;
    },
    // Plan C: Document title (strip site suffix, ignore generic titles)
    () => {
      const ignore = new Set(["gemini", "google gemini", "discussions", "chats",
        "nouvelle conversation", "new conversation", "new chat", ""]);
      const clean = (document.title || "").split(' - ')[0].trim();
      return ignore.has(clean.toLowerCase()) ? null : clean;
    },
    // Plan D: First user message excerpt (max 40 chars)
    () => {
      const el = document.querySelector(
        '[data-message-author-role="user"], user-query, message-content, .query-text'
      );
      if (!el?.textContent) return null;
      const excerpt = el.textContent.trim();
      return excerpt.length > 40 ? excerpt.substring(0, 40) + '...' : excerpt;
    },
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result && result.trim().length > 0) return result.trim();
  }
  return defaultFallback;
}

if (typeof module !== 'undefined') {
  module.exports = { extractGeminiTitleLogic };
}
