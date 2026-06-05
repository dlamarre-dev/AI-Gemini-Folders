#!/usr/bin/env python3
"""Pull GA4 Data API → docs/data/ga4.json (appends monthly history).

Usage:
    python pull_ga4.py [--start YYYY-MM-DD --end YYYY-MM-DD]

Default date range: previous calendar month.
Requires config.json in this directory (see config.example.json).
"""

import argparse
import json
import os
import sys
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path

try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange, Dimension, Metric, OrderBy, RunReportRequest,
    )
except ImportError:
    sys.exit(
        "Missing dependency. Run:\n"
        "  pip install -r tools/ga4-puller/requirements.txt"
    )

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
CONFIG_PATH = ROOT / "config.json"
OUTPUT_PATH = REPO_ROOT / "docs" / "data" / "ga4.json"
TOP_N = 30  # max rows per dimension report


# ── config ────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    if not CONFIG_PATH.exists():
        sys.exit(
            f"Config not found. Copy config.example.json → config.json and fill in values.\n"
            f"  Expected: {CONFIG_PATH}"
        )
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ── date helpers ──────────────────────────────────────────────────────────────

def prev_month_range() -> tuple[str, str]:
    today = date.today()
    first_this = today.replace(day=1)
    last_prev = first_this - timedelta(days=1)
    first_prev = last_prev.replace(day=1)
    return first_prev.isoformat(), last_prev.isoformat()


# ── GA4 queries ───────────────────────────────────────────────────────────────

def pull_report(client, property_id: str, start: str, end: str, dimension: str) -> dict:
    req = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name=dimension)],
        metrics=[Metric(name="activeUsers")],
        order_bys=[OrderBy(
            metric=OrderBy.MetricOrderBy(metric_name="activeUsers"),
            desc=True,
        )],
        limit=TOP_N,
    )
    response = client.run_report(req)
    return {
        row.dimension_values[0].value: int(row.metric_values[0].value)
        for row in response.rows
    }


def pull_total_users(client, property_id: str, start: str, end: str) -> int:
    req = RunReportRequest(
        property=property_id,
        date_ranges=[DateRange(start_date=start, end_date=end)],
        metrics=[Metric(name="activeUsers")],
    )
    response = client.run_report(req)
    if response.rows:
        return int(response.rows[0].metric_values[0].value)
    return 0


# ── history helpers ───────────────────────────────────────────────────────────

def load_db() -> dict:
    if not OUTPUT_PATH.exists():
        return {"schema": 1, "history": []}
    with open(OUTPUT_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_db(db: dict) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", help="Period start (YYYY-MM-DD). Default: first of prev month.")
    parser.add_argument("--end",   help="Period end (YYYY-MM-DD). Default: last of prev month.")
    args = parser.parse_args()

    config = load_config()
    property_id: str = config["property_id"]  # e.g. "properties/123456789"

    key_file = config.get("service_account_key")
    if key_file:
        key_path = (ROOT / key_file).resolve()
        if not key_path.exists():
            sys.exit(f"Service account key not found: {key_path}")
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", str(key_path))

    start, end = (args.start, args.end) if (args.start and args.end) else prev_month_range()
    today = date.today().isoformat()

    print(f"Pulling GA4 {property_id}  {start} → {end} …")
    client = BetaAnalyticsDataClient()

    total = pull_total_users(client, property_id, start, end)
    by_country = pull_report(client, property_id, start, end, "country")
    by_source  = pull_report(client, property_id, start, end, "sessionSourceMedium")

    if total == 0 and not by_country:
        sys.exit("No data returned — check that the property ID is correct and the service account has access.")

    entry = {
        "collected_at":          today,
        "period_start":          start,
        "period_end":            end,
        "active_users":          total,
        "users_by_country":      by_country,
        "users_by_source_medium": by_source,
    }

    db = load_db()
    history: list = db.setdefault("history", [])

    existing_idx = next(
        (i for i, e in enumerate(history) if e.get("period_start") == start),
        None,
    )
    if existing_idx is not None:
        if history[existing_idx] == entry:
            print("No change — data for this period already up to date.")
            return
        history[existing_idx] = entry
        print(f"Updated existing entry for {start}.")
    else:
        history.append(entry)
        print(f"Appended new entry for {start}.")

    history.sort(key=lambda e: e.get("period_start", ""))
    save_db(db)

    print(f"Wrote {OUTPUT_PATH}")
    print(f"  Active users : {total:,}")
    print(f"  Countries    : {len(by_country)}")
    print(f"  Src/mediums  : {len(by_source)}")


if __name__ == "__main__":
    main()
