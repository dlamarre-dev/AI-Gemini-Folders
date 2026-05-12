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
  Marketing/<extension>/screenshots/Promo_1_<locale>.png  — side-by-side overview
  Marketing/<extension>/screenshots/Promo_2_<locale>.png  — folder mode close-up
  Marketing/<extension>/screenshots/Promo_3_<locale>.png  — prompt mode close-up
  Marketing/<extension>/screenshots/Promo_4_<locale>.png  — mobile sync mockup
  Marketing/<extension>/screenshots/Promo_5_<locale>.png  — context menu
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

    print(f'\n✅ Done!  Output → {out_dir}')

if __name__ == '__main__':
    main()
