# CWS Stats Spike — Feasibility Test

Throwaway Firefox MV3 extension. Confirms that a content script can execute on
the CWS developer console and read stats data from the rendered DOM.

## Load in Firefox

1. Open Firefox → `about:debugging` → **This Firefox**
2. Click **Load Temporary Add-on…**
3. Navigate to `tools/site-diagnostics/stats-collector/spike/` and select `manifest.json`

## Run the spike

1. In the same Firefox window, go to the CWS Developer Dashboard and log in:
   - Try `https://chrome.google.com/webstore/devconsole/` (classic URL)
   - Or `https://chromewebstore.google.com/` (new URL if the old one redirects)
2. Navigate to one of the two extensions:
   - Gemini Folders: `jffchdehoapigpmifkmleglfimjiilik`
   - AI Folders: `kjmgfajofolnfeaahchpmkpecfimcppf`
3. Open the **Statistics** section → click into a specific report
   (e.g. Installs, Weekly Users, Impressions)
4. Open the browser console (`F12` → Console tab)
5. Look for `[CWS-SPIKE]` log lines

## What to report back

After running, record the following so we can lock the architecture:

1. **Origin confirmed?** — which URL/origin does the dev console actually run on?
   Copy the full URL from the address bar on a stats page.

2. **Content script executed?** — did `[CWS-SPIKE] Content script running on:` appear?
   If not, the host permission may be wrong (the origin we matched doesn't match reality).

3. **Tables found?** — did `Table[0] headers:` appear? If yes, paste the headers here.
   This tells us the column structure we need to normalize.

4. **Chart data strategy** — which of these appeared?
   - `JSON script block` → embedded JSON (easiest to parse reliably)
   - `Elements with data-value` → data-* attributes
   - `Aria chart-like elements` → aria-label content
   - `SVG <path> elements only` → canvas/SVG only (harder; may need DOM mutation observer
     after SPA navigation, or a different approach entirely)

5. **Numeric cells found?** — did cell values show up? Paste a sample row.

Once we have answers to 1–5, we can lock the `normalize.js` schema and build the
real extension.
