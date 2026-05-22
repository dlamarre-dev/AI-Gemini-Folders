"""
fix_gf_promos.py
1. Removes accidental word duplications in the ⌨️ Prompt Trigger bullet
2. Adds ↓/↑ to the 5 files whose anchor wasn't matched by update_gf_promos.py

Run: python fix_gf_promos.py
"""
import os, re

GF_PROMO_DIR = "Marketing/gemini-folders"

# Files missing ↓/↑: correct (anchor, insert_before_anchor) pairs
MISSING = {
    "PromoDA.txt":    ("Tryk",   "Brug ↓/↑ til at navigere, tryk"),
    "PromoES.txt":    ("Pulsa",  "Usa ↓/↑ para navegar entre sugerencias, pulsa"),
    "PromoHI.txt":    ("Space",  "↓/↑ से नेविगेट करें, Space"),
    "PromoPT_PT.txt": ("Prima",  "Use ↓/↑ para navegar entre sugestões, prima"),
    "PromoTR.txt":    ("boşluk", "↓/↑ ile gezinin, ardından boşluk"),
}


def fix_file(path, filename):
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()

    changed = False
    for i, line in enumerate(lines):
        if not line.startswith('⌨️') or '#' not in line:
            continue

        # 1. Fix word duplications: "word word" → "word" (handles Unicode words too)
        fixed = re.sub(r'(\b\S+\b) \1\b', r'\1', line)
        if fixed != line:
            lines[i] = fixed
            line = fixed
            changed = True

        # 2. Add ↓/↑ if missing and this file is in the MISSING dict
        if filename in MISSING and '↓' not in line:
            anchor, insert = MISSING[filename]
            if anchor in line:
                lines[i] = line.replace(anchor, insert, 1)
                changed = True

    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
    return changed


def main():
    updated = 0
    for fname in sorted(os.listdir(GF_PROMO_DIR)):
        if not fname.startswith('Promo') or not fname.endswith('.txt') or fname == 'PromoEN.txt':
            continue
        path = os.path.join(GF_PROMO_DIR, fname)
        if fix_file(path, fname):
            print(f'  OK   {fname}')
            updated += 1
    print(f'\nDone — {updated} files fixed.')


if __name__ == '__main__':
    main()
