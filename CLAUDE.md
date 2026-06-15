# CLAUDE.md — Working guide for this repository

This file is the onboarding brief for an agent (or contributor) picking up a task
here. It captures the project structure, the build/test/release procedures, the
tools, and the decided constraints — so you can start work without re-discovering
the codebase. Keep it accurate: update it when procedures or constraints change.

---

## 1. What this repository is

Two Manifest V3 browser extensions (Chrome **and** Firefox) that organize AI
conversations into folders and provide a reusable prompt library:

- **Gemini Folders (GF)** — Google Gemini only. Current version **4.5.1**.
- **AI Folders (AF)** — 7 web platforms (Gemini, Claude, ChatGPT, Copilot,
  DeepSeek, Grok, Perplexity) **+ a user-configured local LLM**. Current
  version **1.5.1**.

Both are built from one shared codebase in `src/`, with a thin per-extension
overlay in `extensions/<name>/`. The build merges the two.

Public site / store-referenced privacy policy: **https://aifolders.xyz**
(served from `docs/`, GitHub Pages).

---

## 2. Repository structure

```
src/                         Shared code (copied into every build)
  utils.js                   Storage (loadData/saveData), LZString compression +
                             chunking (makeChunks/assembleChunks), bookmark mobile
                             sync (syncToBookmarksTree), prompt injection
                             (injectPromptIntoEditor / insertSuggestionsInEditor),
                             title extraction, sort helpers, isSafeUrl/normalizeUrl,
                             import merge (mergeImportData/normalizePromptData)
  folders.js                 Folder/conversation rendering + actions (rename, move,
                             delete, pin, tab groups)
  prompts.js                 Prompt library UI (list, inline edit/auto-save, per-row
                             actions, search/sort)
  popup-core.js              Shared popup wiring: i18n pass (applyCommonI18n),
                             clearable search, save-conversation flow, mode toggle,
                             sort menu, mobile-sync toggle, import/export
  ui.js                      showCustomModal (Enter/Escape/backdrop), storage bar,
                             review banner
  bulk-actions.js            Multi-select bar (move/delete)
  prompt-trigger.js          Content script: `#name` + Space trigger (isolated world)
  import.js / import.html    Standalone import page (Firefox can't open a file
                             picker from a popup)
  popup.css                  Shared styles
  lz-string.min.js           Vendored LZString (excluded from coverage)

extensions/ai-folders/       AF overlay (overrides/adds files on top of src/)
  manifest.json  popup.html  popup.js  background.js  site-config.js
  popup-extra.css            AF-only CSS (inherits src/popup.css, adds tweaks)
  _locales/                  43 locales (messages.json)
  icon*.png / *.svg
extensions/gemini-folders/   GF overlay (same set, no popup-extra.css)

tests/                       Jest suites (jsdom). setup.js mocks chrome.* + LZString.
                             ~239 tests, ~65% coverage. Pure-logic + DOM behaviour.
                             Subdirs: stats-collector/, store-publisher/.

Marketing/
  ai-folders/  gemini-folders/   Promo<LANG>.txt (43 each) = store listing text,
                                  screenshots/, DEVELOPMENT_STORY.md
  (Generators were removed — edit Promo*.txt and _locales by hand.)

docs/                        Static GitHub Pages site (aifolders.xyz)
  privacy.html               Renders from site/privacy-i18n.js via site/app.js
  site/privacy-i18n.js       Privacy policy text, 43 languages (window.AF_PRIVACY)
  site/app.js  styles.css    Page renderer + styles
  site/i18n-data.js  i18n-manual.js  logos.js

tools/                       Maintainer tooling — NOT shipped in the extensions
  site-diagnostics/          Detects when a site's editor/title selectors break
  stats-collector/           CWS stats reader (native messaging). Maintainer-only.
  store-publisher/           CWS listing filler + amo_publish.py (AMO API)

build.py                     Build pipeline (see §3)
build_images.py              Regenerates marketing screenshots (release-time only)
.github/workflows/test.yml   CI: npm ci + npm test on push/PR to main
```

---

## 3. Build, test, run

**Tests** (fast, run these constantly):
```bash
npx jest                 # full suite
```

**Build** (runs Jest first; aborts if tests fail):
```bash
python build.py          # interactive
python build.py --yes    # non-interactive (also -y); use this in automation
```
The build copies `src/` then overlays `extensions/<name>/` into
`dist/<name>/{chrome,firefox}`, patches the manifest + locales for Firefox, and
emits versioned `.zip` files. `dist/` is gitignored.

**Manual load (dev mode):**
- Chrome: `chrome://extensions` → Developer mode → Load unpacked →
  `dist/ai-folders/chrome/` or `dist/gemini-folders/chrome/`.
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on →
  `manifest.json` inside `dist/<name>/firefox/`.

---

## 4. Git & CI procedure — DO NOT push to `main` directly

`main` is protected: every change must go through a **pull request** that passes
**3 required status checks** — `test`, `Analyze (javascript-typescript)`,
`Analyze (actions)` (the two `Analyze` checks come from CodeQL *default setup*,
configured on GitHub with no workflow file). Branch protection also requires **1
approving review**, which a solo maintainer cannot self-provide.

Standard flow (the `--admin` on merge overrides *only* the impossible self-review;
the 3 checks still gate the change):
```bash
git checkout -b <branch>
# ... commit work ...
git push -u origin <branch>
gh pr create --base main --fill
gh pr checks --watch                       # wait for the 3 checks to go green
gh pr merge --squash --admin --delete-branch
git checkout main && git pull --ff-only
```
- End commit messages with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- End PR bodies with the Claude Code footer.
- The repo is `dlamarre-dev/AI-Gemini-Folders`; `gh` is authenticated.

---

## 5. Verification after a change

1. `npx jest` — all green.
2. `python build.py --yes` — completes without error.
3. Load `dist/ai-folders/chrome/` and `dist/gemini-folders/chrome/` and manually
   verify the touched area, in **both** Folder and Prompt modes and **both** light
   and dark themes.
4. **If you touched prompt injection** (`injectPromptIntoEditor` /
   `insertSuggestionsInEditor` / `background.js` / `site-config.js`): re-test the
   `#` trigger and the ▶ insert button on the affected sites + a local LLM. This is
   the most fragile area and cannot be covered by unit tests.

---

## 6. Decided constraints — don't re-litigate these

- **`background.js` is NOT shared** between GF and AF (deliberate). Fix bugs in
  both copies.
- **`site-config.js` is NOT merged** between the two extensions.
- **New i18n key** → add it to all 43 `_locales/*/messages.json` of **both**
  extensions. Prefer **reusing existing keys** wherever possible.
- **Store text (`Marketing/`)** must never contain comma-separated brand lists
  (Chrome Web Store keyword-spam rejection, hit 3× historically). Prose such as
  "platforms such as Claude, ChatGPT and Gemini" is fine; bare keyword lists are not.
- **~2px transparent gap on the right of the popup** at fractional Windows DPI
  (125/150%): a device-pixel rounding artifact, **outside the document → not
  fixable in CSS**. Disappears at 100% scaling. Accepted as-is. **Never** retry
  scrollbar/overflow CSS variants for it; don't touch `overflow-y` /
  `scrollbar-gutter` in `popup.css` without a separate reason.
- **Data is keyed by folder name and conversation URL** (no stable IDs). Renames,
  pins and migrations are awkward by design (see TODO §8).
- **Marketing screenshots** are regenerated only at release time
  (`python build_images.py`), not on every change.

---

## 7. Architecture notes (so you don't rediscover them)

- **Storage:** `loadData`/`saveData` (utils.js) transparently compress (LZString)
  and chunk content across `storage.sync` (quota ~100 KB total, 8 KB per item;
  `makeChunks`/`assembleChunks`). UI open-state (`openFolders`/`openPrompts`) lives
  in `storage.local` — device-local, to avoid burning the sync write quota.
  `finishSave(..., affectsBookmarks)` only rebuilds the bookmark mirror when
  folders/pins/sort actually change. Default sort is `dateDesc` (newest-first) for
  both folders and prompts.
- **Prompt trigger:** `prompt-trigger.js` runs as a content script (isolated world)
  and only *detects* `#name`; the actual injection is delegated to `background.js`
  via `chrome.scripting.executeScript({ world: 'MAIN', func: ... })`. The injected
  prompt text comes from the user's own storage, gated by `getSiteByUrl(sender.url)`
  — a page cannot drive it (no `externally_connectable`).
- **Title extraction:** `extractTitleLogic` + per-site strategies in
  `site-config.js`, run via `executeScript`. Falls back to a heuristic (lowest
  sizeable text field) and logs `console.warn("[Folders extension] …")` when a
  selector stops matching.
- **Security posture:** folder/conversation titles render via `textContent` (no
  XSS); `link.href` is gated by `isSafeUrl` (falls back to `about:blank`); import
  is validated (`isSafeUrl` + shape checks + chunked writes); the local-LLM
  permission is requested **scoped to the entered origin only** (the broad
  `optional_host_permissions http(s)://*/*` is just the manifest pattern needed to
  request a dynamic origin at runtime — nothing is granted by default).

---

## 8. Remaining improvement TODOs

The P1–P5 improvement plan is essentially complete. What's left:

- **`popup.css` cleanup:** flatten the stacked `!important` rules on
  `.action-btn` / `.folder-header` / `.chat-item` (around lines ~470–540) into
  single clean definitions. Purely cosmetic (code-side), delicate (1px-shift risk)
  — verify pixel-perfect against current rendering if done.
- **(Deferred)** Extract the inline styles out of `popup.html`. High churn, low
  value, no functional gain.
- **(P5 — discuss with David first)** Differential bookmark sync.
  `syncToBookmarksTree` deletes and recreates the whole bookmark tree on every
  content save; a diff (create/delete/move only what changed) would cut mobile-sync
  churn. Non-trivial (partial-state handling) — only worth it if users complain.
- **(P5 — discuss with David first)** Stable IDs for folders/conversations instead
  of name/URL keys. Would simplify renames/pins and enable the differential sync
  above, but requires a data migration — outside the "same features" scope; don't
  start without an explicit decision.
