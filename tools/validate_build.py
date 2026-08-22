#!/usr/bin/env python3
"""Validates the built extensions in dist/.

CI ran `npm test` and nothing else, so a regression in build.py — a dropped
file, a permission that drifted, an unresolved placeholder — could only be
caught by hand at release time. This runs after `python build.py` and checks
the artifacts themselves.

Maintainer tooling: not shipped inside either extension.

Usage:  python tools/validate_build.py
Exit:   0 when every check passes, 1 otherwise (with each failure listed).
"""

import json
import os
import re
import sys
import zipfile

DIST = "dist"
EXTENSIONS = ["ai-folders", "gemini-folders"]
BROWSERS = ["chrome", "edge", "firefox"]
EXPECTED_LOCALES = 43
# Per-store cap on the listing description. Microsoft rejects anything over
# 10,000 characters, and 15 of the 86 promo texts are naturally over it, so
# build.py trims version-history lines off the tail for that target. This is the
# check that the trim actually happened — a rejection here is cheap, a rejection
# from Partner Center comes after a submission.
DESCRIPTION_MAX = {"edge": 10000}

failures = []


def fail(msg):
    failures.append(msg)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def check_manifest(ext, browser):
    """The built manifest must match its source in the ways that matter."""
    built_path = os.path.join(DIST, ext, browser, "manifest.json")
    if not os.path.isfile(built_path):
        fail(f"{ext}/{browser}: manifest.json missing")
        return None

    built = load_json(built_path)
    source = load_json(os.path.join("extensions", ext, "manifest.json"))

    if built.get("version") != source.get("version"):
        fail(f"{ext}/{browser}: version {built.get('version')} != source {source.get('version')}")

    # Permission drift is the one manifest change that re-prompts every installed
    # user, so it must never happen as a side effect of a build change.
    for key in ("permissions", "optional_permissions", "host_permissions"):
        if sorted(built.get(key) or []) != sorted(source.get(key) or []):
            fail(f"{ext}/{browser}: {key} drifted from the source manifest")

    if "tabs" in (built.get("permissions") or []):
        fail(f"{ext}/{browser}: the \"tabs\" permission is present — see CLAUDE.md §7")

    if browser == "firefox":
        gecko = (built.get("browser_specific_settings") or {}).get("gecko") or {}
        if not gecko.get("id"):
            fail(f"{ext}/firefox: browser_specific_settings.gecko.id missing")

    return built


def check_locales(ext, browser):
    loc_dir = os.path.join(DIST, ext, browser, "_locales")
    if not os.path.isdir(loc_dir):
        fail(f"{ext}/{browser}: _locales missing")
        return
    locales = [d for d in os.listdir(loc_dir) if os.path.isdir(os.path.join(loc_dir, d))]
    if len(locales) != EXPECTED_LOCALES:
        fail(f"{ext}/{browser}: {len(locales)} locales, expected {EXPECTED_LOCALES}")
    for loc in locales:
        path = os.path.join(loc_dir, loc, "messages.json")
        try:
            load_json(path)
        except Exception as e:
            fail(f"{ext}/{browser}/_locales/{loc}: unreadable messages.json ({e})")


# Build-time substitutions look like __NAME__. One left behind ships literally.
PLACEHOLDER = re.compile(r"__[A-Z][A-Z0-9_]{3,}__")
TEXT_EXT = (".json", ".js", ".html", ".css", ".txt")


def check_placeholders(ext, browser):
    root = os.path.join(DIST, ext, browser)
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith(TEXT_EXT):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
            except (UnicodeDecodeError, OSError):
                continue
            for hit in set(PLACEHOLDER.findall(content)):
                # The prompt-trigger content script sets its own guard flag.
                if hit == "__PROMPT_TRIGGER_ACTIVE__":
                    continue
                fail(f"{ext}/{browser}/{os.path.relpath(path, root)}: unresolved {hit}")


def check_marketing_placeholders(ext, browser):
    """The promo texts ship as store copy, so a placeholder left in one is read
    by users, not by a parser. Checked separately from the extension tree
    because it lives beside it, in marketing_<browser>/."""
    root = os.path.join(DIST, ext, f"marketing_{browser}")
    if not os.path.isdir(root):
        return
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith(".txt"):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
            except (UnicodeDecodeError, OSError):
                continue
            for hit in set(PLACEHOLDER.findall(content)):
                fail(f"{ext}/marketing_{browser}/{os.path.relpath(path, root)}: "
                     f"unresolved {hit}")
            limit = DESCRIPTION_MAX.get(browser)
            if limit and name.lower().startswith("promo") and len(content) > limit:
                fail(f"{ext}/marketing_{browser}/{name}: {len(content)} chars, "
                     f"over the {limit} the store accepts")


def check_zip(ext, version):
    """The shipped archive must carry the extension and nothing else."""
    for browser in BROWSERS:
        name = os.path.join(DIST, f"{ext}-{browser}-v{version}.zip")
        if not os.path.isfile(name):
            fail(f"{ext}: {os.path.basename(name)} not produced")
            continue
        with zipfile.ZipFile(name) as z:
            names = z.namelist()
        if "manifest.json" not in names:
            fail(f"{os.path.basename(name)}: no manifest.json at the root")
        leaked = [n for n in names if n.startswith(("tools/", "Marketing/", "tests/"))]
        if leaked:
            fail(f"{os.path.basename(name)}: ships maintainer files, e.g. {leaked[0]}")
        if not any(n.startswith("_locales/") for n in names):
            fail(f"{os.path.basename(name)}: no _locales")


def main():
    if not os.path.isdir(DIST):
        print("❌ dist/ not found — run `python build.py` first.")
        return 1

    for ext in EXTENSIONS:
        version = None
        for browser in BROWSERS:
            built = check_manifest(ext, browser)
            if built and version is None:
                version = built.get("version")
            check_locales(ext, browser)
            check_placeholders(ext, browser)
            check_marketing_placeholders(ext, browser)
        if version:
            check_zip(ext, version)

    # build.py stamps package.json from the Gemini Folders manifest.
    if os.path.isfile("package.json"):
        pkg = load_json("package.json").get("version")
        gf = load_json(os.path.join("extensions", "gemini-folders", "manifest.json")).get("version")
        if pkg != gf:
            fail(f"package.json v{pkg} != gemini-folders manifest v{gf}")

    if failures:
        print(f"❌ {len(failures)} problem(s) with the build:")
        for f in failures:
            print(f"   - {f}")
        return 1

    print(f"✅ Build artifacts validated for {len(BROWSERS)} targets: manifests, "
          f"permissions, locales, placeholders, promo texts and their length, archives.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
