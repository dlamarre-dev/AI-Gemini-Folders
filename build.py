import os
import sys
import shutil
import json
import zipfile
import re
import subprocess
import argparse

# Windows consoles default to cp1252 and crash on the emoji in our log lines.
# Force UTF-8 on the streams so `python build.py` works without PYTHONUTF8=1.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

GREEN = "\033[32m"
RESET = "\033[0m"

# --- CONFIGURATION ---
SRC_DIR       = "src"           # Shared source (utils, folders, ui, bulk-actions, etc.)
EXTENSIONS_DIR = "extensions"   # Extension-specific overrides
DIST_DIR      = "dist"
MARKETING_DIR = "Marketing"

EXTENSION_CONFIG = {
    "gemini-folders": {
        "firefox_gecko_id":   "geminifolders@dlamarre-dev.github.io",
        "firefox_only_files": ["import.html", "import.js", "import.css"],
        "zip_prefix":         "gemini-folders",
        "display_name":       "Gemini Folders",
        # Marketing dir: check Marketing/gemini-folders/ first, fall back to Marketing/
        "marketing_subdir":   "gemini-folders",
        "review_url_chrome":       "https://chromewebstore.google.com/detail/gemini-folders/jffchdehoapigpmifkmleglfimjiilik/reviews",
        "review_url_firefox":      "https://addons.mozilla.org/firefox/addon/gemini_folders/reviews/",
        # Empty until the Edge listing is published: the public URL carries an id
        # Partner Center only assigns at publish time. An empty review URL makes
        # build_target drop the banner rather than ship a dead link (see
        # strip_review_banner); filling it in brings the banner back by itself.
        "review_url_edge":         "",
        "af_download_url_chrome":  "https://chromewebstore.google.com/detail/ai-folders/kjmgfajofolnfeaahchpmkpecfimcppf",
        "af_download_url_firefox": "https://addons.mozilla.org/firefox/addon/ai_folders/",
        "af_download_url_edge":    "",
    },
    "ai-folders": {
        "firefox_gecko_id":   "aifolders@dlamarre-dev.github.io",
        "firefox_only_files": ["import.html", "import.js", "import.css"],
        "zip_prefix":         "ai-folders",
        "display_name":       "AI Folders",
        "marketing_subdir":   "ai-folders",
        "review_url_chrome":  "https://chromewebstore.google.com/detail/ai-folders/kjmgfajofolnfeaahchpmkpecfimcppf/reviews",
        "review_url_firefox": "https://addons.mozilla.org/firefox/addon/ai_folders/reviews/",
        "review_url_edge":    "",
    },
}

# A line that is a version-history entry. Used to decide what may be dropped
# when a store caps the description length: the history sits at the tail of every
# promo text, oldest last, so trimming from the end costs the least. The word
# itself is translated ("Bersyon" in Filipino), which is why this matches the
# NUMBER instead — the one part that stays put in all 43 languages.
HISTORY_LINE = re.compile(r"\d+\.\d")

# Messages that exist only to be swapped in for some target. They are never
# shipped under their own name — patch_locales drops them from every build.
BUILD_ONLY_MESSAGES = ["syncFavoritesTooltip"]

# Spellings of the quick-save shortcut as they appear in translated strings and
# promo texts. Firefox cannot bind Ctrl+Shift+S, so it swaps all of them.
QUICK_SAVE_SPELLINGS = ["Ctrl+Shift+S", "Cmd+Shift+S", "Command+Shift+S",
                        "⌘+Shift+S", "Strg+Shift+S"]

# --- BUILD TARGETS ---
# One entry per store target. Everything that differs between the builds lives
# here as data, so build_target() is a single code path: adding a fourth store
# means adding a row, not a fourth near-copy of the same 90 lines.
#
#   emoji / label     log lines only
#   drop_files        which config key lists files to remove from the merged tree
#   text_swaps        (old, new) pairs applied to _locales AND the promo texts
#   collapse_mac      drop the now-redundant "(or X on Mac)" parenthetical
#   patch_manifest    optional callable(manifest, dest, cfg)
#
# The per-target URLs are read as review_url_<target> / af_download_url_<target>.
TARGETS = {
    "chrome": {
        "emoji": "🚀",
        "label": "Chrome",
        "drop_files": "firefox_only_files",
        "text_swaps": [],
        "message_aliases": {},
        "description_max": None,
        "collapse_mac": False,
        "patch_manifest": None,
    },
    "edge": {
        "emoji": "🌊",
        "label": "Edge",
        "drop_files": "firefox_only_files",
        # Microsoft's port guide is explicit: "If Chrome is used in either the
        # name or the description of your extension, rebrand the extension using
        # Microsoft Edge. To pass the certification process, the changes are
        # required." A brand swap is language-independent, exactly like Firefox's.
        # The quick-save shortcut is NOT swapped: Edge shares Chrome's commands API.
        "text_swaps": [("Chrome", "Microsoft Edge")],
        # Microsoft caps a store-listing description at 10,000 characters, and
        # 15 of the 86 promo texts are over it — French by 755. Discovered before
        # writing the listing driver rather than as a form error in the middle of
        # a 43-language run.
        "description_max": 10000,
        # Edge calls them Favorites, not bookmarks, and chrome.bookmarks really
        # does manipulate Favorites there — so the tooltip was wrong twice over.
        # The replacement runs BEFORE the brand swap, which is why the stored
        # string still says "Chrome": the two keys then differ in exactly one
        # noun, and reviewing a translation means reading one word.
        "message_aliases": {"syncBookmarksTooltip": "syncFavoritesTooltip"},
        "collapse_mac": False,
        "patch_manifest": None,
    },
    "firefox": {
        "emoji": "🦊",
        "label": "Firefox",
        # Firefox keeps import.html/js/css: it cannot open a file picker from a
        # popup, so the standalone import page is its only route (src/popup-core.js).
        "drop_files": None,
        "text_swaps": ([("Chrome", "Firefox")]
                       + [(sc, "Alt+Shift+S") for sc in QUICK_SAVE_SPELLINGS]),
        "message_aliases": {},
        "description_max": None,
        "collapse_mac": True,
        "patch_manifest": "firefox",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ext_dir(ext_name):
    return os.path.join(EXTENSIONS_DIR, ext_name)

def manifest_path(ext_name):
    return os.path.join(ext_dir(ext_name), "manifest.json")

def marketing_dir(ext_name):
    subdir = os.path.join(MARKETING_DIR, EXTENSION_CONFIG[ext_name]["marketing_subdir"])
    if os.path.isdir(subdir):
        return subdir
    return MARKETING_DIR if os.path.isdir(MARKETING_DIR) else None

def merge_into(src, overlay, dest):
    """Copy src/ into dest/, then overlay extension-specific files on top."""
    shutil.copytree(src, dest)
    if os.path.isdir(overlay):
        for root, dirs, files in os.walk(overlay):
            rel = os.path.relpath(root, overlay)
            dest_root = os.path.join(dest, rel)
            os.makedirs(dest_root, exist_ok=True)
            for f in files:
                shutil.copy2(os.path.join(root, f), os.path.join(dest_root, f))


def make_zip(source_dir, output_filename):
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zipf.write(file_path, arcname)


# ---------------------------------------------------------------------------
# Version sync
# ---------------------------------------------------------------------------

def sync_package_version(version):
    """Keeps package.json and package-lock.json in sync with the manifest version."""
    pkg_path  = "package.json"
    lock_path = "package-lock.json"

    if not os.path.exists(pkg_path):
        return

    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)

    if pkg.get("version") == version:
        return

    pkg["version"] = version
    with open(pkg_path, "w", encoding="utf-8") as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if os.path.exists(lock_path):
        with open(lock_path, "r", encoding="utf-8") as f:
            lock = json.load(f)
        lock["version"] = version
        if "" in lock.get("packages", {}):
            lock["packages"][""]["version"] = version
        with open(lock_path, "w", encoding="utf-8") as f:
            json.dump(lock, f, indent=2, ensure_ascii=False)
            f.write("\n")

    print(f"[sync] package.json updated to v{version}\n")


# ---------------------------------------------------------------------------
# Test gate
# ---------------------------------------------------------------------------

def _node_env():
    """Return an env dict that includes common Node install locations in PATH."""
    env = os.environ.copy()
    extra = [
        os.path.expanduser("~/.local/bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
    ]
    env["PATH"] = os.pathsep.join(extra) + os.pathsep + env.get("PATH", "")
    return env


def run_tests(assume_yes=False, force=False):
    """Runs Jest. Returns True if tests pass or the user chooses to continue.

    --yes only answers "is it OK to keep going without a TTY" questions. It does
    NOT wave through a red suite: that used to mean a green "Build finished"
    was no evidence the tests passed, which is exactly backwards for the flag
    every automated invocation uses. Overriding a failing suite now takes the
    explicit --force, whose name says what it does.
    """

    def confirm(question):
        """Only --force (or a human typing yes) may continue past a failure.

        --yes means "don't prompt me", not "ship it regardless": answering yes on
        its behalf is what made a green 'Build finished' meaningless. Every
        question here is about a test gate that did not pass — including the case
        where the suite could not be executed at all, which tells us even less
        than a red suite does.
        """
        if force:
            print(f"   {question} -> yes (--force)")
            return True
        if assume_yes or not sys.stdin.isatty():
            print(f"   {question} -> no. Re-run with --force to build anyway.")
            return False
        return input(f"   {question} [y/N] ").strip().lower() in ("y", "yes")

    if not os.path.isdir("node_modules"):
        print("📦 node_modules not found — running npm install...")
        install = subprocess.run("npm install", shell=True, env=_node_env())
        if install.returncode != 0:
            print("\n❌ npm install failed.")
            return confirm("Continue with the build anyway?")
        print()

    print("🧪 Running test suite...")
    try:
        result = subprocess.run(
            "npx jest --no-coverage --no-colors",
            shell=True, capture_output=True, text=True,
            encoding="utf-8", errors="replace", env=_node_env(),
        )
    except Exception as e:
        print(f"\n⚠️  Could not execute tests: {e}")
        return confirm("Continue with the build anyway?")

    output = (result.stdout + result.stderr).strip()
    if output:
        print(GREEN + output + RESET)

    if result.returncode == 0:
        print("✅ All tests passed.\n")
        return True

    # A red suite is fail-closed: only --force (or an interactive "yes") gets past.
    print("\n⚠️  Some tests failed.")
    return confirm("Continue with the build anyway?")


# ---------------------------------------------------------------------------
# Extension builds
# ---------------------------------------------------------------------------

def strip_block(html, element_id):
    """Removes a whole `<div id="...">...</div>` block from popup.html.

    Used when a target has no URL for what the block links to. A brand-new store
    product has no public page: the id in its URL is only assigned at publish
    time. A dead "Rate 5 stars" link is worse than no banner — especially inside
    a package going through certification — and an unsubstituted
    `__REVIEW_URL__` would ship the placeholder itself.

    Closed by matching `<div>` depth rather than by a regex, so restyling the
    block or changing its inner markup cannot silently cut the wrong thing.
    Filling the URL back in restores the block on the next build.
    """
    start = html.find(f'<div id="{element_id}"')
    if start == -1:
        return html
    depth, i = 0, start
    while i < len(html):
        nxt_open = html.find("<div", i)
        nxt_close = html.find("</div>", i)
        if nxt_close == -1:
            return html                      # malformed: leave it alone
        if nxt_open != -1 and nxt_open < nxt_close:
            depth += 1
            i = nxt_open + len("<div")
        else:
            depth -= 1
            i = nxt_close + len("</div>")
            if depth == 0:
                return html[:start] + html[i:]
    return html


def apply_text_swaps(text, target, collapse=False):
    """The per-target brand and shortcut substitutions. Returns (text, changed)."""
    changed = False
    for old, new in target["text_swaps"]:
        if old in text:
            text = text.replace(old, new)
            changed = True
    if collapse:
        # On Firefox, Mac and PC share the shortcut, so any "(or Alt+Shift+S on
        # Mac)" parenthetical is now redundant. Two shapes, depending on whether
        # the first shortcut sits inside or outside the parens.
        for pattern, repl in (
            (r'(Alt\+Shift\+S)\s*[\(（][^)）]*Alt\+Shift\+S[^)）]*[\)）]', r'\1'),
            (r'[\(（]Alt\+Shift\+S[^)）]*Alt\+Shift\+S[^)）]*[\)）]', r'(Alt+Shift+S)'),
        ):
            new_text = re.sub(pattern, repl, text)
            if new_text != text:
                text, changed = new_text, True
    return text, changed


def patch_manifest_firefox(manifest, dest, cfg):
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": cfg["firefox_gecko_id"],
            "strict_min_version": "142.0",
            "data_collection_permissions": {"required": ["none"]},
        }
    }
    if "background" in manifest and "service_worker" in manifest["background"]:
        sw = manifest["background"].pop("service_worker")
        # Firefox has no importScripts-style service worker: list the worker's
        # imports as background scripts. Parse them from the worker source so
        # the list can't silently drift from the importScripts(...) call.
        with open(os.path.join(dest, sw), "r", encoding="utf-8") as f:
            m = re.search(r"importScripts\(([^)]*)\)", f.read())
        imports = [x.strip().strip("'\"") for x in m.group(1).split(",") if x.strip()] if m else []
        manifest["background"]["scripts"] = imports + [sw]

    # Only patch the quick-save shortcut (Ctrl+Shift+S → Alt+Shift+S).
    # Other commands (e.g. _execute_action) keep their original keys.
    if "commands" in manifest and "quick-save" in manifest["commands"]:
        qs = manifest["commands"]["quick-save"]
        if "suggested_key" in qs:
            for platform in ["default", "windows", "chromeos", "linux", "mac"]:
                if platform in qs["suggested_key"]:
                    qs["suggested_key"][platform] = "Alt+Shift+S"


MANIFEST_PATCHERS = {"firefox": patch_manifest_firefox}


def inject_popup_urls(dest, cfg, target_name):
    """Substitutes the store URLs, or removes the block that would link nowhere."""
    popup_path = os.path.join(dest, "popup.html")
    if not os.path.exists(popup_path):
        return
    with open(popup_path, "r", encoding="utf-8") as f:
        html = f.read()

    review_url = cfg.get(f"review_url_{target_name}", "")
    if review_url:
        html = html.replace("__REVIEW_URL__", review_url)
    else:
        html = strip_block(html, "reviewBanner")

    af_url = cfg.get(f"af_download_url_{target_name}", "")
    if af_url:
        html = html.replace("__AF_DOWNLOAD_URL__", af_url)
        af_icon = os.path.join(ext_dir("ai-folders"), "icon48.png")
        if os.path.exists(af_icon):
            shutil.copy2(af_icon, os.path.join(dest, "af-icon.png"))
    elif "__AF_DOWNLOAD_URL__" in html:
        html = strip_block(html, "afPromoBanner")

    with open(popup_path, "w", encoding="utf-8") as f:
        f.write(html)


def patch_locales(dest, target):
    """Swaps in the target's alternative strings, drops the build-only ones, and
    applies its text swaps — in that order.

    The order matters: an alias is stored with the brand still reading "Chrome"
    so it differs from the string it replaces in exactly one word, and the brand
    swap below is what turns it into the target's. Reversing the two would leave
    "Chrome" in a target that must not mention it.
    """
    locales_dir = os.path.join(dest, "_locales")
    if not os.path.exists(locales_dir):
        return
    aliases = target.get("message_aliases") or {}
    for root, dirs, files in os.walk(locales_dir):
        if "messages.json" not in files:
            continue
        msg_path = os.path.join(root, "messages.json")
        with open(msg_path, "r", encoding="utf-8") as f:
            messages = json.load(f)

        modified = False
        for shipped, source in aliases.items():
            if source in messages and shipped in messages:
                messages[shipped]["message"] = messages[source]["message"]
                modified = True

        # Never ship a build-only key: it would be dead weight in 43 files and,
        # worse, a second copy of a string that is supposed to have one home.
        for key in BUILD_ONLY_MESSAGES:
            if messages.pop(key, None) is not None:
                modified = True

        for val in messages.values():
            if "message" not in val:
                continue
            # collapse=False: the "(or X on Mac)" cleanup is promo-text only.
            val["message"], changed = apply_text_swaps(val["message"], target)
            modified = modified or changed

        if modified:
            with open(msg_path, "w", encoding="utf-8") as f:
                json.dump(messages, f, indent=2, ensure_ascii=False)


def trim_description(text, limit, where):
    """Drops version-history lines from the end until the text fits `limit`.

    Stores cap the listing description, and the promo texts run past Edge's cap
    in 15 of 86 files. Trimming from the tail is what costs least: the history is
    the last block and its oldest entries are the least useful.

    It refuses rather than truncates. If the line it is about to drop is not a
    history entry, the text has run out of history and the next thing to go would
    be a feature — so it stops and says so, instead of quietly publishing a
    listing with its last paragraph missing.
    """
    if not limit or len(text) <= limit:
        return text, 0

    lines = text.split("\n")
    dropped = 0
    while len("\n".join(lines)) > limit:
        while lines and not lines[-1].strip():
            lines.pop()
        if not lines:
            sys.exit(f"{where}: nothing left to trim.")
        if not HISTORY_LINE.search(lines[-1]):
            sys.exit(f"{where}: {len(text)} chars, limit {limit}, and the next line "
                     f"to drop is not version history:\n    {lines[-1][:120]}\n"
                     f"Shorten the promo text itself rather than letting the build "
                     f"eat a feature paragraph.")
        lines.pop()
        dropped += 1
    return "\n".join(lines).rstrip() + "\n", dropped


def build_marketing(ext_name, cfg, target_name, target):
    """Copies Marketing/<slug>/ to marketing_<target>/ and patches the promo texts."""
    mkt = marketing_dir(ext_name)
    if not mkt:
        return
    mkt_dest = os.path.join(DIST_DIR, ext_name, f"marketing_{target_name}")
    shutil.copytree(mkt, mkt_dest)

    af_url = cfg.get(f"af_download_url_{target_name}", "")
    trimmed = []
    for root_dir, dirs, files in os.walk(mkt_dest):
        for fn in files:
            if not fn.endswith(".txt"):
                continue
            fp = os.path.join(root_dir, fn)
            with open(fp, encoding="utf-8") as f:
                content = f.read()

            content, modified = apply_text_swaps(content, target,
                                                 collapse=target["collapse_mac"])
            if "__AF_STORE_URL__" in content:
                if af_url:
                    content = content.replace("__AF_STORE_URL__", af_url)
                else:
                    # No listing to point at on this store yet. Drop the line
                    # rather than publish the placeholder — nothing here walks
                    # marketing_*/ looking for unresolved placeholders, so this
                    # would otherwise reach the store as literal text.
                    content = "\n".join(ln for ln in content.split("\n")
                                        if "__AF_STORE_URL__" not in ln)
                modified = True

            # Only the listing descriptions are capped; the screenshots dir and
            # any other .txt beside them are not descriptions.
            if fn.lower().startswith("promo"):
                content, dropped = trim_description(
                    content, target.get("description_max"),
                    f"{ext_name}/{target_name}/{fn}")
                if dropped:
                    trimmed.append(f"{fn}(-{dropped})")
                    modified = True

            if modified:
                with open(fp, "w", encoding="utf-8") as f:
                    f.write(content)

    if trimmed:
        print(f"   trimmed to {target['description_max']} chars: "
              f"{len(trimmed)} file(s) — {', '.join(sorted(trimmed))}")


def build_target(ext_name, version, target_name):
    """Builds one store target. Every per-target difference is data in TARGETS."""
    cfg = EXTENSION_CONFIG[ext_name]
    target = TARGETS[target_name]
    print(f"{target['emoji']} [{cfg['display_name']}] Building {target['label']}...")

    dest = os.path.join(DIST_DIR, ext_name, target_name)
    merge_into(SRC_DIR, ext_dir(ext_name), dest)

    if target["drop_files"]:
        for f in cfg.get(target["drop_files"], []):
            fp = os.path.join(dest, f)
            if os.path.exists(fp):
                os.remove(fp)

    patcher = MANIFEST_PATCHERS.get(target["patch_manifest"])
    if patcher:
        mfp = os.path.join(dest, "manifest.json")
        with open(mfp, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        patcher(manifest, dest, cfg)
        with open(mfp, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

    inject_popup_urls(dest, cfg, target_name)
    patch_locales(dest, target)
    build_marketing(ext_name, cfg, target_name, target)

    zip_path = os.path.join(DIST_DIR, f"{cfg['zip_prefix']}-{target_name}-v{version}.zip")
    make_zip(dest, zip_path)
    print(f"✅ {target['label']} build: {zip_path}")


def build_extension(ext_name):
    mfp = manifest_path(ext_name)
    if not os.path.exists(mfp):
        print(f"❌ manifest.json not found for {ext_name}: {mfp}")
        return

    with open(mfp, "r", encoding="utf-8") as f:
        version = json.load(f).get("version", "unknown")

    print(f"\n📦 {EXTENSION_CONFIG[ext_name]['display_name']} v{version}")
    for target_name in TARGETS:
        build_target(ext_name, version, target_name)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def sync_diagnostics_config():
    """Refresh the maintainer diagnostics tool's copy of AI Folders' site-config.js
    so it always tests the current production selectors. No-op if either path is absent."""
    src = os.path.join(EXTENSIONS_DIR, "ai-folders", "site-config.js")
    dst_dir = os.path.join("tools", "site-diagnostics")
    if os.path.isfile(src) and os.path.isdir(dst_dir):
        shutil.copy2(src, os.path.join(dst_dir, "site-config.js"))
        print("[sync] tools/site-diagnostics/site-config.js refreshed")



def build_firefox_extension():
    """
    Copies site-diagnostics extension files for Firefox and replaces the manifest file.
    """
    src_dir = "tools/site-diagnostics"
    dest_dir = "tools/site-diagnostics/firefox"

    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)

    dest_name = os.path.basename(dest_dir)
    shutil.copytree(src_dir, dest_dir, ignore=shutil.ignore_patterns(dest_name))

    manifest_default_path = os.path.join(dest_dir, "manifest.json")
    manifest_ff_path = os.path.join(dest_dir, "manifestFF.json")

    if os.path.exists(manifest_ff_path):
        shutil.move(manifest_ff_path, manifest_default_path)
        print("✅ manifest.json replaced for Firefox site-diagnostics.")
    else:
        # Fail loudly: shipping a Chrome manifest in the Firefox diagnostics
        # build would be a silently broken artifact.
        print("❌ 'manifestFF.json' not found in tools/site-diagnostics — Firefox diagnostics build aborted.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Build Gemini Folders / AI Folders extensions")
    parser.add_argument(
        "--extension", "-e",
        choices=list(EXTENSION_CONFIG.keys()),
        default=None,
        help="Which extension to build (default: both)",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Non-interactive: do not prompt (does NOT override a failing test suite)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Build even if the test suite fails. Use deliberately, never in automation.",
    )
    args = parser.parse_args()

    targets = [args.extension] if args.extension else list(EXTENSION_CONFIG.keys())
    label   = EXTENSION_CONFIG[targets[0]]["display_name"] if len(targets) == 1 else "All extensions"

    print(f"🛠️  Starting build pipeline — {label}\n")

    if not os.path.isdir(SRC_DIR):
        print(f"❌ Shared source directory '{SRC_DIR}/' not found.")
        sys.exit(1)

    # Filter out targets without a manifest. Build a new list rather than calling
    # targets.remove() while iterating, which skips elements as the list shifts.
    valid_targets = []
    for ext in targets:
        if os.path.exists(manifest_path(ext)):
            valid_targets.append(ext)
        else:
            print(f"❌ extensions/{ext}/manifest.json not found — skipping.")
    targets = valid_targets

    if not targets:
        sys.exit(1)

    # package.json tracks the Gemini Folders version. Always sync from GF's
    # manifest (not targets[0]) so an AF-only build (-e ai-folders) doesn't
    # re-stamp package.json with the AF version.
    version_source = "gemini-folders" if os.path.exists(manifest_path("gemini-folders")) else targets[0]
    with open(manifest_path(version_source), "r", encoding="utf-8") as f:
        primary_version = json.load(f).get("version", "unknown")
    sync_package_version(primary_version)

    if not run_tests(assume_yes=args.yes, force=args.force):
        print("🛑 Build cancelled.")
        sys.exit(1)

    # Wipe the entire dist/ directory before every build.
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)

    for ext in targets:
        build_extension(ext)

    sync_diagnostics_config()
    build_firefox_extension()

    print("\n🎉 Build finished successfully!")


if __name__ == "__main__":
    main()
