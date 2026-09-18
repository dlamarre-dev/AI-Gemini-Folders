const { classifyTriggerField, parseSuggestionNames } = require('../src/prompt-trigger.js');

// classifyTriggerField is the pure core of the #-trigger scope logic: it decides
// whether the field is actively composing a trigger (so we may act / move the
// caret) vs. a normal prompt that merely starts with '#'.
describe('classifyTriggerField', () => {
  test('empty field is not a trigger', () => {
    const c = classifyTriggerField('');
    expect(c.composingTrigger).toBe(false);
    expect(c.needsClear).toBe(false);
    expect(c.prefix).toBeNull();
  });

  test('bare "#" composes with an empty prefix (show all)', () => {
    const c = classifyTriggerField('#');
    expect(c.composingTrigger).toBe(true);
    expect(c.prefix).toBe('');
  });

  test('single "#name" line is composing', () => {
    const c = classifyTriggerField('#review');
    expect(c.composingTrigger).toBe(true);
    expect(c.prefix).toBe('review');
  });

  test('a name may contain spaces', () => {
    expect(classifyTriggerField('#review code').prefix).toBe('review code');
  });

  test('punctuation after # breaks the trigger', () => {
    expect(classifyTriggerField('#note: hi').composingTrigger).toBe(false);
  });

  test("a '#' not at the line start is not a trigger", () => {
    expect(classifyTriggerField('hello #world').composingTrigger).toBe(false);
  });

  // The bug we fixed: a normal multi-line prompt whose first line starts with '#'
  // must NOT be treated as a trigger (otherwise the caret was yanked to line 1).
  test('multi-line prompt starting with # does NOT compose', () => {
    const c = classifyTriggerField('#Contexte\nPlease summarize the following');
    expect(c.composingTrigger).toBe(false);
    expect(c.needsClear).toBe(false);
  });

  test('composes while our suggestion block (label on line 2) is shown', () => {
    const c = classifyTriggerField('#rev\n== AI Folders ==\n#review  #revert');
    expect(c.composingTrigger).toBe(true);
    expect(c.prefix).toBe('rev');
  });

  test('orphaned suggestion block (# removed) needs clearing', () => {
    const c = classifyTriggerField('== AI Folders ==\n#review  #revert');
    expect(c.composingTrigger).toBe(false);
    expect(c.needsClear).toBe(true);
    expect(c.prefix).toBeNull();
  });

  test('tolerates null/undefined input', () => {
    expect(classifyTriggerField(undefined).composingTrigger).toBe(false);
    expect(classifyTriggerField(null).needsClear).toBe(false);
  });

  // A prompt NAME may contain punctuation. Live filtering stays restrictive (so
  // prose isn't disturbed), but Space must still be able to inject it.
  test('punctuation in the name: injectable on Space even though live filtering stops', () => {
    const c = classifyTriggerField('#Excellent travail !');
    expect(c.composingTrigger).toBe(false); // '!' stops the live suggestion refresh
    expect(c.injectable).toBe(true);        // but Space can still inject the prompt
  });

  test('injectable respects scope (multi-line prose starting with # is not injectable)', () => {
    expect(classifyTriggerField('#Done!\nbuy milk').injectable).toBe(false);
  });

  test('injectable requires a leading #', () => {
    expect(classifyTriggerField('hello!').injectable).toBe(false);
  });

  test('injectable while our suggestion block is shown', () => {
    expect(classifyTriggerField('#Q&A\n== AI Folders ==\n#Q&A helper').injectable).toBe(true);
  });

  // Zero-width padding. Microsoft 365 Copilot's Fluent composer appends
  // U+200B U+200C on every keystroke, and String.prototype.trim() leaves them
  // (they are Cf format characters, not whitespace). They rode into the lookup
  // prefix, so nothing ever matched and the trigger silently did nothing --
  // confirmed live on m365.cloud.microsoft, 09/2026.
  test('zero-width padding does not reach the prefix (M365 Copilot)', () => {
    const c = classifyTriggerField('#test\u200B\u200C');
    expect(c.firstLine).toBe('#test');
    expect(c.prefix).toBe('test');
    expect(c.composingTrigger).toBe(true);
    expect(c.injectable).toBe(true);
  });

  test('a field holding only zero-width padding is empty, not a trigger', () => {
    const c = classifyTriggerField('\u200B\u200C');
    expect(c.nonEmpty).toEqual([]);
    expect(c.composingTrigger).toBe(false);
    expect(c.prefix).toBeNull();
  });

  test('padding mixed with whitespace is trimmed whichever order it comes in', () => {
    expect(classifyTriggerField('\uFEFF #review \u200B').prefix).toBe('review');
    expect(classifyTriggerField('#review\u200B ').prefix).toBe('review');
  });

  // Trimmed at the edges only: a ZWJ inside a name joins an emoji sequence and a
  // ZWNJ inside a Persian or Hindi word is a letter-level instruction. Stripping
  // those would rename the prompt the user is trying to reach.
  test('an interior ZWJ / ZWNJ is preserved', () => {
    expect(classifyTriggerField('#dev\u200Dops').firstLine).toBe('#dev\u200Dops');
    expect(classifyTriggerField('#dev\u200Dops').injectable).toBe(true);
    expect(classifyTriggerField('#\u0645\u06CC\u200C\u062E\u0648\u0627\u0646\u0645').firstLine)
      .toBe('#\u0645\u06CC\u200C\u062E\u0648\u0627\u0646\u0645');
  });

});

describe('parseSuggestionNames', () => {
  test('returns null when there is no suggestion block', () => {
    expect(parseSuggestionNames('#review')).toBeNull();
  });

  test('parses #-prefixed names (contenteditable), skipping the label line', () => {
    expect(parseSuggestionNames('#rev\n== AI Folders ==\n#review  #revert'))
      .toEqual(['review', 'revert']);
  });

  test('parses plain names (textarea, no #)', () => {
    expect(parseSuggestionNames('rev\n== AI Folders ==\nreview  revert'))
      .toEqual(['review', 'revert']);
  });

  test('handles a single suggestion', () => {
    expect(parseSuggestionNames('#rev\n== AI Folders ==\n#review')).toEqual(['review']);
  });

  // Names with punctuation must be parsed (located via the label, not a charset
  // regex) so Arrow cycling works for prompts like "Done!" or "Q&A".
  test('parses names containing punctuation', () => {
    expect(parseSuggestionNames('#Done\n== AI Folders ==\n#Done!  #Q&A  #réf:'))
      .toEqual(['Done!', 'Q&A', 'réf:']);
  });
});
