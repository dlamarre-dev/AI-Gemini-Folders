# Selector Diagnostics (maintainer tool)

A small **standalone, unpacked** browser extension that checks whether each
supported AI site's editor selectors still match — and flags when only the
positional fallback works, i.e. when `editorSelectors` in `site-config.js` have
gone stale and need updating.

It is **not** part of the shipped extensions and is **not** built into `dist/`.
It exists only to be run occasionally by a maintainer.

## What it checks

For each site in the `SITES` registry (its `site-config.js` copy is refreshed
from AI Folders' on every `python build.py` run — 16 web platforms) it opens
the landing page in a background tab, waits for the SPA to hydrate, probes the
DOM with the **production** `editorSelectors`, then closes the tab. Per site:

- 🟢 **OK** — a site selector matched (production selectors are healthy).
- 🟡 **FALLBACK — selectors stale** — no site selector matched, but the
  positional heuristic found a composer. Production still works (via the
  fallback) but you should update `editorSelectors` in `site-config.js`.
- 🔒 **NOT LOGGED IN?** — the page redirected to a login/auth page. Log in and
  re-run.
- 🔴 **NO COMPOSER** — neither selectors nor the heuristic found an input
  (logged out, or a major redesign).
- ❌ **ERROR** — the tab couldn't be scripted.

## How to use

1. **Log in to every AI site** in the browser profile you'll test with.
2. Load the tool unpacked:
   - Chrome: `chrome://extensions` → Developer mode → **Load unpacked** →
     select `tools/site-diagnostics/`.
   - Firefox: `about:debugging` → This Firefox → **Load Temporary Add-on** →
     select `tools/site-diagnostics/firefox/manifest.json`. The `firefox/`
     copy carries the Firefox-specific manifest (event-page `background.scripts`
     instead of Chrome's `service_worker`); run `python build.py` first to
     (re)generate it. Loading the root folder's `manifest.json` in Firefox
     would use the Chrome manifest and fail.
3. Click the toolbar icon → a diagnostics page opens in a tab.
4. Click **Run diagnostics**. A full run takes ~30–60 s (sites are opened one at
   a time and closed after probing).

## Keeping selectors in sync

The tool uses a **copy** of `extensions/ai-folders/site-config.js` so it tests
the exact production selectors. `build.py` refreshes that copy on every build,
so the simplest habit is: run `python build.py` (or
`python build.py -e ai-folders`), then reload the tool. To refresh manually:

```bash
cp extensions/ai-folders/site-config.js tools/site-diagnostics/site-config.js
```

The heuristic in `diagnostics.js` (`findComposer`) is a copy of the one in
`src/utils.js` — keep the two in sync if you change it.
