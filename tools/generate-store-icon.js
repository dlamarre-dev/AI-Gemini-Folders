// generate-store-icon.js — renders each extension's icon.svg at 300x300 into
// Marketing/<slug>/, for the store listing rather than for the browser.
//
// Microsoft's Partner Center takes a 300x300 store logo; the extension itself
// ships 16, 48 and 128, none of which is close enough to upscale. Rendering from
// the same icon.svg the extension is built around is what keeps the listing and
// the installed button the same mark — a separately drawn store icon drifts from
// the product the first time either is touched.
//
// Rasterized here rather than shipped as SVG because that is what the store takes,
// and rasterized through Chrome for the same reason generate-site-icons.js does:
// these icons carry gradients and a drop-shadow filter, and a renderer that
// approximates either produces something subtly not the logo.
//
// Transparent background, as the shipped PNGs are: the Edge store shows the icon
// on both a light and a dark surface, so a baked-in background would be wrong on
// one of them.
//
// Run it when an icon.svg changes (requires Chrome):
//   node tools/generate-store-icon.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SIZE = 300;

// Marketing/ names AI Folders' files with an -AF suffix and Gemini Folders' files
// without one, so the two are still distinguishable once opened side by side.
const EXTENSIONS = [
  { slug: 'gemini-folders', out: `icon-${SIZE}x${SIZE}.png` },
  { slug: 'ai-folders', out: `icon-${SIZE}x${SIZE}-AF.png` },
];

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) {
  console.error('Chrome not found — install it or add its path to CHROME_CANDIDATES.');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-icon-'));

for (const { slug, out } of EXTENSIONS) {
  const svg = fs.readFileSync(path.join(REPO, 'extensions', slug, 'icon.svg'), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;overflow:hidden;background:transparent}
    body{width:${SIZE}px;height:${SIZE}px}
    svg{width:${SIZE}px;height:${SIZE}px;display:block}
  </style></head><body>${svg}</body></html>`;

  const page = path.join(tmp, slug + '.html');
  fs.writeFileSync(page, html);

  const png = path.join(REPO, 'Marketing', slug, out);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--window-size=${SIZE},${SIZE}`, `--screenshot=${png}`,
    'file:///' + page.replace(/\\/g, '/'),
  ], { stdio: 'pipe' });

  if (!fs.existsSync(png) || fs.statSync(png).size < 100) {
    console.error(`FAILED: ${slug}/${out}`);
    process.exitCode = 1;
    continue;
  }
  // The dimensions are the whole requirement, so they are checked rather than
  // assumed: a window-size Chrome quietly clamps would otherwise ship as a store
  // logo that the console rejects on upload.
  const head = fs.readFileSync(png).subarray(16, 24);
  const [w, h] = [head.readUInt32BE(0), head.readUInt32BE(4)];
  if (w !== SIZE || h !== SIZE) {
    console.error(`FAILED: ${slug}/${out} rendered ${w}x${h}, expected ${SIZE}x${SIZE}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`ok Marketing/${slug}/${out} (${w}x${h}, ${fs.statSync(png).size} B)`);
}

fs.rmSync(tmp, { recursive: true, force: true });
