/**
 * Automated screenshot generator for Gemini Folders store listings.
 *
 * Usage:
 *   node take-screenshots.js              → 3 composed 1280×800 per locale (all 16)
 *   node take-screenshots.js --mode folder
 *   node take-screenshots.js --mode prompt
 *   node take-screenshots.js --mode raw   → raw popup PNGs only (no composition)
 *   node take-screenshots.js --locale fr  → single locale
 *
 * Output (mode=both):
 *   Promo_1_<locale>.png  — Folder + Prompt side by side (overview)
 *   Promo_2_<locale>.png  — Folder mode, centered close-up
 *   Promo_3_<locale>.png  — Prompt mode, centered close-up
 *   Promo_4_<locale>.png  — Mobile sync: popup + phone bookmarks mockup
 *   Promo_5_<locale>.png  — Context menu: right-click → folder submenu
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─── Extension target (must be parsed before constants) ──────────────────────

const _argv      = process.argv.slice(2);
const EXTENSION  = _argv.includes('--extension')
  ? _argv[_argv.indexOf('--extension') + 1]
  : 'gemini-folders';

const SAMPLE_DATA = EXTENSION === 'ai-folders'
  ? require('./sample-data-af')
  : require('./sample-data');

// ─── Configuration ────────────────────────────────────────────────────────────

const EXT_PATH = path.resolve(__dirname, `../dist/${EXTENSION}/chrome`);
const OUT_DIR  = path.resolve(__dirname, `../Marketing/${EXTENSION}/screenshots`);

const LOCALES = [
  { id: 'en',    chrome: 'en-US'  },
  { id: 'fr',    chrome: 'fr-FR'  },
  { id: 'de',    chrome: 'de-DE'  },
  { id: 'es',    chrome: 'es-ES'  },
  { id: 'it',    chrome: 'it-IT'  },
  { id: 'pt_BR', chrome: 'pt-BR'  },
  { id: 'pt_PT', chrome: 'pt-PT'  },
  { id: 'ru',    chrome: 'ru-RU'  },
  { id: 'pl',    chrome: 'pl-PL'  },
  { id: 'zh_CN', chrome: 'zh-CN'  },
  { id: 'ja',    chrome: 'ja-JP'  },
  { id: 'ko',    chrome: 'ko-KR'  },
  { id: 'hi',    chrome: 'hi-IN'  },
  { id: 'ro',    chrome: 'ro-RO'  },
  { id: 'sk',    chrome: 'sk-SK'  },
  { id: 'cs',    chrome: 'cs-CZ'  },
  { id: 'tr',    chrome: 'tr-TR'  },
  { id: 'id',    chrome: 'id-ID'  },
  { id: 'zh_TW', chrome: 'zh-TW'  },
  { id: 'vi',    chrome: 'vi-VN'  },
  { id: 'bn',    chrome: 'bn-BD'  },
  { id: 'nl',    chrome: 'nl-NL'  },
  { id: 'sw',    chrome: 'sw-KE'  },
  { id: 'tl',    chrome: 'tl'     },
  { id: 'th',    chrome: 'th-TH'  },
  { id: 'hu',    chrome: 'hu-HU'  },
  { id: 'ar',    chrome: 'ar'     },
  { id: 'ms',    chrome: 'ms'     },
  { id: 'sl',    chrome: 'sl'     },
  { id: 'bg',    chrome: 'bg'     },
  { id: 'sr',    chrome: 'sr'     },
  { id: 'hr',    chrome: 'hr'     },
  { id: 'et',    chrome: 'et'     },
  { id: 'lt',    chrome: 'lt'     },
  { id: 'lv',    chrome: 'lv'     },
  { id: 'ca',    chrome: 'ca'     },
  { id: 'uk',    chrome: 'uk'     },
  { id: 'el',    chrome: 'el'     },
  { id: 'he',    chrome: 'he'     },
  { id: 'nb',    chrome: 'nb'     },
  { id: 'sv',    chrome: 'sv-SE'  },
  { id: 'fi',    chrome: 'fi-FI'  },
  { id: 'da',    chrome: 'da-DK'  },
];

// Total popup viewport width = body content width (392px) + 16px horizontal
// padding on each side. Keep in sync with `body { width }` in src/popup.css.
const POPUP_WIDTH = 424;

const RTL_LOCALES = new Set(['ar', 'he', 'ur', 'fa']);

// ─── Shared brand SVG assets ──────────────────────────────────────────────────

// ChatGPT official logo path (white, 24×24 viewBox)
const CHATGPT_PATH = 'M22.28 9.82a5.98 5.98 0 00-.52-4.91 6.05 6.05 0 00-6.51-2.9A6.07 6.07 0 004.98 4.18a5.98 5.98 0 00-4 2.9 6.05 6.05 0 00.74 7.1 5.98 5.98 0 00.51 4.91 6.05 6.05 0 006.51 2.9A6.07 6.07 0 0013.26 24a6.06 6.06 0 005.77-4.21 5.99 5.99 0 004-2.9 6.06 6.06 0 00-.75-7.07zm-9.02 12.61a4.48 4.48 0 01-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 00.39-.68V11.2l2.02 1.17a.07.07 0 01.04.05v5.58a4.5 4.5 0 01-4.49 4.43zm-9.66-4.13a4.47 4.47 0 01-.53-3.01l.14.08 4.78 2.76a.77.77 0 00.78 0l5.84-3.37v2.33a.08.08 0 01-.03.06L9.74 19.95a4.5 4.5 0 01-6.14-1.65zM2.34 7.9a4.49 4.49 0 012.37-1.97V11.6a.77.77 0 00.39.68l5.81 3.35-2.02 1.17a.08.08 0 01-.07 0L4.03 14.1A4.5 4.5 0 012.34 7.9zm16.6 3.86l-5.81-3.36 2.02-1.17a.08.08 0 01.07 0l4.83 2.79a4.49 4.49 0 01-.68 8.1V12.44a.79.79 0 00-.43-.68zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 00-.79 0L9.41 9.23V6.9a.07.07 0 01.03-.06l4.83-2.79a4.5 4.5 0 016.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 01-.04-.06V6.07a4.5 4.5 0 017.38-3.45l-.14.08-4.78 2.76a.79.79 0 00-.4.68zm1.1-2.37l2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5z';

const geminiStar = (size, id) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#1C7DFF"/><stop offset="100%" stop-color="#8A5CF7"/></linearGradient></defs><path d="M12 2 C11.5 7.5 7.5 11.5 2 12 C7.5 12.5 11.5 16.5 12 22 C12.5 16.5 16.5 12.5 22 12 C16.5 11.5 12.5 7.5 12 2 Z" fill="url(#${id})"/></svg>`;

const chatGptSvg = (size, opacity = 1) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="opacity:${opacity};flex-shrink:0;"><path fill="white" d="${CHATGPT_PATH}"/></svg>`;

// ─── Service name overrides per locale ────────────────────────────────────────
// All 6 services use their English brand name globally.  Add locale-specific
// overrides here if a service officially uses a different name in that market.
// Each key is a locale id (matching LOCALES[].id); value is { ServiceName: 'override' }.
const SVC_NAME_OVERRIDES = {
  // DeepSeek's company name in Chinese is 深度求索 (Shēndù Qiúsuǒ), but the
  // product brand is "DeepSeek" even on Chinese app stores.  Uncomment if needed:
  // zh_CN: { DeepSeek: '深度求索' },
  // zh_TW: { DeepSeek: '深度求索' },
};

// ─── Shared background overlay (SVG noise + scanlines + vertical grid) ────────
// Applied to all promo compositions above the logo layer, below popup content.
const BG_OVERLAY_HTML = `<div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
  <svg style="position:absolute;left:0;top:0;" width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="gf-noise" color-interpolation-filters="linearRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.35 0.16" numOctaves="3" seed="17" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.20  0 0 0 0 0.76  0 0 0 0.22 0"/>
      </filter>
    </defs>
    <rect width="1280" height="800" filter="url(#gf-noise)"/>
  </svg>
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent 0px,rgba(0,0,0,0.4) 6px,transparent 12px);"></div>
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0px,rgba(0,140,255,0.06) 60px,transparent 120px);"></div>
</div>`;

// ─── Scattered AI logo background (AI Folders only) ──────────────────────────
// Monochrome logos placed with seeded LCG — identical layout on every run.
const LOGOS_BG_HTML = EXTENSION === 'ai-folders' ? (() => {
  const C   = 'rgba(195,215,245,1)';
  const mkChatGPT    = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${C}" xmlns="http://www.w3.org/2000/svg"><path d="${CHATGPT_PATH}"/></svg>`;
  const mkGemini     = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${C}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C11.5 7.5 7.5 11.5 2 12C7.5 12.5 11.5 16.5 12 22C12.5 16.5 16.5 12.5 22 12C16.5 11.5 12.5 7.5 12 2Z"/></svg>`;
  const mkClaude     = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${C}" xmlns="http://www.w3.org/2000/svg"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>`;
  const mkCopilot    = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 26" fill="${C}" xmlns="http://www.w3.org/2000/svg"><path d="M17.533 1.829A2.528 2.528 0 0015.11 0h-.737a2.531 2.531 0 00-2.484 2.087l-1.263 6.937.314-1.08a2.528 2.528 0 012.424-1.833h4.284l1.797.706 1.731-.706h-.505a2.528 2.528 0 01-2.423-1.829l-.715-2.453z" transform="translate(0 1)"/><path d="M6.726 20.16A2.528 2.528 0 009.152 22h1.566c1.37 0 2.49-1.1 2.525-2.48l.17-6.69-.357 1.228a2.528 2.528 0 01-2.423 1.83h-4.32l-1.54-.842-1.667.843h.497c1.124 0 2.113.75 2.426 1.84l.697 2.432z" transform="translate(0 1)"/><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" transform="translate(0 1)"/><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" transform="translate(0 1)"/></svg>`;
  const mkDeepSeek   = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${C}" xmlns="http://www.w3.org/2000/svg"><path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358a1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45"/></svg>`;
  const mkPerplexity = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${C}" xmlns="http://www.w3.org/2000/svg"><path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z"/></svg>`;

  const makers = [mkChatGPT, mkGemini, mkClaude, mkCopilot, mkDeepSeek, mkPerplexity];
  const CANVAS_W = 1280, CANVAS_H = 800;
  const COUNT = 14, MAX_TRIES = 500, MARGIN = 20;

  let seed = 29154;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };

  const logoParams = [];
  for (let i = 0; i < COUNT; i++) {
    const makerIdx = i % makers.length;
    const isBig    = makerIdx < 3;
    logoParams.push({
      sz:       isBig ? Math.round(280 + rand() * 130) : Math.round(130 + rand() * 100),
      opacity:  +((0.019 + rand() * 0.026).toFixed(3)),
      maker:    makers[makerIdx],
      makerIdx,
    });
  }

  const placed = [], placedTypes = [];
  let html = '';
  for (const { sz, opacity, maker, makerIdx } of logoParams) {
    const ow = Math.round(sz * 0.6);
    let x, y, attempts = 0, valid = false;
    do {
      x = -ow + Math.round(rand() * (CANVAS_W - sz + 2 * ow));
      y = -ow + Math.round(rand() * (CANVAS_H - sz + 2 * ow));
      attempts++;
      const cx = x + sz / 2, cy = y + sz / 2;
      valid = !placed.some((p, pi) => {
        if (x < p.x + p.sz + MARGIN && x + sz > p.x - MARGIN &&
            y < p.y + p.sz + MARGIN && y + sz > p.y - MARGIN) return true;
        if (placedTypes[pi] === makerIdx) {
          const d = Math.hypot(cx - (p.x + p.sz / 2), cy - (p.y + p.sz / 2));
          return d < (sz + p.sz) * 0.65;
        }
        return false;
      });
    } while (!valid && attempts < MAX_TRIES);
    if (valid) {
      placed.push({ x, y, sz });
      placedTypes.push(makerIdx);
      html += `<div style="position:absolute;left:${x}px;top:${y}px;opacity:${opacity};pointer-events:none;">${maker(sz)}</div>`;
    }
  }
  return `<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;direction:ltr;">${html}</div>`;
})() : '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gf-screenshot-'));
}

function cleanTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

async function getExtensionId(context) {
  const existing = context.serviceWorkers();
  if (existing.length > 0) return existing[0].url().split('/')[2];
  const worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
  return worker.url().split('/')[2];
}

async function injectSampleData(page, localeData) {
  const { folders, pinnedFolders, prompts } = localeData;
  await page.evaluate(({ folders, pinnedFolders, prompts }) => {
    return Promise.all([
      new Promise(r => chrome.storage.sync.set({ folders, pinnedFolders, sortPref: 'dateDesc' }, r)),
      new Promise(r => chrome.storage.local.set({ prompts, promptSortPref: 'dateDesc', syncBookmarksEnabled: false }, r)),
    ]);
  }, { folders, pinnedFolders, prompts });
}

async function waitForRender(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);
}

// Returns PNG height in pixels by reading the IHDR chunk directly.
function pngHeight(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.readUInt32BE(20);
}

// ─── Screenshot functions ─────────────────────────────────────────────────────

async function screenshotFolderMode(page, extId, localeData, outPath) {
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await waitForRender(page);

  await injectSampleData(page, localeData);
  await page.reload();
  await waitForRender(page);

  try {
    await page.waitForSelector('.folder-header', { timeout: 8000 });
  } catch {
    await page.screenshot({ path: outPath.replace('.png', '_DEBUG.png'), fullPage: true });
    throw new Error('No .folder-header found — see _DEBUG screenshot.');
  }

  // Expand first two folders
  const headers = page.locator('.folder-header');
  await headers.nth(0).click();
  await page.waitForTimeout(200);
  await headers.nth(1).click();
  await page.waitForTimeout(300);

  // Suppress all scrollbars so content height is natural (no empty space at bottom)
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('*').forEach(el => {
      const s = window.getComputedStyle(el);
      if (['scroll', 'auto'].includes(s.overflow) ||
          ['scroll', 'auto'].includes(s.overflowY) ||
          ['scroll', 'auto'].includes(s.overflowX)) {
        el.style.overflow = 'hidden';
      }
    });
  });

  // Fit viewport to actual content height — no empty space at bottom
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: POPUP_WIDTH, height: bodyHeight });

  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Folder: ${path.basename(outPath)}`);
}

// Like screenshotFolderMode but with syncBookmarksEnabled:true and returns the
// bounding box of the sync label so compositeMobileSync can draw the highlight.
async function screenshotMobileSyncFolder(page, extId, localeData, outPath) {
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await waitForRender(page);

  const { folders, pinnedFolders, prompts } = localeData;
  await page.evaluate(({ folders, pinnedFolders, prompts }) => {
    return Promise.all([
      new Promise(r => chrome.storage.sync.set({ folders, pinnedFolders, sortPref: 'dateDesc', syncBookmarksEnabled: true }, r)),
      new Promise(r => chrome.storage.local.set({ prompts, promptSortPref: 'dateDesc', lastMode: 'folder' }, r)),
    ]);
  }, { folders, pinnedFolders, prompts });

  await page.reload();
  await waitForRender(page);

  try {
    await page.waitForSelector('.folder-header', { timeout: 8000 });
  } catch {
    throw new Error('No .folder-header found for mobile sync screenshot.');
  }

  const headers = page.locator('.folder-header');
  await headers.nth(0).click();
  await page.waitForTimeout(200);
  await headers.nth(1).click();
  await page.waitForTimeout(300);

  // Capture checkbox position before hiding scrollbars
  const syncLabel = page.locator('#syncBookmarksLabel');
  const checkboxBox = await syncLabel.boundingBox();

  await page.evaluate(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('*').forEach(el => {
      const s = window.getComputedStyle(el);
      if (['scroll', 'auto'].includes(s.overflow) ||
          ['scroll', 'auto'].includes(s.overflowY) ||
          ['scroll', 'auto'].includes(s.overflowX)) {
        el.style.overflow = 'hidden';
      }
    });
  });

  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: POPUP_WIDTH, height: bodyHeight });

  // Wait for all pending async storage callbacks to fire, then force-check last.
  // Also inject a style override because appearance:none checkboxes don't always
  // repaint after a programmatic .checked assignment.
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const toggle = document.getElementById('syncBookmarksToggle');
    if (toggle) {
      toggle.checked = true;
      const s = document.createElement('style');
      s.textContent = '#syncBookmarksToggle { background-color: var(--accent-color, #1a73e8) !important; border-color: var(--accent-color, #1a73e8) !important; } #syncBookmarksToggle::after { content: "✓" !important; color: white !important; font-size: 9px !important; font-weight: bold !important; position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%,-50%) !important; display: block !important; }';
      document.head.appendChild(s);
    }
  });

  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Mobile Sync Folder: ${path.basename(outPath)}`);
  return checkboxBox;
}

async function screenshotPromptMode(page, extId, localeData, outPath) {
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await waitForRender(page);

  await injectSampleData(page, localeData);
  await page.evaluate(() => new Promise(r => chrome.storage.local.set({ lastMode: 'prompt' }, r)));
  await page.reload();
  await waitForRender(page);

  // Expand first two prompt items
  const promptHeaders = page.locator('.prompt-header');
  await promptHeaders.nth(0).click();
  await page.waitForTimeout(200);
  await promptHeaders.nth(1).click();
  await page.waitForTimeout(300);

  // Remove the 200px autoResize cap; also trim trailing whitespace to avoid phantom empty lines
  await page.evaluate(() => {
    document.querySelectorAll('.prompt-text-edit').forEach(ta => {
      ta.value = ta.value.trimEnd();
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.style.overflowY = 'hidden';
    });
    // Suppress all scrollbars
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('*').forEach(el => {
      const s = window.getComputedStyle(el);
      if (['scroll', 'auto'].includes(s.overflow) ||
          ['scroll', 'auto'].includes(s.overflowY) ||
          ['scroll', 'auto'].includes(s.overflowX)) {
        el.style.overflow = 'hidden';
      }
    });
  });

  // Fit viewport to content — no clipping
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: POPUP_WIDTH, height: bodyHeight });

  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Prompt: ${path.basename(outPath)}`);
}

// ─── Composition ─────────────────────────────────────────────────────────────

async function compositeScreenshot(page, folderPath, promptPath, localeData, outPath, localeId = 'en') {
  // ── Layout constants ──────────────────────────────────────────────────────
  const CANVAS_W     = 1280;
  const CANVAS_H     = 800;
  const TITLE_H      = 100;  // vertical space for the title
  const OUTER_PAD    = 24;   // left/right edge padding
  const V_GUARD      = 20;   // min padding above/below popup block (for scale cap)
  const LABEL_MARGIN = 16;   // gap between popup bottom and mode label
  const LABEL_H      = 46;   // height of mode label text area
  const GAP          = 44;   // gap between the two popups
  const LABEL_FONT   = Math.round(54 * 2 / 3); // 2/3 of title font size

  const folderH = pngHeight(folderPath);
  const promptH = pngHeight(promptPath);

  // Available area for popups — used only for scale computation
  const availW = CANVAS_W - OUTER_PAD * 2;
  const availH = CANVAS_H - TITLE_H - V_GUARD * 2 - LABEL_MARGIN - LABEL_H;

  // Uniform scale: fit both popups (same display width) within the available area
  const scaleByW = (availW - GAP) / 2 / POPUP_WIDTH;
  const scaleByH = availH / Math.max(folderH, promptH);
  const scale    = Math.min(scaleByW, scaleByH, 1.0); // never upscale beyond native

  const dispW       = Math.round(POPUP_WIDTH * scale);
  const folderDispH = Math.round(folderH * scale);
  const promptDispH = Math.round(promptH * scale);
  const maxDispH    = Math.max(folderDispH, promptDispH); // each popup shown at natural height

  // Horizontal centering
  const blockW  = dispW * 2 + GAP;
  const leftX   = OUTER_PAD + Math.round((availW - blockW) / 2);
  const rightX  = leftX + dispW + GAP;

  // Vertical centering: center based on the taller popup
  const totalContentH  = maxDispH + LABEL_MARGIN + LABEL_H;
  const topY           = TITLE_H + Math.round((CANVAS_H - TITLE_H - totalContentH) / 2);
  const folderLabelY   = topY + folderDispH + LABEL_MARGIN;
  const promptLabelY   = topY + promptDispH + LABEL_MARGIN;

  // Strip emoji from labels — show text only below the popups
  const folderText = localeData.folderLabel.replace(/^\S+\s*/, '');
  const promptText = localeData.promptLabel.replace(/^\S+\s*/, '');

  // Embed images as base64 so no file:// issues in Playwright page
  const folderB64 = fs.readFileSync(folderPath).toString('base64');
  const promptB64 = fs.readFileSync(promptPath).toString('base64');

  const svcColCss  = '';
  const svcColHtml = LOGOS_BG_HTML;


  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CANVAS_W}px;
    height: ${CANVAS_H}px;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 18% 70%, rgba(110,40,190,0.52) 0%, transparent 42%),
      radial-gradient(ellipse at 82% 55%, rgba(35,65,210,0.42) 0%, transparent 42%),
      radial-gradient(ellipse at 50% 105%, rgba(65,20,130,0.45) 0%, transparent 50%),
      linear-gradient(155deg, #1c2248 0%, #13102e 55%, #09060f 100%);
    font-family: 'Google Sans', 'Segoe UI', Arial, sans-serif;
    position: relative;
  }

  /* ── Title ─────────────────────────────────────────────────────────────── */
  .title {
    position: absolute;
    top: 0;
    left: ${OUTER_PAD}px;
    width: ${CANVAS_W - OUTER_PAD * 2}px;
    height: ${TITLE_H}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 54px;
    font-weight: 500;
    letter-spacing: -0.01em;
    background: linear-gradient(125deg,
      rgba(198,210,242,0.88) 0%,
      rgba(228,235,255,0.94) 40%,
      rgba(205,216,244,0.89) 65%,
      rgba(222,230,252,0.92) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 16px rgba(80,120,255,0.3)) drop-shadow(0 2px 5px rgba(0,0,0,0.75));
  }

  /* ── Popup frames ───────────────────────────────────────────────────────── */
  .popup {
    position: absolute;
    left: ${leftX}px;
    top: ${topY}px;
    width: ${dispW}px;
    border-radius: 18px;
    box-shadow:
      0 0 0 1px rgba(100,150,255,0.08),
      0 10px 30px rgba(80,120,255,0.07),
      0 20px 60px rgba(0,0,0,0.55),
      0 0 80px rgba(40,80,200,0.12);
    overflow: hidden;
  }
  /* Border rendered as a cap layer placed after logos in DOM, so logos never bleed through it */
  .popup-border-cap {
    background: transparent;
    overflow: visible;
    box-shadow: none;
    border: 1px solid rgba(255,255,255,0.1);
    border-top-color: rgba(255,255,255,0.18);
    border-left-color: rgba(255,255,255,0.15);
    pointer-events: none;
  }
  .popup-right {
    left: ${rightX}px;
  }
  .popup img {
    display: block;
    width: 100%;
    height: auto;
  }

  /* ── Each popup at its natural height (no forced clipping) ─────────────── */
  .popup-folder { height: ${folderDispH}px; }
  .popup-prompt { height: ${promptDispH}px; }

  /* ── Mode labels below each popup ──────────────────────────────────────── */
  .mode-label {
    position: absolute;
    height: ${LABEL_H}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${LABEL_FONT}px;
    font-weight: 600;
    letter-spacing: -0.01em;
    background: linear-gradient(125deg, rgba(198,210,242,0.88) 0%, rgba(228,235,255,0.94) 40%, rgba(205,216,244,0.89) 65%, rgba(222,230,252,0.92) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8)) drop-shadow(0 4px 14px rgba(0,0,0,0.5));
    white-space: nowrap;
  }
  .label-folder { left: ${leftX}px;  top: ${folderLabelY}px; width: ${dispW}px; }
  .label-prompt { left: ${rightX}px; top: ${promptLabelY}px; width: ${dispW}px; }
  ${svcColCss}
</style>
</head>
<body>
  ${svcColHtml}
  ${BG_OVERLAY_HTML}
  <div class="title">${localeData.title}</div>

  <div style="position:absolute;border-radius:50%;pointer-events:none;width:520px;height:520px;left:${leftX + Math.round(dispW / 2) - 260}px;top:${topY + Math.round(folderDispH / 2) - 260}px;background:radial-gradient(circle,rgba(100,50,230,0.22) 0%,rgba(60,80,220,0.1) 45%,transparent 70%);"></div>
  <div style="position:absolute;border-radius:50%;pointer-events:none;width:520px;height:520px;left:${rightX + Math.round(dispW / 2) - 260}px;top:${topY + Math.round(promptDispH / 2) - 260}px;background:radial-gradient(circle,rgba(40,90,230,0.2) 0%,rgba(80,50,210,0.1) 45%,transparent 70%);"></div>

  <div class="popup popup-folder">
    <img src="data:image/png;base64,${folderB64}" alt="folder mode">
  </div>
  <div class="popup popup-right popup-prompt">
    <img src="data:image/png;base64,${promptB64}" alt="prompt mode">
  </div>
  <div class="popup popup-folder popup-border-cap"></div>
  <div class="popup popup-right popup-prompt popup-border-cap"></div>

  <div class="mode-label label-folder">${folderText}</div>
  <div class="mode-label label-prompt">${promptText}</div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: CANVAS_W, height: CANVAS_H });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Composed: ${path.basename(outPath)}`);
}

// ─── Single-popup Composition ─────────────────────────────────────────────────

async function compositeSingleScreenshot(page, imagePath, title, outPath) {
  const CANVAS_W  = 1280;
  const CANVAS_H  = 800;
  const TITLE_H   = 100;
  const OUTER_PAD = 24;
  const V_PAD     = 32; // min vertical padding around the popup

  const imgH = pngHeight(imagePath);

  // Target ~58% of canvas width; also constrain by available height.
  const targetW   = Math.round((CANVAS_W - OUTER_PAD * 2) * 0.58);
  const availH    = CANVAS_H - TITLE_H - V_PAD * 2;
  const scaleByW  = targetW / POPUP_WIDTH;
  const scaleByH  = availH / imgH;
  const scale     = Math.min(scaleByW, scaleByH);

  const dispW = Math.round(POPUP_WIDTH * scale);
  const dispH = Math.round(imgH * scale);

  const x = Math.round((CANVAS_W - dispW) / 2);
  const y = TITLE_H + Math.round((CANVAS_H - TITLE_H - dispH) / 2);

  const imgB64 = fs.readFileSync(imagePath).toString('base64');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CANVAS_W}px;
    height: ${CANVAS_H}px;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 18% 70%, rgba(110,40,190,0.52) 0%, transparent 42%),
      radial-gradient(ellipse at 82% 55%, rgba(35,65,210,0.42) 0%, transparent 42%),
      radial-gradient(ellipse at 50% 105%, rgba(65,20,130,0.45) 0%, transparent 50%),
      linear-gradient(155deg, #1c2248 0%, #13102e 55%, #09060f 100%);
    font-family: 'Google Sans', 'Segoe UI', Arial, sans-serif;
    position: relative;
  }
  .title {
    position: absolute;
    top: 0;
    left: ${OUTER_PAD}px;
    width: ${CANVAS_W - OUTER_PAD * 2}px;
    height: ${TITLE_H}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 54px;
    font-weight: 500;
    letter-spacing: -0.01em;
    background: linear-gradient(125deg,
      rgba(198,210,242,0.88) 0%,
      rgba(228,235,255,0.94) 40%,
      rgba(205,216,244,0.89) 65%,
      rgba(222,230,252,0.92) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 16px rgba(80,120,255,0.3)) drop-shadow(0 2px 5px rgba(0,0,0,0.75));
  }
  .popup {
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: ${dispW}px;
    height: ${dispH}px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.1);
    border-top-color: rgba(255,255,255,0.18);
    border-left-color: rgba(255,255,255,0.15);
    box-shadow:
      0 0 0 1px rgba(100,150,255,0.08),
      0 10px 30px rgba(80,120,255,0.07),
      0 20px 60px rgba(0,0,0,0.55),
      0 0 80px rgba(40,80,200,0.12);
    overflow: hidden;
  }
  .popup img {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
</head>
<body>
  ${LOGOS_BG_HTML}
  ${BG_OVERLAY_HTML}
  <div class="title">${title}</div>
  <div style="position:absolute;border-radius:50%;pointer-events:none;width:560px;height:560px;left:${x + Math.round(dispW / 2) - 280}px;top:${y + Math.round(dispH / 2) - 280}px;background:radial-gradient(circle,rgba(80,50,230,0.22) 0%,rgba(50,80,220,0.1) 45%,transparent 70%);"></div>
  <div class="popup">
    <img src="data:image/png;base64,${imgB64}" alt="popup">
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: CANVAS_W, height: CANVAS_H });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Composed: ${path.basename(outPath)}`);
}

// ─── Mobile Sync Composition ──────────────────────────────────────────────────

async function compositeMobileSync(page, folderPath, checkboxBox, localeData, isRTL, outPath) {
  const CANVAS_W  = 1280;
  const CANVAS_H  = 800;
  const TITLE_H   = 100;
  const OUTER_PAD = 24;
  const GAP       = 72; // space between popup and phone (holds the sync arrow)

  const folderH = pngHeight(folderPath);

  // Phone display dimensions (HTML is crisp — no upscaling concern)
  const PHONE_DISP_H = Math.min(folderH, 560); // match popup height, cap at 560
  const PHONE_DISP_W = Math.round(PHONE_DISP_H * 0.52); // ~9:17 ratio

  // Scale the folder popup to the same display height as the phone
  const availH   = CANVAS_H - TITLE_H - 48;
  const capH     = Math.min(PHONE_DISP_H, availH);
  const scaleByH = capH / folderH;
  const scaleByW = (CANVAS_W - OUTER_PAD * 2 - GAP - PHONE_DISP_W) / POPUP_WIDTH;
  const scale    = Math.min(scaleByH, scaleByW, 1.5);

  const popupDispW = Math.round(POPUP_WIDTH * scale);
  const popupDispH = Math.round(folderH * scale);
  const phoneH     = Math.min(popupDispH, PHONE_DISP_H);
  const phoneW     = Math.round(phoneH * 0.52);

  // Horizontal layout — center the block; RTL: phone left, popup right
  const blockW  = popupDispW + GAP + phoneW;
  const blockL  = OUTER_PAD + Math.round((CANVAS_W - OUTER_PAD * 2 - blockW) / 2);
  const popupX  = isRTL ? blockL + phoneW + GAP : blockL;
  const phoneX  = isRTL ? blockL                : blockL + popupDispW + GAP;
  const leftX   = popupX; // alias kept for circle-highlight calc

  // Vertical — center each panel in the available area
  const blockH  = Math.max(popupDispH, phoneH);
  const topY    = TITLE_H + Math.round((CANVAS_H - TITLE_H - blockH) / 2);
  const popupY  = topY + Math.round((blockH - popupDispH) / 2);
  const phoneY  = topY + Math.round((blockH - phoneH) / 2);
  const arrowCY = topY + Math.round(blockH / 2);
  const arrowCX = isRTL
    ? blockL + phoneW + Math.round(GAP / 2)
    : blockL + popupDispW + Math.round(GAP / 2);

  const folderB64 = fs.readFileSync(folderPath).toString('base64');

  // Green circle highlight around the mobile-sync checkbox+icon
  let circleCSS = '';
  let circleHTML = '';
  if (checkboxBox) {
    const cx  = leftX + (checkboxBox.x + checkboxBox.width  / 2) * scale;
    const cy  = popupY + (checkboxBox.y + checkboxBox.height / 2) * scale;
    const r   = Math.round(Math.max(checkboxBox.width, checkboxBox.height) * scale / 2) + 12;
    circleCSS = `
  .sync-highlight {
    position: absolute;
    left: ${Math.round(cx - r)}px; top: ${Math.round(cy - r)}px;
    width: ${r * 2}px; height: ${r * 2}px;
    border-radius: 50%;
    border: 3px solid #34a853;
    box-shadow: 0 0 0 2px rgba(52,168,83,0.25), 0 0 12px rgba(52,168,83,0.6);
    pointer-events: none;
  }`;
    circleHTML = `<div class="sync-highlight"></div>`;
  }

  // Phone screen content — folder list mirroring the extension
  const folderItems = Object.keys(localeData.folders)
    .map(name => `<div class="bm-row"><span class="bm-icon">📁</span><span class="bm-name">${name}</span></div>`)
    .join('');

  // Phone font scales with phone width
  const phoneFontBase = Math.round(phoneW * 0.072);
  const phoneHeaderH  = Math.round(phoneH * 0.11);
  const phoneBreadH   = Math.round(phoneH * 0.09);
  const phoneBorder   = Math.max(6, Math.round(phoneW * 0.04));
  const phoneRadius   = Math.round(phoneW * 0.16);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CANVAS_W}px; height: ${CANVAS_H}px;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 18% 70%, rgba(110,40,190,0.52) 0%, transparent 42%),
      radial-gradient(ellipse at 82% 55%, rgba(35,65,210,0.42) 0%, transparent 42%),
      radial-gradient(ellipse at 50% 105%, rgba(65,20,130,0.45) 0%, transparent 50%),
      linear-gradient(155deg, #1c2248 0%, #13102e 55%, #09060f 100%);
    font-family: 'Google Sans', 'Segoe UI', Arial, sans-serif;
    position: relative;
  }
  .title {
    position: absolute; top: 0; left: ${OUTER_PAD}px;
    width: ${CANVAS_W - OUTER_PAD * 2}px; height: ${TITLE_H}px;
    display: flex; align-items: center; justify-content: center;
    font-size: 54px; font-weight: 500; letter-spacing: -0.01em;
    background: linear-gradient(125deg, rgba(198,210,242,0.88) 0%, rgba(228,235,255,0.94) 40%, rgba(205,216,244,0.89) 65%, rgba(222,230,252,0.92) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 16px rgba(80,120,255,0.3)) drop-shadow(0 2px 5px rgba(0,0,0,0.75));
  }

  /* ── Extension popup ────────────────────────────────────── */
  .popup {
    position: absolute;
    left: ${popupX}px; top: ${popupY}px;
    width: ${popupDispW}px; height: ${popupDispH}px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.1);
    border-top-color: rgba(255,255,255,0.18);
    border-left-color: rgba(255,255,255,0.15);
    box-shadow:
      0 0 0 1px rgba(100,150,255,0.08),
      0 10px 30px rgba(80,120,255,0.07),
      0 20px 60px rgba(0,0,0,0.55),
      0 0 80px rgba(40,80,200,0.12);
    overflow: hidden;
  }
  .popup img { display: block; width: 100%; height: auto; }

  /* ── Sync arrow ──────────────────────────────────────────── */
  .sync-arrow {
    position: absolute;
    left: ${arrowCX - 28}px; top: ${arrowCY - 28}px;
    width: 56px; height: 56px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.12);
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    color: rgba(255,255,255,0.9);
    font-size: 22px;
  }

  /* ── Phone shell ─────────────────────────────────────────── */
  .phone {
    position: absolute;
    left: ${phoneX}px; top: ${phoneY}px;
    width: ${phoneW}px; height: ${phoneH}px;
    background: #1a1a1a;
    border-radius: ${phoneRadius}px;
    border: ${phoneBorder}px solid #2a2a2a;
    box-shadow:
      0 0 0 2px rgba(255,255,255,0.1),
      0 0 32px rgba(90,150,255,0.45),
      0 20px 60px rgba(0,0,0,0.65);
    overflow: hidden;
  }
  .phone-screen {
    width: 100%; height: 100%;
    background: #f1f3f4;
    border-radius: ${Math.max(1, phoneRadius - phoneBorder)}px;
    overflow: hidden;
    display: flex; flex-direction: column;
  }

  /* Chrome mobile top bar */
  .chrome-bar {
    background: #fff;
    height: ${phoneHeaderH}px;
    min-height: ${phoneHeaderH}px;
    display: flex; align-items: center;
    padding: 0 ${Math.round(phoneW * 0.05)}px;
    gap: ${Math.round(phoneW * 0.04)}px;
    border-bottom: 1px solid #e0e0e0;
  }
  .chrome-back { color: #5f6368; font-size: ${Math.round(phoneFontBase * 1.1)}px; flex-shrink: 0; }
  .chrome-title {
    flex: 1; font-size: ${Math.round(phoneFontBase * 0.85)}px;
    font-weight: 600; color: #202124; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .chrome-more { color: #5f6368; font-size: ${Math.round(phoneFontBase * 1.2)}px; flex-shrink: 0; }

  /* Breadcrumb row */
  .breadcrumb {
    background: #e8eaed;
    height: ${phoneBreadH}px; min-height: ${phoneBreadH}px;
    display: flex; align-items: center;
    padding: 0 ${Math.round(phoneW * 0.05)}px;
    font-size: ${Math.round(phoneFontBase * 0.75)}px;
    color: #5f6368;
    gap: 4px;
    border-bottom: 1px solid #dadce0;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }

  /* Bookmark rows */
  .bm-list { flex: 1; background: #fff; overflow: hidden; }
  .bm-row {
    display: flex; align-items: center;
    height: ${Math.round(phoneH * 0.115)}px;
    padding: 0 ${Math.round(phoneW * 0.06)}px;
    border-bottom: 1px solid #f1f3f4;
    gap: ${Math.round(phoneW * 0.04)}px;
  }
  .bm-icon { font-size: ${Math.round(phoneFontBase * 1.1)}px; flex-shrink: 0; }
  .bm-name {
    font-size: ${Math.round(phoneFontBase * 0.88)}px; color: #202124;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  ${circleCSS}
</style>
</head>
<body>
  ${LOGOS_BG_HTML}
  ${BG_OVERLAY_HTML}
  <div class="title">${localeData.mobileScreenTitle}</div>

  <div style="position:absolute;border-radius:50%;pointer-events:none;width:520px;height:520px;left:${popupX + Math.round(popupDispW / 2) - 260}px;top:${popupY + Math.round(popupDispH / 2) - 260}px;background:radial-gradient(circle,rgba(100,50,230,0.22) 0%,rgba(60,80,220,0.1) 45%,transparent 70%);"></div>
  <div style="position:absolute;border-radius:50%;pointer-events:none;width:400px;height:400px;left:${phoneX + Math.round(phoneW / 2) - 200}px;top:${phoneY + Math.round(phoneH / 2) - 200}px;background:radial-gradient(circle,rgba(40,90,230,0.2) 0%,rgba(80,50,210,0.1) 45%,transparent 70%);"></div>

  <div class="popup">
    <img src="data:image/png;base64,${folderB64}" alt="folder mode">
  </div>
  ${circleHTML}

  <div class="sync-arrow">${isRTL ? '⟵' : '⟶'}</div>

  <div class="phone">
    <div class="phone-screen">
      <div class="chrome-bar">
        <span class="chrome-back">‹</span>
        <span class="chrome-title">${localeData.syncFolderName}</span>
        <span class="chrome-more">⋮</span>
      </div>
      <div class="breadcrumb">☆ &rsaquo; ${localeData.syncFolderName}</div>
      <div class="bm-list">${folderItems}</div>
    </div>
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: CANVAS_W, height: CANVAS_H });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Composed: ${path.basename(outPath)}`);
}

// ─── Context Menu Composition ─────────────────────────────────────────────────

async function compositeContextMenu(page, localeData, isRTL, outPath) {
  const CANVAS_W = 1280;
  const CANVAS_H = 800;
  const TITLE_H  = 100;

  const folderNames = Object.keys(localeData.folders);

  // Extension icon embedded as base64
  const iconPath = path.resolve(__dirname, `../dist/${EXTENSION}/chrome/icon48.png`);
  const iconB64  = fs.existsSync(iconPath) ? fs.readFileSync(iconPath).toString('base64') : null;
  const iconImg  = iconB64
    ? `<img src="data:image/png;base64,${iconB64}" width="16" height="16" style="flex-shrink:0;">`
    : '';

  // Context menu dimensions
  const CTX_W      = 300;
  const CTX_ITEM_H = 34;
  const CTX_SEP_H  = 9;
  const CTX_PAD_V  = 6;
  const CTX_H = CTX_PAD_V * 2 + CTX_ITEM_H * 5 + CTX_SEP_H * 2;

  // Submenu
  const SUB_W      = 240;
  const SUB_ITEM_H = 38;
  const SUB_PAD_V  = 6;
  const SUB_H      = SUB_PAD_V * 2 + SUB_ITEM_H * folderNames.length;

  // Browser window panel — no separate win-bar; tabs ARE the top edge
  const PANEL_W  = CANVAS_W - 60;
  const PANEL_H  = CANVAS_H - TITLE_H - 40;
  const PANEL_X  = 30;
  const PANEL_Y  = TITLE_H + 20;

  const TAB_BAR_H  = 40;   // tab row (contains Windows controls on right)
  const ADDR_BAR_H = 44;   // address bar
  const CHROME_H   = TAB_BAR_H + ADDR_BAR_H;

  // Gemini sidebar width (matches the screenshot ~260px)
  const SIDEBAR_W = 260;

  // Context menu position — centre of the main chat area
  const CONTENT_TOP = PANEL_Y + CHROME_H;
  const CONTENT_H   = PANEL_H - CHROME_H;
  const CTX_X = isRTL
    ? PANEL_X + Math.round((PANEL_W - SIDEBAR_W - CTX_W) * 0.38)
    : PANEL_X + SIDEBAR_W + Math.round((PANEL_W - SIDEBAR_W - CTX_W) * 0.38);
  const CTX_Y = CONTENT_TOP + Math.round((CONTENT_H - CTX_H) / 2) + 30;

  // Highlighted item (ctxMenuSave) is the last
  const highlightedTop = CTX_Y + CTX_PAD_V + CTX_ITEM_H * 4 + CTX_SEP_H * 2;
  const SUB_X = isRTL
    ? Math.max(PANEL_X, CTX_X - SUB_W + 4)
    : CTX_X + CTX_W - 4;
  const SUB_Y = Math.min(highlightedTop - CTX_PAD_V, PANEL_Y + PANEL_H - SUB_H - 10);

  // Sidebar conversations (first devChat1 is the active one)
  const sidebarConvos = [
    localeData.devChat1,
    localeData.devChat2,
    localeData.resChat1,
    localeData.writeChat1,
    localeData.devChat3 || localeData.writeChat2 || '',
  ].filter(Boolean);

  const subItems = folderNames
    .map(name => `<div class="sub-item">${name}</div>`)
    .join('');

  // Gemini star SVG — smooth 4-pointed star matching the real logo

  // AI Folders: show ChatGPT page instead of Gemini
  const isAF         = EXTENSION === 'ai-folders';
  const tabFavicon   = isAF
    ? `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="white"/><g transform="translate(2,2) scale(0.5)"><path fill="black" d="${CHATGPT_PATH}"/></g></svg>`
    : geminiStar(16, 'gfav');
  const tabTitle     = isAF ? 'ChatGPT' : 'Gemini';
  const addressUrl   = isAF ? 'chatgpt.com' : 'gemini.google.com';

  // RTL: submenu chevron points left; sidebar active pill corners flip
  const ctxArrowPoints = isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
  const sbConvoRadius  = isRTL ? '24px 0 0 24px' : '0 24px 24px 0';
  const sbConvoMargin  = isRTL ? 'margin-left: 8px; margin-right: 0;' : 'margin-right: 8px;';

  const html = `<!DOCTYPE html>
<html ${isRTL ? 'dir="rtl"' : ''}>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CANVAS_W}px; height: ${CANVAS_H}px;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 18% 70%, rgba(110,40,190,0.52) 0%, transparent 42%),
      radial-gradient(ellipse at 82% 55%, rgba(35,65,210,0.42) 0%, transparent 42%),
      radial-gradient(ellipse at 50% 105%, rgba(65,20,130,0.45) 0%, transparent 50%),
      linear-gradient(155deg, #1c2248 0%, #13102e 55%, #09060f 100%);
    font-family: 'Google Sans', 'Segoe UI', Arial, sans-serif;
    position: relative;
  }
  .title {
    position: absolute; top: 0; left: 24px;
    width: ${CANVAS_W - 48}px; height: ${TITLE_H}px;
    display: flex; align-items: center; justify-content: center;
    font-size: 54px; font-weight: 500; letter-spacing: -0.01em;
    background: linear-gradient(125deg, rgba(198,210,242,0.88) 0%, rgba(228,235,255,0.94) 40%, rgba(205,216,244,0.89) 65%, rgba(222,230,252,0.92) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 16px rgba(80,120,255,0.3)) drop-shadow(0 2px 5px rgba(0,0,0,0.75));
  }

  /* ── Chrome browser window ──────────────────────────────── */
  .browser-window {
    position: absolute;
    left: ${PANEL_X}px; top: ${PANEL_Y}px;
    width: ${PANEL_W}px; height: ${PANEL_H}px;
    border-radius: 10px; overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3);
    display: flex; flex-direction: column;
  }

  /* Tab bar — Windows Chrome style: tabs flush to window top, controls on right */
  .tab-bar {
    height: ${TAB_BAR_H}px; flex-shrink: 0;
    background: #23272a;
    display: flex; align-items: flex-end;
    padding: 0 0 0 8px;
  }
  .tab-spacer { flex: 1; }
  .tab {
    height: 32px; min-width: 180px; max-width: 220px;
    background: #1e1f20;
    border-radius: 8px 8px 0 0;
    display: flex; align-items: center;
    padding: 0 10px; gap: 7px;
    font-size: 12px; font-weight: 400; color: #e8eaed;
  }
  .tab-favicon { width: 16px; height: 16px; flex-shrink: 0; }
  .tab-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tab-close { color: #9aa0a6; font-size: 10px; }
  .new-tab-btn {
    width: 28px; height: 28px; margin-left: 2px; margin-bottom: 4px;
    display: flex; align-items: center; justify-content: center;
    color: #9aa0a6; font-size: 16px;
  }
  /* Windows window controls on the far right of the tab bar */
  .win-controls {
    display: flex; align-self: stretch;
    margin-left: 4px;
  }
  .win-ctrl {
    width: 46px; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: rgba(255,255,255,0.7);
  }
  .win-ctrl:last-child { font-size: 10px; }
  .win-ctrl:last-child:hover { background: #c42b1c; color: #fff; }

  /* Address bar */
  .addr-bar {
    height: ${ADDR_BAR_H}px; flex-shrink: 0;
    background: #1e1f20;
    display: flex; align-items: center;
    padding: 0 12px; gap: 8px;
  }
  .nav-btn {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #9aa0a6; font-size: 14px;
  }
  .nav-btn.disabled { opacity: 0.3; }
  .addr-pill {
    flex: 1; height: 32px; background: #303134;
    border-radius: 16px;
    display: flex; align-items: center; padding: 0 14px; gap: 8px;
    font-size: 13px; color: #e8eaed;
  }
  .addr-lock { font-size: 11px; color: #9aa0a6; }
  .addr-text { flex: 1; }
  .addr-actions { display: flex; gap: 2px; }
  .addr-action {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #9aa0a6; font-size: 14px;
  }

  /* ── Gemini page ─────────────────────────────────────────── */
  .gemini-page {
    flex: 1; display: flex;
    background: #131314;
    position: relative; overflow: hidden;
  }

  /* ── Left sidebar (gray background like real Gemini) ────── */
  .gemini-sidebar {
    width: ${SIDEBAR_W}px; flex-shrink: 0;
    background: #1e1f20;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .sb-top {
    display: flex; align-items: center; gap: 8px;
    padding: 14px 16px 10px;
  }
  .sb-icon {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #c4c7c5; font-size: 18px; flex-shrink: 0;
    cursor: pointer;
  }
  .sb-search { color: #c4c7c5; font-size: 18px; }
  .sb-nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; font-size: 14px; color: #c4c7c5;
    cursor: pointer; white-space: nowrap;
  }
  .sb-nav-item svg { flex-shrink: 0; }
  .sb-section {
    font-size: 13px; font-weight: 500; color: #c4c7c5;
    padding: 12px 16px 4px;
  }
  .sb-convo {
    padding: 8px 16px; font-size: 13px; color: #c4c7c5;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    cursor: pointer; border-radius: ${sbConvoRadius}; ${sbConvoMargin}
  }
  .sb-convo.active {
    background: #2d3a6b; color: #d2e3fc; font-weight: 500;
  }
  .sb-bottom {
    margin-top: auto;
    padding: 10px 16px 14px;
    display: flex; align-items: center; gap: 12px;
    font-size: 14px; color: #c4c7c5;
  }

  /* ── Main content area ───────────────────────────────────── */
  .gemini-main {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden;
  }
  /* Gemini top bar (title + buttons) */
  .gemini-topbar {
    height: 56px; flex-shrink: 0;
    display: flex; align-items: center;
    padding: ${isRTL ? '0 0 0 20px' : '0 20px 0 0'}; gap: 12px;
  }
  .gemini-topbar-title {
    flex: 1; font-size: 14px; color: #e8eaed; font-weight: 400;
    text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding: 0 20px;
  }
  .topbar-btn {
    height: 36px; border-radius: 20px;
    display: flex; align-items: center; gap: 6px;
    padding: 0 16px; font-size: 13px; font-weight: 500;
    background: #1967d2; color: #fff; flex-shrink: 0;
  }
  .topbar-icon { color: #c4c7c5; font-size: 18px; flex-shrink: 0; }

  /* Chat scroll area */
  .chat-scroll {
    flex: 1; padding: 24px 0; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; gap: 0;
  }
  /* User message bubble — always on the right (flex-end), aligned with ⋮ icon */
  .msg-user {
    max-width: 520px; width: 90%;
    background: #303134; border-radius: 18px;
    padding: 14px 20px; font-size: 14px; line-height: 1.6;
    color: #e8eaed; align-self: flex-end;
    ${isRTL ? 'margin-left: 40px;' : 'margin-right: 40px;'} margin-bottom: 20px;
    position: relative;
  }
  .msg-user-chevron {
    position: absolute; ${isRTL ? 'left: 16px;' : 'right: 16px;'} top: 14px;
    color: #9aa0a6; font-size: 12px;
  }
  /* Gemini response — always on the left (flex-start), aligned with input box */
  .msg-ai {
    width: 90%; max-width: 680px; align-self: flex-start;
    margin-left: 40px; margin-bottom: 16px;
  }
  .msg-ai-header {
    display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px;
  }
  .msg-ai-star { flex-shrink: 0; margin-top: 2px; }
  .msg-ai-thinking {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: #9aa0a6; ${isRTL ? 'padding-right: 36px;' : 'padding-right: 0px;'}
    margin-bottom: 10px;
  }
  .msg-ai-body { font-size: 14px; line-height: 1.65; color: #e8eaed; ${isRTL ? 'padding-right: 72px;' : 'padding-left: 36px;'} }
  .msg-ai-bold { font-weight: 600; }

  /* Input bar (two rows) */
  .gemini-input {
    flex-shrink: 0; margin: 0 24px 16px;
    background: #303134; border-radius: 18px;
    padding: 12px 16px 10px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .input-row1 { display: flex; align-items: center; gap: 10px; }
  .input-shield { flex-shrink: 0; }
  .input-placeholder { flex: 1; font-size: 14px; color: #9aa0a6; }
  .input-row2 { display: flex; align-items: center; justify-content: space-between; }
  .input-left-tools { display: flex; gap: 4px; align-items: center; }
  .input-right-tools { display: flex; gap: 6px; align-items: center; }
  .input-btn {
    display: flex; align-items: center; gap: 4px;
    font-size: 13px; color: #c4c7c5;
    padding: 5px 8px; border-radius: 20px;
    cursor: pointer;
  }
  /* Feedback icon row below AI response */
  .msg-feedback {
    display: flex; align-items: center; gap: 16px;
    padding: 10px 0 4px; margin-left: 0;
  }

  /* Dim overlay */
  .gemini-dim {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.25); pointer-events: none;
  }

  /* ── Context menu — dark mode ────────────────────────────── */
  .ctx-menu {
    position: absolute;
    left: ${CTX_X}px; top: ${CTX_Y}px;
    width: ${CTX_W}px;
    background: #303134; border-radius: 8px;
    box-shadow: 0 4px 32px rgba(0,0,0,0.7), 0 1px 6px rgba(0,0,0,0.4);
    padding: ${CTX_PAD_V}px 0;
    font-size: 13.5px; color: #e8eaed;
  }
  .ctx-item {
    height: ${CTX_ITEM_H}px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px;
  }
  .ctx-item.inactive { color: #9aa0a6; }
  .ctx-item.active { background: rgba(138,180,248,0.15); color: #8ab4f8; font-weight: 500; }
  .ctx-sep { height: 1px; background: rgba(255,255,255,0.12); margin: ${Math.round(CTX_SEP_H / 2)}px 0; }
  .ctx-label { display: flex; align-items: center; gap: 8px; }
  .ctx-arrow { display: flex; align-items: center; opacity: 0.8; }

  /* ── Submenu — dark mode, width fits content ────────────── */
  .sub-menu {
    position: absolute;
    ${isRTL
      ? `right: ${CANVAS_W - CTX_X}px; left: auto;`
      : `left: ${SUB_X}px;`}
    top: ${SUB_Y}px;
    width: fit-content; min-width: 120px; background: #303134;
    border-radius: 8px;
    box-shadow: 0 4px 32px rgba(0,0,0,0.7), 0 1px 6px rgba(0,0,0,0.4);
    padding: ${SUB_PAD_V}px 0;
    font-size: 13.5px; color: #e8eaed;
  }
  .sub-item {
    height: ${SUB_ITEM_H}px;
    display: flex; align-items: center;
    padding: 0 20px 0 16px; gap: 8px;
    white-space: nowrap;
  }
  .sub-item:first-child { background: rgba(138,180,248,0.15); color: #8ab4f8; }
</style>
</head>
<body>
  ${LOGOS_BG_HTML}
  ${BG_OVERLAY_HTML}
  <div class="title">${localeData.contextMenuScreenTitle}</div>

  <!-- Chrome browser window -->
  <div class="browser-window">

    <!-- Tab bar with Windows controls on the right -->
    <div class="tab-bar">
      <div class="tab">
        ${tabFavicon}
        <span class="tab-title">${tabTitle}</span>
        <span class="tab-close">✕</span>
      </div>
      <div class="new-tab-btn">+</div>
      <div class="tab-spacer"></div>
      <div class="win-controls">
        <div class="win-ctrl">─</div>
        <div class="win-ctrl" style="font-size:15px;">▢</div>
        <div class="win-ctrl">✕</div>
      </div>
    </div>

    <!-- Address bar (dark, Gemini-themed) -->
    <div class="addr-bar">
      <!-- Back arrow: active/white — points left in LTR, right in RTL -->
      <div class="nav-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          ${isRTL
            ? '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13,5 20,12 13,19"/>'
            : '<line x1="20" y1="12" x2="4" y2="12"/><polyline points="11,5 4,12 11,19"/>'}
        </svg>
      </div>
      <!-- Forward arrow: dimmed — points right in LTR, left in RTL -->
      <div class="nav-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          ${isRTL
            ? '<line x1="20" y1="12" x2="4" y2="12"/><polyline points="11,5 4,12 11,19"/>'
            : '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13,5 20,12 13,19"/>'}
        </svg>
      </div>
      <!-- Refresh: ↻ mirrored in RTL -->
      <div class="nav-btn"><span style="display:inline-block;transform:${isRTL ? 'scaleY(-1) rotate(-90deg)' : 'rotate(90deg)'};font-size:18px;color:#9aa0a6;line-height:1;">↻</span></div>
      <div class="addr-pill">
        <span class="addr-lock">🔒</span>
        <span class="addr-text">${addressUrl}</span>
        <span style="font-size:14px;color:#9aa0a6;flex-shrink:0;margin-left:auto;">☆</span>
      </div>
      <div class="addr-actions">
        ${iconImg ? `<div class="addr-action">${iconImg}</div>` : ''}
        <div class="addr-action">⋮</div>
      </div>
    </div>

    ${isAF ? `
    <!-- ChatGPT page (AI Folders) -->
    <div class="gemini-page" style="background:#212121;">
      <div class="gemini-sidebar" style="background:#171717;">
        <div class="sb-top">
          <div style="flex:1;padding-left:14px;display:flex;align-items:center;">${chatGptSvg(22, 0.9)}</div>
          <div class="sb-icon">
            <!-- Close sidebar icon -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ececec" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </div>
        </div>
        <div class="sb-section" style="color:#8e8ea0;font-size:11px;padding:8px 12px 2px;font-weight:500;letter-spacing:0.04em;">${localeData.sidebarRecent}</div>
        ${sidebarConvos.map((c, i) =>
          `<div class="sb-convo${i === 0 ? ' active' : ''}" style="${i === 0 ? `background:rgba(255,255,255,0.1);border-radius:${sbConvoRadius};` : ''}">${c}</div>`
        ).join('')}
        <div class="sb-bottom" style="color:#8e8ea0;border-top:1px solid rgba(255,255,255,0.08);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e8ea0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
      </div>
      <div class="gemini-main" style="background:#171717;${isRTL ? 'border-right' : 'border-left'}:1px solid rgba(255,255,255,0.1);">
        <div class="gemini-topbar" style="padding:0 20px;justify-content:flex-start;gap:6px;">
          <span style="font-size:15px;font-weight:600;color:#ececec;">ChatGPT</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e8ea0" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="chat-scroll">
          <div class="msg-user" style="background:#2f2f2f;">
            ${localeData.devChat1}
            <span class="msg-user-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
          </div>
          <div class="msg-ai" style="margin-top:4px;">
            <div class="msg-ai-body" style="padding-left:0;">${localeData.aiReply}</div>
          </div>
        </div>
        <!-- Input field: single line, centred, ~70% width -->
        <div style="margin:0 auto 14px;width:70%;background:#2f2f2f;border-radius:28px;padding:12px 14px 12px 16px;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span style="flex:1;font-size:13px;color:#6b6b6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${localeData.chatInputPlaceholder}</span>
          <!-- hollow mic (outline, no fill) -->
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-right:3px;"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
          <!-- voice mode icon: soundbars equalizer in dark rounded button -->
          <svg width="22" height="22" viewBox="0 0 22 22" style="flex-shrink:0;">
            <rect width="22" height="22" rx="6" fill="#343434"/>
            <rect x="4"   y="9.5" width="2.2" height="3"   rx="1.1" fill="white"/>
            <rect x="7.8" y="6.5" width="2.2" height="9"   rx="1.1" fill="white"/>
            <rect x="11.6" y="8"  width="2.2" height="6"   rx="1.1" fill="white"/>
            <rect x="15.4" y="10" width="2.2" height="2"   rx="1"   fill="white"/>
          </svg>
        </div>
      </div>
      <div class="gemini-dim"></div>
    </div>` : `
    <!-- Gemini page (Gemini Folders) -->
    <div class="gemini-page">
      <div class="gemini-sidebar">
        <div class="sb-top">
          <div class="sb-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></div>
          <div style="flex:1;"></div>
          <div class="sb-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        </div>
        <div class="sb-nav-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>${localeData.geminiNewChat}</div>
        <div class="sb-nav-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${localeData.geminiMyContent}</div>
        <div class="sb-nav-item" style="justify-content:space-between;"><span>Gems</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="2"><polyline points="${isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}"/></svg></div>
        <div class="sb-nav-item" style="padding-left:24px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9L6 4h12l3 5-9 13Z"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M20 2l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4Z" fill="#c4c7c5" stroke="none"/></svg>Gem 1</div>
        <div class="sb-nav-item" style="padding-left:24px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9L6 4h12l3 5-9 13Z"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M20 2l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4Z" fill="#c4c7c5" stroke="none"/></svg>Gem 2</div>
        <div class="sb-section">${localeData.geminiDiscussions}</div>
        ${sidebarConvos.map((c, i) => `<div class="sb-convo${i === 0 ? ' active' : ''}">${c}</div>`).join('')}
        <div class="sb-bottom"><svg width="18" height="18" viewBox="0 0 24 24"><path fill-rule="evenodd" fill="#c4c7c5" d="M10.51,2.61 L13.49,2.61 L13.09,5.09 L16.11,6.34 L17.58,4.31 L19.69,6.42 L17.66,7.89 L18.91,10.91 L21.39,10.51 L21.39,13.49 L18.91,13.09 L17.66,16.11 L19.69,17.58 L17.58,19.69 L16.11,17.66 L13.09,18.91 L13.49,21.39 L10.51,21.39 L10.91,18.91 L7.89,17.66 L6.42,19.69 L4.31,17.58 L6.34,16.11 L5.09,13.09 L2.61,13.49 L2.61,10.51 L5.09,10.91 L6.34,7.89 L4.31,6.42 L6.42,4.31 L7.89,6.34 L10.91,5.09 Z M14.5,12 A2.5,2.5 0 1 1 9.5,12 A2.5,2.5 0 1 1 14.5,12 Z"/></svg><span style="font-size:13px;">${localeData.geminiSettings}</span></div>
      </div>
      <div class="gemini-main">
        <div class="gemini-topbar">
          <span style="font-size:18px;font-weight:500;color:#e8eaed;margin-left:20px;margin-right:24px;white-space:nowrap;flex-shrink:0;">Gemini</span>
          <div class="gemini-topbar-title">${sidebarConvos[0]}</div>
          <div class="topbar-icon" style="margin-right:16px;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="2"><circle cx="12" cy="5" r="1" fill="#c4c7c5"/><circle cx="12" cy="12" r="1" fill="#c4c7c5"/><circle cx="12" cy="19" r="1" fill="#c4c7c5"/></svg></div>
        </div>
        <div class="chat-scroll">
          <div class="msg-user">${localeData.devChat1}<span class="msg-user-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span></div>
          <div class="msg-ai">
            <div class="msg-ai-thinking"><span style="color:#4285f4;font-size:20px;line-height:1;">✦</span><span>${localeData.geminiShowReasoning}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>
            <div class="msg-ai-body">${localeData.geminiAiReply}</div>
          </div>
        </div>
        <div class="gemini-input">
          <div class="input-row1"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6Z"/><polyline points="9 12 11 14 15 10"/></svg><span class="input-placeholder">${localeData.geminiInputPlaceholder}</span></div>
          <div class="input-row2">
            <div class="input-left-tools"><span class="input-btn" style="padding:${isRTL ? '0 0 0 6px' : '0 6px 0 0'};"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span><span class="input-btn" style="display:flex;align-items:center;gap:5px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.5" fill="#303134" stroke="#c4c7c5" stroke-width="1.5"/><circle cx="15" cy="17" r="2.5" fill="#303134" stroke="#c4c7c5" stroke-width="1.5"/></svg>${localeData.geminiTools}</span></div>
            <div class="input-right-tools"><span class="input-btn" style="display:flex;align-items:center;gap:3px;">Pro<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c4c7c5" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span><span class="input-btn" style="padding:4px 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3" fill="#9aa0a6" stroke="none"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg></span></div>
          </div>
        </div>
      </div>
      <div class="gemini-dim"></div>
    </div>`}
  </div>

  <!-- Context menu — dark mode -->
  <div class="ctx-menu">
    <div class="ctx-item inactive"><span>${localeData.ctxBack}</span></div>
    <div class="ctx-item inactive"><span>${localeData.ctxForward}</span></div>
    <div class="ctx-sep"></div>
    <div class="ctx-item"><span>${localeData.ctxSavePage}</span></div>
    <div class="ctx-item"><span>${localeData.ctxPrint}</span></div>
    <div class="ctx-sep"></div>
    <div class="ctx-item active">
      <span class="ctx-label">${iconImg}<span>${localeData.ctxMenuSaveLabel}</span></span>
      <span class="ctx-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="${ctxArrowPoints}"/></svg></span>
    </div>
  </div>

  <!-- Submenu — dark mode -->
  <div class="sub-menu">
    ${subItems}
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: CANVAS_W, height: CANVAS_H });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✅ Composed: ${path.basename(outPath)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const args      = _argv;
  const modeArg   = args.includes('--mode')   ? args[args.indexOf('--mode') + 1]   : 'both';
  const localeArg = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null;

  const targetLocales = localeArg
    ? LOCALES.filter(l => l.id === localeArg)
    : LOCALES;

  if (targetLocales.length === 0) {
    console.error(`Unknown locale: ${localeArg}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n${EXTENSION} Screenshot Generator`);
  console.log(`Mode: ${modeArg}  |  Output → ${OUT_DIR}\n`);

  // Headless browser for composition (no extension needed)
  const composeBrowser = (modeArg === 'both') ? await chromium.launch({ headless: true }) : null;
  const composePage    = composeBrowser ? await composeBrowser.newPage() : null;

  for (const locale of targetLocales) {
    console.log(`🌐 ${locale.id} (${locale.chrome})`);
    const localeData = SAMPLE_DATA[locale.id] || SAMPLE_DATA['en'];
    const tmpDir = makeTmpDir();

    const context = await chromium.launchPersistentContext(tmpDir, {
      headless: false,
      args: [
        `--lang=${locale.chrome}`,
        `--load-extension=${EXT_PATH}`,
        `--disable-extensions-except=${EXT_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
      ],
      viewport: { width: POPUP_WIDTH, height: 700 },
      colorScheme: 'dark',
    });

    try {
      const extId = await getExtensionId(context);
      const page  = await context.newPage();
      page.setViewportSize({ width: POPUP_WIDTH, height: 700 });

      if (modeArg === 'raw') {
        // Raw mode: save named final PNGs directly, no composition
        const folderPath = path.join(OUT_DIR, `PromoFolder_${locale.id}.png`);
        const promptPath = path.join(OUT_DIR, `PromoPrompt_${locale.id}.png`);
        await screenshotFolderMode(page, extId, localeData, folderPath);
        await screenshotPromptMode(page, extId, localeData, promptPath);

      } else {
        // Composed mode: take raw intermediates, compose, delete intermediates
        const folderPath = path.join(OUT_DIR, `_raw_folder_${locale.id}.png`);
        const promptPath = path.join(OUT_DIR, `_raw_prompt_${locale.id}.png`);

        if (modeArg === 'both' || modeArg === 'folder') {
          await screenshotFolderMode(page, extId, localeData, folderPath);
        }
        if (modeArg === 'both' || modeArg === 'prompt') {
          await screenshotPromptMode(page, extId, localeData, promptPath);
        }
        if (modeArg === 'both' && fs.existsSync(folderPath) && fs.existsSync(promptPath)) {
          // Image 1: side-by-side overview
          await compositeScreenshot(composePage, folderPath, promptPath, localeData,
            path.join(OUT_DIR, `Promo_1_${locale.id}.png`), locale.id);
          // Image 2: folder mode close-up
          await compositeSingleScreenshot(composePage, folderPath, localeData.folderScreenTitle,
            path.join(OUT_DIR, `Promo_2_${locale.id}.png`));
          // Image 3: prompt mode close-up
          await compositeSingleScreenshot(composePage, promptPath, localeData.promptScreenTitle,
            path.join(OUT_DIR, `Promo_3_${locale.id}.png`));
          // Image 4: mobile sync — separate screenshot with sync checkbox checked
          const mobileSyncPath = path.join(OUT_DIR, `_raw_mobile_sync_${locale.id}.png`);
          const checkboxBox = await screenshotMobileSyncFolder(page, extId, localeData, mobileSyncPath);
          const isRTL = RTL_LOCALES.has(locale.id);
          await compositeMobileSync(composePage, mobileSyncPath, checkboxBox, localeData, isRTL,
            path.join(OUT_DIR, `Promo_4_${locale.id}.png`));
          try { fs.unlinkSync(mobileSyncPath); } catch (_) {}
          // Image 5: context menu
          await compositeContextMenu(composePage, localeData, isRTL,
            path.join(OUT_DIR, `Promo_5_${locale.id}.png`));
          try { fs.unlinkSync(folderPath); } catch (_) {}
          try { fs.unlinkSync(promptPath); } catch (_) {}
        }
      }

    } catch (err) {
      console.error(`  ❌ Error for ${locale.id}: ${err.message}`);
    } finally {
      await context.close();
      cleanTmpDir(tmpDir);
    }
  }

  if (composeBrowser) await composeBrowser.close();
  console.log('\nDone.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
