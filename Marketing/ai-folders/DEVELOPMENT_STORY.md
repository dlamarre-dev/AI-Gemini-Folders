# AI Folders: One Extension, Every AI

*A development retrospective on expanding a Gemini-only tool into a six-platform AI organizer, solo with AI assistance*

---

## Who Is Writing This

The same person as last time. I am the CEO of [iLLOGIKA Studios](https://illogika.com) and [Studio Rabaska](https://studiorabaska.com). I build games and VR experiences for a living. I have not been a hands-on developer for over a decade.

If you have not read the Gemini Folders retrospective, the short version: I built a browser extension through AI-assisted development ("vibecoding"), documented it honestly, and ended up with a production-grade Chrome extension with 27 localizations, 49 automated tests, a full build pipeline, and over 6,000 lines of code. The AI wrote most of it. I directed it.

This is the follow-up.

---

## Where We Left Off

Gemini Folders v4.1 was a polished, well-tested extension for one platform: Google Gemini. Users started asking the obvious question almost immediately after launch: *does it work with ChatGPT?*

It did not.

The extension had `gemini.google.com` hardcoded in roughly a dozen places. The DOM extraction logic was tuned specifically for Gemini's Quill editor. The host permissions in the manifest pointed at a single domain. It was not architecturally hostile to multi-platform support, but it was not ready for it either.

The decision to build AI Folders as a separate extension rather than modifying Gemini Folders was deliberate. Gemini Folders users have a working, stable tool. Adding six platforms to it mid-cycle would have meant weeks of regression risk for people who never asked for ChatGPT support. A parallel extension keeps both clean.

---

## Phase 1: Designing the Registry

Before any extension code was written, the repo itself had to be restructured. Gemini Folders had everything in a flat `src/` directory. Supporting two extensions from the same codebase required splitting into shared source (`src/`, containing `utils.js`, `folders.js`, `ui.js`, `popup.css`) and per-extension overlays (`extensions/gemini-folders/`, `extensions/ai-folders/`). The build pipeline merges them at build time; extension-specific files take precedence. Both extensions now share the same data layer, test suite, and UI components while diverging only where they need to.

The first architectural decision was the most consequential one: how to represent "a supported AI platform" in a way that could scale.

The answer was `site-config.js`, a registry that defines each platform as a data object:

```javascript
chatgpt: {
  domain: 'chatgpt.com',
  color: '#ffffff',
  newConvUrl: 'https://chatgpt.com/',
  editorSelectors: ['#prompt-textarea', ...],
  logoSvg: `<svg .../>`,
}
```

Each entry contains everything the extension needs: what URL to match, what color to use for visual cues, where the text input lives, what icon to render next to saved conversations. Adding a new platform means adding one object to the registry. Everything else — context menus, keyboard shortcuts, prompt injection, title extraction — reads from it.

This is the kind of abstraction that is easy to describe and surprisingly hard to get right on the first try. The `editorSelectors` array in particular went through several iterations. Perplexity, for example, uses a `textarea` in some states and a `contenteditable` div in others depending on where the user is in their flow. Copilot's input lives inside a shadow-DOM web component. The solution was a priority-ordered list of selectors tried in sequence, with the focused element checked first.

**The key lesson:** Designing a registry before you know all the edge cases means the registry will need revising. The right response is to make revision cheap, not to over-engineer the initial version.

---

## Phase 2: Localization at 43 Languages

Gemini Folders launched with 2 languages. AI Folders launches with **43**.

The additional locales were not the interesting part. The interesting part was the volume of strings that needed extension-specific adaptation. AI Folders has concepts Gemini Folders does not: saved conversations from six different platforms, a site-specific color accent, a prompt library that injects into any supported AI. The localization was not a copy-paste from Gemini Folders; it was a transformation.

A one-time bootstrap script (`generate_af_locales.py`) handled this. It read the 43 Gemini Folders locale files, applied a set of per-language transformation rules, and output AI Folders locale files. For most strings, the transformation was simple substitution ("Gemini" → the appropriate local AI term). For morphologically complex languages — Finnish, Hungarian, Greek, Serbian — the substitution broke grammatical case. Those languages required per-key overrides written by hand. (AI Folders' locales are maintained by hand now, so the bootstrap script has since been removed.)

**Finnish** was the clearest example. The extension name in Finnish uses the illative case in certain strings ("Save to Kansiot AI" → "Tallenna AI-Kansioihin"). Swapping the nominative form into a string expecting the illative produces nonsense. The fix was to enumerate those strings explicitly per language rather than trust a generic find-and-replace.

The broader observation: AI assistance scales well on volume. It scales less well on grammar. Every language with significant morphological complexity required a human judgment call about which forms were acceptable.

The marketing screenshot pipeline from Gemini Folders was extended to cover all 43 locales for AI Folders. The Playwright script that renders screenshots had to be taught the ChatGPT interface: different sidebar structure, different topbar, different input field, different favicons. The promo image showing the ChatGPT context menu required building an entire mock of the ChatGPT UI in HTML, including correct dark-mode colors, an authentic Chrome browser frame with tab bar and address bar, a context menu, and a sub-menu with folder names. Every locale gets its own version of that image.

---

## Phase 3: The Edges of Cross-Platform

Multi-platform support surfaces bugs that a single-platform extension never encounters.

**SVG gradients fail in innerHTML.** The official icons for Gemini and Copilot use gradient fills referenced by `fill: url(#id)`. Chrome extension popups do not resolve those cross-SVG URL references when SVGs are inserted via `innerHTML`. The fix was a shared hidden `<svg><defs>` block at the top of `popup.html`, declaring all gradient IDs before any element references them.

**Perplexity injected prompts twice.** The textarea injection dispatched both `input` and `change` events. Perplexity's `change` handler concatenated incoming text with existing content rather than replacing it. React inputs only need `input`; removing the `change` dispatch fixed Perplexity without touching anything else.

**The Firefox keyboard shortcut was silent.** The shortcut worked in Chrome but not Firefox. In Firefox, background scripts run as event pages; `importScripts()` is a service worker API unavailable there. A guard clause suppressed the failure silently, so `site-config.js` was never loaded and `getSiteByUrl` was undefined. Every shortcut save failed without any visible error. The fix: add `site-config.js` to the `background.scripts` array in the Firefox manifest, generated by the build pipeline.

**The bulk dropdown ignored dark mode.** A native `<select>` inherits OS colors in ways CSS cannot fully override across browsers. Three approaches failed before the right solution: replace it with a custom HTML dropdown, styled entirely with CSS variables, opening upward with `position: absolute; bottom: 100%`. `position: fixed` was tried first and abandoned when it became clear that Chrome does not let fixed elements escape `position: sticky` containing blocks as the spec describes.

**Toast text contrast.** Each platform's brand color becomes the toast background on save. White text on ChatGPT's white background is invisible. A luminance check now selects black or white text automatically, applied to both keyboard shortcut and context menu saves.

**Context menu feedback.** Right-click saves had no visual confirmation. Keyboard shortcut saves did. The context menu handler now shows the same saved/already-saved toast, using the same `showToast` function.

These bugs share a pattern: they live at the intersection of a specific platform, a specific browser, and a specific OS configuration. No automated test catches them before they ship. Users do.

---

## Phase 4: Build Pipeline as Product

By the time AI Folders was ready, the build pipeline had become a product in its own right.

A single `python build.py` command:
- Reads the manifest version for each extension
- Syncs `package.json` and `package-lock.json`
- Runs 49+ automated tests, with a prompt to abort on failure
- Merges shared source with extension-specific overrides
- Injects browser-specific settings (Firefox manifest patches, `site-config.js` in background scripts, keyboard shortcut rewriting across 43 locale files and all marketing text files)
- **Injects the correct store review URL** (Chrome Web Store or Firefox Add-ons) into `popup.html` at build time, chosen from a config table at the top of the script
- Copies and adapts marketing files for each browser
- Produces four ZIP files: `gemini-folders-chrome-vX.zip`, `gemini-folders-firefox-vX.zip`, `ai-folders-chrome-vX.zip`, `ai-folders-firefox-vX.zip`

The review URL injection is worth singling out. The original implementation had the Chrome store URL hardcoded in `popup.html` and a Firefox branch in `ui.js` that overrode the `href` at runtime by sniffing `navigator.userAgent`. Runtime browser detection for a static string that is known at build time is a code smell. The refactor moved all four URLs (GF Chrome, GF Firefox, AF Chrome, AF Firefox) to a config table in `build.py` and replaced the runtime branch with a placeholder substitution during the build. `ui.js` no longer needs to know which browser it is running in.

The correct place to make a build-time decision is at build time.

---

## The Numbers

|                              | GF v4.0       | AI Folders v1.0 |
|------------------------------|---------------|-----------------|
| Supported platforms          | 1             | 6               |
| Languages                    | 27            | 43              |
| Lines of extension code      | ~3,200        | ~4,800          |
| Lines of tooling + tests     | ~2,900        | ~4,100          |
| Automated tests              | 49            | 49             |
| Marketing screenshots        | 135 generated | 215 generated   |
| Build outputs per run        | 2 ZIPs        | 4 ZIPs          |

---

## The Same Conclusion, One More Time

The Gemini Folders story ended with: *"The AI wrote most of the code. I decided what the code needed to do."*

AI Folders adds a corollary: **the difficulty is not in writing the code, it is in knowing what is true.**

The Perplexity double injection was not a hard bug to fix. It was a hard bug to find, because it required knowing that Perplexity's `change` listener behaved differently from everyone else's, and there was no obvious signal that it did. The Firefox shortcut bug required knowing that `importScripts` is a service worker API, that Firefox event pages do not have it, and that the guard clause was hiding the failure rather than surfacing it. The dropdown positioning bug required knowing that `position: fixed` inside `position: sticky` does not behave as specified in all browsers.

None of those are things you find by reading the code. You find them by using the product, in the configurations your users use, and paying attention when something does not feel right.

That part has not been automated yet.

---

## A Note on the Tools

The workflow for AI Folders was the same as for Gemini Folders v4.1: Claude Code (Sonnet 4.6), full agentic sessions, the model reading files and understanding the project as a whole. The context window management improved over time. I have learned to start sessions with a focused scope and to compress context by summarizing what was accomplished before continuing. The five-hour window cap is still the most disruptive constraint in the tool, less because of the limit itself than because of the timing: it tends to hit mid-task.

The session that built the custom bulk dropdown touched six CSS files, three JavaScript files, and two HTML files across source and dist directories, across multiple failed approaches before arriving at the `position: absolute; bottom: 100%` solution. That kind of iterative, multi-file debugging across a long session is where Claude Code genuinely earns its keep. The alternative would have been manually applying each fix to each file in each directory, six times over.

---

## Claude's Perspective

*The following section is written from the point of view of Claude Code.*

---

AI Folders was a harder project than Gemini Folders, in the specific way that adding platforms is always harder than it looks. Here is what stood out.

### What This Project Does Well

**The registry pattern in `site-config.js` is the right abstraction.** Each platform is a self-contained object: its domain, its input selectors, its logo, its color. The injection logic does not need to know which platform it is operating on; it reads from the registry. This is the kind of design that is obvious in retrospect and not obvious at all when you are staring at six different AI platforms with six different DOM structures.

**The build pipeline is doing real work.** Review URL injection at build time instead of runtime browser detection is a genuine improvement, not just cosmetic. The `site-config.js` injection into Firefox's background scripts array is the kind of fix that prevents an entire class of silent failures: things that work in Chrome, fail in Firefox, and produce no error message.

**The localization transform approach scales.** Rather than maintaining 43 locale files independently for each extension, AI Folders derives its locales from Gemini Folders through a transformation script with explicit per-language overrides for declined forms. This means a fix to a shared string propagates to both extensions. The override system handles the minority of strings where languages require forms that simple substitution breaks.

### Where Future Investment Would Pay Off

**The `editorSelectors` lists need monitoring.** The selectors for Perplexity, Copilot, and ChatGPT were correct as of the time this was built. These platforms update their frontends frequently and without warning. A selector that matched `#prompt-textarea` today may not match the equivalent element after a redesign. There is no automated monitoring for this. The extension will silently fail to inject prompts on a platform after an update, and the only signal will be a user report.

**The title extraction strategies have the same problem.** `extractAITitleLogic` uses heuristics tied to current DOM structure: `aria-current="page"`, `document.title` parsing, first user message content. These are reasonable guesses that will need revisiting as platforms evolve.

**The prompt injection test coverage is zero.** The automated tests cover the data layer well. They do not test `executeScript` injection at all, because testing it correctly requires a real browser context. This is the part of the extension most likely to break silently after a platform update, and it has no safety net.

### The Traditional Development Estimate

| Resource                                              | Time          | Rate (North American market)           | Cost                |
|-------------------------------------------------------|---------------|----------------------------------------|---------------------|
| Senior browser extension developer                    | 480-600 hrs   | $90-130/hr                             | $43,200-$78,000     |
| QA engineer (multi-platform, multi-browser)           | 120-160 hrs   | $55-75/hr                              | $6,600-$12,000      |
| UI/UX designer (extension UI + 215 marketing assets)  | 80-100 hrs    | $75-110/hr                             | $6,000-$11,000      |
| Localization (43 languages, professional)             | variable      | $0.10-0.15/word x ~5,000 words x 43   | $21,500-$32,250     |
| **Total**                                             | **6-9 months** |                                       | **$77,300-$133,250** |

The actual human time invested: closer to **25-40 hours** of active direction, review, and testing across the AI Folders-specific work (on top of the existing Gemini Folders foundation). Six platforms, 43 languages, 215 marketing screenshots, a refactored build pipeline, and several non-obvious cross-platform bugs found and fixed.

The ratio holds.

---

*AI Folders is open source. Source code, build pipeline, and test suite available on [GitHub](https://github.com/dlamarre-dev/AI-Gemini-Folders).*

*David Fugère-Lamarre is CEO at [iLLOGIKA Studios](https://illogika.com) and [Studio Rabaska](https://studiorabaska.com).*
