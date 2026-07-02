// site-config.js — AI Folders site registry
// Provides:
//   SITES              — metadata for all supported sites (17 web platforms + local)
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
    // Official Gemini SVG shape; solid fill (gradients via url() are unreliable in extension popup innerHTML)
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
    // Official Microsoft Copilot SVG shape; solid fill (gradients via url() are unreliable in extension popup innerHTML)
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
    // Simplified "Z" mark; white fill to match Z.ai branding
    // (light-theme override lives in popup-extra.css, same as ChatGPT/Grok)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 4h14v2.8L9.8 17.2H19V20H5v-2.8L14.2 6.8H5V4z" fill="#ffffff"/></svg>`,
  },
  qwen: {
    key: 'qwen',
    domain: 'chat.qwen.ai',
    color: '#615CED',
    newConvUrl: 'https://chat.qwen.ai/',
    // Qwen Chat composer; selectors need live validation
    editorSelectors: ['#chat-input', 'textarea#chat-input', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified six-spoke Qwen asterisk mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#615CED" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/></svg>`,
  },
  meta: {
    key: 'meta',
    domain: 'meta.ai',
    color: '#0064E0',
    newConvUrl: 'https://www.meta.ai/',
    // Meta AI uses a Lexical contenteditable composer; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified Meta infinity mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0064E0" stroke-width="2.2" stroke-linecap="round"><path d="M7 7.5c-2.6 0-4.5 3.6-4.5 6.5 0 1.9 1 2.9 2.4 2.9 1.8 0 3-2 4.6-5 1.6-3 2.9-4.4 4.9-4.4 2.7 0 5.1 3.3 5.1 6.4 0 1.9-1 3-2.4 3-1.8 0-3.1-2-4.6-5"/></svg>`,
  },
  mistral: {
    key: 'mistral',
    domain: 'chat.mistral.ai',
    color: '#FA500F',
    newConvUrl: 'https://chat.mistral.ai/chat',
    // Le Chat uses a ProseMirror composer; selectors need live validation
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', 'textarea[name="message.text"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified pixel-flag "M" (official palette, yellow → red rows)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 20"><rect x="0" y="0" width="4" height="4" fill="#FFD800"/><rect x="20" y="0" width="4" height="4" fill="#FFD800"/><rect x="0" y="4" width="8" height="4" fill="#FFAF00"/><rect x="16" y="4" width="8" height="4" fill="#FFAF00"/><rect x="0" y="8" width="4" height="4" fill="#FF8205"/><rect x="8" y="8" width="8" height="4" fill="#FF8205"/><rect x="20" y="8" width="4" height="4" fill="#FF8205"/><rect x="0" y="12" width="4" height="4" fill="#FA500F"/><rect x="20" y="12" width="4" height="4" fill="#FA500F"/><rect x="0" y="16" width="4" height="4" fill="#E10500"/><rect x="20" y="16" width="4" height="4" fill="#E10500"/></svg>`,
  },
  poe: {
    key: 'poe',
    domain: 'poe.com',
    color: '#5D5CDE',
    newConvUrl: 'https://poe.com/',
    // Poe uses hashed CSS-module classes — match by class prefix; selectors need live validation
    editorSelectors: ['textarea[class*="GrowingTextArea_textArea"]', 'footer textarea', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified Poe speech-bubble mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6 2 11c0 2.9 1.5 5.5 3.9 7.2L5 22l4.4-2.1c.8.2 1.7.3 2.6.3 5.5 0 10-4 10-9.2S17.5 2 12 2z" fill="#5D5CDE"/></svg>`,
  },
  duckai: {
    key: 'duckai',
    domain: 'duckduckgo.com',
    color: '#DE5833',
    newConvUrl: 'https://duck.ai/',
    // Duck.ai (duckduckgo.com AI chat); selectors need live validation.
    // Note: chats are stateless (no per-conversation URL) — mainly useful in Prompt mode.
    editorSelectors: ['textarea[name="user-prompt"]', 'form textarea', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified DuckDuckGo duck mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#DE5833"/><path d="M10.2 6.2a4.6 4.6 0 0 0-3 4.4c0 3.4 1.9 6.4 4.3 7.9l1.2-.4c-2.1-1.6-3.4-4-3.4-6.9 0-1.9.8-3.4 2.2-4.2l-1.3-.8z" fill="#ffffff"/><circle cx="12.6" cy="8.4" r="2.6" fill="#ffffff"/><circle cx="12" cy="7.8" r=".6" fill="#DE5833"/><path d="M14.8 8.6l3.4.5-3.2 1.1z" fill="#FFCC33"/></svg>`,
  },
  you: {
    key: 'you',
    domain: 'you.com',
    color: '#3B5BFF',
    newConvUrl: 'https://you.com/',
    // You.com chat composer; selectors need live validation
    editorSelectors: ['#search-input-textarea', 'textarea[data-testid="youchat-input"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified "Y" mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 3h4.2L12 9l3.8-6H20l-6.4 9.6V21h-3.2v-8.4L4 3z" fill="#3B5BFF"/></svg>`,
  },
  pi: {
    key: 'pi',
    domain: 'pi.ai',
    color: '#0FA47F',
    newConvUrl: 'https://pi.ai/talk',
    // Pi is one continuous conversation at /talk (no per-thread URLs); selectors need live validation
    editorSelectors: ['textarea[placeholder]', 'main textarea', 'textarea', '[contenteditable="true"]'],
    // Simplified "π" mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0FA47F" stroke-width="2.6" stroke-linecap="round"><path d="M4.5 7h15M8.5 7v10.5M15.5 7v8.5c0 1.6 1 2.3 2.7 1.8"/></svg>`,
  },
  characterai: {
    key: 'characterai',
    domain: 'character.ai',
    color: '#3E77FF',
    newConvUrl: 'https://character.ai/',
    // Character.AI chat composer; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    // Simplified "c." mark (Character.AI wordmark initial)
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3E77FF" stroke-width="3" stroke-linecap="round"><path d="M15.5 8.5a5 5 0 1 0 0 7"/><circle cx="18.5" cy="17" r="1.4" fill="#3E77FF" stroke="none"/></svg>`,
  },
  ernie: {
    key: 'ernie',
    domain: 'ernie.baidu.com',
    color: '#4E6EF2',
    newConvUrl: 'https://ernie.baidu.com/',
    // Ernie Bot uses a custom rich-text editor; selectors need live validation
    editorSelectors: ['div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]', 'textarea[placeholder]', 'textarea'],
    // Simplified four-point spark mark
    logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2c1 4 3 6 7 7-4 1-6 3-7 7-1-4-3-6-7-7 4-1 6-3 7-7z" fill="#4E6EF2"/><path d="M18.5 14.5c.5 2 1.5 3 3.5 3.5-2 .5-3 1.5-3.5 3.5-.5-2-1.5-3-3.5-3.5 2-.5 3-1.5 3.5-3.5z" fill="#4E6EF2"/></svg>`,
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
      ernie: ['ernie', 'ernie bot', '文心一言', '文心'],
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
