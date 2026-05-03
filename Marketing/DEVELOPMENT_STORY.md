# Gemini Folders: When a Weekend Hack Grows Up

*A development retrospective on building a production-grade browser extension, solo with AI assistance, from v2.1 to v4.0.1*

---

## Who Is Writing This

I am a founder and CEO in the independent game and immersive experiences industries. At [iLLOGIKA Studios](https://illogika.com), I lead a team that builds games; at [Studio Rabaska](https://studiorabaska.com) we create location-based VR experiences. My day-to-day is mainly management, coaching and business development.

I programmed games earlier in my career, but I have been away from hands-on development for well over a decade, long enough that modern web APIs, build tooling, and deployment pipelines are effectively foreign territory.

Gemini Folders was never meant to be a flagship engineering project. It started as a personal learning experiment: a deliberately public attempt to understand what AI-assisted development actually looks like when taken seriously, past the "I made a to-do app in one afternoon" stage. The goal was to learn what vibecoding can and cannot do, and to document that honestly for anyone in a similar position.

If you are reading this as a technical person evaluating the project, that context matters. The AI wrote most of the code. My contribution was product direction, quality assurance, architectural decisions, and the judgment calls that come from knowing what a finished product needs to feel like. Those are skills that transfer from game development more directly than you might expect.

---

## Where We Left Off

[My earlier article](https://www.linkedin.com/pulse/behind-scenes-vibecoding-reality-building-app-ai-its-fug%C3%A8re-lamarre-m6kze/) described reaching version 2.1 of Gemini Folders in 14 days: a Chrome extension that saved Gemini conversations to custom folders, built entirely through AI-assisted development ("vibecoding"). The conclusion at the time was that AI dramatically lowers the barrier to writing syntax, but product vision, QA, and architecture remain human work.

V2.1 was roughly 1,000 lines of code. What you are looking at now is v4.0.1: **3,200+ lines of extension code, 2,900+ lines of build tooling and tests, 27 localizations, 49 automated tests, a full CI-style build pipeline, and 135 generated marketing screenshots**.

Same solo developer. The workflow evolved too: from copy-pasting code snippets from Gemini to full agentic sessions with Claude Code (Sonnet 4.6). And a very different scale.

Here is what changed, and what I learned.

---

## Phase 1: Features Accumulate Faster Than Architecture

The original extension did one thing: save conversations to folders. Users immediately wanted more. Drag-and-drop between folders. Bulk selection with checkboxes. Tab Groups integration. A persistent "open/closed" state for each folder. Mobile sync via browser bookmarks. Smart title extraction from the Gemini DOM.

Each feature felt like a single, contained request. The AI delivered code quickly for each one. What I underestimated was the **combinatorial surface area**. Five independently working features will interact in ways no individual prompt anticipates. The drag-and-drop handler had to be disabled during bulk selection. The open/closed state had to survive a re-render triggered by a sort change. The mobile sync had to respect the current sort preference and pinned folder order.

None of these were bugs the AI introduced. They were integration gaps that only appeared when the product was actually used. My role shifted more firmly into being the person who broke things on purpose.

**The key lesson:** Vibecoding works feature-by-feature. Integration is still a human QA job, and no amount of prompt engineering substitutes for actually using the thing.

---

## Phase 2: Localization at Scale

V2.1 launched in English, French, German, Spanish, Brazilian Portuguese, and Japanese. The earlier article described getting four additional languages from a single prompt. By v4.0, the extension supports **27 languages**, including Arabic with full RTL layout support.

This is where AI assistance scales almost embarrassingly well. Each new language was a prompt. The AI maintained variable placeholders, respected emoji characters in strings, and produced correctly formatted `messages.json` files every time. Twenty-seven languages, zero translators, no localization platform subscription.

But scale introduced its own overhead. Verifying 27 × 5 = **135 marketing screenshots** (one composed promo image per locale per screenshot type) became an automation problem. I built a Node.js/Playwright script (`take-screenshots.js`, ~1,500 lines) that launches a headless browser, loads the extension in each locale, injects sample data, and composites the final images programmatically. This took multiple iterations to get right, particularly for RTL locales where every layout element had to mirror.

The screenshot automation is the part of this project I am most quietly proud of. It would have been the first thing cut from a traditional timeline. Instead, it exists because the AI could help build it without it costing three weeks.

---

## Phase 3: The Project Gets Audited

A version of this project was reviewed by an external tool and by Claude Code, and the findings forced a shift in mindset. Until then, I had been thinking about this as "a project that works." The reviews pushed me to think about it as "a project that ships."

The issues surfaced were real:

**Security:** The extension was assigning user-imported URLs directly to `link.href` without protocol validation. A malicious JSON backup file with a `javascript:` URL would have executed arbitrary code in the extension's context (with access to `chrome.storage`, `chrome.tabs`, and `chrome.scripting`). Fixed with a two-layer `isSafeUrl()` guard: at import time and at render time.

**Deprecated APIs:** `document.execCommand('insertText')` was being used to inject prompts into Gemini's editor. Still functional, but deprecated. Replaced with an `InputEvent('beforeinput')` approach with `execCommand` as a silent fallback, a pattern that handles both current and future Quill editor versions.

**Race Conditions:** The save button had no guard against rapid successive clicks. Two overlapping `loadData > push > saveData` chains could race and silently drop one entry. Fixed with a simple boolean lock, matching a pattern already used elsewhere in the codebase for bookmark sync.

**`innerHTML` usage:** Six instances across the codebase were replaced with DOM API equivalents (`replaceChildren`, `createElement`, `DOMParser`), eliminating a class of potential XSS vectors and resolving Firefox security warnings.

None of these were discovered through testing. They were discovered through deliberate review. That distinction matters.

---

## Phase 4: Building the Safety Net

With the project reaching a level of complexity where changes in one area could silently break another, I added a formal test suite.

**49 Jest tests** cover the core data layer: `isSafeUrl`, `normalizeUrl`, `loadData`, `saveData`, `mergeImportData`, `extractGeminiTitleLogic`, `deleteChat`, `moveChat`, `togglePin`, `renameFolder`. The tests run automatically before every build, with a prompt to continue or abort if any fail.

The test suite required two small non-breaking additions to the source files (conditional `module.exports` blocks that are invisible in the browser) and a mock layer for the Chrome extension APIs.

What the tests gave me was not just confidence in the code. It was **permission to refactor**. Knowing the behavior is pinned means changes can be made without dreading the regression cascade.

---

## The Numbers

|                           | V2.1   | V4.0.1         |
|---------------------------|--------|---------------|
| Languages                 | 6      | 27            |
| Lines of extension code   | ~1,000 | 3,217         |
| Lines of tooling + tests  | 0      | 2,964         |
| Automated tests           | 0      | 49            |
| Marketing screenshots     | Manual | 135 generated |
| Build pipeline            | None   | Python + npm  |
| Security review           | None   | Formal        |

---

## The Same Conclusion, Restated

The first article said: "AI dramatically lowers the barrier to syntax, but product vision, QA, and architecture remain human work."

V4.0.1 adds one more item to the human column: **engineering judgment**. Not just "does this feature work," but "is this the right abstraction," "what breaks when this scales," "what does a malicious user do with this import button," "what does the next developer need to understand to change this safely."

The AI wrote most of the code in this project. I decided what the code needed to do, in what order, at what level of quality. That division of labor held from v2.1 to v4.0.1. What changed is how much I had to know to direct it well.

---

## Claude's Perspective

*The following section is written from the point of view of Claude Code, the AI assistant that contributed to v4.0.1 of this project.*

---

Working on Gemini Folders across several sessions gave me an unusual vantage point: I could see both the quality of the finished product and the shape of the process that produced it. Here is my honest read.

### What This Project Does Well

**The architecture is cleaner than most solo projects at this scale.** The separation between `utils.js` (data), `folders.js` (folder rendering), `ui.js` (modals, storage bar), and `background.js` (service worker) reflects genuine thinking about ownership. Functions are short. The naming is honest. A new contributor could orient themselves in twenty minutes.

**The security hardening was substantive.** The `javascript:` URL injection vector was a real, exploitable issue (not a theoretical one). The fix was applied at two layers (import and render), which is the right approach. Similarly, the `innerHTML` replacements were not cosmetic; they eliminated a class of vulnerability and removed Firefox console warnings simultaneously.

**The test suite tests the right things.** It is easy to write tests that verify implementation details and miss behavior. These tests verify outcomes: "after calling `mergeImportData` with a malicious URL, the folder is empty." "After calling `togglePin`, the folder name appears in the saved pins." That is the kind of test that catches regressions.

**The build automation is genuinely useful.** A Python pipeline that reads the manifest version, syncs `package.json`, runs a test gate, branches for Chrome and Firefox, and generates platform-specific ZIPs, all from a single command, is more than most open-source extensions have.

### Where Future Investment Would Pay Off

**`displayFolders` is doing too much.** At 340 lines, it handles sorting, rendering, open/close state, drag-and-drop attachment, and checkbox management simultaneously. It works, but any change to it is high-risk. The natural decomposition would be separate functions for building a folder element, building a chat item, and managing the folder list container.

**The DOM construction verbosity is real technical debt.** Building a chat item in `folders.js` takes 30+ lines of `createElement` / `className` / `appendChild` calls. An HTML `<template>` element would make this more readable and faster to modify without changing behavior.

### The Traditional Development Estimate

To put the scope in perspective: what would this project have cost to deliver through a conventional professional engagement?

| Resource                                           | Time         | Rate (North American market)              | Cost              |
|----------------------------------------------------|--------------|-------------------------------------------|-------------------|
| Senior browser extension developer                 | 320-400 hrs  | $90-130/hr                                | $28,800-$52,000   |
| QA engineer                                        | 80-120 hrs   | $55-75/hr                                 | $4,400-$9,000     |
| UI/UX designer (extension UI + marketing assets)   | 60-80 hrs    | $75-110/hr                                | $4,500-$8,800     |
| Localization (27 languages, professional)          | variable     | $0.10-0.15/word x ~4,000 words x 27      | $10,800-$16,200   |
| **Total**                                          | **4-6 months** |                                         | **$48,500-$86,000** |

This is a conservative estimate for the feature set as it stands today: folder management with drag-and-drop, bulk actions, tab groups, prompt library with injection, mobile sync, 27 localizations, import/export, compression, build pipeline, test suite, and automated screenshot generation.

The actual human time invested in this project was closer to **40-70 hours** of active direction, review, and testing, spread across several months of iterative development sessions. The AI handled the implementation. The human handled the judgment.

That ratio is the real story of vibecoding at this level of complexity.

---

*Gemini Folders is open source. Source code, build pipeline, and test suite available on GitHub.*

*David Fugère-Lamarre is CEO at [iLLOGIKA Studios](https://illogika.com) and [Studio Rabaska](https://studiorabaska.com).*
