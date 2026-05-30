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

  // Returns the suggestion names currently visible in the editor, or null if none.
  function readSuggestionNames(el) {
    const isEditable = el.isContentEditable;
    const rawText = isEditable ? (el.innerText ?? el.textContent) : el.value;
    const nonEmpty = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const suggLine =
      (nonEmpty.length >= 2 && SUGG_LINE_RE.test(nonEmpty[1]) ? nonEmpty[1] : null) ??
      (nonEmpty.length >= 3 && SUGG_LINE_RE.test(nonEmpty[2]) ? nonEmpty[2] : null);
    if (!suggLine) return null;
    return suggLine.split(/\s{2,}/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
  }

  // --- Space: inject prompt or show suggestions ---

  document.addEventListener('keydown', async (e) => {
    if (e.key !== ' ') return;

    const el = document.activeElement;
    if (!el) return;
    const isEditable = el.isContentEditable;
    const isInput = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
    if (!isEditable && !isInput) return;

    // Use innerText (not textContent) so that <p>/<br> paragraph separators in
    // contenteditable editors appear as \n — then check only the first line.
    // This lets the trigger work even when suggestion lines are present below.
    const rawText = isEditable ? (el.innerText ?? el.textContent) : el.value;
    const firstLine = rawText.split('\n')[0].trim();

    if (!/^#[\p{L}\p{N} _-]*$/u.test(firstLine)) return;

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

    const rawText = isEditable ? (el.innerText ?? el.textContent) : el.value;
    const firstLine = rawText.split('\n')[0].trim();
    if (!/^#/u.test(firstLine)) return;

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

    const rawText = isEditable ? (el.innerText ?? el.textContent) : el.value;
    // Filter empty lines: innerText can produce "\n\n" between <p> elements in Quill.
    const nonEmpty = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    const firstLine = nonEmpty[0] ?? '';
    const startsWithHash = /^#[\p{L}\p{N} _-]*$/u.test(firstLine);
    // Check positions 1 and 2: with an extension label on line 2, suggestions are on line 3.
    const hasSuggestionLine = (nonEmpty.length >= 2 && SUGG_LINE_RE.test(nonEmpty[1]))
      || (nonEmpty.length >= 3 && SUGG_LINE_RE.test(nonEmpty[2]));
    // # was just deleted: filter(Boolean) elevates the suggestion line to nonEmpty[0].
    // Detect this so we can clear it (Backspace/Delete only, to avoid false positives).
    const orphanedSuggestion = (e.key === 'Backspace' || e.key === 'Delete')
      && !startsWithHash && !hasSuggestionLine && SUGG_LINE_RE.test(firstLine);

    // Act when: suggestions are visible, OR # is on the first line (any content key
    // triggers live updates from the first # onward), OR suggestion line became orphaned.
    if (!hasSuggestionLine && !orphanedSuggestion && !startsWithHash) return;

    // If # is still on the first line, pass its current suffix as prefix ('' = show all).
    // If # was deleted (orphaned or otherwise), pass null to signal "clear suggestions".
    const prefix = startsWithHash ? firstLine.slice(1) : null;

    clearTimeout(_suggTimer);
    _suggTimer = setTimeout(async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'promptTriggerSuggestUpdate', prefix });
      } catch (_) {}
    }, 80);
  }, true);
})();
