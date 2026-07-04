// generate-site-icons.js — renders assets/site-logos/*.svg into the PNG icons
// shipped with AI Folders (extensions/ai-folders/icons/).
//
// The extension displays site logos at two fixed CSS sizes (16px buttons,
// 12px badges), so it ships small PNGs — rasterized once here — while the
// SVG sources in assets/site-logos/ stay the vector reference for marketing
// (website, screenshots, brag video). PNGs also render gradients/filters that
// inline SVG injection can't display in the popup.
//
// Run it whenever a logo in assets/site-logos/ changes (requires Chrome):
//   node tools/generate-site-icons.js
//
// Output: <key>.png (dark-theme variant, 48x48 = 3x the 16px slot) and, for
// theme-dependent logos, <key>-light.png. characterai renders 72x42 (3x its
// wide 24x14 slot, see popup-extra.css).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SRC = path.join(REPO, 'assets', 'site-logos');
const OUT = path.join(REPO, 'extensions', 'ai-folders', 'icons');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found — install it or add its path to CHROME_CANDIDATES.'); process.exit(1); }

// Theme colors mirror the popup: dark text #e8eaed, light text #212121.
// `fillOverride` recolors explicit white fills (chatgpt/grok); `color` drives
// currentColor logos (poe bubble, c.ai text).
const DARK_TEXT = '#e8eaed';
const LIGHT_TEXT = '#212121';

const SPECS = fs.readdirSync(SRC).filter(f => f.endsWith('.svg')).map(f => {
  const key = f.replace(/\.svg$/, '');
  const spec = { key, w: 48, h: 48, variants: { '': {} } };
  if (key === 'characterai') Object.assign(spec, { w: 72, h: 42 });
  if (key === 'chatgpt' || key === 'grok') spec.variants['-light'] = { fillOverride: LIGHT_TEXT };
  if (key === 'poe' || key === 'characterai') {
    spec.variants[''] = { color: DARK_TEXT };
    spec.variants['-light'] = { color: LIGHT_TEXT };
  }
  return spec;
});

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-icons-'));

for (const { key, w, h, variants } of SPECS) {
  const svg = fs.readFileSync(path.join(SRC, key + '.svg'), 'utf8');
  for (const [suffix, opts] of Object.entries(variants)) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;overflow:hidden;background:transparent}
      body{width:${w}px;height:${h}px;color:${opts.color || DARK_TEXT}}
      svg{width:${w}px;height:${h}px;display:block}
      ${opts.fillOverride ? `svg [fill="white"],svg [fill="#ffffff"]{fill:${opts.fillOverride} !important}` : ''}
    </style></head><body>${svg}</body></html>`;
    const page = path.join(tmp, `${key}${suffix}.html`);
    fs.writeFileSync(page, html);
    const png = path.join(OUT, `${key}${suffix}.png`);
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${w},${h}`, `--screenshot=${png}`,
      'file:///' + page.replace(/\\/g, '/'),
    ], { stdio: 'pipe' });
    if (!fs.existsSync(png) || fs.statSync(png).size < 100) {
      console.error(`FAILED: ${key}${suffix}.png`); process.exitCode = 1;
    } else {
      console.log(`ok ${key}${suffix}.png (${fs.statSync(png).size} B)`);
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
