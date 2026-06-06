# CWS Stats Collector

Firefox MV3 extension that scrapes Chrome Web Store developer-console analytics
and commits aggregated stats to `docs/data/cws.json` via GitHub.

## Prerequisites

- Firefox (any recent release)
- Python 3 on PATH (for the native messaging host)
- A GitHub personal access token (PAT) with **Contents: Read and write** on
  this repo (no other permissions needed)
- Your CWS publisher UUID (visible in the dev-console URL)

## Setup

### 1. Config file

```bash
cp tools/stats-collector/config.example.json tools/stats-collector/config.json
# Edit config.json: fill in publisher_id and github.owner
```

`config.json` is gitignored — it never enters version control.

### 2. Native messaging host (one-time, Windows)

The extension reads downloaded CSV files via a small Python helper registered as
a Firefox native messaging host. Run once in PowerShell:

```powershell
& "tools\stats-collector\native\install-native-host.ps1"
```

This writes one registry key under `HKCU\Software\Mozilla\NativeMessagingHosts`
pointing at `native\filereader.py`. No admin rights required.

## Loading in Firefox

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `tools/stats-collector/manifest.json`
3. The extension badge (📊) appears in the toolbar — it stays loaded until
   Firefox restarts. Reload it from `about:debugging` after each restart.

## Authentication

The extension opens tabs on `chrome.google.com`. You must be logged into your
Google account that has publisher access in the **same Firefox profile** before
running a collection.

If Google shows a sign-in screen during a run, the collector will surface a
`"Login required"` error and abort the commit. Just sign in manually and re-run.
2FA prompts must also be completed before the run — the collector waits 3.5 s
after each tab loads, which is usually enough, but very slow connections may
need a longer settle time (edit `SETTLE_MS` in `background.js`).

## Running a collection

1. Click the 📊 toolbar badge to open the popup.
2. Paste your GitHub PAT into the **PAT** field (stored locally in
   `chrome.storage.local`, never transmitted anywhere except the GitHub API).
3. Click **Run collection**.
4. Watch the progress log. Per item the collector:
   - Scrapes the listing page (current weekly users)
   - Scrapes `analytics/installs`, `analytics/users`, `analytics/impressions`
     (totals + breakdowns by country / language / OS / version)
   - Exports "Last year" daily CSVs from each analytics page and merges them
     into a daily time series
   - Commits the monthly snapshot + any new daily rows to `docs/data/cws.json`
5. On success you'll see `committed ✓` (or `skipped` if data hasn't changed).

**Note on daily row counts:** the CWS only exposes as much history as it retains
per metric. Installs/uninstalls and users/impressions may have different lookback
windows depending on the extension's age and the metric type. The collector
captures whatever the CWS provides and merges it by date.

## Re-authentication

If your Google session expires between monthly runs, sign into the CWS developer
console in the same Firefox profile and re-run.
If your PAT expires, generate a new one and paste it into the popup's PAT field.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Login required` error | Google session expired — sign in and retry |
| `403` from GitHub | PAT expired or wrong permissions |
| `No data — selector mismatch` | Google redesigned the console — update `lib/selectors.js` |
| `Native host unavailable` | Native messaging host not registered — re-run `install-native-host.ps1` |
| `Native host disconnected` | Python not on PATH, or script error — run `python native\filereader.py` manually to test |
| Numbers look wrong | Re-run; CWS sometimes shows stale data for ~1 h after midnight |

## Data format

Results are written to `docs/data/cws.json`, keyed by item ID:

```json
{
  "schema": 1,
  "items": {
    "jffchdehoapigpmifkmleglfimjiilik": {
      "history": [
        {
          "collected_at": "2026-06-06",
          "period_start": "2026-05-06",
          "period_end":   "2026-06-06",
          "weekly_users": 562,
          "installs":     694,
          "uninstalls":   297,
          "impressions":  null,
          "installs_by_country":    { "US": 18, "ES": 16 },
          "installs_by_language":   { "es": 26, "en-US": 13 },
          "installs_by_os":         { "Windows": 65, "Mac": 20 },
          "users_by_country":       {},
          "users_by_language":      {},
          "users_by_os":            {},
          "active_versions":        ["4.2.2.0", "4.0.0.0"]
        }
      ],
      "daily": [
        { "date": "2026-05-07", "installs": 18, "uninstalls": 6 },
        { "date": "2026-05-08", "installs": 16, "uninstalls": 3, "weekly_users": 540, "impressions": 120 }
      ]
    }
  }
}
```

`history` entries are **appended** monthly — existing history is never deleted.
`daily` rows are **merged by date** — re-running the same month only adds rows
not already present.
