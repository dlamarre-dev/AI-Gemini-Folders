# CLAUDE.md — `tools/stats-collector`

> Place this file at `tools/stats-collector/CLAUDE.md`. It scopes work for the
> usage-stats collector and the public dashboard pipeline. Read the repo root
> `readme.md` and `CONTRIBUTING.md` first.

## What we're building

A **public, auto-updating usage dashboard** for the extensions (Gemini Folders
now; AI Folders later), hosted on **GitHub Pages**, refreshed **once a month**,
**with zero end-user tracking**. The dashboard is fed by two data pipelines that
write JSON into the repo; GitHub Pages rebuilds on push.

This directory contains the part Google makes hardest: pulling the Chrome Web
Store's own analytics, which have **no API**.

## Hard constraints (do not violate)

1. **No telemetry in the shipped extensions.** The README promises "No
   third-party servers, no analytics, no tracking." That promise is
   non-negotiable. Nothing built here may be imported by, bundled with, or
   referenced from `src/`, the `extensions/` outputs, `build.py`, or `dist/`.
   This is a **dev-only operator tool** that only the maintainer runs.
2. **Keep it out of the build/release path.** Do not wire `tools/` into
   `build.py`. The collector is loaded manually in Firefox via
   `about:debugging`. Ensure `dist/` and any release artifacts never include it.
3. **Privacy of the data itself.** Only publish aggregate counts already shown
   in the CWS dashboard / GA4 (totals by country, version, source, day). No
   per-user data, ever.
4. **Secrets never committed.** The GitHub PAT and any GA4 service-account key
   stay in local config / env, gitignored. PAT scoped to this repo only.

## Why Firefox (key architectural decision)

Chrome blocks extensions from running on its own Store domain
(`chrome.google.com` is on Chrome's protected-origins list), so a Chrome
extension cannot read the developer dashboard DOM or get a host permission on
it. **Firefox does not protect Google's store domain** — to Firefox the CWS
developer console is an ordinary third-party site. So the collector is a
**Firefox (MV3) extension** with a host permission on the dev console origin.

Read the **rendered DOM**, do **not** replay the CSV-export network calls (they
depend on session + CSRF tokens and are brittle).

## Repo conventions to follow

- **Vanilla JS, MV3, modular files** (separate UI / logic / config), matching
  `src/`. No frameworks, no bundler for the extension itself.
- **Python** is already a first-class citizen here (`build.py`, the
  `generate_af_*.py` scripts) — use Python for the GA4 puller.
- **Tests:** Jest (`jest.config.js`, `tests/`). Add focused unit tests for the
  pure parsing/normalization functions (DOM table → JSON). Don't try to test the
  live scrape.
- **License:** MIT. **Comments/identifiers in English.**

## Directory layout to create

```
tools/
  stats-collector/        # Firefox MV3 extension (dev-only, never shipped)
    manifest.json         # host permission on the dev console origin
    background.js         # orchestrates: open tabs, request parse, commit
    content/
      scrape.js           # injected into dev console; reads rendered DOM
    lib/
      normalize.js        # pure: DOM rows/series -> stable JSON schema (TESTED)
      github.js           # commit JSON via GitHub Contents API (PUT + PAT)
    config.example.json   # item IDs, repo, data paths (no secrets)
    README.md             # how to load, log in, run, re-auth
  ga4-puller/             # Python: GA4 Data API -> JSON (country, source/medium)
    pull_ga4.py
    requirements.txt
docs/                     # GitHub Pages site (serve Pages from /docs on main)
  index.html
  app.js                  # reads docs/data/*.json, renders charts
  data/
    cws.json              # native store metrics (history, appended monthly)
    ga4.json              # GA4 metrics (history; archive past 2-month retention)
```

## Data pipelines

**1. CWS native metrics (this extension).** Reports to capture: Installs &
Uninstalls, Impressions, Weekly Users, plus breakdowns by country / language /
version. For each: navigate the dev console SPA to the report, read the rendered
tables and chart series, normalize to JSON, **merge into history** in
`docs/data/cws.json`, commit via GitHub API.

**2. GA4 metrics (`ga4-puller`).** GA4 Data API via a service account. Pull
active users by **country** and by **session source/medium**. Append to
`docs/data/ga4.json`. Note: the CWS-linked GA4 property retains data only ~2
months, so this script's job is also to **preserve long-term history** by
appending, never overwriting.

**3. Dashboard (`docs/`).** Static site reading the two JSON files, served by
**GitHub Pages from `/docs` on `main`**. A working visual reference already
exists (React/recharts prototype) — port the same views to a dependency-light
static page.

Charting: keep it lightweight, matching the repo's vanilla ethos.
- **Time series** (installs/uninstalls/active users over time, impressions) →
  **uPlot** (~40 KB, fast, built for time series). Load from a pinned CDN or
  vendor it into `docs/vendor/`.
- **Small breakdowns** (users by country, version split, acquisition sources) →
  **plain inline SVG / CSS bars**, no library. These are simple ranked bars and
  don't justify a dependency.

Avoid heavier all-in-one libs (Chart.js, Plotly) unless uPlot proves
insufficient. Views to port: installs/uninstalls/active-users over time (with
optional projection band), impressions, users by country, acquisition sources,
version split.

## Item scope

Both items are live and **both must be collected**:

- Gemini Folders (Chrome) — item id `jffchdehoapigpmifkmleglfimjiilik`
- AI Folders (Chrome) — item id `kjmgfajofolnfeaahchpmkpecfimcppf`

Make the item list **config-driven** (array of `{id, name}` in
`config.json`), so the collector loops over items and additional extensions can
be added later without code changes. Output JSON is keyed per item id.

## Operational rules

- **Idempotent commits:** only commit when the normalized JSON actually changed.
- **Fail loud, never write stale data:** if not logged in to Google, or if
  expected DOM selectors are missing (Google redesigned the console), surface a
  clear error and **abort the commit** — do not push empty/partial data.
- **Selector isolation:** keep all dev-console selectors in one place
  (`config` or a `selectors.js`) so a Google redesign is a one-file fix.
- **Cadence:** monthly, manual, operator present. Session re-auth (incl. 2FA) is
  done by hand at run time — no need to automate login.

## Build / test commands (repo root)

- `python build.py` — builds the shipped extensions (runs Jest first). **The
  collector must not be part of this.**
- Jest runs via the existing config; add the collector's `normalize` tests under
  `tests/` (or a local test dir) following current patterns.

## Do FIRST — feasibility spike (before building the full tool)

1. Throwaway Firefox MV3 extension: host permission on the current dev-console
   origin + a content script that reads one stats `<table>`/chart series and
   logs the parsed numbers. **If that returns real data, the architecture holds.**
2. Confirm the **current dev-console URL/origin** and the DOM structure of each
   report (column names, how chart series are exposed in the DOM).
3. Lock the **JSON schema** consumed by `docs/app.js`, shared by both pipelines.
4. Verify **GA4 Data API** access for the service account on the
   CWS-linked property and which dimensions/metrics are available.

Report back on the spike result before scaffolding the rest.

## Resolved decisions

- Items: Gemini Folders (`jffchdehoapigpmifkmleglfimjiilik`) and AI Folders
  (`kjmgfajofolnfeaahchpmkpecfimcppf`), both collected.
- GitHub Pages: served from **`/docs` on `main`**.
- Charts: **uPlot** for time series, plain SVG/CSS for ranked-bar breakdowns.

## Non-goals

- No embedded telemetry in published extensions.
- No always-on machine, Playwright, headless Chrome, or VNC.
- No replaying of authenticated CSV-export endpoints.
- No per-user or non-aggregate data anywhere in the public output.
