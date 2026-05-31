/* ============================================================
   AI Folders — promo site application
   ============================================================ */
(function () {
  const M = window.AF_MANUAL, D = window.AF_I18N, NAMES = window.AF_LANGS,
        RTL = window.AF_RTL, SFONT = window.AF_SCRIPT_FONT, LOGOS = window.AF_LOGOS;

  const LANG_ORDER = ["en","fr","es","de","it","pt_BR","pt_PT","nl","pl","ru","uk",
    "cs","sk","sl","hr","sr","bg","ro","hu","el","tr","sv","da","nb","fi","et","lv","lt","ca",
    "ar","he","ja","ko","zh_CN","zh_TW","hi","bn","th","vi","id","ms","tl","sw"];

  const LINKS = {
    chrome: "https://chromewebstore.google.com/detail/ai-folders/kjmgfajofolnfeaahchpmkpecfimcppf",
    firefox: "https://addons.mozilla.org/firefox/addon/ai_folders/",
    gemChrome: "https://chromewebstore.google.com/detail/gemini-folders/jffchdehoapigpmifkmleglfimjiilik",
    gemFirefox: "https://addons.mozilla.org/firefox/addon/gemini_folders/",
    github: "https://github.com/dlamarre-dev/AI-Gemini-Folders"
  };

  // service registry — `logo` is the real brand SVG; `local` uses the localized label
  const SERVICES = [
    { n: "ChatGPT", logo: "ChatGPT" }, { n: "Claude", logo: "Claude" },
    { n: "Gemini", logo: "Gemini" }, { n: "Copilot", logo: "Copilot" },
    { n: "DeepSeek", logo: "DeepSeek" }, { n: "Perplexity", logo: "Perplexity" }
  ];
  const LOCAL_SVC = { logo: "Local", local: true };

  // feature key -> emoji glyph
  const GLYPH = {
    quickSave:"⚡", tabGroups:"📑", mobileSync:"📱", multiSelect:"☑️", dragDrop:"🖱️",
    customEmojis:"😃", smartDetection:"🤖", cloudSync:"☁️", compression:"🗜️",
    storageTracker:"📊", customSorting:"⇅", customFolders:"📁",
    promptLibrary:"📝", oneClickInject:"▶", inlineEdit:"✏️", pinnedPrompts:"📌", promptTrigger:"⌨️"
  };
  const FEATURE_CARDS = ["quickSave","tabGroups","mobileSync","multiSelect","dragDrop","customEmojis","smartDetection","cloudSync","compression"];
  const PROMPT_FEATURES = ["promptLibrary","oneClickInject","inlineEdit","pinnedPrompts"];

  const FOLDER_SVG = `<svg viewBox="-12 -10 152 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="afg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#10a37f"/><stop offset="0.2" stop-color="#20b2aa"/>
        <stop offset="0.42" stop-color="#3b86d9"/><stop offset="0.62" stop-color="#8a6df0"/>
        <stop offset="0.82" stop-color="#d97757"/><stop offset="1" stop-color="#c9ccd1"/>
      </linearGradient>
      <filter id="afds" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.4"/><feOffset dx="0" dy="2"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.22"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#afds)"><path d="M 8 38 Q 8 28 18 28 H 48 Q 52 28 54 31 L 60 39 H 110 Q 120 39 120 49 V 110 Q 120 120 110 120 H 18 Q 8 120 8 110 Z" fill="url(#afg)"/></g>
  </svg>`;

  const CHROME_IC = LOGOS.chrome;
  const FOX_IC = LOGOS.firefox;
  const GH_IC = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-2c-2.9.6-3.5-1.3-3.5-1.3-.5-1.2-1.2-1.5-1.2-1.5-.9-.6 0-.6 0-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.3-.3-4.7-1.2-4.7-5.1 0-1.1.4-2 1-2.7-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.7 5.1.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5Z"/></svg>`;

  // service name (localized for Local LLM) + its real logo wrapped in a chip box
  function svcName(lang, s) { return s.local ? man(lang, "localLLM") : s.n; }
  function svcLogo(s) { return `<span class="svc-logo">${LOGOS.services[s.logo]}</span>`; }
  // feature descriptions where "Chrome" should read as the generic localized "browser"
  const BROWSERIZE = { tabGroups: 1, mobileSync: 1, compression: 1 };
  function ft(lang, key) { const f = dpath(lang, "feat." + key); return (f && f.t) || key; }
  function fd(lang, key) {
    if (key === "compression") return man(lang, "compressionBody");
    const f = dpath(lang, "feat." + key); let d = (f && f.d) || "";
    if (BROWSERIZE[key]) d = d.replace(/Chrome/g, man(lang, "browser"));
    return d;
  }

  // ---- lookups ----
  function man(lang, key) { return (M[lang] && M[lang][key]) || M.en[key] || ""; }
  function dpath(lang, path) {
    const parts = path.split(".");
    let cur = D[lang];
    for (const p of parts) { if (cur == null) break; cur = cur[p]; }
    if (cur == null || cur === "") {
      cur = D.en;
      for (const p of parts) { if (cur == null) break; cur = cur[p]; }
    }
    return cur == null ? "" : cur;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  // localized product name ("AI Folders" / "Dossiers IA" / "KI-Ordner" / …)
  function appName(lang) { return dpath(lang, "ui.extName") || "AI Folders"; }

  // --- Serbian: render in Latin script (Gaj's Latin) ---
  // The repo ships Serbian in Cyrillic; transliterate once at load so the whole
  // site (data + manual strings + language name) shows Latin characters.
  function cyrToLat(str) {
    if (!str || !/[\u0400-\u04FF]/.test(str)) return str;
    const digraphs = { "Љ":["Lj","LJ"], "Њ":["Nj","NJ"], "Џ":["Dž","DŽ"], "љ":["lj"], "њ":["nj"], "џ":["dž"] };
    const map = { "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Ђ":"Đ","Е":"E","Ж":"Ž","З":"Z","И":"I","Ј":"J","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","Ћ":"Ć","У":"U","Ф":"F","Х":"H","Ц":"C","Ч":"Č","Ш":"Š",
      "а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"đ","е":"e","ж":"ž","з":"z","и":"i","ј":"j","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","ћ":"ć","у":"u","ф":"f","х":"h","ц":"c","ч":"č","ш":"š" };
    const chars = Array.from(str);
    let out = "";
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (digraphs[c]) {
        const d = digraphs[c];
        if (d.length === 2) { // uppercase digraph: all-caps if next char is uppercase Cyrillic
          const next = chars[i + 1] || "";
          out += /[А-ШA-Z\u0400-\u04FF]/.test(next) && next === next.toUpperCase() && /[\u0400-\u04FF]/.test(next) ? d[1] : d[0];
        } else out += d[0];
      } else if (map[c] != null) out += map[c];
      else out += c;
    }
    return out;
  }
  function translitDeep(obj) {
    if (typeof obj === "string") return cyrToLat(obj);
    if (Array.isArray(obj)) return obj.map(translitDeep);
    if (obj && typeof obj === "object") { for (const k in obj) obj[k] = translitDeep(obj[k]); return obj; }
    return obj;
  }
  // apply to every Serbian source
  if (D.sr) translitDeep(D.sr);
  if (M.sr) translitDeep(M.sr);
  if (NAMES.sr) NAMES.sr = cyrToLat(NAMES.sr);
  // localized product screenshot (folder-mode / prompt-mode / mobile-sync)
  // every one of the 43 languages has its own captured screenshot in shots/
  function shot(lang, name) { return `site/assets/shots/${name}_${lang}.png`; }

  // ---- builders ----
  function heroChips(lang) {
    const items = [
      { s: SERVICES[0], p: { top: "2%", left: "4%" } },     // ChatGPT
      { s: SERVICES[1], p: { top: "15%", right: "-3%" } },  // Claude
      { s: SERVICES[2], p: { bottom: "22%", left: "-6%" } },// Gemini
      { s: SERVICES[3], p: { top: "40%", right: "-6%" } },  // Copilot
      { s: SERVICES[4], p: { bottom: "2%", right: "4%" } },  // DeepSeek
      { s: SERVICES[5], p: { top: "-2%", right: "26%" } },  // Perplexity
      { s: LOCAL_SVC,   p: { bottom: "6%", left: "6%" } }    // Local LLM
    ];
    return items.map(({ s, p }) => {
      const style = Object.entries(p).map(([k, v]) => `${k}:${v}`).join(";");
      return `<div class="hero-chip" style="${style}">${svcLogo(s)}${esc(svcName(lang, s))}</div>`;
    }).join("");
  }

  // services strip; includeLocal adds the Local LLM pill
  function servicesStrip(lang, includeLocal) {
    const list = includeLocal ? SERVICES.concat([LOCAL_SVC]) : SERVICES;
    return list.map(s =>
      `<div class="svc-pill">${svcLogo(s)}${esc(svcName(lang, s))}</div>`).join("");
  }

  function featureCard(lang, key, d) {
    return `<div class="feat reveal ${d}"><div class="ficon">${GLYPH[key] || "•"}</div>
      <h3>${esc(ft(lang, key))}</h3><p>${esc(fd(lang, key))}</p></div>`;
  }

  function panelHTML(lang) {
    const u = (D[lang] && D[lang].ui) || {};
    const ue = k => esc(dpath(lang, "ui." + k));
    return `<div class="afp" dir="${RTL.includes(lang) ? "rtl" : "ltr"}">
      <div class="afp-head">
        <div class="afp-title"><span class="mk">${FOLDER_SVG}</span>${esc(appName(lang))}</div>
        <div class="afp-toggle"><span class="on">📁</span><span>📝</span></div>
      </div>
      <div class="afp-search">🔍 ${ue("searchPlaceholderClean") || "Search a conversation..."}</div>
      <div class="afp-add">＋ ${ue("btnToggleAdd") || "Add a conversation"}</div>
      <div class="afp-folder">
        <div class="afp-fhead">💻 Dev <span class="icns">📌 ✎ 🗑</span></div>
        <div class="afp-chat"><span class="cb"></span>Refactor Node.js API</div>
        <div class="afp-chat"><span class="cb"></span>Debug React hook</div>
      </div>
      <div class="afp-folder">
        <div class="afp-fhead">🔬 ${ue("defaultFolder") || "Research"} <span class="icns">📌 ✎ 🗑</span></div>
        <div class="afp-chat"><span class="cb"></span>Market analysis 2025</div>
      </div>
      <div class="afp-foot">
        <span class="pill">📱</span>
        <span class="pill">${ue("exportBtn") || "💾 Export"}</span>
        <span class="pill">${ue("importBtn") || "📂 Import"}</span>
      </div>
    </div>`;
  }

  function triggerHTML(lang) {
    const name = man(lang, "demoName"), body = man(lang, "demoBody");
    return `<div class="trigger-demo" dir="${RTL.includes(lang) ? "rtl" : "ltr"}" data-name="${esc(name)}" data-body="${esc(body)}">
      <div class="trigger-pop" id="trigPop"><div class="lbl">${esc(appName(lang))}</div>
        <div class="trigger-opt sel"><span class="pi">📝</span>${esc(name)}</div>
      </div>
      <div class="trigger-bar"><div class="trigger-input"><span id="trigType"></span><span class="cursor" id="trigCursor"></span></div></div>
    </div>`;
  }

  function build(lang) {
    const langCloud = LANG_ORDER.map(l =>
      `<span class="${l === lang ? "cur" : ""}" data-setlang="${l}">${esc(NAMES[l])}</span>`).join("");

    const privacyBody = dpath(lang, "body.privacyBody");
    const localBody = dpath(lang, "body.localBody");
    const material = dpath(lang, "feat.material3");

    return `
    <div class="container">
      <div class="hero-lang-row">
        <div class="lang" id="langWrap">
          <button class="lang-btn" id="langBtn" aria-haspopup="true" aria-expanded="false">
            <span class="globe">🌐</span><span id="langLabel">${esc(NAMES[lang])}</span><span class="chev">▾</span>
          </button>
          <div class="lang-menu" id="langMenu" role="menu"></div>
        </div>
      </div>
    </div>

    <!-- HERO -->
    <section class="hero" data-screen-label="Hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <div class="hero-badge reveal"><span class="dot"></span>43 ${esc(man(lang,"languages"))} · RTL</div>
          <h1 class="reveal d1"><span class="grad-text">${esc(man(lang,"heroTitle"))}</span></h1>
          <p class="hero-sub reveal d2">${esc(dpath(lang,"ui.extDesc"))}</p>
          <div class="hero-cta reveal d3">
            <a class="btn btn-lg btn-primary" href="${LINKS.chrome}" target="_blank" rel="noopener"><span class="ic">${CHROME_IC}</span>${esc(man(lang,"ctaChrome"))}</a>
            <a class="btn btn-lg btn-ghost" href="${LINKS.firefox}" target="_blank" rel="noopener"><span class="ic">${FOX_IC}</span>${esc(man(lang,"ctaFirefox"))}</a>
          </div>
          <div class="hero-trust reveal d4">
            <span>${esc(man(lang,"free"))}</span>
            <span class="sep"></span><span>${esc(man(lang,"openSource"))}</span>
            <span class="sep"></span><span>${esc(man(lang,"priv"))}</span>
          </div>
        </div>
        <div class="hero-art reveal d2">
          <div class="glow"></div>
          <div class="folder">${FOLDER_SVG}</div>
          <div class="hero-orbit">${heroChips(lang)}</div>
        </div>
      </div>
    </section>

    <!-- SCREENSHOT GALLERY + SERVICES -->
    <section data-screen-label="Overview">
      <div class="container">
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center">
          <span class="eyebrow reveal">${esc(man(lang,"supportedAI"))}</span>
          <h2 class="h2 reveal d1" style="margin-inline:auto">${esc(man(lang,"servicesTitle"))}</h2>
          <p class="sec-lead reveal d2" style="margin-inline:auto;text-align:center">${esc(man(lang,"servicesBody"))}</p>
        </div>
        <div class="svc-strip reveal d2" style="margin-top:34px">${servicesStrip(lang, true)}</div>
        <div class="shots">
          <div class="shot reveal d1"><div class="shot-glow"></div><img src="${shot(lang,"folder-mode")}" alt="Folder mode" loading="lazy" width="1280" height="800"><span class="cap">${esc(dpath(lang,"ui.folderModeTitle"))}</span></div>
          <div class="shot reveal d2"><div class="shot-glow"></div><img src="${shot(lang,"prompt-mode")}" alt="Prompt mode" loading="lazy" width="1280" height="800"><span class="cap">${esc(dpath(lang,"ui.promptModeTitle"))}</span></div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section data-screen-label="Features">
      <div class="container">
        <span class="eyebrow reveal">${esc(dpath(lang,"sec.secFolder"))}</span>
        <h2 class="h2 reveal d1">${esc(headingFeatures(lang))}</h2>
        <div class="feat-grid">
          ${FEATURE_CARDS.map((k, i) => featureCard(lang, k, "d" + ((i % 3) + 1))).join("")}
        </div>
      </div>
    </section>

    <!-- PROMPT LIBRARY (split) -->
    <section data-screen-label="Prompts">
      <div class="container split">
        <div class="split-copy">
          <span class="eyebrow reveal">${esc(dpath(lang,"sec.secPrompt"))}</span>
          <h2 class="h2 reveal d1">${esc(dpath(lang,"feat.promptLibrary.t"))}</h2>
          <p class="sec-lead reveal d2">${esc(dpath(lang,"feat.oneClickInject.d"))}</p>
          <ul class="mini-list">
            ${PROMPT_FEATURES.map((k, i) => {
              const f = dpath(lang, "feat." + k);
              return `<li class="reveal d${i + 1}"><span class="b">${GLYPH[k]}</span><span><b>${esc(f.t)}</b> — ${esc(f.d)}</span></li>`;
            }).join("")}
          </ul>
        </div>
        <div class="split-media reveal d2">
          <div class="mglow"></div>
          <img src="${shot(lang,"prompt-mode")}" alt="Prompt mode" loading="lazy" width="1280" height="800">
        </div>
      </div>
      <div class="container" style="margin-top:18px">
        <div class="split">
          <div class="split-copy">
            <span class="eyebrow reveal">${esc(dpath(lang,"feat.promptTrigger.t"))}</span>
            <p class="sec-lead reveal d1">${esc(dpath(lang,"feat.promptTrigger.d"))}</p>
            ${triggerHTML(lang)}
          </div>
          <div class="split-copy">
            <span class="eyebrow reveal">${esc(dpath(lang,"feat.newConvButtons.t"))}</span>
            <p class="sec-lead reveal d1">${esc(dpath(lang,"feat.newConvButtons.d"))}</p>
            <div class="svc-strip reveal d2" style="justify-content:flex-start;margin-top:22px">${servicesStrip(lang, true)}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- MOBILE SYNC (split reversed) -->
    <section data-screen-label="Mobile sync">
      <div class="container split rev">
        <div class="split-copy">
          <span class="eyebrow reveal">${esc(dpath(lang,"feat.mobileSync.t"))}</span>
          <h2 class="h2 reveal d1">${esc(dpath(lang,"feat.mobileSync.t"))}</h2>
          <p class="sec-lead reveal d2">${esc(fd(lang,"mobileSync"))}</p>
          <ul class="mini-list">
            <li class="reveal d2"><span class="b">${GLYPH.cloudSync}</span><span><b>${esc(ft(lang,"cloudSync"))}</b> — ${esc(fd(lang,"cloudSync"))}</span></li>
          </ul>
        </div>
        <div class="split-media reveal d1">
          <div class="mglow"></div>
          <img src="${shot(lang,"mobile-sync")}" alt="Mobile sync" loading="lazy" width="1280" height="800">
        </div>
      </div>
    </section>

    <!-- LANGUAGES + live panel -->
    <section data-screen-label="Languages">
      <div class="container lang-hero">
        <div>
          <span class="eyebrow reveal">${esc(man(lang,"languages"))}</span>
          <div class="big-num reveal d1">43</div>
          <h2 class="h2 reveal d1" style="margin-top:10px">${esc(man(lang,"languages"))}</h2>
          <p class="sec-lead reveal d2">${esc(material && material.d ? material.d : dpath(lang,"feat.material3.d"))}</p>
        </div>
        <div class="lang-cloud reveal d2">${langCloud}</div>
      </div>
    </section>

    <!-- PRIVACY / OSS -->
    <section class="privacy" data-screen-label="Privacy">
      <div class="container privacy-grid">
        <div>
          <span class="eyebrow reveal">${esc(dpath(lang,"sec.secPrivacy"))}</span>
          <h2 class="h2 reveal d1">${esc(man(lang,"priv"))}</h2>
          <p class="sec-lead reveal d2">${esc(privacyBody)}</p>
          <ul class="priv-points">
            <li class="reveal d2"><span class="pc">🔒</span><span>${esc(localBody)}</span></li>
          </ul>
        </div>
        <div class="oss-card reveal d1">
          <div class="gh">${GH_IC}</div>
          <h3>${esc(dpath(lang,"sec.secOSS"))}</h3>
          <p>${esc(stripUrl(dpath(lang,"body.ossBody")))}</p>
          <a class="btn btn-md btn-ghost" href="${LINKS.github}" target="_blank" rel="noopener"><span class="ic">${GH_IC}</span>GitHub</a>
        </div>
      </div>
    </section>

    <!-- GEMINI FOLDERS (also available) -->
    <section class="gemini" data-screen-label="Gemini Folders">
      <div class="container">
        <span class="eyebrow reveal" style="display:block;text-align:center;margin-bottom:24px">${esc(man(lang,"alsoAvailable"))}</span>
        <div class="gemini-card reveal d1">
          <span class="gmark">${LOGOS.geminiFolders}</span>
          <div class="gbody">
            <div style="font-family:var(--font-mono);font-size:12px;letter-spacing:.12em;color:var(--blue);text-transform:uppercase">Gemini Folders</div>
            <h3>${esc(man(lang,"heroTitle"))}</h3>
            <p>Google Gemini · ${esc(man(lang,"free"))} · ${esc(man(lang,"openSource"))}</p>
            <div class="hero-cta">
              <a class="btn btn-md btn-primary" href="${LINKS.gemChrome}" target="_blank" rel="noopener">${esc(man(lang,"ctaChrome"))}</a>
              <a class="btn btn-md btn-ghost" href="${LINKS.gemFirefox}" target="_blank" rel="noopener">${esc(man(lang,"ctaFirefox"))}</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FINAL CTA -->
    <section class="final" data-screen-label="Get started">
      <div class="fglow"></div>
      <div class="container">
        <div class="folder reveal">${FOLDER_SVG}</div>
        <h2 class="reveal d1"><span class="grad-text">${esc(man(lang,"heroTitle"))}</span></h2>
        <div class="final-cta reveal d2">
          <a class="btn btn-lg btn-primary" href="${LINKS.chrome}" target="_blank" rel="noopener"><span class="ic">${CHROME_IC}</span>${esc(man(lang,"ctaChrome"))}</a>
          <a class="btn btn-lg btn-ghost" href="${LINKS.firefox}" target="_blank" rel="noopener"><span class="ic">${FOX_IC}</span>${esc(man(lang,"ctaFirefox"))}</a>
        </div>
        <div class="final-trust reveal d3">
          <span>${esc(man(lang,"free"))}</span><span class="sep"></span>
          <span>${esc(man(lang,"openSource"))}</span><span class="sep"></span>
          <span>${esc(man(lang,"priv"))}</span>
        </div>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="footer">
      <div class="container footer-inner">
        <div class="brand"><span class="mark">${FOLDER_SVG}</span>${esc(appName(lang))}</div>
        <div class="footer-links">
          <a href="${LINKS.chrome}" target="_blank" rel="noopener">Chrome</a>
          <a href="${LINKS.firefox}" target="_blank" rel="noopener">Firefox</a>
          <a href="${LINKS.github}" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
    </footer>`;
  }

  // headings that prefer real translated section titles, fallback to short manual phrasing
  function headingServices(lang) {
    const s = dpath(lang, "sec.secServices");
    return s || (man(lang, "supportedAI"));
  }
  function headingFeatures(lang) {
    return dpath(lang, "sec.secFolder") || D.en.sec.secFolder;
  }
  function stripUrl(s) {
    return String(s).replace(/\s*:?\s*https?:\/\/\S+/gi, "").replace(/\s+$/, "");
  }

  // ---- render + i18n apply ----
  function revealCheck() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll(".reveal:not(.in)").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > -40) {
        el.classList.add("in");
        // safety net for environments where CSS transitions don't run
        setTimeout(() => el.classList.add("shown"), 1300);
      }
    });
  }

  // ---- prompt-trigger demo animation ----
  // timestamp-driven so it stays correct even if timers are throttled:
  // type "#"+name → hold 1s on match → show injected body 2s → loop
  let trigIv = null;
  function clearTrig() { if (trigIv) { clearInterval(trigIv); trigIv = null; } }
  function runTriggerAnim() {
    clearTrig();
    const demo = document.querySelector(".trigger-demo");
    const typeEl = document.getElementById("trigType");
    if (!demo || !typeEl) return;
    const pop = document.getElementById("trigPop");
    const cursor = document.getElementById("trigCursor");
    const full = "#" + (demo.getAttribute("data-name") || "");
    const body = demo.getAttribute("data-body") || "";
    const TYPE = 110, NAME_MS = full.length * TYPE, HOLD = 1000, INJECT = 2200;
    const TOTAL = NAME_MS + HOLD + INJECT;
    const start = (window.performance && performance.now()) || Date.now();
    const showPop = (on) => {
      if (cursor) cursor.style.display = on ? "" : "none";
    };
    function frame() {
      const now = (window.performance && performance.now()) || Date.now();
      const e = (now - start) % TOTAL;
      if (e < NAME_MS) {
        const n = Math.min(full.length, Math.floor(e / TYPE) + 1);
        typeEl.classList.remove("injected"); typeEl.textContent = full.slice(0, n); showPop(true);
      } else if (e < NAME_MS + HOLD) {
        typeEl.classList.remove("injected"); typeEl.textContent = full; showPop(true);
      } else {
        typeEl.classList.add("injected"); typeEl.textContent = body; showPop(false);
      }
    }
    frame();
    trigIv = setInterval(frame, 110);
  }

  function applyLangMeta(lang) {
    const html = document.documentElement;
    html.setAttribute("lang", lang.replace("_", "-"));
    html.setAttribute("dir", RTL.includes(lang) ? "rtl" : "ltr");
    const sf = SFONT[lang] || "'Schibsted Grotesk'";
    document.body.style.setProperty("--font-script", sf);
  }

  function getScrollAnchor() {
    const navH = (document.getElementById("nav") || {}).offsetHeight || 68;
    const viewTop = window.scrollY + navH;
    let best = null;
    document.querySelectorAll("section[data-screen-label]").forEach(s => {
      if (s.offsetTop <= viewTop) best = { label: s.getAttribute("data-screen-label"), offset: viewTop - s.offsetTop };
    });
    return best;
  }
  function restoreScrollAnchor(anchor) {
    if (!anchor) { window.scrollTo(0, 0); return; }
    const navH = (document.getElementById("nav") || {}).offsetHeight || 68;
    const target = document.querySelector(`section[data-screen-label="${anchor.label}"]`);
    if (target) window.scrollTo(0, target.offsetTop + anchor.offset - navH);
  }

  function render(lang, animate) {
    const anchor = animate ? null : getScrollAnchor();
    applyLangMeta(lang);
    document.getElementById("app").innerHTML = build(lang);
    if (!animate) restoreScrollAnchor(anchor);
    buildMenu();
    document.getElementById("langBtn").addEventListener("click", toggleMenu);
    // nav bits — real logos + localized labels
    const chromeBtn = document.getElementById("navCtaLink");
    if (chromeBtn) chromeBtn.innerHTML = `<span class="ic">${LOGOS.chrome}</span>${esc(man(lang, "ctaChrome"))}`;
    const foxBtn = document.getElementById("navCtaFoxLink");
    if (foxBtn) foxBtn.innerHTML = `<span class="ic">${LOGOS.firefox}</span>${esc(man(lang, "ctaFirefox"))}`;
    document.getElementById("langLabel").textContent = NAMES[lang];
    const brand = document.getElementById("brandName");
    if (brand) brand.textContent = appName(lang);
    // localized document title
    document.title = appName(lang) + " — " + man(lang, "heroTitle");
    updateMenuActive(lang);
    // reveal
    if (animate) { requestAnimationFrame(revealCheck); }
    else { document.querySelectorAll(".reveal").forEach(el => el.classList.add("in")); }
    // dynamic lang-cloud clicks
    document.querySelectorAll("[data-setlang]").forEach(el =>
      el.addEventListener("click", () => setLang(el.getAttribute("data-setlang"), false)));
    runTriggerAnim();
  }

  let current = "en";
  function setLang(lang, animate) {
    if (!NAMES[lang]) lang = "en";
    current = lang;
    try { localStorage.setItem("af_lang", lang); } catch (e) {}
    render(lang, !!animate);
    closeMenu();
  }

  // ---- nav language menu ----
  function buildMenu() {
    const menu = document.getElementById("langMenu");
    menu.innerHTML = LANG_ORDER.map(l =>
      `<button class="lang-opt" data-lang="${l}"><span>${esc(NAMES[l])}</span><span class="code">${l.replace("_","-")}</span></button>`).join("");
    menu.querySelectorAll(".lang-opt").forEach(b =>
      b.addEventListener("click", () => setLang(b.getAttribute("data-lang"), false)));
  }
  function updateMenuActive(lang) {
    document.querySelectorAll("#langMenu .lang-opt").forEach(b =>
      b.classList.toggle("active", b.getAttribute("data-lang") === lang));
  }
  function openMenu() { document.getElementById("langWrap").classList.add("open"); }
  function closeMenu() { document.getElementById("langWrap").classList.remove("open"); }
  function toggleMenu(e) { e.stopPropagation(); document.getElementById("langWrap").classList.toggle("open"); }

  // ---- init ----
  function makeStars() {
    const c = document.getElementById("stars"); if (!c) return;
    let s = 7, html = "";
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 70; i++) {
      const t = rnd() * 100, l = rnd() * 100, z = rnd() * 1.8 + 0.5, o = rnd() * 0.5 + 0.12;
      html += `<span style="top:${t}%;left:${l}%;width:${z}px;height:${z}px;opacity:${o}"></span>`;
    }
    c.innerHTML = html;
  }

  function init() {
    makeStars();
    document.addEventListener("click", (e) => {
      const wrap = document.getElementById("langWrap");
      if (wrap && !wrap.contains(e.target)) closeMenu();
    });
    // nav scroll state
    const nav = document.getElementById("nav");
    const onScroll = () => { nav.classList.toggle("scrolled", window.scrollY > 12); revealCheck(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", revealCheck, { passive: true });
    onScroll();

    let saved = "en";
    try { saved = localStorage.getItem("af_lang") || guess(); } catch (e) {}
    setLang(saved, true);
  }
  function guess() {
    const n = (navigator.language || "en").toLowerCase();
    const map = { "pt-br":"pt_BR","pt":"pt_PT","zh-cn":"zh_CN","zh":"zh_CN","zh-tw":"zh_TW","nb":"nb","no":"nb" };
    if (map[n]) return map[n];
    const base = n.split("-")[0];
    return NAMES[base] ? base : "en";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
