// prompt-trigger.js — Content script: type #PromptName in any AI chat field,
// press Space, and the matching saved prompt replaces the field content.
//
// Detection runs here (isolated world). The actual injection is delegated to
// background.js via chrome.runtime.sendMessage so it can use executeScript and
// run in the page context — avoiding isolated-world limitations with complex editors.

(function () {
  if (window.__promptTriggerActive) return;
  window.__promptTriggerActive = true;

  // Matches "#word  #word" (contenteditable, e.g. Gemini) OR "word  word" (textarea,
  // e.g. Perplexity — no '#' to avoid triggering site-specific token processors).
  // Two-space separator separates names; single spaces are allowed within a name.
  const SUGG_LINE_RE = /^(?:#[\p{L}\p{N}_-]+(?:[ ][\p{L}\p{N}_-]+)*(?:\s{2,}#[\p{L}\p{N}_-]+(?:[ ][\p{L}\p{N}_-]+)*)*|[\p{L}\p{N}_-]+(?:[ ][\p{L}\p{N}_-]+)*(?:\s{2,}[\p{L}\p{N}_-]+(?:[ ][\p{L}\p{N}_-]+)*)*)$/u;
  // Matches the "== Extension Name ==" label line we inject above the suggestion
  // list. Its presence is the reliable signal that we're in trigger mode (vs. a
  // normal multi-line prompt that merely starts with '#').
  const LABEL_RE = /^==\s.+\s==$/;
  let _suggTimer = null;

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

  // Reads the editor's text as the user sees it (innerText keeps <p>/<br> as \n).
  function fieldText(el) {
    return el.isContentEditable ? (el.innerText ?? el.textContent) : el.value;
  }

  // Classifies a field's text for the #-trigger. Pure (no DOM) for unit testing.
  //   composingTrigger: actively composing "#name" — the field is just the #line,
  //                     or our suggestion block (label on line 2) sits right below.
  //   needsClear:       the '#' is gone but our injected suggestion block remains.
  //   prefix:           query suffix after '#' to send, or null when clearing.
  function classifyTriggerField(rawText) {
    const nonEmpty = String(rawText ?? '').split('\n').map(l => l.trim()).filter(Boolean);
    const firstLine = nonEmpty[0] ?? '';
    const labelIdx = nonEmpty.findIndex(l => LABEL_RE.test(l));
    // In scope = the field is just the #line, or our suggestion block (label on
    // line 2) sits right below it. Outside scope it's a normal multi-line prompt.
    const inScope = nonEmpty.length <= 1 || labelIdx === 1;
    // Restrictive charset drives the LIVE suggestion updates: only refresh
    // suggestions while the first line is a clean "#word", so normal prose is
    // never disturbed (no caret moves on multi-line / punctuated text).
    const startsWithHash = /^#[\p{L}\p{N} _-]*$/u.test(firstLine);
    const composingTrigger = startsWithHash && inScope;
    // Broad: any in-scope first line starting with '#' can be injected on Space,
    // so prompts whose NAME contains punctuation ("Done!", "Q&A", "réf:") stay
    // reachable. On no match the Space just passes through, so this is safe.
    const injectable = firstLine.startsWith('#') && inScope;
    const needsClear = labelIdx !== -1 && !startsWithHash;
    const prefix = composingTrigger ? firstLine.slice(1) : null;
    return { nonEmpty, firstLine, startsWithHash, labelIdx, inScope, composingTrigger, injectable, needsClear, prefix };
  }

  // Parses the visible suggestion names out of the editor text, or null if none. Pure.
  function parseSuggestionNames(rawText) {
    const nonEmpty = String(rawText ?? '').split('\n').map(l => l.trim()).filter(Boolean);
    // The suggestion line is the one right below our "== label ==" line. Locating
    // it by the label (not by a charset regex) lets names contain punctuation
    // ("Done!", "Q&A") — otherwise Arrow cycling broke for such prompts. The
    // SUGG_LINE_RE probe stays only as a no-label fallback.
    const labelIdx = nonEmpty.findIndex(l => LABEL_RE.test(l));
    const suggLine = labelIdx !== -1
      ? (nonEmpty[labelIdx + 1] ?? null)
      : ((nonEmpty.length >= 2 && SUGG_LINE_RE.test(nonEmpty[1]) ? nonEmpty[1] : null) ??
         (nonEmpty.length >= 3 && SUGG_LINE_RE.test(nonEmpty[2]) ? nonEmpty[2] : null));
    if (!suggLine) return null;
    return suggLine.split(/\s{2,}/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
  }

  // Returns the suggestion names currently visible in the editor, or null if none.
  function readSuggestionNames(el) {
    return parseSuggestionNames(fieldText(el));
  }

  // --- Space: inject prompt or show suggestions ---

  document.addEventListener('keydown', async (e) => {
    if (e.key !== ' ') return;

    const el = document.activeElement;
    if (!el) return;
    const isEditable = el.isContentEditable;
    const isInput = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    if (!isEditable && !isInput) return;

    // Inject on Space for any in-scope first line starting with '#' (so prompt
    // names with punctuation work too). A normal multi-line prompt that merely
    // starts with '#' is out of scope and passes through untouched; a no-match
    // simply re-inserts the space below.
    const { injectable, firstLine } = classifyTriggerField(fieldText(el));
    if (!injectable) return;

    const triggerName = firstLine.slice(1);

    // Cancel any pending suggestion-update timer: if Space fires before the 80ms
    // debounce elapses, the stale update would corrupt a field already modified by
    // inject/autocomplete.
    clearTimeout(_suggTimer);
    _suggTimer = null;

    // Stop propagation synchronously (before the await) so app-level React handlers
    // (Open WebUI # command picker, Perplexity # tokenizer, etc.) never see this
    // Space keydown and can't transform the editor content before our injection runs.
    // Also flag the next Space keyup for suppression: in Firefox the service worker
    // round-trip is slow enough that keyup fires before executeScript completes,
    // letting Perplexity's keyup handler convert #word into a chip token.
    _blockNextSpaceKeyup = true;
    e.preventDefault();
    e.stopImmediatePropagation();

    let status = 'no_match';
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'promptTriggerLookup',
        prefix: triggerName,
      });
      status = response?.status ?? 'no_match';
    } catch (_) {
      // Service worker unavailable — treat as no match.
    }

    if (status === 'no_match' || status === 'suggestions') {
      // no_match: no prompt found, let the space through normally.
      // suggestions: multiple matches — insert the space so the user can continue
      // typing the rest of the title to disambiguate (e.g. "#Review " → "code").
      _blockNextSpaceKeyup = false;
      insertSpace(el);
    }
    // 'injected' / 'autocompleted': background already acted on the editor.
  }, true); // capture phase — fires before the editor's own handlers

  // Suppress the Space keyup that follows a triggered injection. In Firefox the
  // service worker is slow enough that keyup fires before executeScript completes,
  // giving apps (e.g. Perplexity) time to convert the #word text into a chip token.
  // The flag is cleared here so only the immediate sibling keyup is suppressed.
  let _blockNextSpaceKeyup = false;
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && _blockNextSpaceKeyup) {
      _blockNextSpaceKeyup = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  // --- ArrowDown / ArrowUp: cycle through visible suggestions ---

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    const el = document.activeElement;
    if (!el) return;
    const isEditable = el.isContentEditable;
    const isInput = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    if (!isEditable && !isInput) return;

    const { firstLine, labelIdx } = classifyTriggerField(fieldText(el));
    // Only when our suggestion block (label on line 2) is actually showing,
    // so Arrow keys aren't hijacked inside a normal multi-line prompt.
    if (!firstLine.startsWith('#') || labelIdx !== 1) return;

    const names = readSuggestionNames(el);
    if (!names || names.length === 0) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const currentName = firstLine.slice(1);
    const currentIdx = names.indexOf(currentName);
    const step = e.key === 'ArrowUp' ? -1 : 1;
    // When nothing is selected yet: ArrowDown → first, ArrowUp → last.
    const baseIdx = currentIdx === -1 ? (e.key === 'ArrowUp' ? names.length : -1) : currentIdx;
    const nextIdx = ((baseIdx + step) % names.length + names.length) % names.length;
    const nextName = names[nextIdx];

    clearTimeout(_suggTimer);
    _suggTimer = null;

    try {
      chrome.runtime.sendMessage({ action: 'promptTriggerCycleTab', name: nextName, allNames: names });
    } catch (_) {}
  }, true);

  // --- Live update of suggestion line as the user types ---

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') return; // handled by keydown above
    // Only react to keys that actually change content.
    if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== 'Delete') return;

    const el = document.activeElement;
    if (!el) return;
    const isEditable = el.isContentEditable;
    const isInput = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    if (!isEditable && !isInput) return;

    // Drive live updates only while composing the trigger, or to clear a leftover
    // suggestion block once '#' is gone — never inside a normal multi-line prompt
    // (that would move the caret). See classifyTriggerField.
    const { composingTrigger, needsClear, prefix } = classifyTriggerField(fieldText(el));
    if (!composingTrigger && !needsClear) return;

    clearTimeout(_suggTimer);
    _suggTimer = setTimeout(async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'promptTriggerSuggestUpdate', prefix });
      } catch (_) {}
    }, 80);
  }, true);

  // Exposed for unit tests (Node only; `module` is undefined in the content script).
  if (typeof module !== 'undefined') {
    module.exports = { classifyTriggerField, parseSuggestionNames, SUGG_LINE_RE, LABEL_RE };
  }
})();
