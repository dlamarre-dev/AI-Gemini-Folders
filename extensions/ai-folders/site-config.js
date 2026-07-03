// site-config.js — AI Folders site registry
// Provides:
//   SITES              — metadata for all supported sites (16 web platforms + local)
//   getSiteByUrl(url)  — returns site key or null
//   getChatSiteInfo    — hook for folders.js (window global)
//   extractAITitleLogic — injected into page via executeScript

const SITES = {
  gemini: {
    key: 'gemini',
    domain: 'gemini.google.com',
    color: '#1a73e8',
    newConvUrl: 'https://gemini.google.com/app',
    // Gemini uses a Quill editor inside a custom element
    editorSelectors: ['rich-textarea .ql-editor', '[contenteditable="true"].ql-editor'],
    // Official Gemini SVG shape, solid fill. The official radial-gradient fill
    // was tried (2026-07) and stays invisible in the extension popup even when
    // injected via document.importNode — don't retry gradient fills here.
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M16 8.016A8.522 8.522 0 008.016 16h-.032A8.521 8.521 0 000 8.016v-.032A8.521 8.521 0 007.984 0h.032A8.522 8.522 0 0016 7.984v.032z" fill="#4285F4"/></svg>`,
  },
  claude: {
    key: 'claude',
    domain: 'claude.ai',
    color: '#D97757',
    newConvUrl: 'https://claude.ai/new',
    // Claude uses ProseMirror (confirmed via multiple extensions)
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', '.ProseMirror[contenteditable]'],
    // Official Anthropic/Claude SVG mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757"/></svg>`,
  },
  chatgpt: {
    key: 'chatgpt',
    domain: 'chatgpt.com',
    color: '#ffffff',
    newConvUrl: 'https://chatgpt.com/',
    // #prompt-textarea is a contenteditable div (confirmed 2024-2025)
    editorSelectors: ['#prompt-textarea', 'div[contenteditable="true"][data-id="root"]'],
    // Official OpenAI hexagonal logo; white fill to match ChatGPT current branding
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="white" d="M30.7,7.27L28.33,9.1c-1.605-2.067-4.068-3.209-6.697-3.092C17.313,6.2,14,9.953,14,14.277l0,9.143l10.5,6.12l-1,1.72l-11.706-6.827C11.302,24.146,11,23.62,11,23.051l0-8.687C11,8.1,16.129,2.79,22.39,3.007C25.669,3.12,28.68,4.663,30.7,7.27z"/><path fill="white" d="M12.861,9.833l0.4,2.967c-2.592,0.357-4.813,1.919-6.026,4.254c-1.994,3.837-0.4,8.582,3.345,10.745l7.918,4.571l10.55-6.033l0.99,1.726l-11.765,6.724c-0.494,0.282-1.101,0.281-1.594-0.003l-7.523-4.343C3.73,27.308,1.696,20.211,5.014,14.898C6.752,12.114,9.594,10.279,12.861,9.833z"/><path fill="white" d="M6.161,26.563l2.77,1.137c-0.987,2.423-0.745,5.128,0.671,7.346c2.326,3.645,7.233,4.638,10.977,2.476l7.918-4.572l0.05-12.153l1.99,0.006l-0.059,13.551c-0.002,0.569-0.307,1.094-0.8,1.379l-7.523,4.343c-5.425,3.132-12.588,1.345-15.531-4.185C5.083,32.994,4.914,29.616,6.161,26.563z"/><path fill="white" d="M17.3,40.73l2.37-1.83c1.605,2.067,4.068,3.209,6.697,3.092C30.687,41.8,34,38.047,34,33.723l0-9.143l-10.5-6.12l1-1.72l11.706,6.827C36.698,23.854,37,24.38,37,24.949l0,8.687c0,6.264-5.13,11.574-11.39,11.358C22.331,44.88,19.32,43.337,17.3,40.73z"/><path fill="white" d="M35.139,38.167l-0.4-2.967c2.592-0.357,4.813-1.919,6.026-4.254c1.994-3.837,0.4-8.582-3.345-10.745l-7.918-4.571l-10.55,6.033l-0.99-1.726l11.765-6.724c0.494-0.282,1.101-0.281,1.594,0.003l7.523,4.343c5.425,3.132,7.459,10.229,4.141,15.543C41.248,35.886,38.406,37.721,35.139,38.167z"/><path fill="white" d="M41.839,21.437l-2.77-1.137c0.987-2.423,0.745-5.128-0.671-7.346c-2.326-3.645-7.233-4.638-10.977-2.476l-7.918,4.572l-0.05,12.153l-1.99-0.006l0.059-13.551c0.002-0.569,0.307-1.094,0.8-1.379l7.523-4.343c5.425-3.132,12.588-1.345,15.531,4.185C42.917,15.006,43.086,18.384,41.839,21.437z"/></svg>`,
  },
  copilot: {
    key: 'copilot',
    domain: 'copilot.microsoft.com',
    color: '#0078d4',
    newConvUrl: 'https://copilot.microsoft.com/',
    // Copilot uses a textarea inside a shadow-DOM web component; selectors need live validation
    editorSelectors: ['textarea#userInput', 'cib-text-input textarea', '#searchbox', 'textarea[name="q"]', 'textarea'],
    // Official Microsoft Copilot SVG shape, solid fill. The full-color gradient
    // version was tried (2026-07) and stays invisible in the extension popup
    // even when injected via document.importNode — don't retry gradient fills here.
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.533 1.829A2.528 2.528 0 0015.11 0h-.737a2.531 2.531 0 00-2.484 2.087l-1.263 6.937.314-1.08a2.528 2.528 0 012.424-1.833h4.284l1.797.706 1.731-.706h-.505a2.528 2.528 0 01-2.423-1.829l-.715-2.453z" fill="#0078d4" transform="translate(0 1)"/><path d="M6.726 20.16A2.528 2.528 0 009.152 22h1.566c1.37 0 2.49-1.1 2.525-2.48l.17-6.69-.357 1.228a2.528 2.528 0 01-2.423 1.83h-4.32l-1.54-.842-1.667.843h.497c1.124 0 2.113.75 2.426 1.84l.697 2.432z" fill="#0078d4" transform="translate(0 1)"/><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="#0078d4" transform="translate(0 1)"/><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="#0078d4" transform="translate(0 1)"/></svg>`,
  },
  deepseek: {
    key: 'deepseek',
    domain: 'chat.deepseek.com',
    color: '#4D6BFE',
    newConvUrl: 'https://chat.deepseek.com/',
    // DeepSeek uses a textarea with a stable id="chat-input"
    editorSelectors: ['#chat-input', 'textarea[placeholder]', 'textarea'],
    // Official DeepSeek mark from simple-icons
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358a1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" fill="#4D6BFE"/></svg>`,
  },
  grok: {
    key: 'grok',
    domain: 'grok.com',
    color: '#ffffff',
    newConvUrl: 'https://grok.com/',
    // Grok has shipped both a plain textarea (aria-label "Ask Grok anything")
    // and a contenteditable composer; try specific then generic fallbacks
    editorSelectors: ['textarea[aria-label*="Grok"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official xAI Grok mark from simple-icons; white fill to match Grok branding
    // (light-theme override lives in popup-extra.css, same as ChatGPT)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.27 15.29l7.978-5.897c.391-.29.949-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.311-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" fill="#ffffff"/></svg>`,
  },
  perplexity: {
    key: 'perplexity',
    domain: 'perplexity.ai',
    color: '#22B8CD',
    newConvUrl: 'https://www.perplexity.ai/',
    // Perplexity uses a React-controlled textarea; try specific then generic, fall back to contenteditable
    editorSelectors: ['textarea.resize-none', 'textarea[rows]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official Perplexity SVG mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="#22B8CD"/></svg>`,
  },
  zai: {
    key: 'zai',
    domain: 'chat.z.ai',
    color: '#ffffff',
    newConvUrl: 'https://chat.z.ai/',
    // chat.z.ai is built on Open WebUI (#chat-input); selectors need live validation
    editorSelectors: ['#chat-input', 'textarea#chat-input', '#chat-textarea', 'textarea[placeholder]', '[contenteditable="true"]'],
    // Official Z.ai mark: dark rounded tile + white Z (self-contained on both themes)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><path fill="#2D2D2D" d="M24.51,28.51H5.49c-2.21,0-4-1.79-4-4V5.49c0-2.21,1.79-4,4-4h19.03c2.21,0,4,1.79,4,4v19.03C28.51,26.72,26.72,28.51,24.51,28.51z"/><path fill="#FFFFFF" d="M15.47,7.1l-1.3,1.85c-0.2,0.29-0.54,0.47-0.9,0.47h-7.1V7.09C6.16,7.1,15.47,7.1,15.47,7.1z"/><polygon fill="#FFFFFF" points="24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1"/><path fill="#FFFFFF" d="M14.53,22.91l1.31-1.86c0.2-0.29,0.54-0.47,0.9-0.47h7.09v2.33H14.53z"/></svg>`,
  },
  qwen: {
    key: 'qwen',
    domain: 'chat.qwen.ai',
    color: '#615CED',
    newConvUrl: 'https://chat.qwen.ai/',
    // Qwen Chat composer; selectors need live validation
    editorSelectors: ['#chat-input', 'textarea#chat-input', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official Qwen mark (radial gradient + white inner star)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none"><path d="M174.82 108.75L155.38 75L165.64 57.75C166.46 56.31 166.46 54.53 165.64 53.09L155.38 35.84C154.86 34.91 153.87 34.33 152.78 34.33H114.88L106.14 19.03C105.62 18.1 104.63 17.52 103.54 17.52H83.3C82.21 17.52 81.22 18.1 80.7 19.03L61.26 52.77H41.02C39.93 52.77 38.94 53.35 38.42 54.28L28.16 71.53C27.34 72.97 27.34 74.75 28.16 76.19L45.52 107.5L36.78 122.8C35.96 124.24 35.96 126.02 36.78 127.46L47.04 144.71C47.56 145.64 48.55 146.22 49.64 146.22H87.54L96.28 161.52C96.8 162.45 97.79 163.03 98.88 163.03H119.12C120.21 163.03 121.2 162.45 121.72 161.52L141.16 127.78H158.52C159.61 127.78 160.6 127.2 161.12 126.27L171.38 109.02C172.2 107.58 172.2 105.8 171.38 104.36L174.82 108.75Z" fill="#4C45BF"/><path d="M119.12 163.03H98.88L87.54 144.71H49.64L61.26 126.39H80.7L38.42 55.29H61.26L83.3 19.03L93.56 37.35L83.3 55.29H161.58L151.32 72.54L170.76 106.28H151.32L141.16 88.34L101.18 163.03H119.12Z" fill="white"/><path d="M127.86 79.83H76.14L101.18 122.11L127.86 79.83Z" fill="#4C45BF"/></svg>`,
  },
  meta: {
    key: 'meta',
    domain: 'meta.ai',
    color: '#0064E0',
    newConvUrl: 'https://www.meta.ai/',
    // Meta AI uses a Lexical contenteditable composer; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official Meta infinity mark (wordmark dropped, brand gradients kept)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 290 191"><path fill="#0081fb" d="m31.06,125.96c0,10.98 2.41,19.41 5.56,24.51 4.13,6.68 10.29,9.51 16.57,9.51 8.1,0 15.51-2.01 29.79-21.76 11.44-15.83 24.92-38.05 33.99-51.98l15.36-23.6c10.67-16.39 23.02-34.61 37.18-46.96 11.56-10.08 24.03-15.68 36.58-15.68 21.07,0 41.14,12.21 56.5,35.11 16.81,25.08 24.97,56.67 24.97,89.27 0,19.38-3.82,33.62-10.32,44.87-6.28,10.88-18.52,21.75-39.11,21.75l0-31.02c17.63,0 22.03-16.2 22.03-34.74 0-26.42-6.16-55.74-19.73-76.69-9.63-14.86-22.11-23.94-35.84-23.94-14.85,0-26.8,11.2-40.23,31.17-7.14,10.61-14.47,23.54-22.7,38.13l-9.06,16.05c-18.2,32.27-22.81,39.62-31.91,51.75-15.95,21.24-29.57,29.29-47.5,29.29-21.27,0-34.72-9.21-43.05-23.09-6.8-11.31-10.14-26.15-10.14-43.06z"/><path fill="#0064E1" d="m24.49,37.3c14.24-21.95 34.79-37.3 58.36-37.3 13.65,0 27.22,4.04 41.39,15.61 15.5,12.65 32.02,33.48 52.63,67.81l7.39,12.32c17.84,29.72 27.99,45.01 33.93,52.22 7.64,9.26 12.99,12.02 19.94,12.02 17.63,0 22.03-16.2 22.03-34.74l27.4-.86c0,19.38-3.82,33.62-10.32,44.87-6.28,10.88-18.52,21.75-39.11,21.75-12.8,0-24.14-2.78-36.68-14.61-9.64-9.08-20.91-25.21-29.58-39.71l-25.79-43.08c-12.94-21.62-24.81-37.74-31.68-45.04-7.39-7.85-16.89-17.33-32.05-17.33-12.27,0-22.69,8.61-31.41,21.78z"/><path fill="#0072EE" d="m82.35,31.23c-12.27,0-22.69,8.61-31.41,21.78-12.33,18.61-19.88,46.33-19.88,72.95 0,10.98 2.41,19.41 5.56,24.51l-26.48,17.44c-6.8-11.31-10.14-26.15-10.14-43.06 0-30.75 8.44-62.8 24.49-87.55 14.24-21.95 34.79-37.3 58.36-37.3z"/></svg>`,
  },
  mistral: {
    key: 'mistral',
    domain: 'chat.mistral.ai',
    color: '#FA500F',
    newConvUrl: 'https://chat.mistral.ai/chat',
    // Le Chat uses a ProseMirror composer; selectors need live validation
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', 'textarea[name="message.text"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official Mistral pixel-flag "M" (clipPaths/transforms of the source file flattened)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190.159 135.429"><path fill="#ffd800" d="M27.153 0h27.169v27.089H27.153zM135.815 0h27.169v27.089h-27.169z"/><path fill="#ffaf00" d="M27.153 27.091h54.329V54.18H27.153zM108.661 27.091h54.329V54.18h-54.329z"/><path fill="#ff8205" d="M27.153 54.168h135.819v27.089H27.153z"/><path fill="#fa500f" d="M27.153 81.259h27.169v27.09H27.153zM81.492 81.259h27.169v27.09H81.492zM135.815 81.259h27.169v27.09h-27.169z"/><path fill="#e10500" d="M-.001 108.339h81.489v27.09H-.001zM108.661 108.339h81.498v27.09h-81.498z"/></svg>`,
  },
  poe: {
    key: 'poe',
    domain: 'poe.com',
    color: '#5D5CDE',
    newConvUrl: 'https://poe.com/',
    // Poe uses hashed CSS-module classes — match by class prefix; selectors need live validation
    editorSelectors: ['textarea[class*="GrowingTextArea_textArea"]', 'footer textarea', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official Poe mark. The bubble uses currentColor so it self-adapts to the
    // light/dark theme (inherits the button/item text color); the two swooshes
    // keep their brand gradients.
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M20.708 6.876a1.412 1.412 0 00-1.029-.415h-.006a2.019 2.019 0 01-2.02-2.023A1.415 1.415 0 0016.254 3H4.871A1.412 1.412 0 003.47 4.434a2.026 2.026 0 01-2.025 2.025v.002A1.414 1.414 0 000 7.883v3.642a1.414 1.414 0 001.444 1.42 2.025 2.025 0 012.025 2.02v3.693a.5.5 0 00.89.313l2.051-2.567h9.843a1.412 1.412 0 001.4-1.434v-.002c0-1.12.904-2.025 2.026-2.025a1.412 1.412 0 001.446-1.42V7.88c0-.363-.14-.727-.417-1.005zm-2.42 4.687a2.025 2.025 0 01-2.025 2.005H4.861a2.025 2.025 0 01-2.025-2.005v-3.72A2.026 2.026 0 014.86 5.838h11.4a2.026 2.026 0 012.026 2.005v3.72h.002z"/><path d="M7.413 7.57A1.422 1.422 0 005.99 8.99v1.422a1.422 1.422 0 102.844 0V8.99c0-.784-.636-1.422-1.422-1.422zm6.297 0a1.422 1.422 0 00-1.422 1.421v1.422a1.422 1.422 0 102.844 0V8.99c0-.784-.636-1.422-1.422-1.422z"/><path d="M7.292 22.643l1.993-2.492h9.844a1.413 1.413 0 001.4-1.434 2.025 2.025 0 012.017-2.027h.01A1.409 1.409 0 0024 15.27v-3.594c0-.344-.113-.68-.324-.951l-.397-.519v4.127a1.415 1.415 0 01-1.444 1.42h-.007a2.026 2.026 0 00-2.018 2.025 1.415 1.415 0 01-1.402 1.436H8.565l-2.169 2.712a.574.574 0 00.896.715v.002z" fill="#6485FB"/><path d="M5.004 19.992l2.12-2.65h9.844a1.414 1.414 0 001.402-1.437c0-1.116.9-2.021 2.014-2.025h.012a1.413 1.413 0 001.443-1.422v-4.13l.52.68c.21.273.324.607.324.95v3.594a1.416 1.416 0 01-1.443 1.42h-.01a2.026 2.026 0 00-2.016 2.026 1.414 1.414 0 01-1.402 1.435H7.97l-1.916 2.4a.671.671 0 01-1.049-.839v-.002z" fill="#E748E9"/></svg>`,
  },
  duckai: {
    key: 'duckai',
    domain: 'duckduckgo.com',
    color: '#DE5833',
    newConvUrl: 'https://duck.ai/',
    // Duck.ai (duckduckgo.com AI chat); selectors need live validation.
    // Note: chats are stateless (no per-conversation URL) — mainly useful in Prompt mode.
    editorSelectors: ['textarea[name="user-prompt"]', 'form textarea', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Official DuckDuckGo duck mark (wordmark cropped out, ids namespaced)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="67.5 18.3 120.5 120.5"><path d="M183.855 77.948c0 32.201-25.321 58.306-56.557 58.306-31.234 0-56.555-26.104-56.555-58.306s25.321-58.305 56.555-58.305c31.236.001 56.557 26.104 56.557 58.305z" fill="#fff"/><path d="M179.717 78.348c0 28.828-23.369 52.201-52.199 52.201s-52.199-23.373-52.199-52.201 23.369-52.199 52.199-52.199 52.199 23.371 52.199 52.199zm7.461 0c0 32.947-26.713 59.66-59.66 59.66-32.947 0-59.66-26.713-59.66-59.66 0-32.947 26.713-59.66 59.66-59.66 32.947 0 59.66 26.712 59.66 59.66zm-4.922 0c0-30.229-24.51-54.736-54.738-54.736-30.227 0-54.738 24.508-54.738 54.736s24.512 54.736 54.738 54.736c30.228 0 54.738-24.508 54.738-54.736z" fill="#DE5833"/><defs><path id="af-duck-b" d="M179.922 78.207c0 28.895-23.506 52.4-52.404 52.4-28.893 0-52.396-23.508-52.396-52.4 0-28.891 23.506-52.396 52.396-52.396 28.898-.001 52.404 23.505 52.404 52.396z"/></defs><clipPath id="af-duck-c"><use xlink:href="#af-duck-b" overflow="visible"/></clipPath><g clip-path="url(#af-duck-c)"><path d="M148.482 154.541c-1.801-8.285-12.262-27.039-16.229-34.969-3.965-7.93-7.939-19.11-6.129-26.322.327-1.312-3.436-11.307-2.354-12.014 8.416-5.49 10.632.598 14.001-1.863 1.738-1.273 4.09 1.047 4.693-1.059 2.158-7.568-3.006-20.76-8.768-26.527-1.885-1.879-4.773-3.059-8.031-3.686-1.254-1.713-3.275-3.361-6.138-4.879-3.188-1.697-10.121-3.938-13.717-4.535-2.492-.41-3.055.287-4.119.461.992.088 5.699 2.414 6.615 2.549-.916.619-3.607-.029-5.324.742-.865.391-1.512 1.877-1.506 2.58 4.91-.496 12.574-.016 17.1 2-3.602.41-9.08.867-11.436 2.105-6.848 3.609-9.873 12.035-8.07 22.133 1.804 10.075 9.738 46.849 12.262 59.129 2.525 12.263-5.408 20.189-10.455 22.354l5.408.363-1.801 3.967c6.484.719 13.695-1.441 13.695-1.441-1.438 3.965-11.176 5.412-11.176 5.412s4.691 1.438 12.258-1.447c7.575-2.883 12.261-4.688 12.261-4.688l3.604 9.373 6.854-6.846 2.883 7.211c.012-.001 5.422-1.808 3.619-10.103z" fill="#d5d7d8"/><path d="M150.66 152.859c-1.795-8.289-12.256-27.043-16.227-34.976-3.969-7.935-7.934-19.112-6.129-26.321.334-1.309.34-6.668 1.428-7.379 8.41-5.494 7.812-.184 11.186-2.645 1.74-1.27 3.133-2.805 3.738-4.912 2.164-7.572-3.006-20.76-8.773-26.529-1.879-1.879-4.768-3.062-8.025-3.686-1.252-1.717-3.271-3.361-6.131-4.881-5.391-2.863-12.074-4.006-18.266-2.883.99.09 3.256 2.137 4.168 2.273-1.381.936-5.053.816-5.029 2.896 4.916-.492 10.303.285 14.834 2.297-3.602.41-6.955 1.299-9.311 2.543-6.854 3.602-8.656 10.812-6.854 20.914 1.807 10.096 9.742 46.868 12.256 59.127 2.527 12.258-5.402 20.188-10.449 22.352l5.408.359-1.801 3.973c6.484.718 13.695-1.442 13.695-1.442-1.438 3.972-11.176 5.405-11.176 5.405s4.686 1.443 12.258-1.444c7.578-2.883 12.268-4.685 12.268-4.685l3.602 9.373 6.854-6.85 2.889 7.211c-.009.006 5.396-1.799 3.587-10.09z" fill="#fff"/><path d="M109.211 70.074A3.786 3.786 0 0 1 113 66.287a3.786 3.786 0 0 1 3.785 3.787A3.785 3.785 0 0 1 113 73.861a3.784 3.784 0 0 1-3.789-3.787z" fill="#2d4f8e"/><path d="M113.697 68.812a.982.982 0 1 1 1.964 0 .985.985 0 0 1-.984.984.984.984 0 0 1-.98-.984z" fill="#fff"/><path d="M135.057 67.828a3.255 3.255 0 0 1 3.252-3.25 3.254 3.254 0 1 1-3.252 3.25z" fill="#2d4f8e"/><path d="M138.914 66.746c0-.463.379-.842.838-.842.477 0 .844.379.844.842a.834.834 0 0 1-.844.842.84.84 0 0 1-.838-.842z" fill="#fff"/><path d="M114.076 59.101s-2.854-1.291-5.629.453c-2.77 1.742-2.668 3.523-2.668 3.523s-1.473-3.283 2.453-4.891c3.93-1.61 5.844.915 5.844.915z" fill="#4A5AA5"/><path d="M140.268 58.841s-2.051-1.172-3.643-1.152c-3.268.043-4.162 1.488-4.162 1.488s.549-3.445 4.734-2.754c2.266.377 3.071 2.418 3.071 2.418z" fill="#4A5AA5"/></g><path d="M124.59 84.678c.379-2.291 6.299-6.625 10.49-6.887 4.201-.264 5.51-.205 9.01-1.043 3.508-.838 12.535-3.088 15.033-4.242 2.504-1.156 13.102.572 5.631 4.738-3.234 1.809-11.945 5.131-18.172 6.988-6.219 1.861-9.99-1.777-12.059 1.281-1.646 2.432-.334 5.762 7.098 6.453 10.037.93 19.66-4.52 20.719-1.625 1.064 2.895-8.625 6.508-14.527 6.623-5.891.111-17.775-3.896-19.553-5.137-1.785-1.239-4.164-4.13-3.67-7.149z" fill="#fdd20a"/><g><path d="M129.133 115.975s-14.1-7.521-14.33-4.47c-.238 3.056 0 15.509 1.643 16.451 1.646.938 13.395-6.108 13.395-6.108l-.708-5.873zM134.535 115.501s9.635-7.285 11.754-6.815c2.111.479 2.582 15.511.701 16.225-1.881.695-12.908-3.816-12.908-3.816l.453-5.594z" fill="#65bc46"/><path d="M125.719 116.771c0 4.931-.708 7.049 1.41 7.517 2.111.473 6.105 0 7.518-.938 1.41-.939.232-7.281-.234-8.465-.475-1.171-8.694-.228-8.694 1.886z" fill="#43a244"/><path d="M126.615 115.675c0 4.933-.707 7.05 1.41 7.519 2.109.475 6.104 0 7.518-.938 1.41-.941.232-7.279-.238-8.466-.471-1.172-8.69-.228-8.69 1.885z" fill="#65bc46"/></g><path d="M140.029 128.698a52.305 52.305 0 0 1-12.916 1.612c-4.715 0-9.282-.637-13.631-1.811l.05.413a52.241 52.241 0 0 0 13.582 1.796c4.511 0 8.89-.573 13.068-1.648l-.153-.362z" fill="#fff"/></svg>`,
  },
  you: {
    key: 'you',
    domain: 'you.com',
    color: '#3B5BFF',
    newConvUrl: 'https://you.com/',
    // You.com chat composer; selectors need live validation
    editorSelectors: ['#search-input-textarea', 'textarea[data-testid="youchat-input"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // You.com mark (the hexagon of the official logo, wordmark dropped):
    // rounded hexagon with the four-point star as a true cutout
    // (fill-rule evenodd) so the button background shows through on both themes
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" fill="#6D6BEC" d="M10.7 1.95 Q12 1.2 13.3 1.95 L20.1 5.85 Q21.4 6.6 21.4 8.1 L21.4 15.9 Q21.4 17.4 20.1 18.15 L13.3 22.05 Q12 22.8 10.7 22.05 L3.9 18.15 Q2.6 17.4 2.6 15.9 L2.6 8.1 Q2.6 6.6 3.9 5.85 Z M12 1.2 C12.55 7.6 14.9 11.3 19.6 12 C14.9 12.7 12.55 16.4 12 22.8 C11.45 16.4 9.1 12.7 4.4 12 C9.1 11.3 11.45 7.6 12 1.2 Z"/></svg>`,
  },
  pi: {
    key: 'pi',
    domain: 'pi.ai',
    color: '#0E7460',
    newConvUrl: 'https://pi.ai/talk',
    // Pi is one continuous conversation at /talk (no per-thread URLs); selectors need live validation
    editorSelectors: ['textarea[placeholder]', 'main textarea', 'textarea', '[contenteditable="true"]'],
    // No official SVG available — the "Pi" wordmark approximated as serif text
    // in the brand green (matches the official PNG app icon)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="12" y="17.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="17" font-weight="700" fill="#0E7460">Pi</text></svg>`,
  },
  characterai: {
    key: 'characterai',
    domain: 'character.ai',
    color: '#3E77FF',
    newConvUrl: 'https://character.ai/',
    // Character.AI chat composer; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // The official mark is too wide for a square slot — "c.ai" rendered as text
    // in the UI font instead; currentColor self-adapts to the light/dark theme.
    // Wide viewBox + textLength let the button CSS give it the full slot width
    // (popup-extra.css sizes this logo 24×14 instead of the default 16×16).
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 14"><text x="12" y="11.5" text-anchor="middle" font-size="13" font-weight="700" textLength="23" lengthAdjust="spacingAndGlyphs" fill="currentColor">c.ai</text></svg>`,
  },
  local: {
    key: 'local',
    domain: null,
    color: '#6b7280',
    newConvUrl: null,
    // Open WebUI (#chat-textarea) is the primary target; fallbacks cover LM Studio, AnythingLLM, Jan, etc.
    editorSelectors: ['#chat-textarea', 'textarea#message-input', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Stylized laptop icon representing a local LLM
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><polyline points="1,20 23,20"/><path d="M5 20 C5 17 7 16 12 16 C17 16 19 17 19 20"/></svg>`,
  },
};

// Backward-compat helper: returns the first editorSelector string, or the array as comma-joined
// (some callers used the old single-string .editorSelector property)
Object.values(SITES).forEach(site => {
  Object.defineProperty(site, 'editorSelector', {
    get() { return this.editorSelectors ? this.editorSelectors[0] : null; },
    enumerable: false,
  });
});

// localUrl: the user-configured local LLM URL (optional). When provided,
// any URL sharing the same origin (scheme+host+port) is matched as 'local'.
function getSiteByUrl(url, localUrl) {
  if (!url) return null;
  let hostname;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    if (localUrl && parsed.origin === new URL(localUrl).origin) return 'local';
  } catch (_) {
    return null;
  }
  for (const [key, site] of Object.entries(SITES)) {
    if (site.domain && (hostname === site.domain || hostname.endsWith('.' + site.domain))) return key;
  }
  return null;
}

// Hook for folders.js — returns {key, color, logoSvg} for a saved chat, or null.
// AI Folders defines this; Gemini Folders leaves it undefined.
// Guard: service workers load this file too (via importScripts) but have no `window`.
if (typeof window !== 'undefined') {
  window.getChatSiteInfo = function(chat) {
    if (!chat.site || !SITES[chat.site]) return null;
    const site = SITES[chat.site];
    return { key: chat.site, color: site.color, logoSvg: site.logoSvg };
  };
}

// Injected into the active page via chrome.scripting.executeScript.
// Tries site-specific DOM strategies in order, falls back to document title.
function extractAITitleLogic(siteKey, defaultFallback) {
  const docTitle = (ignoreSet) => {
    const raw = (document.title || '').trim();
    const clean = raw.split(' - ')[0].split(' | ')[0].split(' — ')[0].trim();
    return (!clean || ignoreSet.has(clean.toLowerCase())) ? null : clean;
  };

  const firstMsg = (selector) => {
    const el = document.querySelector(selector);
    if (!el?.textContent) return null;
    const text = el.textContent.trim();
    return text ? (text.length > 40 ? text.substring(0, 40) + '...' : text) : null;
  };

  // Returns the text of the active sidebar conversation link, tried at several aria patterns
  const activeSidebarLink = () => {
    const selectors = [
      '[aria-current="page"]',
      '[aria-selected="true"]',
      '[aria-current="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // Try a nested paragraph, then a .truncate span, then the element's own text
      const inner = el.querySelector('p, .truncate, span') || el;
      const text = inner.textContent?.trim().split('\n')[0].trim();
      if (text && text.length > 1) return text;
    }
    return null;
  };

  let strategies;

  if (siteKey === 'gemini') {
    strategies = [
      () => document.querySelector('[data-test-id="conversation-title"]')?.textContent?.trim() || null,
      () => {
        const path = window.location.pathname;
        if (!path.includes('/app/')) return null;
        for (const link of document.querySelectorAll(`a[href="${path}"]`)) {
          const text = link.textContent.trim().split('\n')[0].trim();
          if (text.length > 1) return text;
        }
        return null;
      },
      () => docTitle(new Set(['gemini', 'google gemini', 'discussions', 'chats',
        'nouvelle conversation', 'new conversation', 'new chat', ''])),
      () => firstMsg('[data-message-author-role="user"], user-query, message-content, .query-text'),
    ];
  } else if (siteKey === 'claude') {
    strategies = [
      activeSidebarLink,
      // Claude sets <title> to "Conversation Name - Claude" for named conversations
      () => docTitle(new Set(['claude', 'claude.ai', 'new conversation', ''])),
      // First user turn as last resort
      () => firstMsg('[data-testid="user-message"] .font-body, [data-testid="user-message"]'),
    ];
  } else if (siteKey === 'chatgpt') {
    strategies = [
      activeSidebarLink,
      // ChatGPT sets <title> to "Conversation Name" (no suffix) for named conversations
      () => docTitle(new Set(['chatgpt', 'new chat', 'chatgpt - ask anything', ''])),
      // Path-based sidebar link as extra fallback
      () => {
        const path = window.location.pathname;
        if (!path.startsWith('/c/')) return null;
        const link = document.querySelector(`a[href="${path}"]`);
        const text = link?.textContent?.trim().split('\n')[0].trim();
        return (text && text.length > 1) ? text : null;
      },
      () => firstMsg('[data-message-author-role="user"] p, [data-message-author-role="user"]'),
    ];
  } else if (siteKey === 'copilot') {
    strategies = [
      activeSidebarLink,
      () => docTitle(new Set(['microsoft copilot', 'copilot', ''])),
      () => firstMsg('[data-content="user-message"], .user-message, cib-message[type="user"]'),
    ];
  } else if (siteKey === 'deepseek') {
    strategies = [
      activeSidebarLink,
      () => docTitle(new Set(['deepseek', 'deepseek - into the unknown', 'new chat', ''])),
      () => firstMsg('[class*="user"] [class*="message"], [class*="human"] p'),
    ];
  } else if (siteKey === 'grok') {
    strategies = [
      activeSidebarLink,
      () => docTitle(new Set(['grok', 'grok.com', 'new chat', 'new conversation', ''])),
      () => firstMsg('[class*="user"] [class*="message"], .message-bubble p'),
    ];
  } else if (siteKey === 'perplexity') {
    strategies = [
      // Perplexity shows the question as an h1 at the top of the page
      () => document.querySelector('h1')?.textContent?.trim() || null,
      () => docTitle(new Set(['perplexity', 'perplexity ai', 'perplexity.ai', ''])),
      () => firstMsg('[data-testid="query-text"], .query, .prose p:first-child'),
    ];
  } else {
    // Newer sites share the generic strategy chain (sidebar link → document
    // title → first user message); only the per-site generic-title ignore
    // list differs. Promote a site to its own branch above if it needs a
    // dedicated DOM strategy.
    const genericIgnores = {
      zai: ['z.ai', 'chat.z.ai', 'new chat'],
      qwen: ['qwen', 'qwen chat', 'new chat'],
      meta: ['meta ai', 'meta.ai', 'new conversation'],
      mistral: ['le chat', 'le chat - mistral ai', 'mistral ai', 'new chat'],
      poe: ['poe', 'new chat'],
      duckai: ['duckduckgo ai chat', 'duckduckgo', 'ai chat', 'duck.ai'],
      you: ['you.com', 'you', 'new chat'],
      pi: ['pi', 'pi.ai', 'talk with pi', 'pi, your personal ai'],
      characterai: ['character.ai', 'characterai', 'c.ai', 'new chat'],
    }[siteKey];
    if (genericIgnores) {
      strategies = [
        activeSidebarLink,
        () => docTitle(new Set([...genericIgnores, ''])),
        () => firstMsg('[data-message-author-role="user"], [class*="user"] [class*="message"], [class*="human"] p'),
      ];
    }
  }

  if (strategies) {
    for (const s of strategies) {
      try {
        const result = s();
        if (result && result.trim().length > 0) return result.trim();
      } catch (_) { /* skip failing strategies */ }
    }
  }
  return defaultFallback || document.title.trim() || 'New conversation';
}

if (typeof module !== 'undefined') {
  module.exports = { SITES, getSiteByUrl, extractAITitleLogic };
}
