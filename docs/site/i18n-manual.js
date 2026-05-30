/* Hand-authored chrome strings (short, high-confidence) + language metadata.
   Longer body copy comes from i18n-data.js (real repo translations). */

// Native language names shown in the switcher
window.AF_LANGS = {
  en:"English", fr:"Français", es:"Español", de:"Deutsch", it:"Italiano",
  pt_BR:"Português (BR)", pt_PT:"Português (PT)", nl:"Nederlands", pl:"Polski",
  ru:"Русский", uk:"Українська", cs:"Čeština", sk:"Slovenčina", ja:"日本語",
  ko:"한국어", zh_CN:"简体中文", zh_TW:"繁體中文", ar:"العربية", he:"עברית",
  tr:"Türkçe", sv:"Svenska", da:"Dansk", nb:"Norsk bokmål", fi:"Suomi",
  el:"Ελληνικά", ro:"Română", hu:"Magyar", hr:"Hrvatski", sr:"Српски",
  bg:"Български", sl:"Slovenščina", lt:"Lietuvių", lv:"Latviešu", et:"Eesti",
  ca:"Català", id:"Bahasa Indonesia", ms:"Bahasa Melayu", vi:"Tiếng Việt",
  th:"ไทย", hi:"हिन्दी", bn:"বাংলা", sw:"Kiswahili", tl:"Tagalog"
};

// Right-to-left languages
window.AF_RTL = ["ar", "he"];

// Per-language script font (loaded from Google Fonts). Falls back to the
// Latin display/body stack for everything not listed.
window.AF_SCRIPT_FONT = {
  ar:"'Noto Sans Arabic'", he:"'Noto Sans Hebrew'", ja:"'Noto Sans JP'",
  ko:"'Noto Sans KR'", zh_CN:"'Noto Sans SC'", zh_TW:"'Noto Sans TC'",
  th:"'Noto Sans Thai'", hi:"'Noto Sans Devanagari'", bn:"'Noto Sans Bengali'"
};

window.AF_MANUAL = {
  en:{heroTitle:"Organize your AI conversations",ctaChrome:"Add to Chrome",ctaFirefox:"Get for Firefox",free:"Free",openSource:"Open source",priv:"Private",languages:"Languages",alsoAvailable:"Also available",getStarted:"Get started",supportedAI:"Supported AI"},
  fr:{heroTitle:"Organisez vos conversations IA",ctaChrome:"Ajouter à Chrome",ctaFirefox:"Obtenir pour Firefox",free:"Gratuit",openSource:"Open source",priv:"Confidentiel",languages:"Langues",alsoAvailable:"Également disponible",getStarted:"Commencer",supportedAI:"IA prises en charge"},
  es:{heroTitle:"Organiza tus conversaciones de IA",ctaChrome:"Añadir a Chrome",ctaFirefox:"Obtener para Firefox",free:"Gratis",openSource:"Código abierto",priv:"Privado",languages:"Idiomas",alsoAvailable:"También disponible",getStarted:"Empezar",supportedAI:"IA compatibles"},
  de:{heroTitle:"Organisiere deine KI-Gespräche",ctaChrome:"Zu Chrome hinzufügen",ctaFirefox:"Für Firefox holen",free:"Kostenlos",openSource:"Open Source",priv:"Privat",languages:"Sprachen",alsoAvailable:"Ebenfalls verfügbar",getStarted:"Loslegen",supportedAI:"Unterstützte KI"},
  it:{heroTitle:"Organizza le tue conversazioni IA",ctaChrome:"Aggiungi a Chrome",ctaFirefox:"Ottieni per Firefox",free:"Gratis",openSource:"Open source",priv:"Privato",languages:"Lingue",alsoAvailable:"Disponibile anche",getStarted:"Inizia",supportedAI:"IA supportate"},
  pt_BR:{heroTitle:"Organize suas conversas de IA",ctaChrome:"Adicionar ao Chrome",ctaFirefox:"Obter para Firefox",free:"Grátis",openSource:"Código aberto",priv:"Privado",languages:"Idiomas",alsoAvailable:"Também disponível",getStarted:"Começar",supportedAI:"IAs compatíveis"},
  pt_PT:{heroTitle:"Organize as suas conversas de IA",ctaChrome:"Adicionar ao Chrome",ctaFirefox:"Obter para Firefox",free:"Grátis",openSource:"Código aberto",priv:"Privado",languages:"Idiomas",alsoAvailable:"Também disponível",getStarted:"Começar",supportedAI:"IA suportadas"},
  nl:{heroTitle:"Organiseer je AI-gesprekken",ctaChrome:"Toevoegen aan Chrome",ctaFirefox:"Halen voor Firefox",free:"Gratis",openSource:"Opensource",priv:"Privé",languages:"Talen",alsoAvailable:"Ook beschikbaar",getStarted:"Aan de slag",supportedAI:"Ondersteunde AI"},
  pl:{heroTitle:"Uporządkuj swoje rozmowy z AI",ctaChrome:"Dodaj do Chrome",ctaFirefox:"Pobierz dla Firefox",free:"Za darmo",openSource:"Open source",priv:"Prywatne",languages:"Języki",alsoAvailable:"Dostępne także",getStarted:"Zacznij",supportedAI:"Obsługiwane AI"},
  ru:{heroTitle:"Организуйте свои разговоры с ИИ",ctaChrome:"Добавить в Chrome",ctaFirefox:"Установить для Firefox",free:"Бесплатно",openSource:"Открытый код",priv:"Приватно",languages:"Языки",alsoAvailable:"Также доступно",getStarted:"Начать",supportedAI:"Поддерживаемые ИИ"},
  uk:{heroTitle:"Упорядкуйте свої розмови зі ШІ",ctaChrome:"Додати в Chrome",ctaFirefox:"Встановити для Firefox",free:"Безкоштовно",openSource:"Відкритий код",priv:"Приватно",languages:"Мови",alsoAvailable:"Також доступно",getStarted:"Почати",supportedAI:"Підтримувані ШІ"},
  cs:{heroTitle:"Uspořádejte své konverzace s AI",ctaChrome:"Přidat do Chromu",ctaFirefox:"Získat pro Firefox",free:"Zdarma",openSource:"Otevřený zdroj",priv:"Soukromé",languages:"Jazyky",alsoAvailable:"Také k dispozici",getStarted:"Začít",supportedAI:"Podporované AI"},
  sk:{heroTitle:"Usporiadajte svoje konverzácie s AI",ctaChrome:"Pridať do Chromu",ctaFirefox:"Získať pre Firefox",free:"Zadarmo",openSource:"Otvorený zdroj",priv:"Súkromné",languages:"Jazyky",alsoAvailable:"Tiež dostupné",getStarted:"Začať",supportedAI:"Podporované AI"},
  ja:{heroTitle:"AIとの会話を整理しよう",ctaChrome:"Chromeに追加",ctaFirefox:"Firefoxで入手",free:"無料",openSource:"オープンソース",priv:"プライバシー重視",languages:"言語",alsoAvailable:"こちらも提供",getStarted:"始める",supportedAI:"対応AI"},
  ko:{heroTitle:"AI 대화를 정리하세요",ctaChrome:"Chrome에 추가",ctaFirefox:"Firefox용 받기",free:"무료",openSource:"오픈 소스",priv:"개인정보 보호",languages:"언어",alsoAvailable:"함께 제공",getStarted:"시작하기",supportedAI:"지원 AI"},
  zh_CN:{heroTitle:"整理你的 AI 对话",ctaChrome:"添加到 Chrome",ctaFirefox:"获取 Firefox 版",free:"免费",openSource:"开源",priv:"隐私优先",languages:"语言",alsoAvailable:"同样提供",getStarted:"开始使用",supportedAI:"支持的 AI"},
  zh_TW:{heroTitle:"整理你的 AI 對話",ctaChrome:"加到 Chrome",ctaFirefox:"取得 Firefox 版",free:"免費",openSource:"開源",priv:"隱私優先",languages:"語言",alsoAvailable:"同樣提供",getStarted:"開始使用",supportedAI:"支援的 AI"},
  ar:{heroTitle:"نظّم محادثاتك مع الذكاء الاصطناعي",ctaChrome:"أضف إلى Chrome",ctaFirefox:"التثبيت على Firefox",free:"مجاني",openSource:"مفتوح المصدر",priv:"خصوصية",languages:"اللغات",alsoAvailable:"متاح أيضاً",getStarted:"ابدأ الآن",supportedAI:"الذكاء الاصطناعي المدعوم"},
  he:{heroTitle:"ארגנו את שיחות ה-AI שלכם",ctaChrome:"הוסיפו ל-Chrome",ctaFirefox:"התקנה ל-Firefox",free:"חינם",openSource:"קוד פתוח",priv:"פרטי",languages:"שפות",alsoAvailable:"זמין גם",getStarted:"התחילו",supportedAI:"בינה מלאכותית נתמכת"},
  tr:{heroTitle:"Yapay zekâ sohbetlerinizi düzenleyin",ctaChrome:"Chrome'a ekle",ctaFirefox:"Firefox için edinin",free:"Ücretsiz",openSource:"Açık kaynak",priv:"Gizli",languages:"Diller",alsoAvailable:"Ayrıca mevcut",getStarted:"Başla",supportedAI:"Desteklenen yapay zekâ"},
  sv:{heroTitle:"Organisera dina AI-konversationer",ctaChrome:"Lägg till i Chrome",ctaFirefox:"Hämta för Firefox",free:"Gratis",openSource:"Öppen källkod",priv:"Privat",languages:"Språk",alsoAvailable:"Finns även",getStarted:"Kom igång",supportedAI:"AI som stöds"},
  da:{heroTitle:"Organiser dine AI-samtaler",ctaChrome:"Føj til Chrome",ctaFirefox:"Hent til Firefox",free:"Gratis",openSource:"Open source",priv:"Privat",languages:"Sprog",alsoAvailable:"Også tilgængelig",getStarted:"Kom godt i gang",supportedAI:"Understøttet AI"},
  nb:{heroTitle:"Organiser AI-samtalene dine",ctaChrome:"Legg til i Chrome",ctaFirefox:"Få for Firefox",free:"Gratis",openSource:"Åpen kildekode",priv:"Privat",languages:"Språk",alsoAvailable:"Også tilgjengelig",getStarted:"Kom i gang",supportedAI:"Støttet AI"},
  fi:{heroTitle:"Järjestä tekoälykeskustelusi",ctaChrome:"Lisää Chromeen",ctaFirefox:"Hanki Firefoxille",free:"Ilmainen",openSource:"Avoin lähdekoodi",priv:"Yksityinen",languages:"Kielet",alsoAvailable:"Saatavilla myös",getStarted:"Aloita",supportedAI:"Tuetut tekoälyt"},
  el:{heroTitle:"Οργανώστε τις συνομιλίες AI σας",ctaChrome:"Προσθήκη στο Chrome",ctaFirefox:"Λήψη για Firefox",free:"Δωρεάν",openSource:"Ανοιχτού κώδικα",priv:"Ιδιωτικό",languages:"Γλώσσες",alsoAvailable:"Επίσης διαθέσιμο",getStarted:"Ξεκινήστε",supportedAI:"Υποστηριζόμενα AI"},
  ro:{heroTitle:"Organizează-ți conversațiile cu AI",ctaChrome:"Adaugă în Chrome",ctaFirefox:"Obține pentru Firefox",free:"Gratuit",openSource:"Sursă deschisă",priv:"Privat",languages:"Limbi",alsoAvailable:"Disponibil și",getStarted:"Începe",supportedAI:"AI acceptate"},
  hu:{heroTitle:"Rendszerezd az AI-beszélgetéseidet",ctaChrome:"Hozzáadás a Chrome-hoz",ctaFirefox:"Letöltés Firefoxhoz",free:"Ingyenes",openSource:"Nyílt forráskód",priv:"Privát",languages:"Nyelvek",alsoAvailable:"Szintén elérhető",getStarted:"Kezdés",supportedAI:"Támogatott AI-k"},
  hr:{heroTitle:"Organizirajte svoje AI razgovore",ctaChrome:"Dodaj u Chrome",ctaFirefox:"Preuzmi za Firefox",free:"Besplatno",openSource:"Otvoreni kod",priv:"Privatno",languages:"Jezici",alsoAvailable:"Također dostupno",getStarted:"Započni",supportedAI:"Podržani AI"},
  sr:{heroTitle:"Организујте своје AI разговоре",ctaChrome:"Додај у Chrome",ctaFirefox:"Преузми за Firefox",free:"Бесплатно",openSource:"Отворени код",priv:"Приватно",languages:"Језици",alsoAvailable:"Такође доступно",getStarted:"Започни",supportedAI:"Подржани AI"},
  bg:{heroTitle:"Организирайте своите AI разговори",ctaChrome:"Добавяне в Chrome",ctaFirefox:"Изтегли за Firefox",free:"Безплатно",openSource:"Отворен код",priv:"Поверително",languages:"Езици",alsoAvailable:"Също налично",getStarted:"Започни",supportedAI:"Поддържани ИИ"},
  sl:{heroTitle:"Organizirajte svoje pogovore z AI",ctaChrome:"Dodaj v Chrome",ctaFirefox:"Prenesi za Firefox",free:"Brezplačno",openSource:"Odprta koda",priv:"Zasebno",languages:"Jeziki",alsoAvailable:"Na voljo tudi",getStarted:"Začni",supportedAI:"Podprti AI"},
  lt:{heroTitle:"Tvarkykite savo AI pokalbius",ctaChrome:"Pridėti prie Chrome",ctaFirefox:"Gauti „Firefox“",free:"Nemokama",openSource:"Atvirasis kodas",priv:"Privatu",languages:"Kalbos",alsoAvailable:"Taip pat prieinama",getStarted:"Pradėti",supportedAI:"Palaikomi AI"},
  lv:{heroTitle:"Sakārtojiet savas AI sarunas",ctaChrome:"Pievienot pārlūkam Chrome",ctaFirefox:"Iegūt pārlūkam Firefox",free:"Bezmaksas",openSource:"Atvērtais kods",priv:"Privāti",languages:"Valodas",alsoAvailable:"Pieejams arī",getStarted:"Sākt",supportedAI:"Atbalstītie AI"},
  et:{heroTitle:"Korrasta oma AI-vestlused",ctaChrome:"Lisa Chrome'i",ctaFirefox:"Hangi Firefoxile",free:"Tasuta",openSource:"Avatud lähtekood",priv:"Privaatne",languages:"Keeled",alsoAvailable:"Samuti saadaval",getStarted:"Alusta",supportedAI:"Toetatud AI-d"},
  ca:{heroTitle:"Organitza les teves converses amb IA",ctaChrome:"Afegeix a Chrome",ctaFirefox:"Obtén per a Firefox",free:"Gratis",openSource:"Codi obert",priv:"Privat",languages:"Idiomes",alsoAvailable:"També disponible",getStarted:"Comença",supportedAI:"IA compatibles"},
  id:{heroTitle:"Atur percakapan AI Anda",ctaChrome:"Tambahkan ke Chrome",ctaFirefox:"Dapatkan untuk Firefox",free:"Gratis",openSource:"Sumber terbuka",priv:"Privat",languages:"Bahasa",alsoAvailable:"Juga tersedia",getStarted:"Mulai",supportedAI:"AI yang didukung"},
  ms:{heroTitle:"Susun perbualan AI anda",ctaChrome:"Tambah ke Chrome",ctaFirefox:"Dapatkan untuk Firefox",free:"Percuma",openSource:"Sumber terbuka",priv:"Persendirian",languages:"Bahasa",alsoAvailable:"Juga tersedia",getStarted:"Mula",supportedAI:"AI disokong"},
  vi:{heroTitle:"Sắp xếp các cuộc trò chuyện AI của bạn",ctaChrome:"Thêm vào Chrome",ctaFirefox:"Tải cho Firefox",free:"Miễn phí",openSource:"Mã nguồn mở",priv:"Riêng tư",languages:"Ngôn ngữ",alsoAvailable:"Cũng có sẵn",getStarted:"Bắt đầu",supportedAI:"AI được hỗ trợ"},
  th:{heroTitle:"จัดระเบียบบทสนทนา AI ของคุณ",ctaChrome:"เพิ่มไปยัง Chrome",ctaFirefox:"ดาวน์โหลดสำหรับ Firefox",free:"ฟรี",openSource:"โอเพนซอร์ส",priv:"เป็นส่วนตัว",languages:"ภาษา",alsoAvailable:"มีให้บริการเช่นกัน",getStarted:"เริ่มต้น",supportedAI:"AI ที่รองรับ"},
  hi:{heroTitle:"अपनी AI बातचीत व्यवस्थित करें",ctaChrome:"Chrome में जोड़ें",ctaFirefox:"Firefox के लिए पाएं",free:"मुफ़्त",openSource:"ओपन सोर्स",priv:"निजी",languages:"भाषाएं",alsoAvailable:"यह भी उपलब्ध",getStarted:"शुरू करें",supportedAI:"समर्थित AI"},
  bn:{heroTitle:"আপনার এআই কথোপকথন গুছিয়ে রাখুন",ctaChrome:"Chrome-এ যোগ করুন",ctaFirefox:"Firefox-এর জন্য নিন",free:"ফ্রি",openSource:"ওপেন সোর্স",priv:"ব্যক্তিগত",languages:"ভাষা",alsoAvailable:"এটিও উপলব্ধ",getStarted:"শুরু করুন",supportedAI:"সমর্থিত এআই"},
  sw:{heroTitle:"Panga mazungumzo yako ya AI",ctaChrome:"Ongeza kwenye Chrome",ctaFirefox:"Pata kwa Firefox",free:"Bila malipo",openSource:"Chanzo huria",priv:"Faragha",languages:"Lugha",alsoAvailable:"Inapatikana pia",getStarted:"Anza",supportedAI:"AI zinazotumika"},
  tl:{heroTitle:"Ayusin ang iyong mga usapan sa AI",ctaChrome:"Idagdag sa Chrome",ctaFirefox:"Kunin para sa Firefox",free:"Libre",openSource:"Open source",priv:"Pribado",languages:"Mga wika",alsoAvailable:"Available din",getStarted:"Magsimula",supportedAI:"Suportadong AI"}
};

// Additional keys (browser word, Local LLM label, prompt-trigger demo) merged in.
(function () {
  const BROWSER = {en:"browser",fr:"navigateur",es:"navegador",de:"Browser",it:"browser",pt_BR:"navegador",pt_PT:"navegador",nl:"browser",pl:"przeglądarka",ru:"браузер",uk:"браузер",cs:"prohlížeč",sk:"prehliadač",ja:"ブラウザ",ko:"브라우저",zh_CN:"浏览器",zh_TW:"瀏覽器",ar:"المتصفح",he:"הדפדפן",tr:"tarayıcı",sv:"webbläsare",da:"browser",nb:"nettleser",fi:"selain",el:"πρόγραμμα περιήγησης",ro:"browser",hu:"böngésző",hr:"preglednik",sr:"прегледач",bg:"браузър",sl:"brskalnik",lt:"naršyklė",lv:"pārlūks",et:"brauser",ca:"navegador",id:"peramban",ms:"pelayar",vi:"trình duyệt",th:"เบราว์เซอร์",hi:"ब्राउज़र",bn:"ব্রাউজার",sw:"kivinjari",tl:"browser"};
  const LOCALLLM = {en:"Local LLM",fr:"LLM local",es:"LLM local",de:"Lokales LLM",it:"LLM locale",pt_BR:"LLM local",pt_PT:"LLM local",nl:"Lokale LLM",pl:"Lokalny LLM",ru:"Локальная LLM",uk:"Локальна LLM",cs:"Lokální LLM",sk:"Lokálne LLM",ja:"ローカルLLM",ko:"로컬 LLM",zh_CN:"本地 LLM",zh_TW:"本機 LLM",ar:"نموذج محلي",he:"LLM מקומי",tr:"Yerel LLM",sv:"Lokal LLM",da:"Lokal LLM",nb:"Lokal LLM",fi:"Paikallinen LLM",el:"Τοπικό LLM",ro:"LLM local",hu:"Helyi LLM",hr:"Lokalni LLM",sr:"Локални LLM",bg:"Локален LLM",sl:"Lokalni LLM",lt:"Vietinis LLM",lv:"Lokāls LLM",et:"Kohalik LLM",ca:"LLM local",id:"LLM lokal",ms:"LLM tempatan",vi:"LLM cục bộ",th:"LLM ในเครื่อง",hi:"लोकल LLM",bn:"লোকাল LLM",sw:"LLM ya Ndani",tl:"Lokal na LLM"};
  const DEMONAME = {en:"Code Reviewer",fr:"Relecteur de code",es:"Revisor de código",de:"Code-Reviewer",it:"Revisore di codice",pt_BR:"Revisor de código",pt_PT:"Revisor de código",nl:"Code-reviewer",pl:"Recenzent kodu",ru:"Ревью кода",uk:"Рев’ю коду",cs:"Revize kódu",sk:"Revízia kódu",ja:"コードレビュー",ko:"코드 리뷰어",zh_CN:"代码审查",zh_TW:"程式碼審查",ar:"مُراجِع الكود",he:"בודק קוד",tr:"Kod İnceleyici",sv:"Kodgranskare",da:"Kodegennemgang",nb:"Kodegjennomgang",fi:"Koodikatselmoija",el:"Έλεγχος κώδικα",ro:"Recenzent de cod",hu:"Kódellenőr",hr:"Pregled koda",sr:"Преглед кода",bg:"Преглед на код",sl:"Pregled kode",lt:"Kodo recenzentas",lv:"Koda recenzents",et:"Koodi ülevaataja",ca:"Revisor de codi",id:"Peninjau Kode",ms:"Penyemak Kod",vi:"Người duyệt mã",th:"ผู้ตรวจโค้ด",hi:"कोड समीक्षक",bn:"কোড রিভিউয়ার",sw:"Mkaguzi wa Kodi",tl:"Tagasuri ng Code"};
  const DEMOBODY = {en:"Review this code and suggest improvements.",fr:"Relis ce code et propose des améliorations.",es:"Revisa este código y sugiere mejoras.",de:"Überprüfe diesen Code und schlage Verbesserungen vor.",it:"Esamina questo codice e suggerisci miglioramenti.",pt_BR:"Revise este código e sugira melhorias.",pt_PT:"Reveja este código e sugira melhorias.",nl:"Beoordeel deze code en stel verbeteringen voor.",pl:"Przejrzyj ten kod i zaproponuj ulepszenia.",ru:"Проверь этот код и предложи улучшения.",uk:"Перевір цей код і запропонуй покращення.",cs:"Zkontroluj tento kód a navrhni vylepšení.",sk:"Skontroluj tento kód a navrhni vylepšenia.",ja:"このコードをレビューして改善案を提案してください。",ko:"이 코드를 검토하고 개선점을 제안해 주세요.",zh_CN:"审查这段代码并提出改进建议。",zh_TW:"審查這段程式碼並提出改進建議。",ar:"راجِع هذا الكود واقترح تحسينات.",he:"בדוק את הקוד הזה והצע שיפורים.",tr:"Bu kodu incele ve iyileştirmeler öner.",sv:"Granska den här koden och föreslå förbättringar.",da:"Gennemgå denne kode og foreslå forbedringer.",nb:"Gå gjennom denne koden og foreslå forbedringer.",fi:"Tarkista tämä koodi ja ehdota parannuksia.",el:"Έλεγξε αυτόν τον κώδικα και πρότεινε βελτιώσεις.",ro:"Revizuiește acest cod și sugerează îmbunătățiri.",hu:"Nézd át ezt a kódot, és javasolj fejlesztéseket.",hr:"Pregledaj ovaj kôd i predloži poboljšanja.",sr:"Прегледај овај кôд и предложи побољшања.",bg:"Прегледай този код и предложи подобрения.",sl:"Preglej to kodo in predlagaj izboljšave.",lt:"Peržiūrėk šį kodą ir pasiūlyk patobulinimų.",lv:"Pārskati šo kodu un iesaki uzlabojumus.",et:"Vaata see kood üle ja paku parandusi.",ca:"Revisa aquest codi i suggereix millores.",id:"Tinjau kode ini dan sarankan perbaikan.",ms:"Semak kod ini dan cadangkan penambahbaikan.",vi:"Xem lại đoạn mã này và đề xuất cải tiến.",th:"ตรวจสอบโค้ดนี้และเสนอแนะการปรับปรุง",hi:"इस कोड की समीक्षा करें और सुधार सुझाएं।",bn:"এই কোড পর্যালোচনা করুন এবং উন্নতির পরামর্শ দিন।",sw:"Kagua msimbo huu na pendekeza maboresho.",tl:"Suriin ang code na ito at magmungkahi ng mga pagpapabuti."};
  Object.keys(window.AF_MANUAL).forEach(l => {
    const m = window.AF_MANUAL[l];
    m.browser = BROWSER[l] || BROWSER.en;
    m.localLLM = LOCALLLM[l] || LOCALLLM.en;
    m.demoName = DEMONAME[l] || DEMONAME.en;
    m.demoBody = DEMOBODY[l] || DEMOBODY.en;
  });

  // --- "7 supported AI services" section (heading + body), localized ---
  // Heading: "<n> supported AI services"
  const SVC_TITLE = {en:"7 supported AI services",fr:"7 services d'IA pris en charge",es:"7 servicios de IA compatibles",de:"7 unterstützte KI-Dienste",it:"7 servizi di IA supportati",pt_BR:"7 serviços de IA compatíveis",pt_PT:"7 serviços de IA suportados",nl:"7 ondersteunde AI-diensten",pl:"7 obsługiwanych usług AI",ru:"7 поддерживаемых ИИ-сервисов",uk:"7 підтримуваних сервісів ШІ",cs:"7 podporovaných služeb AI",sk:"7 podporovaných služieb AI",ja:"対応する7つのAIサービス",ko:"지원되는 7가지 AI 서비스",zh_CN:"支持 7 种 AI 服务",zh_TW:"支援 7 種 AI 服務",ar:"7 خدمات ذكاء اصطناعي مدعومة",he:"7 שירותי AI נתמכים",tr:"Desteklenen 7 yapay zekâ hizmeti",sv:"7 AI-tjänster som stöds",da:"7 understøttede AI-tjenester",nb:"7 støttede AI-tjenester",fi:"7 tuettua tekoälypalvelua",el:"7 υποστηριζόμενες υπηρεσίες AI",ro:"7 servicii AI acceptate",hu:"7 támogatott MI-szolgáltatás",hr:"7 podržanih AI usluga",sr:"7 подржаних AI услуга",bg:"7 поддържани ИИ услуги",sl:"7 podprtih storitev AI",lt:"7 palaikomos DI paslaugos",lv:"7 atbalstīti AI pakalpojumi",et:"7 toetatud AI-teenust",ca:"7 serveis d'IA compatibles",id:"7 layanan AI yang didukung",ms:"7 perkhidmatan AI disokong",vi:"7 dịch vụ AI được hỗ trợ",th:"รองรับบริการ AI 7 รายการ",hi:"7 समर्थित AI सेवाएं",bn:"7টি সমর্থিত এআই পরিষেবা",sw:"Huduma 7 za AI zinazotumika",tl:"7 suportadong AI services"};
  // connective "and"
  const AND = {en:"and",fr:"et",es:"y",de:"und",it:"e",pt_BR:"e",pt_PT:"e",nl:"en",pl:"oraz",ru:"и",uk:"та",cs:"a",sk:"a",ja:"、",ko:"및",zh_CN:"以及",zh_TW:"以及",ar:"و",he:"וגם",tr:"ve",sv:"och",da:"og",nb:"og",fi:"ja",el:"και",ro:"și",hu:"és",hr:"i",sr:"и",bg:"и",sl:"in",lt:"ir",lv:"un",et:"ja",ca:"i",id:"dan",ms:"dan",vi:"và",th:"และ",hi:"और",bn:"এবং",sw:"na",tl:"at"};
  // sentence after the service list
  const SVC_TAIL = {en:"Conversations from different services can share the same folder, each tagged with its service's color and logo so you always know where it came from.",fr:"Les conversations de différents services peuvent partager le même dossier, chacune marquée par la couleur et le logo de son service pour toujours savoir d'où elle vient.",es:"Las conversaciones de distintos servicios pueden compartir la misma carpeta, cada una con el color y el logotipo de su servicio para que siempre sepas de dónde viene.",de:"Unterhaltungen aus verschiedenen Diensten können denselben Ordner teilen – jede mit Farbe und Logo ihres Dienstes, damit du immer weißt, woher sie stammt.",it:"Le conversazioni di servizi diversi possono condividere la stessa cartella, ognuna contrassegnata dal colore e dal logo del proprio servizio, così sai sempre da dove proviene.",pt_BR:"Conversas de serviços diferentes podem compartilhar a mesma pasta, cada uma marcada com a cor e o logotipo do seu serviço para você sempre saber de onde veio.",pt_PT:"As conversas de serviços diferentes podem partilhar a mesma pasta, cada uma marcada com a cor e o logótipo do seu serviço para saber sempre de onde veio.",nl:"Gesprekken van verschillende diensten kunnen dezelfde map delen, elk met de kleur en het logo van zijn dienst, zodat je altijd weet waar het vandaan komt.",pl:"Rozmowy z różnych usług mogą być w tym samym folderze, każda oznaczona kolorem i logo swojej usługi, więc zawsze wiesz, skąd pochodzi.",ru:"Беседы из разных сервисов могут храниться в одной папке — каждая с цветом и логотипом своего сервиса, чтобы вы всегда знали их источник.",uk:"Розмови з різних сервісів можуть зберігатися в одній теці — кожна з кольором і логотипом свого сервісу, щоб ви завжди знали джерело.",cs:"Konverzace z různých služeb mohou sdílet stejnou složku, každá označená barvou a logem své služby, takže vždy víte, odkud pochází.",sk:"Konverzácie z rôznych služieb môžu zdieľať rovnaký priečinok, každá označená farbou a logom svojej služby, takže vždy viete, odkiaľ pochádza.",ja:"異なるサービスの会話を同じフォルダにまとめられます。各チャットにはサービスの色とロゴが付くので、出どころが一目でわかります。",ko:"서로 다른 서비스의 대화를 같은 폴더에 담을 수 있으며, 각 대화에 서비스의 색상과 로고가 표시되어 출처를 한눈에 알 수 있습니다.",zh_CN:"来自不同服务的对话可以放在同一个文件夹中，每条对话都标有所属服务的颜色和图标，让你随时知道它的来源。",zh_TW:"來自不同服務的對話可以放在同一個資料夾中，每則對話都標有所屬服務的顏色和圖示，讓你隨時知道它的來源。",ar:"يمكن أن تتشارك المحادثات من خدمات مختلفة المجلد نفسه، وكل محادثة تحمل لون وشعار خدمتها لتعرف دائمًا مصدرها.",he:"שיחות משירותים שונים יכולות לחלוק את אותה תיקייה, כל אחת מסומנת בצבע ובלוגו של השירות שלה כדי שתמיד תדעו מהיכן הגיעה.",tr:"Farklı hizmetlerdeki sohbetler aynı klasörü paylaşabilir; her biri kendi hizmetinin rengi ve logosuyla işaretlenir, böylece nereden geldiğini hep bilirsiniz.",sv:"Konversationer från olika tjänster kan dela samma mapp, var och en märkt med sin tjänsts färg och logotyp så att du alltid vet varifrån den kom.",da:"Samtaler fra forskellige tjenester kan dele samme mappe, hver mærket med sin tjenestes farve og logo, så du altid ved, hvor den kom fra.",nb:"Samtaler fra ulike tjenester kan dele samme mappe, hver merket med tjenestens farge og logo, så du alltid vet hvor den kom fra.",fi:"Eri palveluiden keskustelut voivat olla samassa kansiossa, ja jokainen on merkitty palvelunsa värillä ja logolla, joten tiedät aina mistä se on peräisin.",el:"Συνομιλίες από διαφορετικές υπηρεσίες μπορούν να μοιράζονται τον ίδιο φάκελο, καθεμία με το χρώμα και το λογότυπο της υπηρεσίας της ώστε να ξέρετε πάντα την προέλευσή της.",ro:"Conversațiile din servicii diferite pot împărți același dosar, fiecare marcată cu culoarea și logoul serviciului său, ca să știi mereu de unde provine.",hu:"A különböző szolgáltatások beszélgetései ugyanabban a mappában lehetnek, mindegyik a szolgáltatása színével és logójával jelölve, így mindig tudod, honnan származik.",hr:"Razgovori iz različitih usluga mogu dijeliti istu mapu, svaki označen bojom i logotipom svoje usluge da uvijek znate odakle dolazi.",sr:"Разговори из различитих услуга могу делити исту фасциклу, сваки означен бојом и логотипом своје услуге да увек знате одакле потиче.",bg:"Разговорите от различни услуги могат да са в една папка, всеки маркиран с цвета и логото на услугата си, за да знаете винаги откъде идва.",sl:"Pogovori iz različnih storitev so lahko v isti mapi, vsak označen z barvo in logotipom svoje storitve, da vedno veste, od kod prihaja.",lt:"Skirtingų paslaugų pokalbiai gali būti tame pačiame aplanke, kiekvienas pažymėtas savo paslaugos spalva ir logotipu, kad visada žinotumėte šaltinį.",lv:"Dažādu pakalpojumu sarunas var atrasties vienā mapē, katra atzīmēta ar sava pakalpojuma krāsu un logotipu, lai vienmēr zinātu izcelsmi.",et:"Eri teenuste vestlused võivad olla samas kaustas, igaüks märgistatud oma teenuse värvi ja logoga, et alati teaksid, kust see pärineb.",ca:"Les converses de diferents serveis poden compartir la mateixa carpeta, cadascuna marcada amb el color i el logotip del seu servei perquè sempre sàpigues d'on ve.",id:"Percakapan dari layanan berbeda bisa berbagi folder yang sama, masing-masing ditandai warna dan logo layanannya agar Anda selalu tahu asalnya.",ms:"Perbualan daripada perkhidmatan berbeza boleh berkongsi folder yang sama, setiap satu ditanda dengan warna dan logo perkhidmatannya supaya anda sentiasa tahu asalnya.",vi:"Các cuộc trò chuyện từ những dịch vụ khác nhau có thể nằm chung một thư mục, mỗi cuộc được gắn màu và logo của dịch vụ để bạn luôn biết nguồn gốc.",th:"บทสนทนาจากบริการต่าง ๆ สามารถอยู่ในโฟลเดอร์เดียวกันได้ โดยแต่ละรายการจะมีสีและโลโก้ของบริการกำกับไว้ ให้คุณรู้ที่มาเสมอ",hi:"अलग-अलग सेवाओं की बातचीत एक ही फ़ोल्डर साझा कर सकती है, हर एक अपनी सेवा के रंग और लोगो के साथ ताकि आपको हमेशा उसका स्रोत पता रहे।",bn:"বিভিন্ন পরিষেবার কথোপকথন একই ফোল্ডারে রাখা যায়, প্রতিটি তার পরিষেবার রঙ ও লোগো দিয়ে চিহ্নিত থাকে যাতে আপনি সবসময় উৎস জানেন।",sw:"Mazungumzo kutoka huduma tofauti yanaweza kushiriki folda moja, kila moja likiwa na rangi na nembo ya huduma yake ili ujue chanzo chake kila wakati.",tl:"Ang mga usapan mula sa iba't ibang serbisyo ay maaaring magkasama sa iisang folder, bawat isa ay may kulay at logo ng serbisyo nito para alam mo agad ang pinagmulan."};

  // Latin service names stay as proper nouns in every locale
  const SVC_NAMES = ["ChatGPT", "Claude", "Gemini", "Copilot", "DeepSeek", "Perplexity"];

  // Compression feature — authored translations using "your browser's native storage"
  const COMPRESSION = {
    en:"Automatically compresses your data (LZString) to maximize your browser's native storage and save hundreds of conversations.",
    fr:"Compresse automatiquement vos données (LZString) pour maximiser le stockage natif de votre navigateur et sauvegarder des centaines de conversations.",
    es:"Comprime automáticamente tus datos (LZString) para maximizar el almacenamiento nativo de tu navegador y guardar cientos de conversaciones.",
    de:"Komprimiert Ihre Daten automatisch (LZString), um den nativen Speicher Ihres Browsers optimal zu nutzen und Hunderte von Unterhaltungen zu speichern.",
    it:"Comprime automaticamente i tuoi dati (LZString) per massimizzare l'archiviazione nativa del tuo browser e salvare centinaia di conversazioni.",
    pt_BR:"Comprime automaticamente seus dados (LZString) para maximizar o armazenamento nativo do seu navegador e salvar centenas de conversas.",
    pt_PT:"Comprime automaticamente os seus dados (LZString) para maximizar o armazenamento nativo do seu navegador e guardar centenas de conversas.",
    nl:"Comprimeert je gegevens automatisch (LZString) om de native opslag van je browser optimaal te benutten en honderden gesprekken te bewaren.",
    pl:"Automatycznie kompresuje Twoje dane (LZString), aby maksymalnie wykorzystać natywną pamięć Twojej przeglądarki i zapisać setki rozmów.",
    ru:"Автоматически сжимает ваши данные (LZString), чтобы максимально использовать встроенное хранилище вашего браузера и сохранять сотни бесед.",
    uk:"Автоматично стискає ваші дані (LZString), щоб максимально використати вбудоване сховище вашого браузера й зберігати сотні розмов.",
    cs:"Automaticky komprimuje vaše data (LZString), aby maximálně využila nativní úložiště vašeho prohlížeče a uložila stovky konverzací.",
    sk:"Automaticky komprimuje vaše dáta (LZString), aby maximálne využila natívne úložisko vášho prehliadača a uložila stovky konverzácií.",
    ja:"データを自動的に圧縮（LZString）して、お使いのブラウザのネイティブストレージを最大限に活用し、数百件の会話を保存できます。",
    ko:"데이터를 자동으로 압축(LZString)하여 사용 중인 브라우저의 기본 저장 공간을 최대한 활용하고 수백 개의 대화를 저장합니다.",
    zh_CN:"自动压缩你的数据（LZString），最大化利用你浏览器的原生存储空间，保存数百个对话。",
    zh_TW:"自動壓縮你的資料（LZString），最大化利用你瀏覽器的原生儲存空間，保存數百個對話。",
    ar:"يضغط بياناتك تلقائياً (LZString) لتحقيق أقصى استفادة من التخزين الأصلي في متصفحك وحفظ مئات المحادثات.",
    he:"דוחס אוטומטית את הנתונים שלך (LZString) כדי לנצל את האחסון המובנה של הדפדפן שלך ולשמור מאות שיחות.",
    tr:"Verilerinizi otomatik olarak sıkıştırır (LZString) ve tarayıcınızın yerel depolamasını en üst düzeye çıkararak yüzlerce sohbeti kaydeder.",
    sv:"Komprimerar automatiskt dina data (LZString) för att maximera din webbläsares inbyggda lagring och spara hundratals konversationer.",
    da:"Komprimerer automatisk dine data (LZString) for at maksimere din browsers indbyggede lager og gemme hundredvis af samtaler.",
    nb:"Komprimerer automatisk dataene dine (LZString) for å maksimere nettleserens innebygde lagring og lagre hundrevis av samtaler.",
    fi:"Pakkaa tietosi automaattisesti (LZString) hyödyntääkseen selaimesi natiivin tallennustilan ja tallentaakseen satoja keskusteluja.",
    el:"Συμπιέζει αυτόματα τα δεδομένα σας (LZString) για να αξιοποιήσει στο έπακρο τον εγγενή χώρο αποθήκευσης του προγράμματος περιήγησής σας και να αποθηκεύσει εκατοντάδες συνομιλίες.",
    ro:"Comprimă automat datele tale (LZString) pentru a maximiza stocarea nativă a browserului tău și a salva sute de conversații.",
    hu:"Automatikusan tömöríti az adataidat (LZString), hogy a böngésződ natív tárhelyét maximálisan kihasználja, és több száz beszélgetést mentsen.",
    hr:"Automatski komprimira vaše podatke (LZString) kako bi maksimalno iskoristio izvornu pohranu vašeg preglednika i spremio stotine razgovora.",
    sr:"Аутоматски компресује ваше податке (LZString) како би максимално искористио изворну меморију вашег прегледача и сачувао стотине разговора.",
    bg:"Автоматично компресира данните ви (LZString), за да оползотвори максимално вградената памет на браузъра ви и да запази стотици разговори.",
    sl:"Samodejno stisne vaše podatke (LZString), da kar najbolje izkoristi izvorno shrambo vašega brskalnika in shrani stotine pogovorov.",
    lt:"Automatiškai suspaudžia jūsų duomenis (LZString), kad maksimaliai išnaudotų vietinę jūsų naršyklės saugyklą ir išsaugotų šimtus pokalbių.",
    lv:"Automātiski saspiež jūsu datus (LZString), lai maksimāli izmantotu jūsu pārlūka vietējo krātuvi un saglabātu simtiem sarunu.",
    et:"Tihendab teie andmeid automaatselt (LZString), et kasutada maksimaalselt teie brauseri kohalikku salvestusruumi ja salvestada sadu vestlusi.",
    ca:"Comprimeix automàticament les teves dades (LZString) per maximitzar l'emmagatzematge natiu del teu navegador i desar centenars de converses.",
    id:"Mengompres data Anda secara otomatis (LZString) untuk memaksimalkan penyimpanan native peramban Anda dan menyimpan ratusan percakapan.",
    ms:"Memampatkan data anda secara automatik (LZString) untuk memaksimumkan storan asli pelayar anda dan menyimpan ratusan perbualan.",
    vi:"Tự động nén dữ liệu của bạn (LZString) để tận dụng tối đa bộ nhớ gốc của trình duyệt và lưu hàng trăm cuộc trò chuyện.",
    th:"บีบอัดข้อมูลของคุณโดยอัตโนมัติ (LZString) เพื่อใช้พื้นที่จัดเก็บในเบราว์เซอร์ของคุณให้คุ้มค่าที่สุด และบันทึกบทสนทนาได้หลายร้อยรายการ",
    hi:"आपके डेटा को स्वचालित रूप से संपीड़ित करता है (LZString) ताकि आपके ब्राउज़र के मूल संग्रहण का अधिकतम उपयोग हो और सैकड़ों बातचीत सहेजी जा सकें।",
    bn:"আপনার ডেটা স্বয়ংক্রিয়ভাবে সংকুচিত করে (LZString) যাতে আপনার ব্রাউজারের নেটিভ স্টোরেজ সর্বাধিক ব্যবহার করা যায় এবং শত শত কথোপকথন সংরক্ষণ করা যায়।",
    sw:"Hubana data yako kiotomatiki (LZString) ili kuongeza matumizi ya hifadhi asilia ya kivinjari chako na kuhifadhi mazungumzo mamia.",
    tl:"Awtomatikong kino-compress ang iyong data (LZString) para mapakinabangan nang husto ang native storage ng iyong browser at makapag-save ng daan-daang usapan."
  };

  Object.keys(window.AF_MANUAL).forEach(l => {
    window.AF_MANUAL[l].compressionBody = COMPRESSION[l] || COMPRESSION.en;
  });
  Object.keys(window.AF_MANUAL).forEach(l => {
    const m = window.AF_MANUAL[l];
    m.servicesTitle = SVC_TITLE[l] || SVC_TITLE.en;
    const and = AND[l] || AND.en;
    const tail = SVC_TAIL[l] || SVC_TAIL.en;
    const ll = m.localLLM || LOCALLLM.en;
    const cjkComma = (l === "ja" || l === "zh_CN" || l === "zh_TW");
    const sep = cjkComma ? "、" : ", ";
    const list = SVC_NAMES.join(sep);
    // CJK list grammar just continues with 、 (no separate "and" word);
    // other languages get "… and Local LLM" with no comma before the connective.
    if (cjkComma) {
      m.servicesBody = list + sep + ll + "。" + tail;
    } else {
      m.servicesBody = list + " " + and + " " + ll + ". " + tail;
    }
  });
})();
