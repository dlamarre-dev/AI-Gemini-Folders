import os
import sys
import shutil
import json
import zipfile
import re
import subprocess
import argparse

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
        "firefox_only_files": ["import.html", "import.js"],
        "zip_prefix":         "gemini-folders",
        "display_name":       "Gemini Folders",
        # Marketing dir: check Marketing/gemini-folders/ first, fall back to Marketing/
        "marketing_subdir":   "gemini-folders",
        "review_url_chrome":  "https://chromewebstore.google.com/detail/gemini-folders/jffchdehoapigpmifkmleglfimjiilik/reviews",
        "review_url_firefox": "https://addons.mozilla.org/firefox/addon/gemini_folders/reviews/",
    },
    "ai-folders": {
        "firefox_gecko_id":   "aifolders@dlamarre-dev.github.io",
        "firefox_only_files": ["import.html", "import.js"],
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

def run_tests():
    """Runs Jest. Returns True if tests pass or the user chooses to continue."""
    if not os.path.isdir("node_modules"):
        print("📦 node_modules not found — running npm install...")
        install = subprocess.run("npm install", shell=True)
        if install.returncode != 0:
            print("\n❌ npm install failed.")
            answer = input("   Continue with the build anyway? [y/N] ").strip().lower()
            return answer in ("y", "yes")
        print()

    print("🧪 Running test suite...")
    try:
        result = subprocess.run(
            "npx jest --no-coverage --no-colors",
            shell=True, capture_output=True, text=True,
            encoding="utf-8", errors="replace",
        )
    except Exception as e:
        print(f"\n⚠️  Could not execute tests: {e}")
        answer = input("   Continue with the build anyway? [y/N] ").strip().lower()
        return answer in ("y", "yes")

    output = (result.stdout + result.stderr).strip()
    if output:
        print(GREEN + output + RESET)

    if result.returncode == 0:
        print("✅ All tests passed.\n")
        return True

    print("\n⚠️  Some tests failed.")
    answer = input("   Continue with the build anyway? [y/N] ").strip().lower()
    return answer in ("y", "yes")


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

    # --- Inject review URL ---
    popup_path = os.path.join(dest, "popup.html")
    if os.path.exists(popup_path):
        with open(popup_path, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace("__REVIEW_URL__", cfg["review_url_chrome"])
        with open(popup_path, "w", encoding="utf-8") as f:
            f.write(html)

    mkt = marketing_dir(ext_name)
    if mkt:
        shutil.copytree(mkt, os.path.join(DIST_DIR, ext_name, "marketing_chrome"))

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
        extra = ["site-config.js"] if os.path.exists(os.path.join(dest, "site-config.js")) else []
        manifest["background"]["scripts"] = ["lz-string.min.js", "utils.js"] + extra + [sw]

    if "commands" in manifest:
        for cmd_info in manifest["commands"].values():
            if "suggested_key" in cmd_info:
                for platform in ["default", "windows", "chromeos", "linux", "mac"]:
                    if platform in cmd_info["suggested_key"]:
                        cmd_info["suggested_key"][platform] = "Alt+Shift+S"

    with open(mfp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # --- 2. Inject review URL ---
    popup_path = os.path.join(dest, "popup.html")
    if os.path.exists(popup_path):
        with open(popup_path, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace("__REVIEW_URL__", cfg["review_url_firefox"])
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
                # On Firefox, Mac and PC share the same shortcut, so the
                # "(or Alt+Shift+S on Mac)" parenthetical is now redundant.
                # Remove it entirely instead of leaving a duplicate.
                new_content = re.sub(
                    r'(Alt\+Shift\+S)\s*[\(（][^)）]*Alt\+Shift\+S[^)）]*[\)）]',
                    r'\1', content
                )
                if new_content != content:
                    content, modified = new_content, True

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

def main():
    parser = argparse.ArgumentParser(description="Build Gemini Folders / AI Folders extensions")
    parser.add_argument(
        "--extension", "-e",
        choices=list(EXTENSION_CONFIG.keys()),
        default=None,
        help="Which extension to build (default: both)",
    )
    args = parser.parse_args()

    targets = [args.extension] if args.extension else list(EXTENSION_CONFIG.keys())
    label   = EXTENSION_CONFIG[targets[0]]["display_name"] if len(targets) == 1 else "All extensions"

    print(f"🛠️  Starting build pipeline — {label}\n")

    if not os.path.isdir(SRC_DIR):
        print(f"❌ Shared source directory '{SRC_DIR}/' not found.")
        sys.exit(1)

    for ext in targets:
        if not os.path.exists(manifest_path(ext)):
            print(f"❌ extensions/{ext}/manifest.json not found — skipping.")
            targets.remove(ext)

    if not targets:
        sys.exit(1)

    # Version sync uses the first target's manifest
    with open(manifest_path(targets[0]), "r", encoding="utf-8") as f:
        primary_version = json.load(f).get("version", "unknown")
    sync_package_version(primary_version)

    if not run_tests():
        print("🛑 Build cancelled.")
        sys.exit(1)

    # Clean only the targeted extension subdirs, not the whole dist/
    os.makedirs(DIST_DIR, exist_ok=True)
    for ext in targets:
        ext_dist = os.path.join(DIST_DIR, ext)
        if os.path.exists(ext_dist):
            shutil.rmtree(ext_dist)

    for ext in targets:
        build_extension(ext)

    print("\n🎉 Build finished successfully!")


if __name__ == "__main__":
    main()
