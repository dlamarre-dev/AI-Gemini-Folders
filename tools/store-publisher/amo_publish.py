#!/usr/bin/env python3
"""
AMO (addons.mozilla.org) listing publisher — the Firefox counterpart of the
store-publisher extension, but API-based: AMO has an official add-ons API, so
no DOM scraping is needed.

Per supported locale it PATCHes the listing description with
dist/<slug>/marketing_firefox/Promo<XX>.txt, and with --images it replaces the
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
SCREENSHOTS_PER_LISTING = 5
REQUEST_GAP_S = 1.0  # politeness delay between write requests


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


def api_request(creds, method, path, json_body=None, multipart=None):
    """One authenticated API call. `multipart` = dict of name → str | (filename,
    bytes) encoded as multipart/form-data. Returns parsed JSON (or None for 204)."""
    url = path if path.startswith("http") else API_BASE + path
    headers = {"Authorization": "JWT " + make_jwt(creds["jwt_issuer"], creds["jwt_secret"])}
    data = None

    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
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
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:2000]
        sys.exit(f"API {method} {path} failed: HTTP {e.code}\n{detail}")


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


def update_texts(creds, guid, descriptions, apply):
    if not apply:
        for code, text in sorted(descriptions.items()):
            print(f"  would send description[{code}]: {len(text)} chars")
        return
    # One PATCH carries every locale; omitted locales stay untouched on AMO.
    api_request(creds, "PATCH", f"/addons/addon/{guid}/", json_body={"description": descriptions})
    print(f"  description updated for {len(descriptions)} locales ✓")


def update_images(creds, guid, addon, marketing_dir, locales, apply):
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

    if not apply:
        print(f"  would delete {len(previews)} existing previews, then upload: "
              + ", ".join(f.name for f in files))
        return

    for p in previews:
        api_request(creds, "DELETE", f"/addons/addon/{guid}/previews/{p['id']}/")
        print(f"  deleted preview {p['id']}")
        time.sleep(REQUEST_GAP_S)
    for position, f in enumerate(files, start=1):
        api_request(creds, "POST", f"/addons/addon/{guid}/previews/",
                    multipart={"image": (f.name, f.read_bytes()), "position": str(position)})
        print(f"  uploaded {f.name} (position {position}) ✓")
        time.sleep(REQUEST_GAP_S)


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--item", required=True, help="item slug from config.json (e.g. gemini-folders)")
    ap.add_argument("--texts", action="store_true", help="update localized descriptions")
    ap.add_argument("--images", action="store_true", help="replace the listing previews with the EN screenshots + each locale's Promo_1")
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
        update_texts(creds, guid, descriptions, args.apply)
    if args.images:
        update_images(creds, guid, addon, marketing_dir, locales, args.apply)

    print("Done." if args.apply else "Dry-run done — re-run with --apply to write (changes go live immediately).")


if __name__ == "__main__":
    main()
