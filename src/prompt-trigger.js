// prompt-trigger.js — Content script: type #PromptName in any AI chat field,
// press Space, and the matching saved prompt replaces the field content.
//
// Detection runs here (isolated world). The actual injection is delegated to
// background.js via chrome.runtime.sendMessage so it can use executeScript and
// run in the page context — avoiding isolated-world limitations with complex editors.

(function () {
  if (window.__promptTriggerActive) return;
  window.__promptTriggerActive = true;

  // Re-inserts a space after e.preventDefault() when no prompt matched.
  function insertSpace(el) {
    if (el.isContentEditable) {
      document.execCommand('insertText', false, ' ');
      return;
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd   ?? el.value.length;
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      const newVal = el.value.slice(0, start) + ' ' + el.value.slice(end);
      if (nativeSetter) { nativeSetter.call(el, newVal); } else { el.value = newVal; }
      el.setSelectionRange(start + 1, start + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  document.addEventListener('keydown', async (e) => {
    if (e.key !== ' ') return;

    const el = document.activeElement;
    if (!el) return;
    const isEditable = el.isContentEditable;
    const isInput = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    if (!isEditable && !isInput) return;

    const currentText = (isEditable ? el.textContent : el.value).trim();

    // Trigger only when the entire field contains exactly #word
    if (!/^#[\p{L}\p{N}_-]+$/u.test(currentText)) return;

    const triggerName = currentText.slice(1);

    // Stop propagation synchronously (before the await) so app-level React handlers
    // (Open WebUI # command picker, Perplexity # tokenizer, etc.) never see this
    // Space keydown and can't transform the editor content before our injection runs.
    e.preventDefault();
    e.stopImmediatePropagation();

    let matched = false;
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'injectPromptTrigger',
        triggerName,
      });
      matched = response?.matched === true;
    } catch (_) {
      // Service worker unavailable — treat as no match.
    }

    if (!matched) insertSpace(el);
  }, true); // capture phase — fires before the editor's own handlers
})();
