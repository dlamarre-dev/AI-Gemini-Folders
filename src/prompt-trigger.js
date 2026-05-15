// prompt-trigger.js — Content script: type #PromptName in any AI chat field,
// press Space, and the matching saved prompt replaces the field content.

(function () {
  if (window.__promptTriggerActive) return;
  window.__promptTriggerActive = true;

  // ---------------------------------------------------------------------------
  // Storage helpers (inline — avoids loading full utils.js as a content script)
  // ---------------------------------------------------------------------------

  function assembleChunks(source, prefix) {
    const n = source[prefix + 'N'];
    if (n === undefined) return null;
    let result = '';
    for (let i = 0; i < n; i++) result += (source[prefix + i] || '');
    return result || null;
  }

  function decodePrompts(rawData) {
    if (!rawData) return {};
    if (typeof rawData !== 'string') return rawData || {};
    try {
      const decompressed = LZString.decompressFromUTF16(rawData);
      return decompressed ? JSON.parse(decompressed) : {};
    } catch (_) {
      return {};
    }
  }

  function loadPrompts(callback) {
    chrome.storage.sync.get(null, (syncResult) => {
      const syncPromptsEnabled = syncResult.syncPromptsEnabled === true;
      if (syncPromptsEnabled) {
        const raw = assembleChunks(syncResult, 'pdc')
          ?? syncResult.promptsDataCompressed
          ?? syncResult.prompts
          ?? null;
        callback(decodePrompts(raw));
      } else {
        chrome.storage.local.get(['promptsDataCompressed', 'prompts'], (localResult) => {
          const raw = localResult.promptsDataCompressed ?? localResult.prompts ?? null;
          callback(decodePrompts(raw));
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Prompt lookup
  // ---------------------------------------------------------------------------

  // Strips a leading emoji + whitespace from a prompt title for cleaner matching.
  const EMOJI_RE = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?\s*/u;

  function findPrompt(prompts, triggerName) {
    const needle = triggerName.toLowerCase();
    for (const [title, data] of Object.entries(prompts)) {
      const stripped = title.replace(EMOJI_RE, '').trim().toLowerCase();
      if (stripped === needle) return typeof data === 'string' ? data : (data.text || '');
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Text injection (mirrors popup.js injection logic)
  // ---------------------------------------------------------------------------

  function injectText(el, text) {
    el.focus();

    if (el.isContentEditable) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      const before = el.textContent;
      document.execCommand('insertText', false, text);
      // Fallback for editors that don't respond to execCommand (e.g. some React setups)
      if (el.textContent === before) {
        el.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true, cancelable: true,
          inputType: 'insertText', data: text,
        }));
      }
      return;
    }

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Re-inserts a space when no matching prompt is found (we already called preventDefault).
  function insertSpace(el) {
    if (el.isContentEditable) {
      document.execCommand('insertText', false, ' ');
      return;
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      const newVal = el.value.slice(0, start) + ' ' + el.value.slice(end);
      if (nativeSetter) {
        nativeSetter.call(el, newVal);
      } else {
        el.value = newVal;
      }
      el.setSelectionRange(start + 1, start + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ---------------------------------------------------------------------------
  // Keydown listener
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ') return;

    const el = document.activeElement;
    if (!el) return;
    const isEditable = el.isContentEditable;
    const isInput = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    if (!isEditable && !isInput) return;

    const currentText = isEditable ? el.textContent : el.value;

    // Trigger only when the entire field content is exactly #word
    // Supports Unicode letters and digits, plus hyphens and underscores.
    if (!/^#[\p{L}\p{N}_-]+$/u.test(currentText.trim())) return;

    const triggerName = currentText.trim().slice(1); // strip leading #

    // Prevent the space from being typed; we restore it below if no match.
    e.preventDefault();

    loadPrompts((prompts) => {
      const promptText = findPrompt(prompts, triggerName);
      if (promptText) {
        injectText(el, promptText);
      } else {
        insertSpace(el);
      }
    });
  }, true); // capture phase — intercept before the editor's own handlers
})();
