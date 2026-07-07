#!/usr/bin/env python3
"""
AMO (addons.mozilla.org) listing publisher — the Firefox counterpart of the
store-publisher extension, but API-based: AMO has an official add-ons API, so
no DOM scraping is needed.

Per supported locale it PATCHes the listing description with
dist/<slug>/marketing_firefox/Promo<XX>.txt and the listing summary with the
extension's own extDesc string (dist/<slug>/firefox/_locales — the Firefox
build, so wording patches are included), and with --images it replaces the
listing previews (screenshots) with the 5 EN images followed by Promo_1 of every
other locale (a single multilingual gallery showcasing the extension). AMO
previews are NOT localized — there is one shared set per listing — so the images
step runs once, not per locale. Locales absent from AMO's production language
list are skipped for texts only (see the `amo` column in lib/locales.js); the
preview gallery uses all locales' screenshots regardless.

!! Unlike the CWS draft flow, AMO listing edits go LIVE IMMEDIATELY — there is
no draft/review stage for listing metadata. The script is dry-run by default;
pass --apply to write.

Usage:
  python amo_publish.py --item gemini-folders [--texts] [--images] [--apply]

Credentials: "amo": {"jwt_issuer": "user:…", "jwt_secret": "…"} in config.json
(gitignored), generated at https://addons.mozilla.org/developers/addon/api/key/
Stdlib only — no pip dependencies.
"""

import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API_BASE = "https://addons.mozilla.org/api/v5"
TOOL_DIR = Path(__file__).resolve().parent
# Records the screenshot set last uploaded per add-on, so an unchanged gallery
# is skipped instead of torn down and re-uploaded (AMO throttles writes hard).
STATE_FILE = TOOL_DIR / ".amo-previews-state.json"  # gitignored
SCREENSHOTS_PER_LISTING = 5
AMO_SUMMARY_MAX = 250   # AMO rejects summaries above this length
REQUEST_GAP_S = 1.0     # initial delay before each write request (grows on throttle)
MAX_PACE_S = 30.0       # cap for the adaptive pacing delay
AUTO_RETRY_CAP_S = 180  # longest we'll auto-sleep on a single throttle before retrying
LONG_THROTTLE_S = 300   # above this hinted wait, bail with an ETA instead of sleeping
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_pace_gap = REQUEST_GAP_S  # adaptive: bumped to the server's hinted rate on 429/503


# ── locales (parsed from the shared JS table) ─────────────────────────────────

def load_locales():
    """Parses the LOCALES rows of lib/locales.js (single source of truth).
    Returns [{internal, amo}] — amo is None for locales AMO doesn't support."""
    src = (TOOL_DIR / "lib" / "locales.js").read_text(encoding="utf-8")
    rows = re.findall(
        r"\{ internal: '([A-Za-z_]+)',\s*cws: '[^']+',\s*amo: (null|'[^']+'),", src)
    if len(rows) != 43:
        sys.exit(f"locales.js parse error: expected 43 rows, got {len(rows)}")
    return [{"internal": i, "amo": None if a == "null" else a.strip("'")}
            for i, a in rows]


def promo_txt_name(internal):
    return "PromoCN.txt" if internal == "zh_CN" else f"Promo{internal.upper()}.txt"


# ── AMO API client (JWT auth, stdlib HTTP) ────────────────────────────────────

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def make_jwt(issuer, secret):
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = b64url(json.dumps({
        "iss": issuer, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 240,
    }).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def throttle_wait_s(err):
    """Seconds to wait before retrying a 429/503, from the Retry-After header or
    AMO's "Expected available in N seconds" body. Falls back to None (no hint)."""
    retry_after = err.headers.get("Retry-After")
    if retry_after and retry_after.strip().isdigit():
        return int(retry_after)
    body = getattr(err, "_amo_detail", "")
    m = re.search(r"available in (\d+) second", body)
    return int(m.group(1)) if m else None


def api_request(creds, method, path, json_body=None, multipart=None, max_retries=6):
    """One authenticated API call. `multipart` = dict of name → str | (filename,
    bytes) encoded as multipart/form-data. Returns parsed JSON (or None for 204).
    Retries on 429/503 (AMO throttling), honouring the server's retry delay."""
    url = path if path.startswith("http") else API_BASE + path
    base_headers, data = {}, None

    if json_body is not None:
        data = json.dumps(json_body).encode()
        base_headers["Content-Type"] = "application/json"
    elif multipart is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in multipart.items():
            if isinstance(value, tuple):
                filename, blob = value
                ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
                parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                    f'filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + blob + b"\r\n")
            else:
                parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
                    f"\r\n\r\n{value}\r\n".encode())
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
        base_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

    global _pace_gap
    for attempt in range(max_retries + 1):
        # Proactively pace writes at the rate the server last told us to use, so
        # requests succeed first try instead of bouncing off the throttle. On a
        # retry (attempt > 0) we already slept the server's hint below, so skip.
        if method in WRITE_METHODS and attempt == 0 and _pace_gap:
            time.sleep(_pace_gap)
        # Fresh JWT (and jti) per attempt — tokens are short-lived.
        headers = {**base_headers,
                   "Authorization": "JWT " + make_jwt(creds["jwt_issuer"], creds["jwt_secret"])}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = resp.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as e:
            e._amo_detail = e.read().decode("utf-8", "replace")[:2000]
            if e.code in (429, 503):
                hint = throttle_wait_s(e)
                # A long cooldown means the write quota is exhausted — don't sleep
                # for ages in-process; tell the user when to come back and exit.
                if hint and hint > LONG_THROTTLE_S:
                    mins = max(1, round(hint / 60))
                    sys.exit(f"AMO is throttling writes for ~{hint}s (~{mins} min): your API "
                             f"write quota is temporarily exhausted (repeated runs). Re-run this "
                             f"command in ~{mins} min — a single --texts PATCH is all it takes.")
                if attempt < max_retries:
                    if hint:  # learn the server's rate so later writes pre-wait
                        new_gap = min(max(_pace_gap, hint), MAX_PACE_S)
                        if new_gap > _pace_gap:
                            print(f"  pacing -> {new_gap:g}s/request (server throttle)")
                            _pace_gap = new_gap
                    wait = min((hint or 5 * (attempt + 1)) + 1, AUTO_RETRY_CAP_S)
                    print(f"  throttled (HTTP {e.code}); retrying in {wait}s "
                          f"(attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait)
                    continue
            sys.exit(f"API {method} {path} failed: HTTP {e.code}\n{e._amo_detail}")


# ── steps ─────────────────────────────────────────────────────────────────────

def build_descriptions(marketing_dir, locales):
    """Reads every supported locale's promo text. Returns {amo_code: text}."""
    out, skipped = {}, []
    for loc in locales:
        if not loc["amo"]:
            skipped.append(loc["internal"])
            continue
        path = marketing_dir / promo_txt_name(loc["internal"])
        out[loc["amo"]] = path.read_text(encoding="utf-8-sig")
    print(f"Texts: {len(out)} locales to send; unsupported on AMO, skipped: {', '.join(skipped)}")
    return out


def build_summaries(locales_dir, locales):
    """Reads every supported locale's extDesc from the built Firefox _locales.
    Returns {amo_code: text} — the AMO listing summary mirrors the extension's
    own store summary string, so both update together."""
    if not locales_dir.is_dir():
        sys.exit(f"Locales dir not found: {locales_dir} — run `python build.py` first.")
    out = {}
    for loc in locales:
        if not loc["amo"]:
            continue
        path = locales_dir / loc["internal"] / "messages.json"
        msg = json.loads(path.read_text(encoding="utf-8-sig")).get("extDesc", {}).get("message", "").strip()
        if not msg:
            sys.exit(f"extDesc missing/empty in {path}")
        if len(msg) > AMO_SUMMARY_MAX:
            sys.exit(f"extDesc for {loc['internal']} is {len(msg)} chars (AMO summary max {AMO_SUMMARY_MAX}): {msg[:80]}…")
        out[loc["amo"]] = msg
    print(f"Summaries: {len(out)} locales from extDesc")
    return out


def update_texts(creds, guid, descriptions, summaries, apply):
    if not apply:
        for code, text in sorted(descriptions.items()):
            print(f"  would send description[{code}]: {len(text)} chars"
                  + (f", summary: {len(summaries[code])} chars" if code in summaries else ""))
        return
    # One PATCH carries every locale and both fields; omitted locales stay
    # untouched on AMO.
    api_request(creds, "PATCH", f"/addons/addon/{guid}/",
                json_body={"description": descriptions, "summary": summaries})
    print(f"  description + summary updated for {len(descriptions)} locales ✓")


def file_fingerprints(files):
    """Ordered [{name, sha1}] over the screenshot files — content-based so it's
    stable across rebuilds that only touch mtimes."""
    return [{"name": f.name, "sha1": hashlib.sha1(f.read_bytes()).hexdigest()} for f in files]


def load_previews_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_previews_state(guid, fingerprints):
    state = load_previews_state()
    state[guid] = {
        "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(fingerprints),
        "files": fingerprints,
    }
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def update_images(creds, guid, addon, marketing_dir, locales, apply, force):
    previews = addon.get("previews", [])
    shots = marketing_dir / "screenshots"
    # The 5 English promos first, then Promo_1 of every other locale so the
    # gallery showcases the extension across all supported languages.
    files = [shots / f"Promo_{i}_en.png" for i in range(1, SCREENSHOTS_PER_LISTING + 1)]
    files += [shots / f"Promo_1_{loc['internal']}.png"
              for loc in locales if loc["internal"] != "en"]
    missing = [f.name for f in files if not f.exists()]
    if missing:
        sys.exit(f"Missing screenshot files: {missing}")

    # Skip the whole teardown/re-upload when our recorded gallery already matches
    # the local files AND the live preview count lines up. --force-images overrides.
    fingerprints = file_fingerprints(files)
    recorded = load_previews_state().get(guid)
    in_sync = (recorded is not None
               and recorded.get("files") == fingerprints
               and len(previews) == len(files))
    if in_sync and not force:
        print(f"  previews already up to date ({len(files)} images, unchanged since "
              f"{recorded.get('uploaded_at', '?')}) - skipping (use --force-images to redo)")
        return

    if not apply:
        if force and in_sync:
            why = "forced (--force-images)"
        elif recorded is None:
            why = "no recorded state yet"
        elif len(previews) != len(files):
            why = f"live preview count {len(previews)} != expected {len(files)}"
        else:
            why = "screenshot contents changed"
        print(f"  would delete {len(previews)} existing previews, then upload "
              f"{len(files)} [{why}]: " + ", ".join(f.name for f in files))
        return

    # api_request paces writes itself (adaptive throttle handling), so no sleeps here.
    for p in previews:
        api_request(creds, "DELETE", f"/addons/addon/{guid}/previews/{p['id']}/")
        print(f"  deleted preview {p['id']}")
    for position, f in enumerate(files, start=1):
        api_request(creds, "POST", f"/addons/addon/{guid}/previews/",
                    multipart={"image": (f.name, f.read_bytes()), "position": str(position)})
        print(f"  uploaded {f.name} (position {position}) ✓")
    # Record only after every upload succeeded (api_request exits on hard failure).
    save_previews_state(guid, fingerprints)
    print(f"  recorded gallery state ({len(files)} images) - future runs will skip if unchanged")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    # Never let a non-ASCII status char (✓, …) crash on a legacy code-page console.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--item", required=True, help="item slug from config.json (e.g. gemini-folders)")
    ap.add_argument("--texts", action="store_true", help="update localized descriptions")
    ap.add_argument("--images", action="store_true", help="replace the listing previews with the EN screenshots + each locale's Promo_1")
    ap.add_argument("--force-images", action="store_true",
                    help="re-upload previews even if the recorded gallery is unchanged")
    ap.add_argument("--apply", action="store_true",
                    help="actually write (default is dry-run). AMO changes go live immediately!")
    args = ap.parse_args()
    if not args.texts and not args.images:
        ap.error("nothing to do — pass --texts and/or --images")

    config = json.loads((TOOL_DIR / "config.json").read_text(encoding="utf-8-sig"))
    creds = config.get("amo")
    if not creds or "YOUR_" in creds.get("jwt_issuer", "YOUR_"):
        sys.exit('Fill in "amo": {"jwt_issuer", "jwt_secret"} in config.json '
                 "(from https://addons.mozilla.org/developers/addon/api/key/)")
    item = next((i for i in config["items"] if i["slug"] == args.item), None)
    if not item:
        sys.exit(f'Item "{args.item}" not in config.json')
    guid = item["amo_guid"]
    marketing_dir = Path(config["repo_root"]) / "dist" / item["slug"] / "marketing_firefox"
    locales_dir = Path(config["repo_root"]) / "dist" / item["slug"] / "firefox" / "_locales"
    locales = load_locales()

    print(f'{"APPLY" if args.apply else "DRY-RUN"} — {item["name"]} ({guid})')
    addon = api_request(creds, "GET", f"/addons/addon/{guid}/")
    current_desc = addon.get("description") or {}
    if isinstance(current_desc, dict):
        print(f"Current listing: {len(current_desc)} description locales, "
              f"{len(addon.get('previews', []))} previews "
              f"(status: {addon.get('status')})")

    if args.texts:
        descriptions = build_descriptions(marketing_dir, locales)
        summaries = build_summaries(locales_dir, locales)
        update_texts(creds, guid, descriptions, summaries, args.apply)
    if args.images:
        update_images(creds, guid, addon, marketing_dir, locales, args.apply, args.force_images)

    print("Done." if args.apply else "Dry-run done — re-run with --apply to write (changes go live immediately).")


if __name__ == "__main__":
    main()
