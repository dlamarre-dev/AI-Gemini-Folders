/**
 * Localized sample data for AI Folders store-listing screenshots.
 * Shows conversations from multiple AI services living in the same folders,
 * the prompt library with multi-site injection, and the site-button row.
 */

const NOW = Date.now();
const DAY = 86400000;

function make(locale) {
  const {
    title,
    folderLabel,
    promptLabel,
    folderScreenTitle  = 'All your AI chats, one organized place',
    promptScreenTitle  = 'Your best prompts, ready for any AI',
    mobileScreenTitle  = 'Access your AI chats from your phone',
    contextMenuScreenTitle = 'Save any AI conversation in one right-click',
    ctxMenuSaveLabel   = 'Save to AI Folders',
    ctxBack    = 'Back',
    ctxForward = 'Forward',
    ctxSavePage = 'Save page as…',
    ctxPrint   = 'Print…',
    // Site labels shown in conversation list
    siteGemini     = 'Gemini',
    siteClaude     = 'Claude',
    siteChatGPT    = 'ChatGPT',
    siteCopilot    = 'Copilot',
    sitePerplexity = 'Perplexity',
    syncFolderName = 'AI Folders (Sync)',
    research, writing, travel,
    dev         = 'Dev',
    // Conversation titles (English defaults, represent multi-site use)
    devChat1    = 'Refactor Node.js API',
    devChat2    = 'Debug React hook',
    devChat3    = 'Write unit tests',
    resChat1    = 'Market analysis 2025',
    resChat2    = 'Competitor overview',
    writeChat1  = 'Blog post — AI productivity',
    writeChat2  = 'Newsletter draft',
    travelChat1 = 'Japan trip itinerary',
    // Prompt titles
    codeReviewer, codeReviewerText,
    emailPro,     emailProText,
    explainSimply, blogOutline,
    debugHelper     = 'Debug Helper',
    debugHelperText = 'I have the following error or unexpected behavior. Help me diagnose the root cause step by step, then suggest a fix.',
  } = locale;

  const devFolder = `💻 ${dev}`;
  const resFolder = `🔬 ${research || 'Research'}`;
  const writeFolder = `✍️ ${writing || 'Writing'}`;

  return {
    title,
    folderLabel,
    promptLabel,
    folderScreenTitle,
    promptScreenTitle,
    mobileScreenTitle,
    contextMenuScreenTitle,
    ctxMenuSaveLabel,
    ctxBack, ctxForward, ctxSavePage, ctxPrint,
    syncFolderName,
    devChat1, devChat2, resChat1, writeChat1,
    pinnedFolders: [devFolder],
    folders: {
      // Dev folder: conversations from ChatGPT + Claude + Gemini
      [devFolder]: [
        { url: 'https://chatgpt.com/c/aaa1',   title: devChat1,  timestamp: NOW - 1 * DAY, site: 'chatgpt' },
        { url: 'https://claude.ai/chat/aaa2',   title: devChat2,  timestamp: NOW - 2 * DAY, site: 'claude' },
        { url: 'https://chatgpt.com/c/aaa3',    title: devChat3,  timestamp: NOW - 3 * DAY, site: 'chatgpt' },
        { url: 'https://gemini.google.com/app/aaa4', title: `${devChat1} v2`, timestamp: NOW - 4 * DAY, site: 'gemini' },
      ],
      // Research folder: Perplexity + Copilot + Claude
      [resFolder]: [
        { url: 'https://www.perplexity.ai/search/bbb1', title: resChat1, timestamp: NOW - 1 * DAY, site: 'perplexity' },
        { url: 'https://copilot.microsoft.com/c/bbb2',  title: resChat2, timestamp: NOW - 2 * DAY, site: 'copilot' },
        { url: 'https://claude.ai/chat/bbb3',           title: `${resChat1} — deep dive`, timestamp: NOW - 5 * DAY, site: 'claude' },
      ],
      // Writing folder: Gemini + Claude + ChatGPT
      [writeFolder]: [
        { url: 'https://gemini.google.com/app/ccc1', title: writeChat1, timestamp: NOW - 1 * DAY, site: 'gemini' },
        { url: 'https://claude.ai/chat/ccc2',        title: writeChat2, timestamp: NOW - 2 * DAY, site: 'claude' },
        { url: 'https://chatgpt.com/c/ccc3',         title: `${writeChat2} final`, timestamp: NOW - 3 * DAY, site: 'chatgpt' },
      ],
    },
    pinnedPrompts: [codeReviewer || 'Code Reviewer'],
    prompts: {
      [codeReviewer || 'Code Reviewer']: {
        text: codeReviewerText || 'Review this code for correctness, performance, and readability. Point out any bugs, anti-patterns, or style issues. Suggest concrete improvements.',
        timestamp: NOW - 3 * DAY,
        pinned: true,
      },
      [emailPro || 'Email Pro']: {
        text: emailProText || 'Rewrite the following email to be professional, concise, and clear. Keep the core message but improve the tone and structure.',
        timestamp: NOW - 5 * DAY,
      },
      [explainSimply || 'Explain Simply']: {
        text: 'Explain the following concept as if I were a smart 12-year-old. Use simple language, a real-world analogy, and one concrete example.',
        timestamp: NOW - 7 * DAY,
      },
      [debugHelper]: {
        text: debugHelperText,
        timestamp: NOW - 10 * DAY,
      },
      [blogOutline || 'Blog Outline']: {
        text: 'Create a detailed blog post outline on the following topic. Include an engaging title, introduction hook, 5 main sections with sub-points, and a conclusion with a call to action.',
        timestamp: NOW - 14 * DAY,
      },
    },
  };
}

// ─── Locale definitions ───────────────────────────────────────────────────────

const LOCALES = {
  en: make({ title: 'AI Folders', folderLabel: 'Folders', promptLabel: 'Prompts',
    dev: 'Dev', research: 'Research', writing: 'Writing',
    ctxMenuSaveLabel: 'Save to AI Folders', syncFolderName: 'AI Folders (Sync)',
    devChat1: 'Refactor Node.js API', devChat2: 'Debug React hook', devChat3: 'Write unit tests',
    resChat1: 'Market analysis 2025', resChat2: 'Competitor overview',
    writeChat1: 'Blog post — AI productivity', writeChat2: 'Newsletter draft',
    codeReviewer: 'Code Reviewer', codeReviewerText: 'Review this code for correctness, performance, and readability. Point out any bugs, anti-patterns, or style issues. Suggest concrete improvements.',
    emailPro: 'Email Pro', emailProText: 'Rewrite the following email to be professional, concise, and clear.',
    explainSimply: 'Explain Simply', blogOutline: 'Blog Outline',
  }),

  fr: make({ title: 'Dossiers IA', folderLabel: 'Dossiers', promptLabel: 'Prompts',
    dev: 'Dev', research: 'Recherche', writing: 'Rédaction',
    ctxMenuSaveLabel: 'Sauvegarder dans Dossiers IA', syncFolderName: 'Dossiers IA (Sync)',
    devChat1: 'Refactoriser l\'API Node.js', devChat2: 'Déboguer le hook React', devChat3: 'Écrire des tests unitaires',
    resChat1: 'Analyse de marché 2025', resChat2: 'Vue d\'ensemble concurrents',
    writeChat1: 'Article de blog — IA productive', writeChat2: 'Brouillon newsletter',
    codeReviewer: 'Relecteur de Code', codeReviewerText: 'Examine ce code pour sa correction, ses performances et sa lisibilité. Signale les bugs, anti-patterns ou problèmes de style. Propose des améliorations concrètes.',
    emailPro: 'Email Pro', emailProText: 'Réécris cet e-mail pour qu\'il soit professionnel, concis et clair.',
    explainSimply: 'Explique Simplement', blogOutline: 'Plan d\'Article',
    folderScreenTitle: 'Tous vos chats IA, un espace organisé',
    promptScreenTitle: 'Vos meilleurs prompts, prêts pour tout IA',
  }),

  de: make({ title: 'AI-Ordner', folderLabel: 'Ordner', promptLabel: 'Prompts',
    dev: 'Entwicklung', research: 'Recherche', writing: 'Texte',
    ctxMenuSaveLabel: 'In AI-Ordner speichern', syncFolderName: 'AI-Ordner (Sync)',
    devChat1: 'Node.js-API refaktorieren', devChat2: 'React-Hook debuggen', devChat3: 'Unit-Tests schreiben',
    resChat1: 'Marktanalyse 2025', resChat2: 'Wettbewerbsübersicht',
    writeChat1: 'Blogartikel — KI-Produktivität', writeChat2: 'Newsletter-Entwurf',
    codeReviewer: 'Code-Reviewer', codeReviewerText: 'Überprüfe diesen Code auf Korrektheit, Performance und Lesbarkeit. Weise auf Bugs, Anti-Patterns oder Stilprobleme hin. Schlage konkrete Verbesserungen vor.',
    emailPro: 'E-Mail-Profi', emailProText: 'Schreibe diese E-Mail professionell, prägnant und klar um.',
    explainSimply: 'Einfach Erklären', blogOutline: 'Blog-Gliederung',
    folderScreenTitle: 'Alle KI-Chats, ein organisierter Ort',
    promptScreenTitle: 'Ihre besten Prompts, bereit für jede KI',
  }),

  es: make({ title: 'Carpetas IA', folderLabel: 'Carpetas', promptLabel: 'Prompts',
    dev: 'Desarrollo', research: 'Investigación', writing: 'Escritura',
    ctxMenuSaveLabel: 'Guardar en Carpetas IA', syncFolderName: 'Carpetas IA (Sync)',
    devChat1: 'Refactorizar API Node.js', devChat2: 'Depurar hook React', devChat3: 'Escribir pruebas unitarias',
    resChat1: 'Análisis de mercado 2025', resChat2: 'Visión general competidores',
    writeChat1: 'Post blog — productividad IA', writeChat2: 'Borrador newsletter',
    codeReviewer: 'Revisor de Código', emailPro: 'Email Pro', explainSimply: 'Explica Simple', blogOutline: 'Esquema Blog',
    folderScreenTitle: 'Todos tus chats IA, un lugar organizado',
  }),

  it: make({ title: 'Cartelle IA', folderLabel: 'Cartelle', promptLabel: 'Prompt',
    dev: 'Dev', research: 'Ricerca', writing: 'Scrittura',
    ctxMenuSaveLabel: 'Salva in Cartelle IA', syncFolderName: 'Cartelle IA (Sync)',
    devChat1: 'Refactoring API Node.js', devChat2: 'Debug hook React', devChat3: 'Scrivere test unitari',
    resChat1: 'Analisi di mercato 2025', resChat2: 'Panoramica concorrenti',
    writeChat1: 'Post blog — produttività IA', writeChat2: 'Bozza newsletter',
    codeReviewer: 'Revisore Codice', emailPro: 'Email Pro', explainSimply: 'Spiega Semplicemente', blogOutline: 'Schema Blog',
  }),

  pt_BR: make({ title: 'Pastas IA', folderLabel: 'Pastas', promptLabel: 'Prompts',
    dev: 'Dev', research: 'Pesquisa', writing: 'Escrita',
    ctxMenuSaveLabel: 'Salvar em Pastas IA', syncFolderName: 'Pastas IA (Sync)',
    devChat1: 'Refatorar API Node.js', devChat2: 'Depurar hook React', devChat3: 'Escrever testes unitários',
    resChat1: 'Análise de mercado 2025', resChat2: 'Visão geral dos concorrentes',
    writeChat1: 'Post blog — produtividade IA', writeChat2: 'Rascunho newsletter',
    codeReviewer: 'Revisor de Código', emailPro: 'Email Pro', explainSimply: 'Explique Simples', blogOutline: 'Esquema Blog',
  }),

  ja: make({ title: 'AI フォルダ', folderLabel: 'フォルダ', promptLabel: 'プロンプト',
    dev: '開発', research: 'リサーチ', writing: 'ライティング',
    ctxMenuSaveLabel: 'AI フォルダに保存', syncFolderName: 'AI フォルダ (同期)',
    devChat1: 'Node.js API をリファクタリング', devChat2: 'React フックのデバッグ', devChat3: '単体テストを書く',
    resChat1: '市場分析 2025', resChat2: '競合他社概要',
    writeChat1: 'ブログ記事 — AI 生産性', writeChat2: 'ニュースレター下書き',
    codeReviewer: 'コードレビュアー', emailPro: 'メールプロ', explainSimply: 'わかりやすく説明', blogOutline: 'ブログ構成',
    folderScreenTitle: 'すべての AI チャットを一箇所に整理',
    promptScreenTitle: 'あなたのベストプロンプトをどの AI にも',
  }),

  zh_CN: make({ title: 'AI 文件夹', folderLabel: '文件夹', promptLabel: '提示词',
    dev: '开发', research: '研究', writing: '写作',
    ctxMenuSaveLabel: '保存到 AI 文件夹', syncFolderName: 'AI 文件夹 (同步)',
    devChat1: '重构 Node.js API', devChat2: '调试 React Hook', devChat3: '编写单元测试',
    resChat1: '市场分析 2025', resChat2: '竞争对手概述',
    writeChat1: '博客文章 — AI 生产力', writeChat2: '简报草稿',
    codeReviewer: '代码审查', emailPro: '专业邮件', explainSimply: '简单解释', blogOutline: '博客大纲',
    folderScreenTitle: '所有 AI 对话，一个有序的地方',
    promptScreenTitle: '您的最佳提示词，随时可用于任何 AI',
  }),

  ko: make({ title: 'AI 폴더', folderLabel: '폴더', promptLabel: '프롬프트',
    dev: '개발', research: '연구', writing: '글쓰기',
    ctxMenuSaveLabel: 'AI 폴더에 저장', syncFolderName: 'AI 폴더 (동기화)',
    devChat1: 'Node.js API 리팩터링', devChat2: 'React 훅 디버깅', devChat3: '단위 테스트 작성',
    resChat1: '시장 분석 2025', resChat2: '경쟁사 개요',
    writeChat1: '블로그 포스트 — AI 생산성', writeChat2: '뉴스레터 초안',
    codeReviewer: '코드 리뷰어', emailPro: '이메일 프로', explainSimply: '쉽게 설명', blogOutline: '블로그 개요',
  }),

  ru: make({ title: 'AI-папки', folderLabel: 'Папки', promptLabel: 'Промпты',
    dev: 'Разработка', research: 'Исследования', writing: 'Тексты',
    ctxMenuSaveLabel: 'Сохранить в AI-папки', syncFolderName: 'AI-папки (Sync)',
    devChat1: 'Рефакторинг Node.js API', devChat2: 'Отладка React-хука', devChat3: 'Написать юнит-тесты',
    resChat1: 'Анализ рынка 2025', resChat2: 'Обзор конкурентов',
    writeChat1: 'Статья блога — продуктивность с ИИ', writeChat2: 'Черновик рассылки',
    codeReviewer: 'Ревьюер кода', emailPro: 'Проф. письмо', explainSimply: 'Объясни просто', blogOutline: 'План статьи',
    folderScreenTitle: 'Все чаты ИИ — одно упорядоченное место',
    promptScreenTitle: 'Ваши лучшие промпты — для любого ИИ',
  }),
};

// Fallback: use English data for locales not listed above
const LOCALE_IDS = [
  'en','fr','de','es','it','pt_BR','pt_PT','ru','pl',
  'zh_CN','ja','ko','hi','ro','sk','cs','tr','id','zh_TW',
  'vi','bn','nl','sw','tl','th','hu','ar','ms','sl','bg','sr','hr',
  'et','lt','lv','ca','uk','el','he','nb','sv','fi','da',
];

const DATA = {};
for (const id of LOCALE_IDS) {
  DATA[id] = LOCALES[id] || LOCALES.en;
}

module.exports = DATA;
