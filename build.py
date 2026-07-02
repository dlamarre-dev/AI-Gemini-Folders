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
        "af_download_url_chrome":  "https://chromewebstore.google.com/detail/ai-folders/kjmgfajofolnfeaahchpmkpecfimcppf",
        "af_download_url_firefox": "https://addons.mozilla.org/firefox/addon/ai_folders/",
    },
    "ai-folders": {
        "firefox_gecko_id":   "aifolders@dlamarre-dev.github.io",
        "firefox_only_files": ["import.html", "import.js", "import.css"],
        "zip_prefix":         "ai-folders",
        "display_name":       "AI Folders",
        "marketing_subdir":   "ai-folders",
        "review_url_chrome":  "https://chromewebstore.google.com/detail/ai-folders/kjmgfajofolnfeaahchpmkpecfimcppf/reviews",
        "review_url_firefox": "https://addons.mozilla.org/firefox/addon/ai_folders/reviews/",
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


def run_tests(assume_yes=False):
    """Runs Jest. Returns True if tests pass or the user chooses to continue."""

    def confirm(question):
        # Never block on input() when there's no TTY (CI). --yes forces a
        # "continue anyway"; otherwise fail safe and abort the build.
        if assume_yes:
            print(f"   {question} -> yes (--yes)")
            return True
        if not sys.stdin.isatty():
            print(f"   {question} -> no (non-interactive, aborting)")
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

    print("\n⚠️  Some tests failed.")
    return confirm("Continue with the build anyway?")


# ---------------------------------------------------------------------------
# Extension builds
# ---------------------------------------------------------------------------

def build_chrome(ext_name, version):
    cfg = EXTENSION_CONFIG[ext_name]
    print(f"🚀 [{cfg['display_name']}] Building Chrome...")

    dest = os.path.join(DIST_DIR, ext_name, "chrome")
    merge_into(SRC_DIR, ext_dir(ext_name), dest)

    for f in cfg["firefox_only_files"]:
        fp = os.path.join(dest, f)
        if os.path.exists(fp):
            os.remove(fp)

    # --- Inject review URL + AF promo URL (GF only) ---
    popup_path = os.path.join(dest, "popup.html")
    if os.path.exists(popup_path):
        with open(popup_path, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace("__REVIEW_URL__", cfg["review_url_chrome"])
        if "af_download_url_chrome" in cfg:
            html = html.replace("__AF_DOWNLOAD_URL__", cfg["af_download_url_chrome"])
            af_icon = os.path.join(ext_dir("ai-folders"), "icon48.png")
            if os.path.exists(af_icon):
                shutil.copy2(af_icon, os.path.join(dest, "af-icon.png"))
        with open(popup_path, "w", encoding="utf-8") as f:
            f.write(html)

    mkt = marketing_dir(ext_name)
    if mkt:
        mkt_chrome = os.path.join(DIST_DIR, ext_name, "marketing_chrome")
        shutil.copytree(mkt, mkt_chrome)
        af_url = cfg.get("af_download_url_chrome", "")
        if af_url:
            for root_d, _, mkt_files in os.walk(mkt_chrome):
                for fn in mkt_files:
                    if not fn.endswith(".txt"):
                        continue
                    fp = os.path.join(root_d, fn)
                    with open(fp, encoding="utf-8") as f:
                        ct = f.read()
                    if "__AF_STORE_URL__" in ct:
                        with open(fp, "w", encoding="utf-8") as f:
                            f.write(ct.replace("__AF_STORE_URL__", af_url))

    zip_path = os.path.join(DIST_DIR, f"{cfg['zip_prefix']}-chrome-v{version}.zip")
    make_zip(dest, zip_path)
    print(f"✅ Chrome build: {zip_path}")


def build_firefox(ext_name, version):
    cfg = EXTENSION_CONFIG[ext_name]
    print(f"🦊 [{cfg['display_name']}] Building Firefox...")

    dest = os.path.join(DIST_DIR, ext_name, "firefox")
    merge_into(SRC_DIR, ext_dir(ext_name), dest)

    # --- 1. Patch manifest.json for Firefox ---
    mfp = os.path.join(dest, "manifest.json")
    with open(mfp, "r", encoding="utf-8") as f:
        manifest = json.load(f)

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
        imports = [s.strip().strip("'\"") for s in m.group(1).split(",") if s.strip()] if m else []
        manifest["background"]["scripts"] = imports + [sw]

    # Only patch the quick-save shortcut (Ctrl+Shift+S → Alt+Shift+S).
    # Other commands (e.g. _execute_action) keep their original keys.
    if "commands" in manifest and "quick-save" in manifest["commands"]:
        qs = manifest["commands"]["quick-save"]
        if "suggested_key" in qs:
            for platform in ["default", "windows", "chromeos", "linux", "mac"]:
                if platform in qs["suggested_key"]:
                    qs["suggested_key"][platform] = "Alt+Shift+S"

    with open(mfp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # --- 2. Inject review URL + AF promo URL (GF only) ---
    popup_path = os.path.join(dest, "popup.html")
    if os.path.exists(popup_path):
        with open(popup_path, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace("__REVIEW_URL__", cfg["review_url_firefox"])
        if "af_download_url_firefox" in cfg:
            html = html.replace("__AF_DOWNLOAD_URL__", cfg["af_download_url_firefox"])
            af_icon = os.path.join(ext_dir("ai-folders"), "icon48.png")
            if os.path.exists(af_icon):
                shutil.copy2(af_icon, os.path.join(dest, "af-icon.png"))
        with open(popup_path, "w", encoding="utf-8") as f:
            f.write(html)

    # --- 4. Patch translations ---
    locales_dir = os.path.join(dest, "_locales")
    if os.path.exists(locales_dir):
        for root, dirs, files in os.walk(locales_dir):
            if "messages.json" not in files:
                continue
            msg_path = os.path.join(root, "messages.json")
            with open(msg_path, "r", encoding="utf-8") as f:
                messages = json.load(f)

            modified = False
            old_shortcuts = ["Ctrl+Shift+S", "Cmd+Shift+S", "Command+Shift+S", "⌘+Shift+S", "Strg+Shift+S"]
            for val in messages.values():
                if "message" not in val:
                    continue
                if "Chrome" in val["message"]:
                    val["message"] = val["message"].replace("Chrome", "Firefox")
                    modified = True
                for sc in old_shortcuts:
                    if sc in val["message"]:
                        val["message"] = val["message"].replace(sc, "Alt+Shift+S")
                        modified = True

            if modified:
                with open(msg_path, "w", encoding="utf-8") as f:
                    json.dump(messages, f, indent=2, ensure_ascii=False)

    # --- 5. Patch marketing text files ---
    mkt = marketing_dir(ext_name)
    if mkt:
        print(f"📸 Processing marketing assets for Firefox...")
        mkt_dest = os.path.join(DIST_DIR, ext_name, "marketing_firefox")
        shutil.copytree(mkt, mkt_dest)

        old_shortcuts = ["Ctrl+Shift+S", "Cmd+Shift+S", "Command+Shift+S", "⌘+Shift+S", "Strg+Shift+S"]
        for root_dir, dirs, files in os.walk(mkt_dest):
            for file in files:
                if not file.endswith(".txt"):
                    continue
                fp = os.path.join(root_dir, file)
                with open(fp, "r", encoding="utf-8") as f:
                    content = f.read()

                modified = False
                if "Chrome" in content:
                    content = content.replace("Chrome", "Firefox")
                    modified = True
                for sc in old_shortcuts:
                    if sc in content:
                        content = content.replace(sc, "Alt+Shift+S")
                        modified = True
                # On Firefox, Mac and PC share the same shortcut, so any
                # "(or Alt+Shift+S on Mac)" parenthetical is now redundant.
                # Case 1: shortcut outside parens — "Alt+Shift+S (or Alt+Shift+S on Mac)"
                new_content = re.sub(
                    r'(Alt\+Shift\+S)\s*[\(（][^)）]*Alt\+Shift\+S[^)）]*[\)）]',
                    r'\1', content
                )
                if new_content != content:
                    content, modified = new_content, True
                # Case 2: both shortcuts inside parens — "(Alt+Shift+S or Alt+Shift+S on Mac)"
                new_content = re.sub(
                    r'[\(（]Alt\+Shift\+S[^)）]*Alt\+Shift\+S[^)）]*[\)）]',
                    r'(Alt+Shift+S)', content
                )
                if new_content != content:
                    content, modified = new_content, True

                af_url = cfg.get("af_download_url_firefox", "")
                if af_url and "__AF_STORE_URL__" in content:
                    content = content.replace("__AF_STORE_URL__", af_url)
                    modified = True

                if modified:
                    with open(fp, "w", encoding="utf-8") as f:
                        f.write(content)

    zip_path = os.path.join(DIST_DIR, f"{cfg['zip_prefix']}-firefox-v{version}.zip")
    make_zip(dest, zip_path)
    print(f"✅ Firefox build: {zip_path}")


def build_extension(ext_name):
    mfp = manifest_path(ext_name)
    if not os.path.exists(mfp):
        print(f"❌ manifest.json not found for {ext_name}: {mfp}")
        return

    with open(mfp, "r", encoding="utf-8") as f:
        version = json.load(f).get("version", "unknown")

    print(f"\n📦 {EXTENSION_CONFIG[ext_name]['display_name']} v{version}")
    build_chrome(ext_name, version)
    build_firefox(ext_name, version)


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
        help="Non-interactive: continue the build even if tests or npm install fail",
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

    if not run_tests(assume_yes=args.yes):
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
