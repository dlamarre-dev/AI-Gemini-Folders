"""
generate_af_promos.py
Generates Marketing/ai-folders/Promo<XX>.txt for all 42 non-English languages
by transforming the corresponding Gemini Folders promo file.

Run: python generate_af_promos.py
"""
import json, os, re

GF_PROMO_DIR  = "Marketing"
AF_PROMO_DIR  = "Marketing/ai-folders"
AF_LOCALES    = "extensions/ai-folders/_locales"
GF_LOCALES    = "extensions/gemini-folders/_locales"

# Map promo filename suffix → locale id used in _locales/
PROMO_FILES = {
    "FR":    "fr",   "DE":    "de",   "ES":    "es",   "IT":    "it",
    "PT_BR": "pt_BR","PT_PT": "pt_PT","PL":    "pl",   "RU":    "ru",
    "CN":    "zh_CN","JA":    "ja",   "KO":    "ko",   "HI":    "hi",
    "RO":    "ro",   "CS":    "cs",   "SK":    "sk",   "TR":    "tr",
    "ID":    "id",   "ZH_TW": "zh_TW","VI":    "vi",   "BN":    "bn",
    "NL":    "nl",   "SW":    "sw",   "TL":    "tl",   "TH":    "th",
    "AR":    "ar",   "HU":    "hu",   "NB":    "nb",   "SV":    "sv",
    "FI":    "fi",   "CA":    "ca",   "DA":    "da",   "UK":    "uk",
    "EL":    "el",   "HE":    "he",   "ET":    "et",   "LT":    "lt",
    "LV":    "lv",   "MS":    "ms",   "BG":    "bg",   "SL":    "sl",
    "SR":    "sr",   "HR":    "hr",
}

# promoHI.txt uses lowercase prefix
PROMO_LOWERCASE = {"HI"}

# ── Per-language v1.0 release notes ──────────────────────────────────────────
V1_NOTES = {
    "fr":    "Version 1.0 : Première publication ! Organisez vos conversations depuis Gemini, Claude, ChatGPT, Copilot et Perplexity dans des dossiers partagés. Bibliothèque de prompts complète avec injection en un clic, raccourcis de sauvegarde rapide, glisser-déposer, synchronisation mobile, actions groupées, groupes d'onglets et prise en charge de 43 langues. Support des LLM locaux avec URL configurable (localhost et adresses LAN).",
    "de":    "Version 1.0: Erstveröffentlichung! Organisieren Sie Gespräche von Gemini, Claude, ChatGPT, Copilot und Perplexity in gemeinsamen Ordnern. Vollständige Prompt-Bibliothek mit Ein-Klick-Injektion, Schnellspeicher-Shortcuts, Drag & Drop, Mobile-Sync, Massenaktionen, Tab-Gruppen und Unterstützung für 43 Sprachen. Lokaler LLM-Support mit konfigurierbarer URL (localhost und LAN-Adressen).",
    "es":    "Versión 1.0: ¡Publicación inicial! Organiza conversaciones de Gemini, Claude, ChatGPT, Copilot y Perplexity en carpetas compartidas. Biblioteca de prompts completa con inyección en un clic, atajos de guardado rápido, arrastrar y soltar, sincronización móvil, acciones en masa, grupos de pestañas y soporte para 43 idiomas. Compatibilidad con LLM locales con URL configurable (localhost y direcciones LAN).",
    "it":    "Versione 1.0: Prima pubblicazione! Organizza conversazioni da Gemini, Claude, ChatGPT, Copilot e Perplexity in cartelle condivise. Libreria prompt completa con iniezione in un clic, scorciatoie di salvataggio rapido, drag & drop, sincronizzazione mobile, azioni in blocco, gruppi di schede e supporto per 43 lingue. Supporto LLM locale con URL configurabile (localhost e indirizzi LAN).",
    "pt_BR": "Versão 1.0: Lançamento inicial! Organize conversas do Gemini, Claude, ChatGPT, Copilot e Perplexity em pastas compartilhadas. Biblioteca de prompts completa com injeção em um clique, atalhos de salvamento rápido, arrastar e soltar, sincronização mobile, ações em massa, grupos de abas e suporte para 43 idiomas. Suporte a LLM local com URL configurável (localhost e endereços LAN).",
    "pt_PT": "Versão 1.0: Lançamento inicial! Organize conversas do Gemini, Claude, ChatGPT, Copilot e Perplexity em pastas partilhadas. Biblioteca de prompts completa com injeção com um clique, atalhos de gravação rápida, arrastar e largar, sincronização móvel, ações em massa, grupos de separadores e suporte para 43 idiomas. Suporte a LLM local com URL configurável (localhost e endereços LAN).",
    "pl":    "Wersja 1.0: Pierwsze wydanie! Organizuj rozmowy z Gemini, Claude, ChatGPT, Copilot i Perplexity we wspólnych folderach. Pełna biblioteka promptów z wstawianiem jednym kliknięciem, skróty szybkiego zapisu, przeciąganie i upuszczanie, synchronizacja mobilna, akcje zbiorcze, grupy kart i obsługa 43 języków. Obsługa lokalnych LLM z konfigurowalnym URL (localhost i adresy LAN).",
    "ru":    "Версия 1.0: Первый выпуск! Организуйте разговоры из Gemini, Claude, ChatGPT, Copilot и Perplexity в общих папках. Полная библиотека промптов с инъекцией в один клик, горячие клавиши быстрого сохранения, перетаскивание, мобильная синхронизация, групповые действия, группы вкладок и поддержка 43 языков. Поддержка локальных LLM с настраиваемым URL (localhost и LAN-адреса).",
    "zh_CN": "版本 1.0：首次发布！将 Gemini、Claude、ChatGPT、Copilot 和 Perplexity 的对话整理到共享文件夹中。完整的提示词库，支持一键注入、快速保存快捷键、拖放、手机同步、批量操作、标签组，以及 43 种语言支持。支持本地 LLM，可配置 URL（localhost 和局域网地址）。",
    "ja":    "バージョン 1.0: 初回リリース！Gemini、Claude、ChatGPT、Copilot、Perplexity の会話を共有フォルダに整理できます。ワンクリック注入対応の完全なプロンプトライブラリ、クイックセーブショートカット、ドラッグ＆ドロップ、モバイル同期、一括操作、タブグループ、43言語サポート。設定可能なURL（localhostとLANアドレス）でローカルLLMにも対応。",
    "ko":    "버전 1.0: 첫 출시! Gemini, Claude, ChatGPT, Copilot, Perplexity의 대화를 공유 폴더에 정리하세요. 클릭 한 번으로 삽입 가능한 완전한 프롬프트 라이브러리, 빠른 저장 단축키, 드래그 앤 드롭, 모바일 동기화, 일괄 작업, 탭 그룹, 43개 언어 지원. 설정 가능한 URL(localhost 및 LAN 주소)로 로컬 LLM 지원.",
    "hi":    "संस्करण 1.0: पहला रिलीज़! Gemini, Claude, ChatGPT, Copilot और Perplexity की बातचीत को साझा फ़ोल्डर में व्यवस्थित करें। एक-क्लिक इंजेक्शन के साथ पूर्ण प्रॉम्प्ट लाइब्रेरी, त्वरित सेव शॉर्टकट, ड्रैग और ड्रॉप, मोबाइल सिंक, बल्क एक्शन, टैब ग्रुप और 43 भाषाओं का समर्थन। कॉन्फ़िगर करने योग्य URL (localhost और LAN पते) के साथ स्थानीय LLM समर्थन।",
    "ro":    "Versiunea 1.0: Prima lansare! Organizați conversații din Gemini, Claude, ChatGPT, Copilot și Perplexity în dosare partajate. Bibliotecă completă de prompturi cu injectare în un clic, comenzi rapide de salvare, glisare și plasare, sincronizare mobilă, acțiuni în masă, grupuri de file și suport pentru 43 de limbi. Suport LLM local cu URL configurabil (localhost și adrese LAN).",
    "cs":    "Verze 1.0: První vydání! Uspořádejte konverzace z Gemini, Claude, ChatGPT, Copilot a Perplexity do sdílených složek. Kompletní knihovna promptů s vkládáním jedním kliknutím, zkratky rychlého ukládání, přetahování, mobilní synchronizace, hromadné akce, skupiny karet a podpora 43 jazyků. Podpora lokálních LLM s konfigurovatelnou URL (localhost a LAN adresy).",
    "sk":    "Verzia 1.0: Prvé vydanie! Usporiadajte konverzácie z Gemini, Claude, ChatGPT, Copilot a Perplexity do zdieľaných priečinkov. Kompletná knižnica promptov s vkladaním jedným kliknutím, skratky rýchleho ukladania, drag & drop, mobilná synchronizácia, hromadné akcie, skupiny kariet a podpora 43 jazykov. Podpora lokálnych LLM s konfigurovateľnou URL (localhost a LAN adresy).",
    "tr":    "Sürüm 1.0: İlk yayın! Gemini, Claude, ChatGPT, Copilot ve Perplexity sohbetlerini paylaşılan klasörlerde düzenleyin. Tek tıkla ekleme özellikli tam prompt kütüphanesi, hızlı kaydetme kısayolları, sürükle ve bırak, mobil senkronizasyon, toplu işlemler, sekme grupları ve 43 dil desteği. Yapılandırılabilir URL (localhost ve LAN adresleri) ile yerel LLM desteği.",
    "id":    "Versi 1.0: Rilis pertama! Atur percakapan dari Gemini, Claude, ChatGPT, Copilot, dan Perplexity dalam folder bersama. Pustaka prompt lengkap dengan injeksi satu klik, pintasan simpan cepat, drag & drop, sinkronisasi mobile, aksi massal, grup tab, dan dukungan 43 bahasa. Dukungan LLM lokal dengan URL yang dapat dikonfigurasi (localhost dan alamat LAN).",
    "zh_TW": "版本 1.0：首次發布！將 Gemini、Claude、ChatGPT、Copilot 和 Perplexity 的對話整理到共享資料夾中。完整的提示詞庫，支援一鍵插入、快速儲存快捷鍵、拖放、手機同步、批量操作、分頁群組，以及 43 種語言支援。支援本地 LLM，可設定 URL（localhost 和區域網路位址）。",
    "vi":    "Phiên bản 1.0: Ra mắt lần đầu! Tổ chức các cuộc trò chuyện từ Gemini, Claude, ChatGPT, Copilot và Perplexity vào các thư mục chung. Thư viện prompt đầy đủ với chèn một cú nhấp, phím tắt lưu nhanh, kéo và thả, đồng bộ di động, hành động hàng loạt, nhóm tab và hỗ trợ 43 ngôn ngữ. Hỗ trợ LLM cục bộ với URL có thể cấu hình (localhost và địa chỉ LAN).",
    "bn":    "সংস্করণ 1.0: প্রথম প্রকাশ! Gemini, Claude, ChatGPT, Copilot এবং Perplexity এর কথোপকথন শেয়ার ফোল্ডারে সংগঠিত করুন। এক-ক্লিক ইনজেকশন সহ সম্পূর্ণ প্রম্পট লাইব্রেরি, দ্রুত সেভ শর্টকাট, ড্র্যাগ এবং ড্রপ, মোবাইল সিঙ্ক, বাল্ক অ্যাকশন, ট্যাব গ্রুপ এবং 43টি ভাষার সমর্থন।",
    "nl":    "Versie 1.0: Eerste uitgave! Organiseer gesprekken van Gemini, Claude, ChatGPT, Copilot en Perplexity in gedeelde mappen. Volledige promptbibliotheek met één-klik-invoegen, snelopslagsnelkoppelingen, slepen en neerzetten, mobiele synchronisatie, bulkacties, tabgroepen en ondersteuning voor 43 talen. Lokale LLM-ondersteuning met configureerbare URL (localhost en LAN-adressen).",
    "sw":    "Toleo 1.0: Chapisho la kwanza! Panga mazungumzo kutoka Gemini, Claude, ChatGPT, Copilot na Perplexity katika folda zilizoshirikiwa. Maktaba kamili ya maagizo na sindano ya kubonyeza mara moja, njia za mkato za kuhifadhi haraka, buruta na uacha, usawazishaji wa simu, vitendo vya wingi, vikundi vya kichupo na usaidizi wa lugha 43.",
    "tl":    "Bersyon 1.0: Unang inilabas! Ayusin ang mga pag-uusap mula sa Gemini, Claude, ChatGPT, Copilot, at Perplexity sa mga ibinabahaging folder. Kumpletong prompt library na may one-click injection, mga shortcut ng mabilis na pag-save, drag at drop, mobile sync, bulk actions, tab groups, at suporta para sa 43 na wika.",
    "th":    "เวอร์ชัน 1.0: การเปิดตัวครั้งแรก! จัดระเบียบบทสนทนาจาก Gemini, Claude, ChatGPT, Copilot และ Perplexity ในโฟลเดอร์ที่ใช้ร่วมกัน ไลบรารีพรอมต์ครบถ้วนพร้อมการแทรกด้วยคลิกเดียว ทางลัดบันทึกด่วน ลากและวาง ซิงค์มือถือ การดำเนินการจำนวนมาก กลุ่มแท็บ และรองรับ 43 ภาษา",
    "ar":    "الإصدار 1.0: الإصدار الأول! نظّم محادثاتك من Gemini وClaude وChatGPT وCopilot وPerplexity في مجلدات مشتركة. مكتبة متكاملة للإرشادات مع إدراج بنقرة واحدة، اختصارات الحفظ السريع، السحب والإفلات، المزامنة مع الهاتف، الإجراءات الجماعية، مجموعات التبويب، ودعم 43 لغة.",
    "hu":    "1.0-s verzió: Első kiadás! Rendszerezze a Gemini, Claude, ChatGPT, Copilot és Perplexity beszélgetéseit közös mappákban. Teljes prompt-könyvtár egy kattintásos beillesztéssel, gyors mentési parancsikonok, húzás és ejtés, mobilszinkronizáció, tömeges műveletek, lapcsoportok és 43 nyelv támogatása.",
    "nb":    "Versjon 1.0: Første utgivelse! Organiser samtaler fra Gemini, Claude, ChatGPT, Copilot og Perplexity i delte mapper. Fullstendig prompt-bibliotek med ett-klikks injeksjon, hurtiglagringssnarvei, dra og slipp, mobilsynkronisering, massehandlinger, fanegruppper og støtte for 43 språk.",
    "sv":    "Version 1.0: Första utgåvan! Organisera konversationer från Gemini, Claude, ChatGPT, Copilot och Perplexity i delade mappar. Komplett promptbibliotek med ett-klicksinjektion, genvägar för snabbspara, dra och släpp, mobilsynkronisering, massåtgärder, flikgrupper och stöd för 43 språk.",
    "fi":    "Versio 1.0: Ensijulkaisu! Järjestä Geminin, Clauden, ChatGPT:n, Copilotin ja Perplexityn keskustelut jaetuiksi kansioiksi. Täydellinen kehotekirjasto yhdellä napsautuksella, pikaentallenteen pikanäppäimet, vedä ja pudota, mobiilisynkronointi, joukkotoiminnot, välilehtiryhmät ja tuki 43 kielelle.",
    "ca":    "Versió 1.0: Primera publicació! Organitzeu converses de Gemini, Claude, ChatGPT, Copilot i Perplexity en carpetes compartides. Biblioteca de prompts completa amb injecció d'un clic, dreceres de desament ràpid, arrossegar i deixar anar, sincronització mòbil, accions en bloc, grups de pestanyes i suport per a 43 idiomes.",
    "da":    "Version 1.0: Første udgivelse! Organiser samtaler fra Gemini, Claude, ChatGPT, Copilot og Perplexity i delte mapper. Komplet prompt-bibliotek med ét-klik-injektion, genveje til hurtig lagring, træk og slip, mobilsynkronisering, massehandlinger, fanegrupper og understøttelse af 43 sprog.",
    "uk":    "Версія 1.0: Перший випуск! Організуйте розмови з Gemini, Claude, ChatGPT, Copilot і Perplexity у спільних папках. Повна бібліотека підказок із вставленням одним кліком, гарячі клавіші швидкого збереження, перетягування, мобільна синхронізація, групові дії, групи вкладок та підтримка 43 мов.",
    "el":    "Έκδοση 1.0: Πρώτη κυκλοφορία! Οργανώστε συνομιλίες από Gemini, Claude, ChatGPT, Copilot και Perplexity σε κοινόχρηστους φακέλους. Πλήρης βιβλιοθήκη prompt με εισαγωγή ενός κλικ, συντομεύσεις γρήγορης αποθήκευσης, μεταφορά και απόθεση, συγχρονισμός κινητού, μαζικές ενέργειες, ομάδες καρτελών και υποστήριξη 43 γλωσσών.",
    "he":    "גרסה 1.0: פרסום ראשון! ארגן שיחות מ-Gemini, Claude, ChatGPT, Copilot ו-Perplexity בתיקיות משותפות. ספריית הנחיות מלאה עם הוספה בלחיצה אחת, קיצורי שמירה מהירה, גרור ושחרר, סנכרון נייד, פעולות מאסיביות, קבוצות כרטיסיות ותמיכה ב-43 שפות.",
    "et":    "Versioon 1.0: Esimene väljalase! Korraldage Gemini, Claude, ChatGPT, Copilot ja Perplexity vestlused jagatud kaustadesse. Täielik viipade teek ühe klõpsuga lisamisega, kiirsalvestuse otseteed, lohistamine, mobiilsünkroniseerimine, hulgioperatsioonid, vahelehtede rühmad ja tugi 43 keelele.",
    "lt":    "Versija 1.0: Pirmasis leidimas! Tvarkykite pokalbius iš Gemini, Claude, ChatGPT, Copilot ir Perplexity bendrose aplankuose. Pilna raginimų biblioteka su vieno paspaudimo įterpimu, sparčiojo įrašymo spartieji klavišai, vilkimas ir numetimas, mobilioji sinchronizacija, masiniai veiksmai, skirtukų grupės ir palaikymas 43 kalbų.",
    "lv":    "Versija 1.0: Pirmais laidiens! Kārtojiet sarunas no Gemini, Claude, ChatGPT, Copilot un Perplexity koplietotās mapēs. Pilna uzvedņu bibliotēka ar viena klikšķa ievietošanu, ātrās saglabāšanas īsinājumtaustiņi, vilkšana un nomešana, mobilo ierīču sinhronizācija, lielapjoma darbības, ciļņu grupas un atbalsts 43 valodām.",
    "ms":    "Versi 1.0: Keluaran pertama! Susun perbualan dari Gemini, Claude, ChatGPT, Copilot dan Perplexity dalam folder berkongsi. Pustaka arahan lengkap dengan suntikan satu klik, pintasan simpan pantas, seret dan lepas, penyegerakan mudah alih, tindakan pukal, kumpulan tab dan sokongan untuk 43 bahasa.",
    "bg":    "Версия 1.0: Първо издание! Организирайте разговори от Gemini, Claude, ChatGPT, Copilot и Perplexity в споделени папки. Пълна библиотека с подсказки с вмъкване с едно кликване, преки пътища за бързо запазване, плъзгане и пускане, мобилна синхронизация, масови действия, групи раздели и поддръжка на 43 езика.",
    "sl":    "Različica 1.0: Prva izdaja! Organizirajte pogovore iz Gemini, Claude, ChatGPT, Copilot in Perplexity v skupne mape. Popolna knjižnica pozivov z vstavljanjem z enim klikom, bližnjice za hitro shranjevanje, povleci in spusti, mobilna sinhronizacija, množična dejanja, skupine zavihkov in podpora za 43 jezikov.",
    "sr":    "Верзија 1.0: Прво издање! Организујте разговоре из Gemini, Claude, ChatGPT, Copilot и Perplexity у дељене фасцикле. Потпуна библиотека промптова са убацивањем једним кликом, пречице за брзо чување, превлачење и пуштање, мобилна синхронизација, масовне радње, групе картица и подршка за 43 језика.",
    "hr":    "Verzija 1.0: Prvo izdanje! Organizirajte razgovore iz Gemini, Claude, ChatGPT, Copilot i Perplexity u dijeljene mape. Potpuna biblioteka upita s umetanjem jednim klikom, prečaci za brzo spremanje, povuci i ispusti, mobilna sinkronizacija, skupne radnje, grupe kartica i podrška za 43 jezika.",
}

# ── Gem-button bullet replacement (per language) ──────────────────────────────
# Replaces the "💎 Custom Gem Link" bullet with a multi-site new-conv bullet.
GEM_REPLACEMENTS = {
    "fr":    "🔀 Boutons Nouvelle Conversation : Lancez une nouvelle discussion sur ChatGPT, Claude, Copilot, Gemini ou Perplexity directement depuis le Mode Prompts — un bouton par service.",
    "de":    "🔀 Neue-Konversation-Schaltflächen: Starten Sie direkt aus dem Prompt-Modus eine neue Unterhaltung auf ChatGPT, Claude, Copilot, Gemini oder Perplexity — ein Knopf pro Dienst.",
    "es":    "🔀 Botones de Nueva Conversación: Inicia una nueva conversación en ChatGPT, Claude, Copilot, Gemini o Perplexity directamente desde el Modo Prompt — un botón por servicio.",
    "it":    "🔀 Pulsanti Nuova Conversazione: Avvia una nuova conversazione su ChatGPT, Claude, Copilot, Gemini o Perplexity direttamente dalla Modalità Prompt — un pulsante per servizio.",
    "pt_BR": "🔀 Botões de Nova Conversa: Inicie uma nova conversa no ChatGPT, Claude, Copilot, Gemini ou Perplexity diretamente do Modo Prompt — um botão por serviço.",
    "pt_PT": "🔀 Botões de Nova Conversa: Inicie uma nova conversa no ChatGPT, Claude, Copilot, Gemini ou Perplexity diretamente do Modo Prompt — um botão por serviço.",
    "pl":    "🔀 Przyciski Nowej Rozmowy: Rozpocznij nową rozmowę na ChatGPT, Claude, Copilot, Gemini lub Perplexity bezpośrednio z Trybu Promptów — jeden przycisk na serwis.",
    "ru":    "🔀 Кнопки новой беседы: Начните новую беседу на ChatGPT, Claude, Copilot, Gemini или Perplexity прямо из режима промптов — по одной кнопке на сервис.",
    "zh_CN": "🔀 新对话按钮：直接从提示词模式启动 ChatGPT、Claude、Copilot、Gemini 或 Perplexity 的新对话——每个服务一个按钮。",
    "ja":    "🔀 新規会話ボタン：プロンプトモードから直接 ChatGPT、Claude、Copilot、Gemini、または Perplexity の新しい会話を開始できます。サービスごとに1つのボタン。",
    "ko":    "🔀 새 대화 버튼: 프롬프트 모드에서 바로 ChatGPT, Claude, Copilot, Gemini, 또는 Perplexity의 새 대화를 시작하세요 — 서비스당 하나의 버튼.",
    "hi":    "🔀 नई बातचीत बटन: प्रॉम्प्ट मोड से सीधे ChatGPT, Claude, Copilot, Gemini या Perplexity पर नई बातचीत शुरू करें — प्रति सेवा एक बटन।",
    "ro":    "🔀 Butoane Conversație Nouă: Lansați o conversație nouă pe ChatGPT, Claude, Copilot, Gemini sau Perplexity direct din Modul Prompt — un buton per serviciu.",
    "cs":    "🔀 Tlačítka nové konverzace: Spusťte novou konverzaci na ChatGPT, Claude, Copilot, Gemini nebo Perplexity přímo z režimu promptů — jedno tlačítko na službu.",
    "sk":    "🔀 Tlačidlá novej konverzácie: Spustite novú konverzáciu na ChatGPT, Claude, Copilot, Gemini alebo Perplexity priamo z režimu promptov — jedno tlačidlo na službu.",
    "tr":    "🔀 Yeni Konuşma Düğmeleri: Prompt Modundan doğrudan ChatGPT, Claude, Copilot, Gemini veya Perplexity'de yeni bir konuşma başlatın — her hizmet için bir düğme.",
    "id":    "🔀 Tombol Percakapan Baru: Mulai percakapan baru di ChatGPT, Claude, Copilot, Gemini, atau Perplexity langsung dari Mode Prompt — satu tombol per layanan.",
    "zh_TW": "🔀 新對話按鈕：直接從提示詞模式啟動 ChatGPT、Claude、Copilot、Gemini 或 Perplexity 的新對話——每個服務一個按鈕。",
    "vi":    "🔀 Nút Cuộc trò chuyện Mới: Bắt đầu cuộc trò chuyện mới trên ChatGPT, Claude, Copilot, Gemini hoặc Perplexity trực tiếp từ Chế độ Prompt — một nút mỗi dịch vụ.",
    "bn":    "🔀 নতুন কথোপকথন বোতাম: সরাসরি প্রম্পট মোড থেকে ChatGPT, Claude, Copilot, Gemini বা Perplexity-তে নতুন কথোপকথন শুরু করুন।",
    "nl":    "🔀 Knoppen Nieuw Gesprek: Start een nieuw gesprek op ChatGPT, Claude, Copilot, Gemini of Perplexity direct vanuit de Promptmodus — één knop per dienst.",
    "sw":    "🔀 Vitufe vya Mazungumzo Mapya: Anza mazungumzo mapya kwenye ChatGPT, Claude, Copilot, Gemini, au Perplexity moja kwa moja kutoka Hali ya Maagizo.",
    "tl":    "🔀 Mga Pindutan ng Bagong Pag-uusap: Magsimula ng bagong pag-uusap sa ChatGPT, Claude, Copilot, Gemini, o Perplexity nang direkta mula sa Prompt Mode.",
    "th":    "🔀 ปุ่มการสนทนาใหม่: เริ่มการสนทนาใหม่บน ChatGPT, Claude, Copilot, Gemini หรือ Perplexity โดยตรงจากโหมดพรอมต์",
    "ar":    "🔀 أزرار محادثة جديدة: ابدأ محادثة جديدة على ChatGPT أو Claude أو Copilot أو Gemini أو Perplexity مباشرةً من وضع الإرشادات — زر واحد لكل خدمة.",
    "hu":    "🔀 Új Beszélgetés Gombok: Indítson új beszélgetést a ChatGPT-n, Claude-on, Copiloton, Geminin vagy a Perplexityn közvetlenül a Prompt módból — egy gomb szolgáltatásonként.",
    "nb":    "🔀 Ny samtale-knapper: Start en ny samtale på ChatGPT, Claude, Copilot, Gemini eller Perplexity direkte fra Prompt-modus — én knapp per tjeneste.",
    "sv":    "🔀 Knappar för ny konversation: Starta en ny konversation på ChatGPT, Claude, Copilot, Gemini eller Perplexity direkt från Promptläge — en knapp per tjänst.",
    "fi":    "🔀 Uuden keskustelun painikkeet: Aloita uusi keskustelu ChatGPT:ssä, Claudessa, Copilotissa, Geminissä tai Perplexityssä suoraan Kehotetyökalusta — yksi painike palvelua kohden.",
    "ca":    "🔀 Botons de Nova Conversa: Inicieu una nova conversa a ChatGPT, Claude, Copilot, Gemini o Perplexity directament des del Mode Prompt — un botó per servei.",
    "da":    "🔀 Knapper til ny samtale: Start en ny samtale på ChatGPT, Claude, Copilot, Gemini eller Perplexity direkte fra Prompt-tilstand — én knap pr. service.",
    "uk":    "🔀 Кнопки нової розмови: Розпочніть нову розмову на ChatGPT, Claude, Copilot, Gemini або Perplexity безпосередньо з режиму підказок — по одній кнопці на сервіс.",
    "el":    "🔀 Κουμπιά Νέας Συνομιλίας: Ξεκινήστε μια νέα συνομιλία στο ChatGPT, Claude, Copilot, Gemini ή Perplexity απευθείας από τη Λειτουργία Prompt — ένα κουμπί ανά υπηρεσία.",
    "he":    "🔀 כפתורי שיחה חדשה: התחל שיחה חדשה ב-ChatGPT, Claude, Copilot, Gemini או Perplexity ישירות ממצב Prompt — כפתור אחד לכל שירות.",
    "et":    "🔀 Uue vestluse nupud: Alustage uut vestlust ChatGPT-s, Claudes, Copilotis, Geminis või Perplexitys otse viipade režiimist — üks nupp teenuse kohta.",
    "lt":    "🔀 Naujo pokalbio mygtukai: Pradėkite naują pokalbį ChatGPT, Claude, Copilot, Gemini arba Perplexity tiesiogiai iš raginimų režimo — vienas mygtukas kiekvienai paslaugai.",
    "lv":    "🔀 Jaunas sarunas pogas: Sāciet jaunu sarunu ChatGPT, Claude, Copilot, Gemini vai Perplexity tieši no uzvedņu režīma — viena poga katram pakalpojumam.",
    "ms":    "🔀 Butang Perbualan Baru: Mulakan perbualan baru di ChatGPT, Claude, Copilot, Gemini atau Perplexity terus dari Mod Arahan — satu butang setiap perkhidmatan.",
    "bg":    "🔀 Бутони за нов разговор: Стартирайте нов разговор в ChatGPT, Claude, Copilot, Gemini или Perplexity директно от режима на подсказки — един бутон за услуга.",
    "sl":    "🔀 Gumbi za novo pogovor: Začnite nov pogovor na ChatGPT, Claude, Copilot, Gemini ali Perplexity neposredno iz načina pozivov — en gumb za vsako storitev.",
    "sr":    "🔀 Дугмад за нови разговор: Покрените нови разговор на ChatGPT, Claude, Copilot, Gemini или Perplexity директно из режима промптова — по јedno дугме по сервису.",
    "hr":    "🔀 Gumbi za novi razgovor: Pokrenite novi razgovor na ChatGPT, Claude, Copilot, Gemini ili Perplexity izravno iz načina upita — jedan gumb po usluzi.",
}

# ── Gem bullet regex (matches the 💎 bullet across languages) ─────────────────
GEM_BULLET_PATTERN = re.compile(
    r'💎[^\n]+(?:\n(?![\n🔀▶✏️📌☁️📝])[^\n]+)*',
    re.MULTILINE
)

# ── Version history section pattern ──────────────────────────────────────────
VERSION_SECTION_PATTERN = re.compile(
    r'(?:📢\s*(?:UPDATES|MISES À JOUR|AKTUALISIERUNGEN|ACTUALIZACIONES|AGGIORNAMENTI|ATUALIZAÇÕES|ACTUALIZĂRI|'
    r'ACTUALIZACIONES|UPDATES|更新|更新情報|업데이트|अपडेट|ACTUALIZĂRI|AKTUALIZACE|AKTUALIZÁCIE|'
    r'GÜNCELLEMELER|PEMBARUAN|更新日誌|CẬP NHẬT|আপডেট|UPDATES|MASASISHO|MGA UPDATE|อัปเดต|'
    r'التحديثات|FRISSÍTÉSEK|OPPDATERINGER|UPPDATERINGAR|PÄIVITYKSET|ACTUALITZACIONS|OPDATERINGER|'
    r'ОНОВЛЕННЯ|ΕΝΗΜΕΡΏΣΕΙΣ|עדכונים|UUENDUSED|ATNAUJINIMAI|ATJAUNINĀJUMI|KEMAS KINI|АКТУАЛИЗАЦИИ|'
    r'POSODOBITVE|АЖУРИРАЊА|АЖУРИРАЊА|AŽURIRANJA|ОБНОВЛЕНИЯ)[^\n]*\n)([\s\S]*)',
    re.IGNORECASE
)

# ── Multi-site intro paragraph replacements ───────────────────────────────────
# Maps locale → new opening sentence that replaces the GF-centric opening
INTRO_REPLACEMENTS = {
    "fr":    "Vos conversations IA sont éparpillées sur cinq sites différents. Vous retapez toujours les mêmes prompts. Vos meilleures discussions disparaissent dans des historiques sans fin sur Gemini, Claude, ChatGPT, Copilot et Perplexity.\n{af_name} est l'extension qu'il vous faut.",
    "de":    "Ihre KI-Gespräche sind über fünf verschiedene Sites verstreut. Sie tippen immer wieder dieselben Prompts. Ihre besten Chats verschwinden in endlosen Verläufen auf Gemini, Claude, ChatGPT, Copilot und Perplexity.\n{af_name} ist die Erweiterung, die Sie brauchen.",
    "es":    "Tus conversaciones de IA están dispersas en cinco sitios distintos. Sigues reescribiendo los mismos prompts. Tus mejores chats desaparecen en historiales interminables de Gemini, Claude, ChatGPT, Copilot y Perplexity.\n{af_name} es la extensión que necesitas.",
    "it":    "Le tue conversazioni AI sono sparse su cinque siti diversi. Continui a riscrivere gli stessi prompt. Le tue migliori chat scompaiono in cronologie infinite su Gemini, Claude, ChatGPT, Copilot e Perplexity.\n{af_name} è l'estensione di cui hai bisogno.",
    "pt_BR": "Suas conversas de IA estão espalhadas por cinco sites diferentes. Você continua redigitando os mesmos prompts. Seus melhores chats desaparecem em históricos intermináveis no Gemini, Claude, ChatGPT, Copilot e Perplexity.\n{af_name} é a extensão que você precisa.",
    "pt_PT": "As suas conversas de IA estão dispersas por cinco sites diferentes. Continua a redigitar os mesmos prompts. Os seus melhores chats desaparecem em históricos intermináveis no Gemini, Claude, ChatGPT, Copilot e Perplexity.\n{af_name} é a extensão de que precisa.",
    "pl":    "Twoje rozmowy z AI są rozrzucone po pięciu różnych stronach. Ciągle przepisujesz te same prompty. Twoje najlepsze czaty znikają w nieskończonych historiach na Gemini, Claude, ChatGPT, Copilot i Perplexity.\n{af_name} to rozszerzenie, którego potrzebujesz.",
    "ru":    "Ваши беседы с ИИ разбросаны по пяти разным сайтам. Вы снова и снова вводите одни и те же промпты. Лучшие разговоры исчезают в бесконечных историях Gemini, Claude, ChatGPT, Copilot и Perplexity.\n{af_name} — расширение, которое вам нужно.",
    "zh_CN": "您的 AI 对话分散在五个不同的网站上。您一遍又一遍地重新输入相同的提示词。您在 Gemini、Claude、ChatGPT、Copilot 和 Perplexity 上的最佳对话消失在无尽的历史记录中。\n{af_name} 正是您需要的扩展程序。",
    "ja":    "AIとの会話は5つの異なるサイトに散らばっています。同じプロンプトを何度も打ち直しています。Gemini、Claude、ChatGPT、Copilot、Perplexityの最高の会話が無限の履歴の中に消えていきます。\n{af_name}はあなたが必要とする拡張機能です。",
    "ko":    "AI 대화가 다섯 개의 다른 사이트에 흩어져 있습니다. 같은 프롬프트를 반복해서 입력하고 있습니다. Gemini, Claude, ChatGPT, Copilot, Perplexity에서의 최고의 대화가 끝없는 기록 속으로 사라집니다.\n{af_name}이 필요한 확장 프로그램입니다.",
    "hi":    "आपकी AI बातचीत पाँच अलग-अलग साइटों पर बिखरी हुई है। आप बार-बार वही प्रॉम्प्ट टाइप करते रहते हैं। Gemini, Claude, ChatGPT, Copilot और Perplexity पर आपकी सबसे अच्छी बातचीत अनंत इतिहास में खो जाती है।\n{af_name} वह एक्सटेंशन है जिसकी आपको ज़रूरत है।",
}


def load_locale_name(lang, locales_dir):
    path = os.path.join(locales_dir, lang, 'messages.json')
    if not os.path.exists(path):
        return None, None
    with open(path, encoding='utf-8') as f:
        msgs = json.load(f)
    af_name = msgs.get('extName', {}).get('message', 'AI Folders')
    gf_name = None
    gf_path = os.path.join(GF_LOCALES, lang, 'messages.json')
    if os.path.exists(gf_path):
        with open(gf_path, encoding='utf-8') as f:
            gf = json.load(f)
        gf_name = gf.get('extName', {}).get('message', 'Gemini Folders')
    return af_name, gf_name


def transform(text, lang, af_name, gf_name):
    # 1. Replace brand name (case-sensitive, also handle parenthetical)
    if gf_name:
        text = text.replace(gf_name, af_name)
    # Always replace the English brand name fallback
    text = text.replace('Gemini Folders', af_name)

    # 2. Replace intro paragraph with multi-site version
    if lang in INTRO_REPLACEMENTS:
        intro = INTRO_REPLACEMENTS[lang].format(af_name=af_name)
        # Replace up to the second paragraph (the "cockpit" line)
        first_blank = text.find('\n\n')
        if first_blank != -1:
            text = intro + '\n\n' + text[first_blank + 2:]

    # 3. Replace the Gem button bullet with new-conv buttons bullet
    if lang in GEM_REPLACEMENTS:
        new_bullet = GEM_REPLACEMENTS[lang]
        match = GEM_BULLET_PATTERN.search(text)
        if match:
            text = text[:match.start()] + new_bullet + text[match.end():]

    # 4. Replace version history section
    if lang in V1_NOTES:
        # Find the 📢 updates section header and replace everything after it
        match = VERSION_SECTION_PATTERN.search(text)
        if match:
            text = text[:match.start(1)] + match.group(1) + V1_NOTES[lang] + '\n'
        else:
            # Fallback: append version note at the end if section not found
            text = text.rstrip() + '\n\n📢 VERSION:\n' + V1_NOTES[lang] + '\n'

    # 5. Replace gemini.google.com references with multi-site reference
    text = re.sub(
        r'gemini\.google\.com',
        'the supported AI sites (Gemini, Claude, ChatGPT, Copilot, Perplexity)',
        text
    )

    # 6. Replace "Save to Gemini Folders" / equivalent in How-To section
    text = text.replace(f'"Save to {gf_name}"', f'"Save to {af_name}"') if gf_name else text
    text = text.replace('"Save to Gemini Folders"', f'"Save to {af_name}"')

    return text


def main():
    os.makedirs(AF_PROMO_DIR, exist_ok=True)

    generated = 0
    for suffix, lang in sorted(PROMO_FILES.items()):
        # Find the GF promo file
        if suffix in PROMO_LOWERCASE:
            filename = f'promo{suffix}.txt'
        else:
            filename = f'Promo{suffix}.txt'
        gf_path = os.path.join(GF_PROMO_DIR, filename)
        if not os.path.exists(gf_path):
            print(f'  SKIP {lang:6s} — {filename} not found')
            continue

        af_name, gf_name = load_locale_name(lang, AF_LOCALES)
        if af_name is None:
            print(f'  SKIP {lang:6s} — locale not found')
            continue

        with open(gf_path, encoding='utf-8') as f:
            text = f.read()

        text = transform(text, lang, af_name, gf_name)

        out_path = os.path.join(AF_PROMO_DIR, f'Promo{suffix}.txt')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(text)

        print(f'  OK  {lang:6s} → {os.path.basename(out_path)}')
        generated += 1

    print(f'\nDone — {generated} promo files written to {AF_PROMO_DIR}/')


if __name__ == '__main__':
    main()
