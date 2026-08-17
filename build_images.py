#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build marketing screenshots for Gemini Folders or AI Folders.

Usage:
  python build_images.py                                  # GF, all locales
  python build_images.py --extension ai-folders           # AF, all locales
  python build_images.py --locale fr                      # GF, single locale
  python build_images.py --extension ai-folders --locale fr de ja
  python build_images.py --mode raw                       # raw popup PNGs
  python build_images.py --build                          # rebuild first
  python build_images.py --extension ai-folders --build --locale en

Output per locale (mode=both):
  Marketing/<extension>/screenshots/Promo_1_<locale>.png  — side-by-side overview (dark)
  Marketing/<extension>/screenshots/Promo_2_<locale>.png  — folder mode close-up (light)
  Marketing/<extension>/screenshots/Promo_3_<locale>.png  — prompt mode close-up (light)
  Marketing/<extension>/screenshots/Promo_4_<locale>.png  — mobile sync mockup (dark)
  Marketing/<extension>/screenshots/Promo_5_<locale>.png  — context menu (dark)

Images 2 and 3 show the light theme so the listing advertises both appearances.
The website has no light theme, so it takes its two close-ups from the dark
_site_*.png intermediates instead (see step_sync_site_shots).
"""

import argparse
import io
import os
import shutil
import subprocess
import sys

# Force UTF-8 output so box-drawing and emoji chars work on Windows consoles
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT            = os.path.dirname(os.path.abspath(__file__))
SCREENSHOTS_DIR = os.path.join(ROOT, 'screenshots')
SITE_SHOTS_DIR  = os.path.join(ROOT, 'docs', 'site', 'assets', 'shots')

# Website screenshot name → the composed file it comes from (AI Folders only).
# folder-mode and prompt-mode read the dark _site_* intermediates rather than
# Promo_2/3, which now show the light theme: aifolders.xyz is dark-only, so a light
# popup on it would look like a mistake rather than a feature.
SITE_SHOT_MAP = {
    'folder-mode': '_site_folder-mode',
    'prompt-mode': '_site_prompt-mode',
    'mobile-sync': 'Promo_4',
}

VALID_EXTENSIONS = ['gemini-folders', 'ai-folders']

VALID_LOCALES = [
    'en', 'fr', 'de', 'es', 'it',
    'pt_BR', 'pt_PT', 'ru', 'pl',
    'zh_CN', 'ja', 'ko', 'hi',
    'ro', 'sk', 'cs',
    'tr', 'id', 'zh_TW',
    'vi', 'bn', 'nl', 'sw', 'tl', 'th', 'hu',
    'ar',
    'nb', 'sv', 'fi', 'da',
    'ca', 'uk', 'el', 'he',
    'et', 'lt', 'lv',
    'ms', 'sl', 'bg', 'sr', 'hr',
]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def run(cmd, cwd=None, label=None):
    if label:
        print(f'\n{label}')
    print(f'  $ {" ".join(str(c) for c in cmd)}')
    result = subprocess.run(cmd, cwd=cwd or ROOT)
    if result.returncode != 0:
        print(f'\n❌ Command failed (exit {result.returncode})')
        sys.exit(result.returncode)

def node_available():
    return shutil.which('node') is not None

def npm_available():
    return shutil.which('npm') is not None

# ─── Steps ────────────────────────────────────────────────────────────────────

def step_build_extension(extension):
    run(['python', '-X', 'utf8', 'build.py', '--extension', extension],
        label=f'🔨 Building {extension}...')

def step_install_deps():
    nm = os.path.join(SCREENSHOTS_DIR, 'node_modules')
    if os.path.isdir(nm):
        print('\n📦 Node dependencies already installed.')
        return
    if not npm_available():
        print('\n❌ npm not found. Install Node.js to continue.')
        sys.exit(1)
    run(['npm', 'install'], cwd=SCREENSHOTS_DIR, label='📦 Installing screenshot dependencies...')

def step_screenshots(extension, mode, locales, out_dir):
    if not node_available():
        print('\n❌ node not found. Install Node.js to continue.')
        sys.exit(1)
    os.makedirs(out_dir, exist_ok=True)
    cmd = ['node', 'take-screenshots.js', '--extension', extension, '--mode', mode]
    if locales:
        for locale in locales:
            run(cmd + ['--locale', locale], cwd=SCREENSHOTS_DIR,
                label=f'📸 [{extension}] Capturing {locale}...')
    else:
        run(cmd, cwd=SCREENSHOTS_DIR,
            label=f'📸 [{extension}] Capturing all locales...')

def step_sync_site_shots(out_dir, locales):
    """Mirror the freshly composed AI Folders promos onto the website:
    <source>_<locale>.png → docs/site/assets/shots/<name>_<locale>.png.

    The _site_* sources are intermediates that exist only for this copy, so they are
    removed afterwards — Marketing/ must hold the five store images and nothing else.
    """
    copied, missing, dropped = 0, [], 0
    for locale in locales:
        for name, source in SITE_SHOT_MAP.items():
            src = os.path.join(out_dir, f'{source}_{locale}.png')
            if not os.path.isfile(src):
                missing.append(os.path.basename(src))
                continue
            shutil.copy2(src, os.path.join(SITE_SHOTS_DIR, f'{name}_{locale}.png'))
            copied += 1
            if source.startswith('_site_'):
                os.remove(src)
                dropped += 1
    print(f'\n🌐 Website shots synced: {copied} file(s) → {SITE_SHOTS_DIR}')
    if dropped:
        print(f'   🧹 Removed {dropped} intermediate(s) from {out_dir}')
    if missing:
        print(f'   ⚠️ Missing source(s) skipped: {", ".join(missing)}')

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Build marketing screenshots for Gemini Folders or AI Folders',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f'Valid locales: {", ".join(VALID_LOCALES)}',
    )
    parser.add_argument(
        '--extension', '-e',
        choices=VALID_EXTENSIONS,
        default='gemini-folders',
        help='Which extension to screenshot (default: gemini-folders)',
    )
    parser.add_argument(
        '--locale', nargs='+', metavar='LOCALE',
        help='One or more locale IDs (e.g. --locale fr de ja). Default: all.',
    )
    parser.add_argument(
        '--mode', choices=['both', 'folder', 'prompt', 'raw'], default='both',
        help='both (default) = composed 1280×800 | raw = individual popup PNGs',
    )
    parser.add_argument(
        '--build', action='store_true',
        help='Rebuild the extension before taking screenshots.',
    )
    args = parser.parse_args()

    # Validate locales
    if args.locale:
        bad = [l for l in args.locale if l not in VALID_LOCALES]
        if bad:
            print(f'❌ Unknown locale(s): {", ".join(bad)}')
            print(f'   Valid: {", ".join(VALID_LOCALES)}')
            sys.exit(1)

    out_dir = os.path.join(ROOT, 'Marketing', args.extension, 'screenshots')

    # Verify the built extension exists
    ext_dist = os.path.join(ROOT, 'dist', args.extension, 'chrome')
    if not os.path.isdir(ext_dist):
        print(f'❌ Built extension not found: {ext_dist}')
        print(f'   Run:  python -X utf8 build.py --extension {args.extension}')
        if not args.build:
            sys.exit(1)

    print(f'╔══════════════════════════════════════════╗')
    print(f'║  build_images.py  [{args.extension}]')
    print(f'╚══════════════════════════════════════════╝')

    if args.build:
        step_build_extension(args.extension)

    step_install_deps()
    step_screenshots(args.extension, args.mode, args.locale, out_dir)

    # The website only showcases AI Folders, and only the composed promos
    # (mode=both) produce the Promo_2/3/4 images it uses.
    if args.extension == 'ai-folders' and args.mode == 'both':
        step_sync_site_shots(out_dir, args.locale or VALID_LOCALES)

    print(f'\n✅ Done!  Output → {out_dir}')

if __name__ == '__main__':
    main()
