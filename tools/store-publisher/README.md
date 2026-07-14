# Store Listing Publisher

Two operator tools that push the `dist/` marketing assets to the stores:

- **CWS** (Chrome Web Store): Firefox MV3 extension (like `stats-collector`)
  that fills the Store listing *draft* by driving the dev-console page —
  Google has no listing API. Described below.
- **AMO** (addons.mozilla.org): `amo_publish.py`, a stdlib-only Python script
  using the official add-ons API — no scraping. See "AMO publisher" at the
  bottom.

The CWS extension fills the **Store listing** draft from the marketing assets
in `dist/`: for each of the 43 locales it replaces the detailed description
with `dist/<slug>/marketing_chrome/Promo<XX>.txt`, and optionally replaces the
5 localized screenshots with `dist/<slug>/marketing_chrome/screenshots/
Promo_<1-5>_<locale>.png`. It can also replace the international (global)
screenshots with the EN set, once per deployment.

**It never saves.** The run leaves the listing tab open with the draft filled
in; reviewing and clicking **Save draft** (then submitting for review) stays
manual, by design.

## Workflow per release

1. Upload the new build zip to the CWS by hand, as usual.
2. `python build.py` (or `build_images.py`) so `dist/` holds the final promo
   texts/screenshots.
3. Run this tool, one extension at a time.
4. Review the page, click **Save draft**, verify, submit.

## Setup (one-time)

1. `cp config.example.json config.json` and fill in `publisher_id` and
   `repo_root` (absolute path to this repo). `config.json` is gitignored.
2. Native messaging host: the tool shares the stats-collector host
   (`filereader.py`, which also serves PNG bytes as base64). If you already
   installed it for stats-collector you have nothing to do — the host manifest
   now allowlists `store-publisher@dev.local` too. Otherwise run once:
   `tools\stats-collector\native\install-native-host.ps1`.
3. Load in Firefox: `about:debugging` → This Firefox → Load Temporary Add-on →
   select `tools/store-publisher/manifest.json`. Reload after each Firefox
   restart. Be signed into the Google account with publisher access in this
   profile.

## Using it

Open the popup:

- **Extension** — Gemini Folders or AI Folders (from `config.json`).
- **Update detailed descriptions** — replaces the description for every locale.
- **Replace the 5 localized screenshots per locale** — deletes the existing
  ones then uploads `Promo_1..5_<locale>.png` in order.
- **Replace international screenshots with EN set** — the global (non-localized)
  screenshot slots; needed once per deployment only.
- **Dry run** — walks the 43 languages and locates every field/section without
  writing anything. **Run this first on a new console layout.**
- **Locale filter** — empty = all; `fr,de` = just those; `from:pl` = resume an
  aborted run at `pl`.
- **Probe page** — opens the listing page and dumps its DOM structure
  (dropdowns, textareas, file inputs, sections, buttons) to the log. This is
  the debugging entry point when Google changes the page.

A run aborts at the first failed step (with diagnostics in the log) rather
than risking writes into the wrong locale; fix, then resume with `from:<locale>`.

## Locale notation

The CWS uses `no` where the repo uses `nb`, `iw` for `he`, `fil` for `tl`,
and dashes for regional variants (`pt-BR`, `zh-CN`…). The mapping lives in
`lib/locales.js` (covered by `tests/store-publisher/locales.test.js`).

## When Google redesigns the console

All DOM heuristics live in `stores/cws.js` — selectors are intentionally
text/role based, not class based, to survive cosmetic changes. If a step
fails: click **Probe page**, read the dump, adjust the matching `page*`
function, reload the temporary add-on, resume with `from:<locale>`.

## AMO publisher (`amo_publish.py`)

AMO has an official API, so the Firefox side is a plain Python script (stdlib
only, hand-rolled JWT + multipart):

```
python amo_publish.py --item gemini-folders --texts --images          # dry-run
python amo_publish.py --item gemini-folders --texts --images --apply  # write
```

- `--texts` PATCHes the listing description, summary **and name** for every
  locale AMO supports, in a single request: the description from
  `dist/<slug>/marketing_firefox/Promo<XX>.txt`, the summary from the
  extension's own `extDesc` string and the name from its `extName` string
  (`dist/<slug>/firefox/_locales/…`, so the listing always stays in sync — the
  script validates AMO's 250-char summary and 50-char name caps). The **name is
  sent only for locales where it actually changed** vs the live listing (an
  unchanged title isn't rewritten). AMO production only enables 42 languages:
  28 of our 43 map (see the `amo` column in `lib/locales.js`); the other 15 are
  skipped with a log line. Locales omitted from the PATCH are left untouched on AMO.
- `--images` deletes the listing previews and uploads `Promo_1..5_en.png`
  with explicit positions. AMO previews are **not** localized — one set per
  listing — so this runs once, not per locale.
- Credentials: `"amo": {"jwt_issuer", "jwt_secret"}` in `config.json`, from
  <https://addons.mozilla.org/developers/addon/api/key/>. Items are addressed
  by their `amo_guid` (the gecko id from the Firefox manifest).

**⚠ Unlike the CWS draft flow, AMO listing edits go live immediately** (no
draft/review stage for metadata). The script is dry-run by default; `--apply`
is the explicit switch. Check the listing after an apply.
