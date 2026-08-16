# CLAUDE.md — Working guide for this repository

This file is the onboarding brief for an agent (or contributor) picking up a task
here. It captures the project structure, the build/test/release procedures, the
tools, and the decided constraints — so you can start work without re-discovering
the codebase. Keep it accurate: update it when procedures or constraints change.

---

## 1. What this repository is

Two Manifest V3 browser extensions (Chrome **and** Firefox) that organize AI
conversations into folders and provide a reusable prompt library:

- **Gemini Folders (GF)** — Google Gemini only. Current version **4.5.6**.
- **AI Folders (AF)** — 18 web platforms (Gemini, Claude, ChatGPT, Copilot,
  DeepSeek, Grok, Perplexity, Baidu, Z.ai, Kimi, Qwen, Meta AI, Mistral, Poe,
  Duck.ai, You.com, Pi, Character.AI) **+ a user-configured local LLM**.
  Current version **1.6.4**. The popup's per-site "new conversation" buttons
  are generated from the `SITES` registry (site-config.js) into wrapping
  grid rows — adding a site does not touch popup.html.
  **Site logos**: the extension ships pre-rasterized PNGs
  (`extensions/ai-folders/icons/`, some with a `-light` theme variant) —
  inline SVG `url(#gradient)` fills do NOT render in the popup, don't go back
  to them. The vector sources live in `assets/site-logos/` (reference for the
  website/screenshots/videos); regenerate the PNGs with
  `node tools/generate-site-icons.js` (needs Chrome) after changing one.
  Gemini Folders has an `icons/` directory too, holding only `gemini.png` — the
  welcome page's site row needs the real Gemini mark, which is not the same image
  as GF's own `icon.svg` (§10). Keep the two `gemini.png` copies identical.

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
  welcome.html / .js / .css  First-run page, opened once on fresh install (see §10).
                             Shared; text from each extension's _locales, site logos
                             from its site-config.js. Styled after aifolders.xyz
  popup.css                  Shared styles
  lz-string.min.js           Vendored LZString (excluded from coverage)

extensions/ai-folders/       AF overlay (overrides/adds files on top of src/)
  manifest.json  popup.html  popup.js  background.js  site-config.js
  popup-extra.css            AF-only CSS (inherits src/popup.css, adds tweaks)
  _locales/                  43 locales (messages.json)
  icon*.png / *.svg
extensions/gemini-folders/   GF overlay (same set, no popup-extra.css)

tests/                       Jest suites (jsdom). setup.js mocks chrome.* + LZString.
                             ~270 tests, ~65% coverage. Pure-logic + DOM behaviour.
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
  uninstall-ai-folders.html  Uninstall feedback survey, one page per extension
  uninstall-gemini-folders.html   (noindex; see §9)
  site/uninstall.js  uninstall-i18n.js  uninstall-forms.js

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

**Build** (runs Jest first and **aborts** if it fails):
```bash
python build.py          # interactive
python build.py --yes    # non-interactive (also -y); use this in automation
python build.py --force  # build anyway on a red suite — deliberate use only
```
`--yes` only suppresses prompts; it does **not** wave through a test gate that
did not pass (it used to, which meant a green `🎉 Build finished` proved nothing).
That covers **both** a red suite and a suite that could not be executed at all —
the second case tells you even less than the first. Only `--force` continues.

**Validate what was built:**
```bash
python tools/validate_build.py   # after build.py; exits 1 and lists every problem
```
Checks the four built manifests (version, **permission drift**, no `"tabs"`,
Firefox gecko id), 43 locales with parseable `messages.json`, no unresolved
`__PLACEHOLDER__`, and that each ZIP has a root manifest, `_locales`, and no
`tools/`/`Marketing/`/`tests/` files. Run by CI's `build` job.
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
**5 required status checks** — `test`, `build`, `Analyze (javascript-typescript)`,
`Analyze (actions)`, `Analyze (python)` (the three `Analyze` checks come from
CodeQL *default setup*, configured on GitHub with no workflow file; `python` was
added to the required list on 09/08/2026, CodeQL having started scanning
`build.py` and the `tools/` scripts). Branch protection also requires **1
approving review**, which a solo maintainer cannot self-provide.

The **`build`** job in `.github/workflows/test.yml` packages both extensions for
both browsers, runs `tools/validate_build.py`, then fails if the build dirtied a
tracked file. It was added to the required list on 15/08/2026, so a packaging
regression — a dropped file, a drifted permission, a generated artifact left
uncommitted — now blocks the merge instead of surfacing at release time.

Standard flow (the `--admin` on merge overrides *only* the impossible self-review;
the 5 checks still gate the change):
```bash
git checkout -b <branch>
# ... commit work ...
git push -u origin <branch>
gh pr create --base main --fill
gh pr checks --watch                       # wait for the 5 checks to go green
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
  pins and migrations are awkward by design (see TODO §8). Because those keys are
  user-typed names on ordinary objects, **every existence check must go through
  `hasEntry(container, name)`** (`src/utils.js`), never plain truthiness — including
  the import merge, where a truthy inherited name silently created orphan pins and
  renamed incoming prompts to `<name> (Imported)` against a collision that did not
  exist.
  `folders[name]` is truthy for *every* member of `Object.prototype`, so a folder
  called `toString` or `valueOf` skipped its "create if missing" guard and then
  threw on `.some()` — a blacklist can never be complete, which is why the old
  three-name `isUnsafeKey` was the wrong shape of fix. With an ownership test
  those names simply work as ordinary titles. `isUnsafeKey` now rejects exactly
  one name, `__proto__`: assigning it invokes the prototype setter instead of
  creating a property, so the entry is never stored and `JSON.stringify` emits
  `{}`. Rejection is surfaced as `reservedNameError`.
- **Marketing screenshots** are regenerated only at release time
  (`python build_images.py`), not on every change.

---

## 7. Architecture notes (so you don't rediscover them)

- **Storage:** `loadData`/`saveData` (utils.js) transparently compress (LZString)
  and chunk content across `storage.sync` (quota ~100 KB total, 8 KB per item;
  `makeChunks`/`assembleChunks`).
  **Write first, delete second — never the reverse.** The chunks and their
  `fdcN`/`pdcN` pointer go out in a *single* `sync.set`, whose quota Chrome
  evaluates as a unit, so that call is the commit point. Every superseded key is
  removed in `runCleanup()`, only after that set confirms. Doing the removes first
  (as the code did until 2026-08) loses data on a failed write: the shrink case
  deletes the tail chunks, the set fails, the surviving pointer references keys
  that are gone, `assembleChunks` returns garbage, and `loadData` silently falls
  back to `{}` — every folder appears empty. **Do not "fix" this with generation-
  prefixed chunks:** two generations coexisting doubles peak usage against a
  *shared* 100 KB ceiling, so anyone above ~50 % would stop being able to save at
  all — a worse regression than the bug, for a guarantee the single set already
  gives. Errors must reach the caller: `saveData` passes a message for both sync
  *and* local failures, `mergeImportData` rejects, and both `background.js` use
  `saveDataAsync`/`saveOrReportError` so a failed quick-save shows
  `storageFullError` instead of "✅ Saved!" (a service worker has no `window`, so
  the modal fallback never fires there). UI open-state (`openFolders`/`openPrompts`) lives
  in `storage.local` — device-local, to avoid burning the sync write quota.
  `finishSave(..., affectsBookmarks)` only rebuilds the bookmark mirror when
  folders/pins/sort actually change. Default sort is `dateDesc` (newest-first) for
  both folders and prompts.
- **Prompt trigger:** `prompt-trigger.js` runs as a content script (isolated world)
  and only *detects* `#name`; the actual injection is delegated to `background.js`
  via `chrome.scripting.executeScript({ world: 'MAIN', func: ... })`. The injected
  prompt text comes from the user's own storage, gated by `getSiteByUrl(sender.url)`
  — a page cannot drive it (no `externally_connectable`).
  **Every listener starts with `isRealUserEvent(e)` (`e.isTrusted === true`) and that
  is load-bearing security, not hygiene.** The content script shares the DOM with the
  page, so script on a supported site could otherwise forge `#` + Space, get the whole
  prompt list back (an empty prefix matches everything), read the titles out of the
  composer, then request each body — the entire library, no user interaction. The
  site check cannot help: the attacker *is* the supported site. `dispatchEvent` can
  never set `isTrusted`, so the gate is complete. jsdom cannot make a trusted event
  either, which is why the four handlers (`onSpaceKeydown` etc.) are exported and
  tested directly while `tests/prompt-trigger-events.test.js` dispatches real
  synthetic events to prove the gate holds. Behind it, both `background.js` add
  `isTrustedSender` (own extension id, main frame only) and resolve the target tab
  via `resolveTriggerTabId` — AF's active-tab fallback for Firefox's dynamically
  registered local-LLM script only fires when the active tab is the **same origin**
  that spoke, so a background tab can never drive an injection into another one.
- **Title extraction:** `extractTitleLogic` + per-site strategies in
  `site-config.js`, run via `executeScript`. Falls back to a heuristic (lowest
  sizeable text field) and logs `console.warn("[Folders extension] …")` when a
  selector stops matching.
- **Keyboard access:** custom dropdowns go through `makeMenuAccessible`
  (`src/ui.js`) — the sort menus in `popup-core.js`/`prompts.js` and the
  bulk-move list in `bulk-actions.js`. It adds the WAI menu-button roles, roving
  arrow-key focus, Enter/Space to choose and Escape to close, **without owning
  the open/close state**: each caller keeps its own show/hide code. It supports
  the two conventions in use — a `.show` class or the `hidden` attribute —
  detected once at wiring time (`usesHidden`); testing `!menu.hidden` on a plain
  `<div>` is always true and would make the menu look permanently open. Pass
  `{ radio: true }` for a single-choice menu (both sort menus): items become
  `menuitemradio` and `aria-checked` tracks the `.active` class via a
  MutationObserver, because that class is applied asynchronously by `loadData`.
  `aria-expanded` is re-synced from a **capture** listener on the menu — the
  bulk-move `<li>` stops propagation, so a bubble listener never sees the click.
  Keyboard-opened menus move focus to the first item, detected with
  `e.detail === 0`; `preventDefault` is not usable there since it would suppress
  the very click that opens the menu.
  `showCustomModal` carries `role="dialog"`/`aria-modal`/`aria-labelledby`, traps
  Tab and restores focus to the opener. Its focusable scan filters on inline
  `style.display`, **not `offsetParent`**, which is always null under jsdom.
  Folder and prompt headers already had `tabindex="0"` + `keydown` — that is the
  pattern to copy for anything new.
- **Prompt autosave:** inline edits go through one module-level slot committed by
  `flushPendingEdit` (`src/prompts.js`), called on blur, on `pagehide`, before
  rename/delete/pin and at the top of `displayPrompts`. **Its callback must not
  run until every queued commit has finished writing** — commits are serialized on
  a promise chain, because clearing the slot is synchronous while the load/save
  that follows is not: blur then Pin used to let Pin read the pre-edit text and
  save it back over the edit. Callers with nothing pending still get a synchronous
  callback, so re-renders are unaffected. Tests must use genuinely async storage
  mocks to see this; the synchronous ones hide every ordering bug.
- **Sub-folders (one level):** nesting lives in a **sibling sync key**,
  `folderParents: { child: parent }`, never on the folder itself — `folders[name]`
  is a bare array and every consumer relies on `Array.isArray` holding, so moving
  it into an object would need the migration this codebase has no mechanism for.
  An absent key defaults to `{}` through `loadData` exactly like `pinnedFolders`,
  so old installs and old backups need no conversion, and an old build ignores
  the key instead of dropping it. Child→parent rather than parent→children: a
  parent→children map can express "this folder has two parents", this cannot.
  Child *order* is never stored — it is derived by `sortFolderNames`, same as at
  root. **All the invariants live in `getFolderParent` / `canNestFolder` /
  `pruneFolderParents` (`src/utils.js`)**; nothing else should re-derive them.
  Depth is capped at one twice over: by `canNestFolder` on write, and by
  `buildFolderElement(name, ctx, isChild)` on read, where a child is built with
  `isChild = true` and never asks for children of its own — there is no recursion
  to bound. An **orphan** (parent deleted on another device) reads as a root
  folder without being deleted: a read must not write, and the parent may come
  back on the next sync; `pruneFolderParents` cleans up on the write side.
  **Nesting never touches `pinnedFolders`** — that is what makes a pin dormant
  while nested and live again at the top level, and it holds by doing nothing:
  the pin button is not rendered on a child, and children are sorted with an
  empty pin list so a dormant pin cannot reorder siblings.
  Consequences to know: `affectsBookmarks` (`saveData`) must fire on
  `folderParents` and both `background.js` must rebuild their menu on it, because
  nesting writes **no** `folders` at all; and folder names stay globally unique,
  so two parents cannot both hold a sub-folder called "Notes" — a direct
  consequence of the name-as-key design (§6) and the strongest argument yet for
  the stable-IDs item in §8.
  **Drag & drop:** the drag source is the `.folder-header`, and folder drags use
  `body.is-dragging-folder`, **not** `is-dragging` — the latter neutralizes
  pointer events on every descendant of a `.folder`, which includes the header
  being dragged, so the source stopped being hit-testable the instant the drag
  began and folders could not be dragged at all. (`body.is-dragging .dragging`
  exists for exactly the same reason on chat items.) `body.is-dragging .folder
  .folder--child` restores pointer events so a **conversation** can still be
  dropped into a sub-folder. Un-nesting is handled on the **document**: anywhere
  outside a folder card, since cards stop propagation. Indentation is a
  `margin-inline-start` on the nested card — never padding, which would have to
  out-`!important` the fragile compact block (§8).
- **Security posture:** folder/conversation titles render via `textContent` (no
  XSS); `link.href` is gated by `isSafeUrl` (falls back to `about:blank`); import
  is validated (`isSafeUrl` + shape checks + chunked writes); the local-LLM
  permission is requested **scoped to the entered origin only** (the broad
  `optional_host_permissions http(s)://*/*` is just the manifest pattern needed to
  request a dynamic origin at runtime — nothing is granted by default).
- **Opening a saved conversation** (`openConversation` / `pickReusableTab`,
  folders.js): a plain click activates the tab already showing that URL instead of
  spawning a duplicate; **Ctrl/Cmd-click reuses the last tab the extension opened**
  (`reuseTabId`, `storage.local`); middle-click and Shift-click are left 100% native,
  which is why the `<a href target="_blank">` must stay. The modifier *is* the
  consent for overwriting a tab — that is why there is deliberately no setting, and
  why its only discoverability is the second line of the link's tooltip
  (`chatLinkReuseHint`). That string carries a **`{k}` placeholder** filled by
  `currentModifierKeyLabel()` with `Cmd` on macOS and `Ctrl` elsewhere — never
  hardcode a key name into a translation, it would be wrong on half the machines
  (a test asserts all 43 × 2 keep `{k}` and spell out neither key).
  A remembered tab id is never trusted on its own: it is only
  a tiebreaker inside a candidate set recomputed per click (readable URL, not
  pinned, current window, `window.isSupportedTabUrl` — supplied per extension in
  `popup.js`, so folders.js stays site-agnostic). **Never add the `"tabs"` permission
  for this** — it triggers the "read your browsing history" warning and re-prompts
  every installed user. Without it `chrome.tabs.query({})` still lists every tab but
  populates `tab.url` only for hosts in `host_permissions`, so a tab we cannot read
  is by construction not ours and is never touched; `isSafeUrl` then excludes
  `chrome-extension:` (the popup's own page, `import.html`, `welcome.html`). The
  `url:` filter of `tabs.query` is off-limits for the same reason — filter in JS.
  Consequence to accept, not fix: a local-LLM conversation (AF) and everything on
  Firefox before the user grants host permissions degrade silently to "new tab".

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
- **Site watch list** (checked 15/08/2026 with `tools/site-diagnostics`):
  - **You.com — kept, but untestable.** The consumer chat is closed to new
    subscribers, so its selectors can no longer be validated live. You.com turned
    its unlimited free plan into a 25-query Pro trial on **03/04/2026**
    (support.you.com, "Changes to You.com's Free plan") and `you.com/pricing` now
    lists **API plans only** — the consumer product is being wound down in
    practice. **No end-of-support date has been announced anywhere public**
    (checked the support KB, the pricing page, Wikipedia and the trade press), so
    there is no date to schedule a removal against. Re-check ~02/2027, or sooner
    if a user reports the site dead; removing it means the
    `you` entry in `site-config.js`, its host permissions in `manifest.json` +
    `background.js`, its icons, the README/`llms.txt`/`docs/site` service lists,
    and the store text.
  - **Baidu moved to `wenxin.baidu.com`** (08/2026). `chat.baidu.com` 302s there,
    which the manifest could not follow — hence the `wenxin` host permission and
    `altDomains: ['chat.baidu.com']`. A test now asserts every `SITES` domain and
    altDomain has a host permission, a content-script match and a
    `SUPPORTED_URL_PATTERNS` entry, so the next move fails in CI instead of in the
    field. Baidu's `editorSelectors` and the sidebar title strategy still need a
    live re-run on the new domain.
- **(P5 — discuss with David first)** Stable IDs for folders/conversations instead
  of name/URL keys. Would simplify renames/pins and enable the differential sync
  above, but requires a data migration — outside the "same features" scope; don't
  start without an explicit decision.

---

## 9. Uninstall feedback survey

When the user removes an extension, the browser opens a short survey page on the
website. Both halves are deliberately dumb: the extension only builds a URL, and
the page only posts to a Google Form. **There is no database and no backend.**

- **Extension side:** `buildUninstallUrl` (`src/utils.js`, unit-tested) + a
  `refreshUninstallUrl` / `recordInstallDate` pair in **both** `background.js`
  (not shared — fix bugs in both, §6). The URL carries `l` language, `v` version,
  `b` browser, `i` install date (`YYYY-MM-DD`), `ie=1` when that date was only
  inferred at update time, `o` popup opens and `s` conversations saved (both from
  `usageStats`, `storage.local`), **all in the URL fragment (`#`), never the query
  string**. The browser opens this page unprompted, so anything in the query would
  already be in the request line — in the host's logs and leaked onward via
  `Referer` — before the user consented. Fragments are never sent to a server,
  which is exactly what makes `privacyBody`'s "Nothing leaves your device until you
  press Send" literally true, and keeps `s1UninstallBody`'s "its address carries
  six non-identifying details" true as well. **Never move these back to `?`.**
  `docs/site/uninstall.js` reads the fragment and falls back to the query, because
  `setUninstallURL` captured its value long before the page opens and an extension
  that has not run since the switch still holds a `?` URL; drop the fallback once
  that has aged out. The *date* is sent, never a day count —
  `setUninstallURL` is called long before the page opens, so a count would be
  stale; the page derives the tenure. The URL is re-signed on install/startup
  **and on every `usageStats` change**, so both counters stay current.
  `s` is the one that makes `o` interpretable: opens alone cannot separate "opened
  the popup four times and saved nothing" from "actually used it".
- **Both privacy strings enumerate the params exhaustively** — `privacyBody` in
  `docs/site/uninstall-i18n.js` and `s1UninstallBody` in `docs/site/privacy-i18n.js`
  ("six non-identifying details"). Adding a param means updating both, in all 43
  languages, or the disclosure becomes false.
- **Page side:** `docs/uninstall-{ai,gemini}-folders.html` → `site/uninstall.js`
  (+ `uninstall-i18n.js`, 43 languages, and `styles.css`'s `.uf-*` block). It
  reuses `AF_LANGS` / `AF_RTL` / `AF_SCRIPT_FONT` from `i18n-manual.js` and the
  `LOGOS.geminiFolders` mark; `app.js` and `i18n-data.js` are **not** loaded.
- **`docs/site/uninstall-forms.js` is the only file to touch when the Forms are
  (re)created** — form ids + one `entry.<N>` per question, obtained from the
  Form's "Get pre-filled link". While the ids are still `PASTE_…`, the page warns
  in the console and shows the user a normal thank-you.
- **The Form is the schema.** Its checkbox options must be exactly
  `not-what-expected`, `dont-understand-how`, `wanted-in-page-ui`, `found-bugs`,
  `no-longer-needed`, `found-alternative`, `other` — the English keys, never the
  translated labels. Google silently drops a
  response carrying an unknown option, and translated values would make the
  response sheet unreadable. No question may be *required*, and "Collect email
  addresses" must be OFF.
  **Order of operations when adding a reason or a field: update both Forms FIRST,
  then ship the page.** `no-longer-needed` / `found-alternative` were added because
  26% of the first 43 GF responses arrived with nothing checked and 5 of the 6
  `other` boxes were left empty — the list was missing their reason.
- **The GF Form carries an eighth option, `switched-to-ai-folders`**, shown first on
  the Gemini Folders page only (leaving for AI Folders is an upgrade, not a
  grievance, and mixing it into the complaints would misread the numbers). Its
  label names the *other* product — `SWITCH_REASON.afName` in `uninstall.js`
  resolves `{p}` to the AF name even on the GF page. The AF page never sends this
  value, so the AF Form must not offer it.
- **Nothing is transmitted on page load** — the browser opens that URL without the
  user asking, so only an explicit Send posts anything. Disclosed in the privacy
  policy (`s1UninstallTitle` / `s1UninstallBody`, 43 languages) and in a note on
  the page itself. Don't add anything that fires on load.
- **Both pages are `noindex`, absent from `sitemap.xml`, and linked from nowhere.**
  Do **not** add a `Disallow` to `robots.txt`: a disallowed URL can still be
  indexed URL-only, whereas a crawlable `noindex` is honoured (GitHub Pages cannot
  send `X-Robots-Tag`).

---

## 10. First-run welcome page

Opened in a tab **once, on fresh install only**, by `openWelcomeTab(details.reason)`
in **both** `background.js` (not shared, §6 — `reason === 'install'`, never `update`
or `onStartup`).

**Why it exists — don't remove it without new data.** The first 43 Gemini Folders
uninstall responses (27/07 → 07/08/2026, a 44% response rate against 97 CWS
uninstalls, so representative) said the churn is in the first minute, not in the
features: 77% uninstalled the same day, median 2 popup opens, and **23% had `o=0` —
they never opened the popup at all**. Chrome hides a new extension behind the puzzle
icon, so after installing, nothing on screen changes. Hence step 1 is "pin it", not
a feature tour. Baselines to measure against are in §11.

**Firefox needs step 1 too — do not remove it there.** Since Firefox 109 (Jan 2023)
Firefox has its own unified Extensions panel and a newly installed extension lands
*in the panel*, not on the toolbar, exactly like Chrome; the extensions that don't
appear in that panel are precisely the pinned ones. Only the gesture differs, so
`welcome.js` swaps `welcomePinBody` for `welcomePinBodyFirefox` on a `/Firefox/`
user-agent (same test as `background.js`). That string quotes Firefox's **own**
"Pin to Toolbar" label, taken from `mozilla-l10n/firefox-l10n`
(`browser/browser/unifiedExtensions.ftl`, key
`unified-extensions-context-menu-pin-to-toolbar`) so the page names the menu entry
the user actually sees. Five locales (et, hi, lt, ms, sw) have that file without the
key, so Firefox falls back to en-US there — quoting the English label is correct for
them, not a gap. Serbian is the Latin transliteration of Firefox's Cyrillic label
(§6 / `tests/serbian-latin.test.js`). The step-1 artwork stays puzzle → pin in both
browsers — the pin is the *outcome*, which is what the step title promises — but the
**puzzle glyph itself is per-browser**: `.ico-chrome` (Material Symbols `extension`,
filled) and `.ico-firefox` (Firefox's outline puzzle, stroked) both ship in the HTML
and `pickExtensionsGlyph()` removes the one that does not apply. Exactly one must
survive or they stack inside the same 38px tile. The outline needs `fill: none` **and**
its `stroke-width` declared in `welcome.css`: presentation attributes on the markup
lose to any CSS rule, so `.glyph svg { fill }` would otherwise flood the shape.

- **`src/welcome.html` + `welcome.js` + `welcome.css` are shared** by both
  extensions. Every string comes from `chrome.i18n`, so the Gemini-vs-18-sites
  wording lives in each extension's own `_locales`. Seven of the eight keys are
  deliberately **product-neutral and byte-identical** between AF and GF; only
  `welcomeOpenBody` differs. `tests/welcome.test.js` enforces both halves of that.
  The product name is not a new key — the page reuses `appTitle`.
- **It is styled after aifolders.xyz, not after the popup** (brand row → big `h1` →
  translucent cards → violet accent → `.btn-primary`), so the extension's own tab
  reads like the privacy and uninstall pages the same user may see later.
  `welcome.css` copies the tokens from `docs/site/styles.css`; keep them in step.
  Two deliberate departures:
  - **Dark only.** The site has no light theme, so matching it means not having one.
    Don't "fix" this by adding a light palette — that would stop matching the site.
  - **No web font.** The site pulls Schibsted Grotesk + a dozen Noto subsets from
    Google Fonts. This page must stay inert, so it keeps the site's stack minus the
    hosted font and falls back to `system-ui`. Vendoring the woff2 would cost
    ~80 KB × 2 extensions (latin + latin-ext, both needed for the 43 locales) — a
    deliberate open question, not an oversight.
  It does **not** import `popup.css`: that pins `body { width: 392px;
  max-height: 576px }` and `html { overflow-y: hidden }`, which a full tab must not
  inherit, and the block is explicitly fragile (§6).
- **The three illustrations are real UI, not schematics.** Step 1 shows Chrome's own
  toolbar glyphs — Material `extension` (the puzzle button) then Material `push_pin`
  — because those two icons *are* the instruction. Step 2 shows the supported sites'
  logos, built by `welcome.js` from each extension's `site-config.js`: `SITES`
  entries that have a `domain` (AF), or Gemini alone when there is no registry (GF,
  which therefore also ships `icons/gemini.png`). Entries without a domain — the
  user-configured local LLM — are left out of a row that says "open a conversation
  on one of these". Step 3 is a CSS replica of the popup's own add-conversation
  button, localized, so it is recognizable once the popup opens.
- **The replica copies the popup button's *computed* values, not its source.**
  `popup.css` declares a `.main-btn` block inside its `prefers-color-scheme: dark`
  media query (translucent blue, 1px border, blue glow) that the plain `.main-btn`
  rule further down overrides at equal specificity — so **none of that dark block
  ever applies**, and transcribing it would have produced a button no user sees.
  Read the values out of the browser if you touch this. (The dead block is a real
  popup.css wart; cleaning it belongs with the §8 CSS cleanup, not here.)
  A test pins the replica to the popup's dark `--accent-color` / `--shadow-sm` so a
  restyle of the popup fails loudly instead of drifting.
- **Step 3's text quotes the popup's Save button through a `{b}` placeholder**, which
  `welcome.js` fills with this locale's `saveBtn`. Never hardcode the button name
  into a translation: the substitution is what stops the instruction from naming a
  button the popup does not have. A test asserts all 43 × 2 keep the placeholder.
- **The page is inert**: no network, no storage writes, no "welcome seen" flag. It
  opens unprompted, so anything that fired on load would look like a phone-home —
  the same rule as the uninstall page (§9). A test asserts this.
- No `manifest.json` entry is needed: the build copies the whole `src/` tree, and an
  extension page opened via `chrome.runtime.getURL` needs no
  `web_accessible_resources`.

---

## 11. Baselines for the 2026-08 anti-churn work

Frozen 06/08/2026 over 30 days (08/07 → 06/08), so the welcome page and the survey
changes can be judged on a comparable window. Re-measure ~30 days after release.

| Metric | Source | GF | AF |
|---|---|---|---|
| Installs | CWS | 674 (22.5/day) | 113 (3.8/day) |
| Uninstalls | CWS | 318 (10.6/day) | 40 (1.3/day) |
| **Churn** | CWS | **47%** | 35% |
| Net | CWS | +356 | +73 |
| Share with `opens=0` | survey | **23%** | 1/7 |
| `dont-understand-how` | survey | 12% | 1/7 |
| Uninstalled same day | survey | 77% | 7/7 |

Reading cautions:

- GF churn was **already** falling before any change (52% → 42% between the two
  fortnights). Don't claim that slope: compare GF's movement against AF's over the
  same window, AF being a rough control (same code, same release, different audience).
- AF is too small (40 uninstalls/month) for a change there to mean anything. Conclude
  on GF; on AF only check for the absence of a regression.
- **2026-07-30 reads 0 installs / 0 uninstalls on both extensions** — a CWS reporting
  gap, not a real day. Exclude it from any daily average.
- **`s` is discontinuous from the tab-reuse release onward.** Until then, saving a
  conversation that was already in the folder still wrote and still incremented
  the counter, so older `s` values are inflated by re-saves. The number is now
  right, but **do not compare averages across that boundary**.
- Once `s` (§9) has data, the decisive question becomes readable: among those who
  leave with `saves > 0` (they did use it), what share ask for `wanted-in-page-ui`?
  That number — not today's n=4 — decides whether the in-page UI is worth building
  (§8's deferred item).
