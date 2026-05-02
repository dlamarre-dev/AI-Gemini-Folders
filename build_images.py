#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build marketing screenshots for Gemini Folders.

Usage:
  python build_images.py                     # all locales, 3 composed 1280×800 each
  python build_images.py --locale fr         # single locale
  python build_images.py --locale fr de ja   # multiple locales
  python build_images.py --mode raw          # raw popup PNGs (no composition)
  python build_images.py --build             # rebuild extension first
  python build_images.py --build --locale en # rebuild + single locale

Output per locale (mode=both):
  Promo_1_<locale>.png  — Folder + Prompt side by side (overview)
  Promo_2_<locale>.png  — Folder mode, centered close-up
  Promo_3_<locale>.png  — Prompt mode, centered close-up
  Promo_4_<locale>.png  — Mobile sync: popup + phone bookmarks mockup
  Promo_5_<locale>.png  — Context menu: right-click → folder submenu
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

ROOT           = os.path.dirname(os.path.abspath(__file__))
SCREENSHOTS_DIR = os.path.join(ROOT, 'screenshots')
OUT_DIR        = os.path.join(ROOT, 'Marketing', 'screenshots')

VALID_LOCALES = [
    'en', 'fr', 'de', 'es', 'it',
    'pt_BR', 'pt_PT', 'ru', 'pl',
    'zh_CN', 'ja', 'ko', 'hi',
    'ro', 'sk', 'cs',
    'tr', 'id', 'zh_TW',
    'vi', 'bn', 'nl', 'sw', 'tl', 'th', 'hu',
    'ar',
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

def step_build_extension():
    run(['python', 'build.py'], label='🔨 Building extension...')

def step_install_deps():
    nm = os.path.join(SCREENSHOTS_DIR, 'node_modules')
    if os.path.isdir(nm):
        print('\n📦 Node dependencies already installed.')
        return
    if not npm_available():
        print('\n❌ npm not found. Install Node.js to continue.')
        sys.exit(1)
    run(['npm', 'install'], cwd=SCREENSHOTS_DIR, label='📦 Installing screenshot dependencies...')

def step_screenshots(mode, locales):
    if not node_available():
        print('\n❌ node not found. Install Node.js to continue.')
        sys.exit(1)
    os.makedirs(OUT_DIR, exist_ok=True)
    cmd = ['node', 'take-screenshots.js', '--mode', mode]
    if locales:
        # Run once per locale if multiple provided
        for locale in locales:
            run(cmd + ['--locale', locale], cwd=SCREENSHOTS_DIR,
                label=f'📸 Capturing {locale}...')
    else:
        run(cmd, cwd=SCREENSHOTS_DIR, label='📸 Capturing all locales...')

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Build Gemini Folders marketing screenshots',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f'Valid locales: {", ".join(VALID_LOCALES)}',
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
        help='Rebuild the extension (python build.py) before taking screenshots.',
    )
    args = parser.parse_args()

    # Validate locales
    if args.locale:
        bad = [l for l in args.locale if l not in VALID_LOCALES]
        if bad:
            print(f'❌ Unknown locale(s): {", ".join(bad)}')
            print(f'   Valid: {", ".join(VALID_LOCALES)}')
            sys.exit(1)

    print('╔══════════════════════════════════════╗')
    print('║  Gemini Folders — build_images.py    ║')
    print('╚══════════════════════════════════════╝')

    if args.build:
        step_build_extension()

    step_install_deps()
    step_screenshots(args.mode, args.locale)

    print(f'\n✅ Done!  Output → {OUT_DIR}')

if __name__ == '__main__':
    main()
