"""
generate_af_promos.py
Generates Marketing/ai-folders/Promo<XX>.txt for all 42 non-English languages
by transforming the corresponding Gemini Folders promo file.

Run: python generate_af_promos.py
"""
import json, os, re

GF_PROMO_DIR  = "Marketing/gemini-folders"
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


# ── Per-language v1.1 release notes ──────────────────────────────────────────
V1_1_NOTES = {
    "fr":    "Version 1.1 (Déclenchement de prompt) : Tapez # dans n'importe quel champ de saisie IA pour voir vos prompts filtrés en temps réel. Utilisez ↓/↑ pour naviguer entre les suggestions, Espace pour autocompléter ou injecter — sans jamais ouvrir le panneau. Fonctionne sur tous les services pris en charge, y compris les LLM locaux.",
    "de":    "Version 1.1 (Prompt-Auslöser): Geben Sie # in ein beliebiges KI-Chat-Feld ein, um gespeicherte Prompts in Echtzeit gefiltert zu sehen. Verwenden Sie ↓/↑ zum Navigieren durch Vorschläge, Leertaste zum Autovervollständigen oder Einsetzen — ohne das Panel zu öffnen. Funktioniert für alle unterstützten Dienste einschließlich lokaler LLMs.",
    "es":    "Versión 1.1 (Disparador de prompts): Escribe # en cualquier campo de chat de IA para ver tus prompts filtrados en tiempo real. Usa ↓/↑ para navegar entre sugerencias, Espacio para autocompletar o inyectar — sin abrir jamás el panel. Funciona en todos los servicios compatibles, incluidos los LLM locales.",
    "it":    "Versione 1.1 (Prompt Trigger): Digita # in qualsiasi campo chat AI per vedere i tuoi prompt filtrati in tempo reale. Usa ↓/↑ per navigare tra i suggerimenti, Spazio per autocompletare o iniettare — senza mai aprire il pannello. Funziona su tutti i servizi supportati, inclusi i LLM locali.",
    "pt_BR": "Versão 1.1 (Gatilho de Prompt): Digite # em qualquer campo de chat de IA para ver seus prompts filtrados em tempo real. Use ↓/↑ para navegar entre sugestões, Espaço para autocompletar ou injetar — sem abrir o painel. Funciona em todos os serviços suportados, incluindo LLMs locais.",
    "pt_PT": "Versão 1.1 (Gatilho de Prompt): Escreva # em qualquer campo de chat de IA para ver os seus prompts filtrados em tempo real. Use ↓/↑ para navegar entre sugestões, Espaço para autocompletar ou injetar — sem abrir o painel. Funciona em todos os serviços suportados, incluindo LLMs locais.",
    "pl":    "Wersja 1.1 (Wyzwalacz Promptów): Wpisz # w dowolnym polu czatu AI, aby zobaczyć swoje prompty filtrowane w czasie rzeczywistym. Użyj ↓/↑ do nawigacji między sugestiami, Spacji do autouzupełniania lub wstrzyknięcia — bez otwierania panelu. Działa na wszystkich obsługiwanych serwisach, w tym lokalnych LLM.",
    "ru":    "Версия 1.1 (Триггер промптов): Введите # в любое поле чата ИИ, чтобы увидеть сохранённые промпты с фильтрацией в реальном времени. Используйте ↓/↑ для навигации по подсказкам, пробел для автодополнения или вставки — без открытия панели. Работает на всех поддерживаемых сервисах, включая локальные LLM.",
    "zh_CN": "版本 1.1（提示词触发器）：在任意 AI 聊天框输入 # 即可实时过滤查看已保存的提示词。用 ↓/↑ 浏览建议，空格键自动补全或注入 — 无需打开面板。适用于所有支持的服务，包括本地 LLM。",
    "ja":    "バージョン 1.1（プロンプトトリガー）：任意の AI チャット欄に # を入力すると、保存済みプロンプトがリアルタイムで絞り込まれて表示されます。↓/↑ で候補を選択し、スペースでオートコンプリートまたは挿入 — パネルを開かずに利用できます。ローカル LLM を含む全対応サービスで動作します。",
    "ko":    "버전 1.1 (프롬프트 트리거): AI 채팅 필드에 #을 입력하면 저장된 프롬프트가 실시간으로 필터링됩니다. ↓/↑로 제안 사항을 탐색하고, 스페이스로 자동 완성 또는 주입 — 패널을 열지 않아도 됩니다. 로컬 LLM을 포함한 모든 지원 서비스에서 작동합니다.",
    "hi":    "संस्करण 1.1 (प्रॉम्प्ट ट्रिगर): किसी भी AI चैट फ़ील्ड में # टाइप करें और अपने सहेजे गए प्रॉम्प्ट को रीयल टाइम में फ़िल्टर होते देखें। सुझावों में नेविगेट करने के लिए ↓/↑ का उपयोग करें, ऑटोकंप्लीट या इंजेक्ट करने के लिए स्पेस — पैनल खोले बिना। सभी समर्थित सेवाओं पर काम करता है, स्थानीय LLM सहित।",
    "ro":    "Versiunea 1.1 (Declanșatorul de Prompturi): Tastați # în orice câmp de chat AI pentru a vedea prompturile salvate filtrate în timp real. Folosiți ↓/↑ pentru a naviga prin sugestii, Spațiu pentru autocompletare sau injectare — fără a deschide vreodată panoul. Funcționează pe toate serviciile acceptate, inclusiv LLM-urile locale.",
    "cs":    "Verze 1.1 (Spouštěč promptů): Zadejte # do libovolného pole chatu AI a zobrazte si uložené prompty filtrované v reálném čase. Pomocí ↓/↑ procházejte návrhy, mezerníkem je automaticky dokončete nebo vložte — bez otevření panelu. Funguje na všech podporovaných službách včetně lokálních LLM.",
    "sk":    "Verzia 1.1 (Spúšťač promptov): Zadajte # do ľubovoľného poľa chatu AI a zobrazte si uložené prompty filtrované v reálnom čase. Pomocou ↓/↑ prechádzajte návrhy, medzerníkom ich automaticky dokončite alebo vložte — bez otvorenia panela. Funguje na všetkých podporovaných službách vrátane lokálnych LLM.",
    "tr":    "Sürüm 1.1 (Prompt Tetikleyici): Herhangi bir AI sohbet alanına # yazarak kayıtlı promptlarınızı gerçek zamanlı filtrelenmiş görün. Öneriler arasında gezinmek için ↓/↑ kullanın, otomatik tamamlamak veya eklemek için Boşluk — paneli açmadan. Yerel LLM'ler dahil tüm desteklenen hizmetlerde çalışır.",
    "id":    "Versi 1.1 (Pemicu Prompt): Ketik # di kolom chat AI mana pun untuk melihat prompt yang tersimpan difilter secara real time. Gunakan ↓/↑ untuk menavigasi saran, Spasi untuk melengkapi otomatis atau menyuntikkan — tanpa membuka panel. Berfungsi di semua layanan yang didukung termasuk LLM lokal.",
    "zh_TW": "版本 1.1（提示詞觸發器）：在任意 AI 聊天框輸入 # 即可即時篩選查看已儲存的提示詞。用 ↓/↑ 瀏覽建議，空白鍵自動補全或插入 — 無需開啟面板。適用於所有支援的服務，包括本地 LLM。",
    "vi":    "Phiên bản 1.1 (Kích hoạt Prompt): Nhập # vào bất kỳ trường chat AI nào để xem các prompt đã lưu được lọc theo thời gian thực. Dùng ↓/↑ để điều hướng gợi ý, phím Cách để tự hoàn thành hoặc chèn — mà không cần mở bảng. Hoạt động trên tất cả các dịch vụ được hỗ trợ kể cả LLM cục bộ.",
    "bn":    "সংস্করণ 1.1 (প্রম্পট ট্রিগার): যেকোনো AI চ্যাট ফিল্ডে # টাইপ করুন এবং রিয়েল টাইমে ফিল্টার করা সংরক্ষিত প্রম্পটগুলি দেখুন। পরামর্শে নেভিগেট করতে ↓/↑ ব্যবহার করুন, অটোকমপ্লিট বা ইনজেক্ট করতে স্পেস — প্যানেল না খুলেই। স্থানীয় LLM সহ সমস্ত সমর্থিত পরিষেবায় কাজ করে।",
    "nl":    "Versie 1.1 (Prompt-trigger): Typ # in een willekeurig AI-chatveld om uw opgeslagen prompts in realtime gefilterd te zien. Gebruik ↓/↑ om door suggesties te navigeren, Spatie om automatisch aan te vullen of in te voegen — zonder het panel te openen. Werkt op alle ondersteunde services inclusief lokale LLM's.",
    "sw":    "Toleo 1.1 (Kichocheo cha Kidokezo): Andika # katika uwanja wowote wa mazungumzo wa AI ili uone vidokezo vyako vilivyohifadhiwa vikichujwa kwa wakati halisi. Tumia ↓/↑ kuvinjari mapendekezo, Spacebar kukamilisha kiotomatiki au kuingiza — bila kufungua paneli. Inafanya kazi kwenye huduma zote zinazounga mkono, ikiwemo LLM za ndani.",
    "tl":    "Bersyon 1.1 (Prompt Trigger): I-type ang # sa anumang AI chat field para makita ang iyong mga na-save na prompt na na-filter sa real time. Gamitin ang ↓/↑ para mag-navigate sa mga mungkahi, Space para mag-autocomplete o mag-inject — nang hindi binubuksan ang panel. Gumagana sa lahat ng sinusuportahang serbisyo kasama ang mga lokal na LLM.",
    "th":    "เวอร์ชัน 1.1 (ตัวกระตุ้น Prompt): พิมพ์ # ในช่องแชท AI ใดก็ได้เพื่อดูพรอมต์ที่บันทึกไว้แบบกรองแบบเรียลไทม์ ใช้ ↓/↑ เพื่อเลือกคำแนะนำ กด Space เพื่อเติมอัตโนมัติหรือแทรก — โดยไม่ต้องเปิดแผง ใช้ได้กับทุกบริการที่รองรับรวมถึง LLM ในเครื่อง",
    "ar":    "الإصدار 1.1 (مُشغِّل الإرشادات): اكتب # في أي حقل دردشة AI لرؤية إرشاداتك المحفوظة مفلترةً في الوقت الفعلي. استخدم ↓/↑ للتنقل بين الاقتراحات، ومسافة للإكمال التلقائي أو الإدراج — دون فتح اللوحة. يعمل على جميع الخدمات المدعومة بما فيها LLM المحلية.",
    "hu":    "1.1-es verzió (Prompt-kiváltó): Írjon # jelet bármely AI-chat mezőbe, hogy valós időben szűrve lássa mentett promptjait. Használja a ↓/↑ billentyűket a javaslatok közötti navigáláshoz, a szóközt az automatikus kiegészítéshez vagy beillesztéshez — a panel megnyitása nélkül. Minden támogatott szolgáltatáson működik, beleértve a helyi LLM-eket.",
    "nb":    "Versjon 1.1 (Promptutløser): Skriv # i et AI-chatfelt for å se dine lagrede prompter filtrert i sanntid. Bruk ↓/↑ til å navigere gjennom forslag, Mellomrom for å autofullføre eller injisere — uten å åpne panelet. Fungerer på alle støttede tjenester inkludert lokale LLM-er.",
    "sv":    "Version 1.1 (Promptutlösare): Skriv # i valfritt AI-chattfält för att se dina sparade promptar filtrerade i realtid. Använd ↓/↑ för att navigera bland förslag, Blanksteg för att autokomplettera eller injicera — utan att öppna panelen. Fungerar på alla stödda tjänster inklusive lokala LLM:er.",
    "fi":    "Versio 1.1 (Kehotteen laukaisin): Kirjoita # mihin tahansa AI-chat-kenttään nähdäksesi tallennetut kehotteesi suodatettuina reaaliajassa. Käytä ↓/↑ ehdotusten selailuun, välilyöntiä automaattitäydennykseen tai lisäämiseen — avaamatta paneelia. Toimii kaikilla tuetuilla palveluilla, mukaan lukien paikalliset LLM:t.",
    "ca":    "Versió 1.1 (Disparador de Prompts): Escriu # a qualsevol camp de xat d'IA per veure els teus prompts filtrats en temps real. Usa ↓/↑ per navegar pels suggeriments, Espai per autocompletar o injectar — sense obrir mai el panell. Funciona a tots els serveis compatibles, inclosos els LLM locals.",
    "da":    "Version 1.1 (Prompt-udløser): Skriv # i et vilkårligt AI-chatfelt for at se dine gemte prompts filtreret i realtid. Brug ↓/↑ til at navigere gennem forslag, Mellemrum for at autofuldføre eller injicere — uden at åbne panelet. Fungerer på alle understøttede tjenester, inklusive lokale LLM'er.",
    "uk":    "Версія 1.1 (Тригер підказок): Введіть # у будь-яке поле чату ШІ, щоб бачити збережені підказки з фільтрацією в реальному часі. Використовуйте ↓/↑ для навігації між пропозиціями, пробіл для автодоповнення або вставки — без відкриття панелі. Працює на всіх підтримуваних сервісах, включно з локальними LLM.",
    "el":    "Έκδοση 1.1 (Ενεργοποιητής Prompt): Πληκτρολογήστε # σε οποιοδήποτε πεδίο AI chat για να δείτε τα αποθηκευμένα σας prompts φιλτραρισμένα σε πραγματικό χρόνο. Χρησιμοποιήστε ↓/↑ για πλοήγηση στις προτάσεις, Κενό για αυτόματη συμπλήρωση ή εισαγωγή — χωρίς να ανοίξετε τον πίνακα. Λειτουργεί σε όλες τις υποστηριζόμενες υπηρεσίες, συμπεριλαμβανομένων των τοπικών LLM.",
    "he":    "גרסה 1.1 (מפעיל Prompt): הקלד # בכל שדה צ'אט AI כדי לראות את ה-Prompt השמורים מסוננים בזמן אמת. השתמש ב-↓/↑ לניווט בין הצעות, רווח להשלמה אוטומטית או הזרקה — מבלי לפתוח את הפאנל. עובד על כל השירותים הנתמכים כולל LLM מקומיים.",
    "et":    "Versioon 1.1 (Viipade käivitaja): Sisestage # mis tahes AI vestlusväljale, et näha salvestatud viipasid reaalajas filtreerituna. Kasutage ↓/↑ soovituste vahel liikumiseks, Tühikut automaatseks täitmiseks või lisamiseks — ilma paneeli avamata. Töötab kõigil toetatud teenustel, sealhulgas kohalikel LLM-idel.",
    "lt":    "Versija 1.1 (Raginimų paleidiklis): Įveskite # bet kuriame AI pokalbių lauke, kad realiuoju laiku matytumėte filtruotus išsaugotus raginimus. Naudokite ↓/↑ naršyti pasiūlymams, tarpą automatiškai užbaigti ar įterpti — neatidarant skydelio. Veikia visose palaikomose paslaugose, įskaitant vietinius LLM.",
    "lv":    "Versija 1.1 (Uzvedņu aktivizētājs): Ievadiet # jebkurā AI tērzēšanas laukā, lai reāllaikā filtrētu saglabātās uzvednes. Izmantojiet ↓/↑, lai pārvietotos starp ieteikumiem, Atstarpi automātiskai pabeigšanai vai ievietošanai — neatverot paneli. Darbojas visos atbalstītajos pakalpojumos, ieskaitot vietējos LLM.",
    "ms":    "Versi 1.1 (Pencetus Prompt): Taip # dalam mana-mana medan chat AI untuk melihat arahan tersimpan anda ditapis dalam masa nyata. Gunakan ↓/↑ untuk navigasi cadangan, Ruang untuk autoisi atau suntik — tanpa membuka panel. Berfungsi pada semua perkhidmatan yang disokong termasuk LLM tempatan.",
    "bg":    "Версия 1.1 (Тригер за подсказки): Въведете # в произволно поле за AI чат, за да видите запазените подсказки, филтрирани в реално време. Използвайте ↓/↑ за навигация между предложенията, интервала за автодовършване или вмъкване — без да отваряте панела. Работи на всички поддържани услуги, включително локални LLM.",
    "sl":    "Različica 1.1 (Sprožilec pozivov): Vnesite # v katero koli polje za klepet AI in v realnem času glejte filtrirane shranjene pozive. Uporabite ↓/↑ za krmarjenje med predlogi, preslednico za samodejno dokončanje ali vstavljanje — brez odpiranja plošče. Deluje na vseh podprtih storitvah, vključno z lokalnimi LLM.",
    "sr":    "Верзија 1.1 (Окидач промптова): Унесите # у bilo које поље AI четовања да бисте у реалном времену видели филтриране сачуване промптове. Користите ↓/↑ за навигацију кроз предлоге, размак за аутодовршавање или убацивање — без отварања панела. Ради на свим подржаним сервисима, укључујући локалне LLM.",
    "hr":    "Verzija 1.1 (Okidač upita): Unesi # u bilo koje polje za chat s AI-jem da u stvarnom vremenu vidiš filtrirane spremljene upite. Koristi ↓/↑ za navigaciju kroz prijedloge, Razmak za automatsko dovršavanje ili ubacivanje — bez otvaranja panela. Radi na svim podržanim uslugama, uključujući lokalne LLM.",
}

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
    "ca":    "🔀 Botons de Nova Conversa: Inicia una nova conversa a ChatGPT, Claude, Copilot, Gemini o Perplexity directament des del Mode Prompt — un botó per servei.",
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
    "hr":    "🔀 Gumbi za novi razgovor: Pokreni novi razgovor na ChatGPT, Claude, Copilot, Gemini ili Perplexity izravno iz načina upita — jedan gumb po usluzi.",
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
    r'ОНОВЛЕННЯ|ΕΝΗΜΕΡΩΣΕΙΣ|ΕΝΗΜΕΡΏΣΕΙΣ|עדכונים|UUENDUSED|ATNAUJINIMAI|ATJAUNINĀJUMI|KEMAS KINI|АКТУАЛИЗАЦИИ|'
    r'POSODOBITVE|АЖУРИРАЊА|AŽURIRANJA|ОБНОВЛЕНИЯ|アップデート|AKTUALIZACJE|การอัปเดต)[^\n]*\n)([\s\S]*)',
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
    "ro":    "Conversațiile dvs. de IA sunt răspândite pe cinci site-uri diferite. Continuați să retastați aceleași instrucțiuni. Cele mai bune conversații ale dvs. dispar în istorici nesfârșite pe Gemini, Claude, ChatGPT, Copilot și Perplexity.\n{af_name} este extensia de care aveți nevoie.",
    "cs":    "Vaše AI konverzace jsou rozptýleny po pěti různých stránkách. Neustále přepisujete stejné prompty. Vaše nejlepší chaty mizí v nekonečných historiích na Gemini, Claude, ChatGPT, Copilot a Perplexity.\n{af_name} je rozšíření, které potřebujete.",
    "sk":    "Vaše AI konverzácie sú rozptýlené po piatich rôznych stránkach. Neustále prepisujete tie isté výzvy. Vaše najlepšie chaty miznú v nekonečných históriách na Gemini, Claude, ChatGPT, Copilot a Perplexity.\n{af_name} je rozšírenie, ktoré potrebujete.",
    "tr":    "AI sohbetleriniz beş farklı siteye dağılmış durumda. Aynı promptları tekrar tekrar yazıyorsunuz. En iyi sohbetleriniz Gemini, Claude, ChatGPT, Copilot ve Perplexity'deki sonsuz geçmişlerde kayboluyor.\n{af_name} ihtiyacınız olan uzantıdır.",
    "id":    "Percakapan AI Anda tersebar di lima situs yang berbeda. Anda terus mengetik ulang prompt yang sama. Obrolan terbaik Anda menghilang dalam riwayat tak berujung di Gemini, Claude, ChatGPT, Copilot, dan Perplexity.\n{af_name} adalah ekstensi yang Anda butuhkan.",
    "zh_TW": "您的 AI 對話分散在五個不同的網站上。您一遍又一遍地重新輸入相同的提示詞。您在 Gemini、Claude、ChatGPT、Copilot 和 Perplexity 上的最佳對話消失在無盡的歷史記錄中。\n{af_name} 正是您需要的擴充功能。",
    "vi":    "Các cuộc trò chuyện AI của bạn bị phân tán trên năm trang web khác nhau. Bạn cứ phải nhập lại những prompt giống nhau. Những cuộc trò chuyện hay nhất của bạn biến mất vào lịch sử vô tận trên Gemini, Claude, ChatGPT, Copilot và Perplexity.\n{af_name} là tiện ích mở rộng bạn cần.",
    "bn":    "আপনার AI কথোপকথনগুলি পাঁচটি ভিন্ন সাইটে ছড়িয়ে আছে। আপনি বারবার একই প্রম্পটগুলি টাইপ করতে থাকেন। Gemini, Claude, ChatGPT, Copilot এবং Perplexity-তে আপনার সেরা চ্যাটগুলি অন্তহীন ইতিহাসে হারিয়ে যায়।\n{af_name} হল সেই এক্সটেনশন যা আপনার দরকার।",
    "nl":    "Uw AI-gesprekken zijn verspreid over vijf verschillende sites. U blijft dezelfde prompts opnieuw typen. Uw beste chats verdwijnen in eindeloze historiek op Gemini, Claude, ChatGPT, Copilot en Perplexity.\n{af_name} is de extensie die u nodig heeft.",
    "sw":    "Mazungumzo yako ya AI yametawanyika kwenye tovuti tano tofauti. Unaendelea kuandika tena maagizo yale yale. Mazungumzo yako bora yanayopotea katika historia zisizo na mwisho kwenye Gemini, Claude, ChatGPT, Copilot, na Perplexity.\n{af_name} ni kiendelezi unachohitaji.",
    "tl":    "Ang iyong mga AI na pag-uusap ay nakakalat sa limang magkakaibang site. Patuloy kang nagta-type ng parehong mga prompt. Ang iyong mga pinakamahusay na chat ay nawawala sa walang katapusang mga kasaysayan sa Gemini, Claude, ChatGPT, Copilot, at Perplexity.\n{af_name} ang extension na kailangan mo.",
    "th":    "การสนทนา AI ของคุณกระจายอยู่ในห้าเว็บไซต์ที่แตกต่างกัน คุณพิมพ์พรอมต์เดิมซ้ำแล้วซ้ำเล่า การสนทนาที่ดีที่สุดของคุณหายไปในประวัติที่ไม่มีที่สิ้นสุดบน Gemini, Claude, ChatGPT, Copilot และ Perplexity\n{af_name} คือส่วนขยายที่คุณต้องการ",
    "ar":    "محادثاتك مع الذكاء الاصطناعي مبعثرة عبر خمسة مواقع مختلفة. لا تزال تُعيد كتابة نفس التعليمات مراراً وتكراراً. أفضل محادثاتك تختفي في سجلات لا نهاية لها على Gemini وClaude وChatGPT وCopilot وPerplexity.\n{af_name} هو الامتداد الذي تحتاجه.",
    "hu":    "AI-beszélgetései öt különböző oldalon szórványosan szétszórva vannak. Folyamatosan újra begépeli ugyanazokat a promptokat. Legjobb csevegései végtelen előzményekbe vesznek el a Geminiben, a Claude-ban, a ChatGPT-ben, a Copilotban és a Perplexityben.\n{af_name} a bővítmény, amelyre szüksége van.",
    "nb":    "AI-samtalene dine er spredt over fem forskjellige nettsteder. Du skriver stadig inn de samme promptene på nytt. De beste samtalene dine forsvinner inn i uendelige historikker på Gemini, Claude, ChatGPT, Copilot og Perplexity.\n{af_name} er utvidelsen du trenger.",
    "sv":    "Dina AI-konversationer är utspridda över fem olika sidor. Du skriver ständigt om samma promptar. Dina bästa chattar försvinner i oändliga historiker på Gemini, Claude, ChatGPT, Copilot och Perplexity.\n{af_name} är tillägget du behöver.",
    "fi":    "AI-keskustelusi ovat hajallaan viidellä eri sivustolla. Kirjoitat jatkuvasti samat kehotteet uudelleen. Parhaat keskustelusi katoavat loputtomiin historioihin Geminissä, Claudessa, ChatGPT:ssä, Copilotissa ja Perplexityssä.\n{af_name} on laajennus, jota tarvitset.",
    "ca":    "Les teves converses d'IA estan escampades per cinc llocs diferents. Continues reescrivint els mateixos prompts. Les teves millors xats desapareixen en historials interminables de Gemini, Claude, ChatGPT, Copilot i Perplexity.\n{af_name} és l'extensió que necessites.",
    "da":    "Dine AI-samtaler er spredt ud over fem forskellige sider. Du bliver ved med at skrive de samme prompts igen. Dine bedste chats forsvinder i endeløse historikker på Gemini, Claude, ChatGPT, Copilot og Perplexity.\n{af_name} er den udvidelse, du har brug for.",
    "uk":    "Ваші розмови з ІІ розкидані по п'яти різних сайтах. Ви знову і знову вводите одні й ті самі підказки. Найкращі розмови зникають у нескінченних журналах Gemini, Claude, ChatGPT, Copilot та Perplexity.\n{af_name} — розширення, яке вам потрібне.",
    "el":    "Οι συνομιλίες AI σας είναι διασκορπισμένες σε πέντε διαφορετικά sites. Συνεχίζετε να επαναπληκτρολογείτε τα ίδια prompts. Οι καλύτερες συνομιλίες σας εξαφανίζονται σε ατελείωτες ιστορικές καταγραφές στο Gemini, Claude, ChatGPT, Copilot και Perplexity.\n{af_name} είναι η επέκταση που χρειάζεστε.",
    "he":    "שיחות ה-AI שלך מפוזרות על פני חמישה אתרים שונים. אתה ממשיך להקליד שוב ושוב את אותן הנחיות. השיחות הטובות שלך נעלמות בהיסטוריות אינסופיות ב-Gemini, Claude, ChatGPT, Copilot ו-Perplexity.\n{af_name} היא התוסף שאתה צריך.",
    "et":    "Teie AI-vestlused on hajutatud viiele erinevale saidile. Te kirjutate ikka samu käsklusi uuesti. Teie parimad vestlused kaovad lõpututesse ajalugudesse Geminis, Claude'is, ChatGPT-s, Copilotis ja Perplexitys.\n{af_name} on laiendus, mida vajate.",
    "lt":    "Jūsų AI pokalbiai išsibarstyti per penkis skirtingus puslapius. Jūs nuolat iš naujo įvedate tuos pačius raginimus. Geriausi jūsų pokalbiai dingsta begalinėse istorijose Gemini, Claude, ChatGPT, Copilot ir Perplexity platformose.\n{af_name} yra plėtinys, kurio jums reikia.",
    "lv":    "Jūsu AI sarunas ir izkaisītas pa piecām dažādām vietnēm. Jūs nemitīgi pārtipat vienas un tās pašas uzvednes. Jūsu labākās sarunas pazūd bezgalīgās vēsturēs Gemini, Claude, ChatGPT, Copilot un Perplexity platformās.\n{af_name} ir paplašinājums, kas jums nepieciešams.",
    "ms":    "Perbualan AI anda tersebar di lima laman yang berbeza. Anda terus menaip semula arahan yang sama. Perbualan terbaik anda hilang dalam sejarah tanpa henti di Gemini, Claude, ChatGPT, Copilot, dan Perplexity.\n{af_name} ialah sambungan yang anda perlukan.",
    "bg":    "Вашите AI разговори са разпръснати из пет различни сайта. Продължавате да въвеждате едни и същи подсказки отново и отново. Най-добрите ви чатове изчезват в безкрайните истории на Gemini, Claude, ChatGPT, Copilot и Perplexity.\n{af_name} е разширението, от което се нуждаете.",
    "sl":    "Vaši AI pogovori so razpršeni po petih različnih spletnih mestih. Vedno znova vnašate iste pozive. Vaši najboljši klepeti izginejo v neskončnih zgodovinah na Gemini, Claude, ChatGPT, Copilot in Perplexity.\n{af_name} je razširitev, ki jo potrebujete.",
    "sr":    "Ваши AI разговори су расути по пет различитих сајтова. Стално поново уносите исте упите. Ваши најбољи четови нестају у бесконачним историјама на Gemini, Claude, ChatGPT, Copilot и Perplexity.\n{af_name} је проширење које вам треба.",
    "hr":    "Tvoji AI razgovori su rasuti po pet različitih stranica. Stalno ponovo unosiš iste upite. Tvoji najbolji chatovi nestaju u beskonačnim povijestima na Geminiju, Claudeu, ChatGPT-u, Copilotu i Perplexityju.\n{af_name} je proširenje koje ti treba.",
}


# ── 2nd paragraph: unified AI cockpit (replaces GF "Gemini cockpit" sentence) ─
COCKPIT_REPLACEMENTS = {
    "fr":    "{af_name} est votre cockpit IA unifié : organisez des conversations de tous vos outils IA dans des dossiers partagés, constituez une bibliothèque de prompts réutilisables et injectez des prompts directement dans n'importe quelle IA prise en charge — sans copier-coller.",
    "de":    "{af_name} ist Ihr einheitliches KI-Cockpit: Organisieren Sie Gespräche aller Ihrer KI-Tools in gemeinsamen Ordnern, erstellen Sie eine Bibliothek wiederverwendbarer Prompts und injizieren Sie Prompts direkt in jede unterstützte KI — ganz ohne Kopieren und Einfügen.",
    "es":    "{af_name} es tu cockpit de IA unificado: organiza conversaciones de todas tus herramientas de IA en carpetas compartidas, crea una biblioteca de prompts reutilizables e inyecta prompts directamente en cualquier IA compatible — sin necesidad de copiar y pegar.",
    "it":    "{af_name} è il tuo cockpit AI unificato: organizza conversazioni da tutti i tuoi strumenti AI in cartelle condivise, crea una libreria di prompt riutilizzabili e inietta prompt direttamente in qualsiasi AI supportata — senza bisogno di copiare e incollare.",
    "pt_BR": "{af_name} é o seu cockpit de IA unificado: organize conversas de todas as suas ferramentas de IA em pastas compartilhadas, crie uma biblioteca de prompts reutilizáveis e injete prompts diretamente em qualquer IA compatível — sem precisar copiar e colar.",
    "pt_PT": "{af_name} é o seu cockpit de IA unificado: organize conversas de todas as suas ferramentas de IA em pastas partilhadas, crie uma biblioteca de prompts reutilizáveis e injete prompts diretamente em qualquer IA suportada — sem precisar de copiar e colar.",
    "pl":    "{af_name} to Twoje zunifikowane centrum AI: organizuj rozmowy ze wszystkich narzędzi AI w wspólnych folderach, buduj bibliotekę wielokrotnie używanych promptów i wstrzykuj prompty bezpośrednio do dowolnej obsługiwanej AI — bez kopiowania i wklejania.",
    "ru":    "{af_name} — ваш единый ИИ-кокпит: организуйте разговоры со всех ваших ИИ-инструментов в общих папках, создавайте библиотеку многоразовых промптов и вставляйте их прямо в любой поддерживаемый ИИ — без копирования и вставки.",
    "zh_CN": "{af_name} 是您的统一 AI 驾驶舱：将来自所有 AI 工具的对话整理到共享文件夹中，构建可重复使用的提示词库，并将提示词直接注入任意受支持的 AI — 无需复制粘贴。",
    "ja":    "{af_name} はあなたの統合 AI コックピットです：すべての AI ツールの会話を共有フォルダに整理し、再利用可能なプロンプトライブラリを構築し、プロンプトをサポートされている任意の AI に直接注入できます — コピー＆ペースト不要。",
    "ko":    "{af_name}은 통합 AI 콕핏입니다: 모든 AI 도구의 대화를 공유 폴더에 정리하고, 재사용 가능한 프롬프트 라이브러리를 구축하고, 지원되는 모든 AI에 직접 프롬프트를 주입하세요 — 복사-붙여넣기 없이.",
    "hi":    "{af_name} आपका एकीकृत AI कॉकपिट है: सभी AI टूल्स से बातचीत को साझा फ़ोल्डर में व्यवस्थित करें, पुन: उपयोग योग्य प्रॉम्प्ट लाइब्रेरी बनाएं, और किसी भी समर्थित AI में सीधे प्रॉम्प्ट इंजेक्ट करें — बिना कॉपी-पेस्ट के।",
    "ro":    "{af_name} este cockpit-ul dvs. AI unificat: organizați conversații din toate instrumentele dvs. AI în dosare partajate, construiți o bibliotecă de prompturi reutilizabile și injectați prompturi direct în orice AI acceptat — fără a fi nevoie să copiați și să lipiți.",
    "cs":    "{af_name} je váš sjednocený AI kokpit: organizujte konverzace ze všech vašich AI nástrojů do sdílených složek, vytvořte knihovnu znovu použitelných promptů a vkládejte prompty přímo do libovolné podporované AI — bez kopírování a vkládání.",
    "sk":    "{af_name} je váš zjednotený AI kokpit: organizujte konverzácie zo všetkých vašich AI nástrojov do zdieľaných priečinkov, vytvorte knižnicu opakovane použiteľných promptov a vkladajte prompty priamo do ľubovoľnej podporovanej AI — bez kopírovania a vkladania.",
    "tr":    "{af_name}, birleşik AI kontrol merkezinizdir: tüm AI araçlarınızdan gelen sohbetleri paylaşılan klasörlerde düzenleyin, yeniden kullanılabilir bir prompt kütüphanesi oluşturun ve promptları desteklenen herhangi bir AI'ye doğrudan enjekte edin — kopyala yapıştır gerekmez.",
    "id":    "{af_name} adalah kokpit AI terpadu Anda: atur percakapan dari semua alat AI Anda dalam folder bersama, bangun perpustakaan prompt yang dapat digunakan kembali, dan suntikkan prompt langsung ke AI yang didukung — tanpa perlu menyalin dan menempel.",
    "zh_TW": "{af_name} 是您的統一 AI 駕駛艙：將來自所有 AI 工具的對話整理到共享資料夾中，建立可重複使用的提示詞庫，並將提示詞直接插入任何受支援的 AI — 無需複製貼上。",
    "vi":    "{af_name} là trung tâm AI thống nhất của bạn: sắp xếp các cuộc trò chuyện từ tất cả các công cụ AI vào các thư mục chung, xây dựng thư viện prompt có thể tái sử dụng, và chèn prompt trực tiếp vào bất kỳ AI nào được hỗ trợ — không cần sao chép và dán.",
    "bn":    "{af_name} হল আপনার একীভূত AI ককপিট: সমস্ত AI টুল থেকে কথোপকথন শেয়ার ফোল্ডারে সংগঠিত করুন, পুনর্ব্যবহারযোগ্য প্রম্পট লাইব্রেরি তৈরি করুন এবং সরাসরি যেকোনো সমর্থিত AI-তে প্রম্পট ইনজেক্ট করুন — কপি-পেস্ট ছাড়াই।",
    "nl":    "{af_name} is uw uniforme AI-cockpit: organiseer gesprekken van al uw AI-tools in gedeelde mappen, bouw een herbruikbare promptbibliotheek en injecteer prompts rechtstreeks in elke ondersteunde AI — zonder kopiëren en plakken.",
    "sw":    "{af_name} ni kokpit yako ya AI iliyounganishwa: panga mazungumzo kutoka kwa zana zako zote za AI katika folda zilizoshirikiwa, jenga maktaba ya maagizo yanayoweza kutumika tena, na uweke maagizo moja kwa moja katika AI yoyote inayounga mkono — bila kuhitaji kunakili na kubandika.",
    "tl":    "{af_name} ang iyong pinagsamang AI cockpit: ayusin ang mga pag-uusap mula sa lahat ng iyong mga AI tool sa mga ibinabahaging folder, bumuo ng library ng mga prompt na magagamit muli, at mag-inject ng mga prompt nang direkta sa anumang sinusuportahang AI — hindi na kailangang mag-copy-paste.",
    "th":    "{af_name} คือห้องควบคุม AI รวมของคุณ: จัดระเบียบการสนทนาจากเครื่องมือ AI ทั้งหมดของคุณในโฟลเดอร์ที่ใช้ร่วมกัน สร้างคลังพรอมต์ที่นำมาใช้ซ้ำได้ และแทรกพรอมต์โดยตรงไปยัง AI ที่รองรับ — ไม่ต้องคัดลอกวาง",
    "ar":    "{af_name} هو مركز التحكم الموحد للذكاء الاصطناعي: نظّم المحادثات من جميع أدوات الذكاء الاصطناعي في مجلدات مشتركة، وابنِ مكتبة من التعليمات القابلة لإعادة الاستخدام، وأدرج التعليمات مباشرةً في أي ذكاء اصطناعي مدعوم — دون الحاجة إلى النسخ واللصق.",
    "hu":    "{af_name} az Ön egységes AI-irányítóközpontja: szervezze az összes AI-eszközéből származó beszélgetéseket közös mappákba, hozzon létre újra felhasználható prompt-könyvtárat, és illesszen be promptokat közvetlenül bármely támogatott AI-ba — másolás-beillesztés nélkül.",
    "nb":    "{af_name} er din samlede AI-kontrollpanel: organiser samtaler fra alle AI-verktøyene dine i delte mapper, bygg et bibliotek av gjenbrukbare prompter, og injiser prompter direkte i en hvilken som helst støttet AI — uten kopiering og innliming.",
    "sv":    "{af_name} är din enhetliga AI-kontrollpanel: organisera konversationer från alla dina AI-verktyg i delade mappar, bygg ett bibliotek med återanvändbara promptar och injicera promptar direkt i valfri AI som stöds — utan att behöva kopiera och klistra in.",
    "fi":    "{af_name} on yhtenäinen AI-ohjauskeskuksesi: järjestä kaikista AI-työkaluistasi käydyt keskustelut jaetuiksi kansioiksi, rakenna uudelleenkäytettävien kehotteiden kirjasto ja lisää kehotteet suoraan mihin tahansa tuettuun AI:hin — ilman kopiointia ja liittämistä.",
    "ca":    "{af_name} és el teu cockpit d'IA unificat: organitza converses de totes les teves eines d'IA en carpetes compartides, crea una biblioteca de prompts reutilitzables i injecta prompts directament a qualsevol IA compatible — sense necessitat de copiar i enganxar.",
    "da":    "{af_name} er dit samlede AI-kontrolpanel: organiser samtaler fra alle dine AI-værktøjer i delte mapper, opbyg et bibliotek af genbrugbare prompter, og injicér prompter direkte i enhver understøttet AI — uden at kopiere og indsætte.",
    "uk":    "{af_name} — ваш єдиний ШІ-кокпіт: організуйте розмови з усіх ваших ШІ-інструментів у спільних папках, створіть бібліотеку повторно використовуваних підказок і вставляйте їх безпосередньо в будь-який підтримуваний ШІ — без копіювання та вставки.",
    "el":    "{af_name} είναι το ενοποιημένο AI cockpit σας: οργανώστε συνομιλίες από όλα τα AI εργαλεία σας σε κοινόχρηστους φακέλους, δημιουργήστε μια βιβλιοθήκη επαναχρησιμοποιήσιμων prompts και εισάγετε prompts απευθείας σε οποιοδήποτε υποστηριζόμενο AI — χωρίς αντιγραφή και επικόλληση.",
    "he":    "{af_name} הוא לוח הבקרה המאוחד שלך ל-AI: ארגן שיחות מכל כלי ה-AI שלך בתיקיות משותפות, בנה ספריית הנחיות לשימוש חוזר, והזרק הנחיות ישירות לכל AI נתמך — ללא צורך בהעתקה והדבקה.",
    "et":    "{af_name} on teie ühtne AI-juhtimiskeskus: korraldage kõigi AI-tööriistade vestlused jagatud kaustadesse, looge korduvkasutatavate käskluste teek ja lisage käsklused otse mistahes toetatud AI-sse — ilma kopeerimise ja kleepimiseta.",
    "lt":    "{af_name} yra jūsų vieninga AI valdymo centras: tvarkykite visų AI įrankių pokalbius bendrose aplankuose, kurkite daugkartinio naudojimo raginimų biblioteką ir įterpkite raginimus tiesiogiai į bet kurią palaikomą AI — be kopijavimo ir įklijavimo.",
    "lv":    "{af_name} ir jūsu vienotais AI vadības panelis: kārtojiet sarunas no visiem AI rīkiem koplietotās mapēs, veidojiet atkārtoti izmantojamu uzvedņu bibliotēku un ievietojiet uzvednes tieši jebkurā atbalstītajā AI — bez kopēšanas un ielīmēšanas.",
    "ms":    "{af_name} ialah kokpit AI bersatu anda: susun perbualan dari semua alat AI anda dalam folder berkongsi, bina perpustakaan arahan yang boleh digunakan semula, dan suntik arahan terus ke mana-mana AI yang disokong — tanpa perlu menyalin dan menampal.",
    "bg":    "{af_name} е вашето обединено AI табло за управление: организирайте разговори от всички ваши AI инструменти в споделени папки, изградете библиотека от подсказки за многократна употреба и вмъквайте подсказки директно в произволен поддържан AI — без копиране и поставяне.",
    "sl":    "{af_name} je vaše enotno AI-upravljalno središče: organizirajte pogovore iz vseh vaših AI-orodij v skupne mape, zgradite knjižnico promptov za večkratno uporabo in vstavljajte prompte neposredno v kateri koli podprti AI — brez kopiranja in lepljenja.",
    "sr":    "{af_name} је ваш јединствени AI кокпит: организујте разговоре из свих ваших AI алата у дељене фасцикле, изградите библиотеку упита за вишеструку употребу и убацујте упите директно у било који подржани AI — без копирања и лепљења.",
    "hr":    "{af_name} je tvoj objedinjeni AI kokpit: organiziraj razgovore iz svih tvojih AI alata u dijeljene mape, izgradi knjižnicu upita za višekratnu upotrebu i ubacuj upite izravno u bilo koji podržani AI — bez kopiranja i lijepljenja.",
}


# ── Local LLM Support section (inserted before 🛠️ how-to section) ───────────
LOCAL_LLM_SECTION = {
    "fr":    "🏠 SUPPORT LLM LOCAL\n\nVous utilisez un modèle IA local (Ollama, LM Studio, Jan ou autre) ? Configurez {af_name} avec votre URL locale — prend en charge localhost et les adresses LAN (192.168.x.x, noms d'hôtes personnalisés). La sauvegarde rapide et via le menu contextuel fonctionnent aussi sur les interfaces locales.",
    "de":    "🏠 LOKALER LLM-SUPPORT\n\nVerwenden Sie ein lokales KI-Modell (Ollama, LM Studio, Jan oder ein anderes)? Konfigurieren Sie {af_name} mit Ihrer lokalen URL — unterstützt localhost und LAN-Adressen (192.168.x.x, benutzerdefinierte Hostnamen). Schnellspeicherung und Kontextmenü-Speicherung funktionieren auch auf lokalen Benutzeroberflächen.",
    "es":    "🏠 SOPORTE DE LLM LOCAL\n\n¿Usas un modelo de IA local (Ollama, LM Studio, Jan u otro)? Configura {af_name} con tu URL local — compatible con localhost y direcciones LAN (192.168.x.x, nombres de host personalizados). El guardado rápido y el guardado por menú contextual también funcionan en interfaces locales.",
    "it":    "🏠 SUPPORTO LLM LOCALE\n\nStai usando un modello AI locale (Ollama, LM Studio, Jan o altro)? Configura {af_name} con il tuo URL locale — supporta localhost e indirizzi LAN (192.168.x.x, hostname personalizzati). Il salvataggio rapido e dal menu contestuale funzionano anche nelle interfacce locali.",
    "pt_BR": "🏠 SUPORTE A LLM LOCAL\n\nEstá usando um modelo de IA local (Ollama, LM Studio, Jan ou outro)? Configure o {af_name} com sua URL local — suporta localhost e endereços LAN (192.168.x.x, hostnames personalizados). O salvamento rápido e pelo menu de contexto também funcionam em interfaces locais.",
    "pt_PT": "🏠 SUPORTE A LLM LOCAL\n\nEstá a usar um modelo de IA local (Ollama, LM Studio, Jan ou outro)? Configure o {af_name} com o seu URL local — suporta localhost e endereços LAN (192.168.x.x, nomes de anfitrião personalizados). O guardamento rápido e pelo menu de contexto também funcionam em interfaces locais.",
    "pl":    "🏠 WSPARCIE LOKALNEGO LLM\n\nUżywasz lokalnego modelu AI (Ollama, LM Studio, Jan lub innego)? Skonfiguruj {af_name} ze swoim lokalnym adresem URL — obsługuje localhost i adresy LAN (192.168.x.x, niestandardowe nazwy hostów). Szybkie zapisywanie i zapisywanie z menu kontekstowego działają również w lokalnych interfejsach.",
    "ru":    "🏠 ПОДДЕРЖКА ЛОКАЛЬНОГО LLM\n\nИспользуете локальную ИИ-модель (Ollama, LM Studio, Jan или другую)? Настройте {af_name} с вашим локальным URL — поддерживаются localhost и LAN-адреса (192.168.x.x, пользовательские имена хостов). Быстрое сохранение и сохранение через контекстное меню работают и в локальных интерфейсах.",
    "zh_CN": "🏠 本地 LLM 支持\n\n正在运行本地 AI 模型（Ollama、LM Studio、Jan 或其他）？使用本地 URL 配置 {af_name} — 支持 localhost 和 LAN 地址（192.168.x.x、自定义主机名）。快速保存和右键菜单保存也适用于本地界面。",
    "ja":    "🏠 ローカル LLM サポート\n\nローカル AI モデル（Ollama、LM Studio、Jan など）を使用していますか？ {af_name} をローカル URL で設定できます — localhost と LAN アドレス（192.168.x.x、カスタムホスト名）に対応。クイック保存とコンテキストメニュー保存もローカル UI で動作します。",
    "ko":    "🏠 로컬 LLM 지원\n\n로컬 AI 모델(Ollama, LM Studio, Jan 등)을 사용 중이신가요? 로컬 URL로 {af_name}을 구성하세요 — localhost와 LAN 주소(192.168.x.x, 사용자 지정 호스트 이름)를 지원합니다. 빠른 저장과 컨텍스트 메뉴 저장도 로컬 UI에서 작동합니다.",
    "hi":    "🏠 लोकल LLM सपोर्ट\n\nलोकल AI मॉडल (Ollama, LM Studio, Jan या अन्य) चला रहे हैं? {af_name} को अपने लोकल URL के साथ कॉन्फ़िगर करें — localhost और LAN एड्रेस (192.168.x.x, कस्टम होस्टनाम) सपोर्ट करता है। क्विक-सेव और कॉन्टेक्स्ट-मेनू सेव लोकल UI पर भी काम करते हैं।",
    "ro":    "🏠 SUPORT LLM LOCAL\n\nFolosiți un model AI local (Ollama, LM Studio, Jan sau altul)? Configurați {af_name} cu URL-ul local — acceptă localhost și adrese LAN (192.168.x.x, nume de gazdă personalizate). Salvarea rapidă și din meniul contextual funcționează și pe interfețe locale.",
    "cs":    "🏠 PODPORA LOKÁLNÍHO LLM\n\nPoužíváte lokální AI model (Ollama, LM Studio, Jan nebo jiný)? Nakonfigurujte {af_name} s místní URL adresou — podporuje localhost a LAN adresy (192.168.x.x, vlastní názvy hostitelů). Rychlé ukládání a ukládání přes kontextové menu fungují i na lokálních rozhraních.",
    "sk":    "🏠 PODPORA LOKÁLNEHO LLM\n\nPoužívate lokálny model AI (Ollama, LM Studio, Jan alebo iný)? Nakonfigurujte {af_name} s miestnou URL adresou — podporuje localhost a LAN adresy (192.168.x.x, vlastné názvy hostiteľov). Rýchle ukladanie a ukladanie cez kontextové menu fungujú aj na lokálnych rozhraniach.",
    "tr":    "🏠 YEREL LLM DESTEĞİ\n\nYerel bir AI modeli (Ollama, LM Studio, Jan veya başka) mı kullanıyorsunuz? {af_name}'ı yerel URL'nizle yapılandırın — localhost ve LAN adreslerini destekler (192.168.x.x, özel ana bilgisayar adları). Hızlı kaydetme ve bağlam menüsü kaydetme yerel arayüzlerde de çalışır.",
    "id":    "🏠 DUKUNGAN LLM LOKAL\n\nMenjalankan model AI lokal (Ollama, LM Studio, Jan, atau lainnya)? Konfigurasikan {af_name} dengan URL lokal Anda — mendukung localhost dan alamat LAN (192.168.x.x, nama host khusus). Simpan cepat dan simpan melalui menu konteks juga berfungsi pada UI lokal.",
    "zh_TW": "🏠 本地 LLM 支援\n\n正在執行本地 AI 模型（Ollama、LM Studio、Jan 或其他）？使用本地 URL 設定 {af_name} — 支援 localhost 和 LAN 位址（192.168.x.x、自訂主機名稱）。快速儲存和右鍵選單儲存也適用於本地介面。",
    "vi":    "🏠 HỖ TRỢ LLM CỤC BỘ\n\nĐang chạy mô hình AI cục bộ (Ollama, LM Studio, Jan hoặc khác)? Cấu hình {af_name} với URL cục bộ của bạn — hỗ trợ localhost và địa chỉ LAN (192.168.x.x, tên máy chủ tùy chỉnh). Lưu nhanh và lưu qua menu ngữ cảnh cũng hoạt động trên giao diện cục bộ.",
    "bn":    "🏠 লোকাল LLM সাপোর্ট\n\nলোকাল AI মডেল (Ollama, LM Studio, Jan বা অন্য) চালাচ্ছেন? {af_name} আপনার লোকাল URL দিয়ে কনফিগার করুন — localhost এবং LAN ঠিকানা (192.168.x.x, কাস্টম হোস্টনাম) সাপোর্ট করে। কুইক-সেভ এবং কনটেক্সট-মেনু সেভ লোকাল UI-তেও কাজ করে।",
    "nl":    "🏠 LOKALE LLM-ONDERSTEUNING\n\nGebruikt u een lokaal AI-model (Ollama, LM Studio, Jan of een ander)? Configureer {af_name} met uw lokale URL — ondersteunt localhost en LAN-adressen (192.168.x.x, aangepaste hostnamen). Snel opslaan en opslaan via contextmenu werken ook op lokale interfaces.",
    "sw":    "🏠 MSAADA WA LLM WA NDANI\n\nUnaendesha mfano wa AI wa ndani (Ollama, LM Studio, Jan, au mwingine)? Sanidi {af_name} na URL yako ya ndani — inasaidia localhost na anwani za LAN (192.168.x.x, majina ya seva maalum). Kuhifadhi haraka na kuhifadhi kupitia menyu ya muktadha pia hufanya kazi kwenye UI za ndani.",
    "tl":    "🏠 SUPORTA SA LOKAL NA LLM\n\nNagpapatakbo ng lokal na AI model (Ollama, LM Studio, Jan, o iba pa)? I-configure ang {af_name} gamit ang iyong lokal na URL — sinusuportahan ang localhost at mga LAN address (192.168.x.x, mga custom na hostname). Gumagana rin ang mabilis na pag-save at pag-save sa pamamagitan ng context menu sa mga lokal na UI.",
    "th":    "🏠 รองรับ LLM ในเครื่อง\n\nกำลังรัน AI model ในเครื่อง (Ollama, LM Studio, Jan หรืออื่นๆ)? ตั้งค่า {af_name} ด้วย URL ในเครื่องของคุณ — รองรับ localhost และที่อยู่ LAN (192.168.x.x, hostname แบบกำหนดเอง) การบันทึกด่วนและการบันทึกผ่านเมนูคลิกขวาก็ทำงานบน UI ในเครื่องด้วย",
    "ar":    "🏠 دعم LLM المحلي\n\nهل تشغّل نموذج ذكاء اصطناعي محليًا (Ollama أو LM Studio أو Jan أو غيره)؟ قم بتكوين {af_name} بعنوان URL المحلي الخاص بك — يدعم localhost وعناوين LAN (192.168.x.x وأسماء المضيف المخصصة). يعمل الحفظ السريع والحفظ عبر قائمة النقر الأيمن على الواجهات المحلية أيضًا.",
    "hu":    "🏠 HELYI LLM TÁMOGATÁS\n\nHelyi AI modellt futtat (Ollama, LM Studio, Jan vagy más)? Konfigurálja a(z) {af_name}-t a helyi URL-jével — támogatja a localhostot és a LAN-címeket (192.168.x.x, egyéni állomásneveket). A gyors mentés és a helyi menüs mentés is működik a helyi felületeken.",
    "nb":    "🏠 STØTTE FOR LOKAL LLM\n\nKjører du en lokal AI-modell (Ollama, LM Studio, Jan eller annen)? Konfigurer {af_name} med din lokale URL — støtter localhost og LAN-adresser (192.168.x.x, egendefinerte vertsnavn). Hurtiglagring og kontekstmenylagring fungerer også på lokale brukergrensesnitt.",
    "sv":    "🏠 STÖD FÖR LOKAL LLM\n\nKör du en lokal AI-modell (Ollama, LM Studio, Jan eller annan)? Konfigurera {af_name} med din lokala URL — stöder localhost och LAN-adresser (192.168.x.x, anpassade värdnamn). Snabbspara och kontextmenyspara fungerar även på lokala gränssnitt.",
    "fi":    "🏠 PAIKALLISEN LLM:N TUKI\n\nKäytätkö paikallista AI-mallia (Ollama, LM Studio, Jan tai muu)? Määritä {af_name} paikallisella URL-osoitteellasi — tukee localhostia ja LAN-osoitteita (192.168.x.x, mukautetut isäntänimet). Pikatallennus ja kontekstivalikosta tallennus toimivat myös paikallisissa käyttöliittymissä.",
    "ca":    "🏠 SUPORT PER A LLM LOCAL\n\nEstàs executant un model d'IA local (Ollama, LM Studio, Jan o un altre)? Configura {af_name} amb el teu URL local — admet localhost i adreces LAN (192.168.x.x, noms d'host personalitzats). El desament ràpid i des del menú contextual també funcionen en interfícies locals.",
    "da":    "🏠 UNDERSTØTTELSE AF LOKAL LLM\n\nKører du en lokal AI-model (Ollama, LM Studio, Jan eller en anden)? Konfigurer {af_name} med din lokale URL — understøtter localhost og LAN-adresser (192.168.x.x, brugerdefinerede værtsnavne). Hurtig lagring og genvejsmenu-lagring fungerer også på lokale brugergrænseflader.",
    "uk":    "🏠 ПІДТРИМКА ЛОКАЛЬНОГО LLM\n\nЗапускаєте локальну ШІ-модель (Ollama, LM Studio, Jan або іншу)? Налаштуйте {af_name} з вашою локальною URL-адресою — підтримує localhost та LAN-адреси (192.168.x.x, власні імена хостів). Швидке збереження та збереження через контекстне меню також працюють на локальних інтерфейсах.",
    "el":    "🏠 ΥΠΟΣΤΗΡΙΞΗ ΤΟΠΙΚΟΥ LLM\n\nΤρέχετε ένα τοπικό μοντέλο AI (Ollama, LM Studio, Jan ή άλλο); Ρυθμίστε το {af_name} με το τοπικό σας URL — υποστηρίζει localhost και διευθύνσεις LAN (192.168.x.x, προσαρμοσμένα ονόματα κεντρικών υπολογιστών). Η γρήγορη αποθήκευση και μέσω μενού περιβάλλοντος λειτουργούν επίσης σε τοπικές διεπαφές.",
    "he":    "🏠 תמיכה ב-LLM מקומי\n\nמפעיל מודל AI מקומי (Ollama, LM Studio, Jan או אחר)? הגדר את {af_name} עם כתובת ה-URL המקומית שלך — תומך ב-localhost ובכתובות LAN (192.168.x.x, שמות מארח מותאמים אישית). שמירה מהירה ושמירה דרך תפריט ההקשר פועלות גם בממשקים מקומיים.",
    "et":    "🏠 KOHALIKU LLM TUGI\n\nKas kasutate kohalikku AI-mudelit (Ollama, LM Studio, Jan või muu)? Seadistage {af_name} oma kohaliku URL-iga — toetab localhosti ja LAN-aadresse (192.168.x.x, kohandatud hostinimed). Kiirsalvestamine ja kontekstimenüüst salvestamine töötavad ka kohalikes liidestes.",
    "lt":    "🏠 VIETINIO LLM PALAIKYMAS\n\nAr naudojate vietinį AI modelį (Ollama, LM Studio, Jan ar kitą)? Sukonfigūruokite {af_name} naudodami vietinį URL — palaiko localhost ir LAN adresus (192.168.x.x, pasirinktiniai prieglobos pavadinimai). Greitas išsaugojimas ir per kontekstinį meniu taip pat veikia vietinėse sąsajose.",
    "lv":    "🏠 VIETĒJĀ LLM ATBALSTS\n\nVai izmantojat vietējo AI modeli (Ollama, LM Studio, Jan vai citu)? Konfigurējiet {af_name} ar savu vietējo URL — atbalsta localhost un LAN adreses (192.168.x.x, pielāgoti resursdatoru nosaukumi). Ātrā saglabāšana un saglabāšana konteksta izvēlnē darbojas arī vietējās saskarnēs.",
    "ms":    "🏠 SOKONGAN LLM TEMPATAN\n\nMenjalankan model AI tempatan (Ollama, LM Studio, Jan, atau lain-lain)? Konfigurasikan {af_name} dengan URL tempatan anda — menyokong localhost dan alamat LAN (192.168.x.x, nama hos tersuai). Simpan pantas dan simpan menu konteks juga berfungsi pada antara muka tempatan.",
    "bg":    "🏠 ПОДДРЪЖКА НА ЛОКАЛЕН LLM\n\nИзползвате локален AI модел (Ollama, LM Studio, Jan или друг)? Конфигурирайте {af_name} с вашия локален URL — поддържа localhost и LAN адреси (192.168.x.x, персонализирани имена на хостове). Бързото запазване и запазването чрез контекстно меню работят и на локални интерфейси.",
    "sl":    "🏠 PODPORA ZA LOKALNI LLM\n\nUporabljate lokalni model AI (Ollama, LM Studio, Jan ali drugega)? Konfigurirajte {af_name} z lokalnim URL-jem — podpira localhost in LAN naslove (192.168.x.x, prilagojeni nazivi gostiteljev). Hitro shranjevanje in shranjevanje prek kontekstnega menija delujeta tudi na lokalnih vmesnikih.",
    "sr":    "🏠 PODRŠKA ZA LOKALNI LLM\n\nKoristite lokalni AI model (Ollama, LM Studio, Jan ili drugi)? Konfigurišite {af_name} sa vašim lokalnim URL-om — podržava localhost i LAN adrese (192.168.x.x, prilagođena imena domaćina). Brzo čuvanje i čuvanje putem kontekstnog menija rade i na lokalnim interfejsima.",
    "hr":    "🏠 PODRŠKA ZA LOKALNI LLM\n\nKoristiš lokalni AI model (Ollama, LM Studio, Jan ili drugi)? Konfiguriraj {af_name} s tvojim lokalnim URL-om — podržava localhost i LAN adrese (192.168.x.x, prilagođeni nazivi domaćina). Brzo spremanje i spremanje putem kontekstnog izbornika rade i na lokalnim sučeljima.",
}


# ── Per-language injection fixes (▶ bullet + how-to inject line) ─────────────
# Each entry: [(old_fragment, new_fragment), ...]  — applied via str.replace()
INJECTION_FIXES = {
    "fr": [
        ("dans le champ de saisie de Gemini. L'extension détecte si vous êtes bien sur une page Gemini et vous avertit sinon.",
         "dans le champ de saisie de l'IA active."),
        ("il s'injecte directement dans Gemini, prêt à envoyer.",
         "il s'injecte directement dans l'IA active, prêt à envoyer."),
    ],
    "de": [
        ("in das Eingabefeld von Gemini zu injizieren. Die Erweiterung prüft, ob Sie sich auf einer Gemini-Seite befinden, und benachrichtigt Sie andernfalls.",
         "in das Eingabefeld der aktiven KI zu injizieren."),
        ("er wird direkt in Gemini injiziert, bereit zum Senden.",
         "er wird direkt in die aktive KI injiziert, bereit zum Senden."),
    ],
    "es": [
        ("en el campo de texto de Gemini. La extensión detecta si estás en una página de Gemini y te avisa si no es así.",
         "en el campo de texto de la IA activa."),
        ("se inyecta directamente en Gemini, listo para enviar.",
         "se inyecta directamente en la IA activa, listo para enviar."),
    ],
    "it": [
        ("nel campo di input di Gemini. L'estensione rileva se sei su una pagina Gemini e ti avvisa se non lo sei.",
         "nel campo di input dell'IA attiva."),
        ("viene iniettato direttamente in Gemini, pronto per l'invio.",
         "viene iniettato direttamente nell'IA attiva, pronto per l'invio."),
    ],
    "pt_BR": [
        ("no campo de texto do Gemini. A extensão detecta se você está em uma página do Gemini e avisa caso contrário.",
         "no campo de texto da IA ativa."),
        ("ele é injetado diretamente no Gemini, pronto para enviar.",
         "ele é injetado diretamente na IA ativa, pronto para enviar."),
    ],
    "pt_PT": [
        ("no campo de texto do Gemini. A extensão deteta se está numa página do Gemini e avisa-o caso contrário.",
         "no campo de texto da IA ativa."),
        ("é injetado diretamente no Gemini, pronto para enviar.",
         "é injetado diretamente na IA ativa, pronto para enviar."),
    ],
    "pl": [
        ("w pole tekstowe Gemini. Rozszerzenie wykrywa, czy jesteś na stronie Gemini, i powiadamia Cię, jeśli nie.",
         "w pole tekstowe aktywnej AI."),
        ("zostaje wstrzyknięty bezpośrednio do Gemini, gotowy do wysłania.",
         "zostaje wstrzyknięty bezpośrednio do aktywnej AI, gotowy do wysłania."),
    ],
    "ru": [
        ("в поле ввода Gemini. Расширение определяет, находитесь ли вы на странице Gemini, и уведомляет вас, если нет.",
         "в поле ввода активного ИИ."),
        ("он вставляется прямо в Gemini, готов к отправке.",
         "он вставляется прямо в активный ИИ, готов к отправке."),
    ],
    "zh_CN": [
        ("将其注入 Gemini 输入框。扩展程序会检测您是否在 Gemini 页面上，否则会发出通知。",
         "将其注入活跃 AI 的输入框。"),
        ("直接注入 Gemini，随时可发送。",
         "直接注入活跃的 AI，随时可发送。"),
    ],
    "ja": [
        ("Gemini の入力欄に直接注入されます。拡張機能が Gemini のページかどうかを検出し、そうでない場合は通知します。",
         "アクティブな AI の入力欄に直接注入されます。"),
        ("Gemini に直接注入され、送信準備完了。",
         "アクティブな AI に直接注入され、送信準備完了。"),
    ],
    "ko": [
        ("Gemini 입력창에 직접 주입됩니다. Gemini 페이지에 있는지 확인하고 그렇지 않으면 알림을 표시합니다.",
         "활성 AI 입력창에 직접 주입됩니다."),
        ("Gemini에 직접 주입되어 바로 전송 가능합니다.",
         "활성 AI에 직접 주입되어 바로 전송 가능합니다."),
    ],
    "hi": [
        ("Gemini के इनपुट फ़ील्ड में इंजेक्ट हो जाएगा। एक्सटेंशन जांचता है कि आप Gemini पेज पर हैं या नहीं, और सूचित करता है।",
         "सक्रिय AI के इनपुट फ़ील्ड में इंजेक्ट हो जाएगा।"),
        ("सीधे Gemini में इंजेक्ट होता है, भेजने के लिए तैयार।",
         "सीधे सक्रिय AI में इंजेक्ट होता है, भेजने के लिए तैयार।"),
    ],
    "ro": [
        ("în câmpul de introducere al Gemini. Extensia detectează dacă vă aflați pe o pagină Gemini și vă notifică dacă nu este cazul.",
         "în câmpul de introducere al oricărui AI acceptat."),
        ("se injectează direct în Gemini, gata de trimis.",
         "se injectează direct în AI-ul activ, gata de trimis."),
    ],
    "cs": [
        ("do vstupního pole Gemini. Rozšíření zjistí, zda jste na stránce Gemini, a pokud ne, upozorní vás.",
         "do vstupního pole aktivní AI."),
        ("vloží se přímo do Gemini, připravena k odeslání.",
         "vloží se přímo do aktivní AI, připravena k odeslání."),
    ],
    "sk": [
        ("do vstupného poľa Gemini. Rozšírenie zistí, či ste na stránke Gemini, a ak nie, upozorní vás.",
         "do vstupného poľa aktívnej AI."),
        ("vloží sa priamo do Gemini, pripravená na odoslanie.",
         "vloží sa priamo do aktívnej AI, pripravená na odoslanie."),
    ],
    "tr": [
        ("Gemini'nin giriş alanına doğrudan enjekte edin. Uzantı, Gemini sayfasında olup olmadığınızı algılar ve değilseniz sizi uyarır.",
         "doğrudan aktif AI'nin giriş alanına enjekte edin."),
        ("doğrudan Gemini'ye enjekte edilir, göndermeye hazır.",
         "doğrudan aktif AI'ye enjekte edilir, göndermeye hazır."),
    ],
    "id": [
        ("ke kolom input Gemini. Ekstensi mendeteksi apakah Anda berada di halaman Gemini dan memberi tahu jika tidak.",
         "ke kolom input AI aktif."),
        ("langsung disuntikkan ke Gemini, siap dikirim.",
         "langsung disuntikkan ke AI aktif, siap dikirim."),
    ],
    "zh_TW": [
        ("直接注入 Gemini 的輸入欄。擴充功能會偵測您是否在 Gemini 頁面上，若不在則通知您。",
         "直接注入活躍 AI 的輸入欄。"),
        ("直接注入 Gemini，準備傳送。",
         "直接注入活躍的 AI，準備傳送。"),
    ],
    "vi": [
        ("vào ô nhập của Gemini. Tiện ích phát hiện bạn có đang ở trang Gemini hay không và thông báo nếu chưa.",
         "vào ô nhập của AI đang hoạt động."),
        ("chèn trực tiếp vào Gemini, sẵn sàng gửi.",
         "chèn trực tiếp vào AI đang hoạt động, sẵn sàng gửi."),
    ],
    "bn": [
        ("Gemini-এর ইনপুট ফিল্ডে প্রবেশ করান। এক্সটেনশন সনাক্ত করে আপনি Gemini পৃষ্ঠায় আছেন কিনা এবং না থাকলে জানায়।",
         "সক্রিয় AI-এর ইনপুট ফিল্ডে প্রবেশ করান।"),
        ("সরাসরি Gemini-তে প্রবেশ করে, পাঠানোর জন্য প্রস্তুত।",
         "সরাসরি সক্রিয় AI-তে প্রবেশ করে, পাঠানোর জন্য প্রস্তুত।"),
    ],
    "nl": [
        ("in het invoerveld van Gemini in te voegen. De extensie detecteert of u op een Gemini-pagina bent en waarschuwt u indien niet.",
         "rechtstreeks in het invoerveld van de actieve AI in te voegen."),
        ("wordt direct ingevoegd in Gemini, klaar om te verzenden.",
         "wordt direct ingevoegd in de actieve AI, klaar om te verzenden."),
    ],
    "sw": [
        ("kwenye uwanja wa kuandika wa Gemini. Kiendelezi hugundua kama uko kwenye ukurasa wa Gemini na kukuarifu ikiwa la.",
         "kwenye uwanja wa kuandika wa AI inayotumika."),
        ("kinaingizwa moja kwa moja kwenye Gemini, tayari kutumwa.",
         "kinaingizwa moja kwa moja kwenye AI inayotumika, tayari kutumwa."),
    ],
    "tl": [
        ("sa input field ng Gemini. Nde-detect ng extension kung nasa Gemini page ka at inaabisuhan ka kung wala.",
         "sa input field ng aktibong AI."),
        ("direktang ini-inject sa Gemini, handa nang ipadala.",
         "direktang ini-inject sa aktibong AI, handa nang ipadala."),
    ],
    "th": [
        ("ในช่องป้อนข้อมูลของ Gemini ส่วนขยายตรวจสอบว่าคุณอยู่ในหน้า Gemini หรือไม่ และแจ้งเตือนหากไม่ใช่",
         "ในช่องป้อนข้อมูลของ AI ที่ใช้งานอยู่"),
        ("จะแทรกโดยตรงใน Gemini พร้อมส่ง",
         "จะแทรกโดยตรงใน AI ที่ใช้งานอยู่ พร้อมส่ง"),
    ],
    "ar": [
        ("في حقل الإدخال في Gemini. يكتشف الامتداد ما إذا كنت على صفحة Gemini ويُخطرك إذا لم تكن كذلك.",
         "في حقل إدخال أي ذكاء اصطناعي مدعوم."),
        ("يُدرج مباشرةً في Gemini، جاهز للإرسال.",
         "يُدرج مباشرةً في الذكاء الاصطناعي النشط، جاهز للإرسال."),
    ],
    "hu": [
        ("a Gemini beviteli mezőjébe illessze be. A bővítmény észleli, hogy Gemini-oldalon van-e, és értesíti, ha nem.",
         "az aktív AI beviteli mezőjébe illessze be."),
        ("közvetlenül a Geminibe illeszti be, küldésre készen.",
         "közvetlenül az aktív AI-ba illeszti be, küldésre készen."),
    ],
    "nb": [
        ("i Geminis inndatafelt. Tillegget varsler deg hvis du ikke er på en Gemini-side.",
         "i inndatafeltet til den aktive AI-en."),
        ("den settes direkte inn i Gemini, klar til å sende.",
         "den settes direkte inn i den aktive AI-en, klar til å sende."),
    ],
    "sv": [
        ("i Geminis inmatningsfält. Tillägget meddelar dig om du inte är på en Gemini-sida.",
         "i indatafältet för den aktiva AI:n."),
        ("den injiceras direkt i Gemini, redo att skicka.",
         "den injiceras direkt i den aktiva AI:n, redo att skicka."),
    ],
    "fi": [
        ("Geminin syöttökenttään. Laajennus ilmoittaa, jos et ole Gemini-sivulla.",
         "aktiivisen AI:n syöttökenttään."),
        ("se injektoidaan suoraan Geminiin, valmiina lähetettäväksi.",
         "se injektoidaan suoraan aktiiviseen AI:hin, valmiina lähetettäväksi."),
    ],
    "ca": [
        ("al camp d'entrada de Gemini.",
         "al camp d'entrada de la IA activa."),
        ("s'injecta directament a Gemini.",
         "s'injecta directament a la IA activa."),
    ],
    "da": [
        ("i Geminis inputfelt. Udvidelsen giver besked, hvis du ikke er på en Gemini-side.",
         "i inputfeltet på den aktive AI."),
        ("den indsættes direkte i Gemini, klar til at sende.",
         "den indsættes direkte i den aktive AI, klar til at sende."),
    ],
    "uk": [
        ("в поле введення Gemini.",
         "в поле введення активного ШІ."),
        ("він вставляється безпосередньо в Gemini.",
         "він вставляється безпосередньо в активний ШІ."),
    ],
    "el": [
        ("στο πεδίο εισόδου του Gemini.",
         "στο πεδίο εισόδου του ενεργού AI."),
        ("εισάγεται απευθείας στο Gemini.",
         "εισάγεται απευθείας στον ενεργό AI."),
    ],
    "he": [
        ("לשדה הקלט של Gemini.",
         "לשדה הקלט של ה-AI הפעיל."),
        ("הוא מוזן ישירות ל-Gemini, מוכן לשליחה.",
         "הוא מוזן ישירות ל-AI הפעיל, מוכן לשליחה."),
    ],
    "et": [
        ("Gemini sisestusväljale.",
         "aktiivse AI sisestusväljale."),
        ("see lisatakse otse Geminisse.",
         "see lisatakse otse aktiivsesse AI-sse."),
    ],
    "lt": [
        ("Gemini įvesties lauką.",
         "aktyvaus AI įvesties lauką."),
        ("jis įterpiamas tiesiai į Gemini.",
         "jis įterpiamas tiesiai į aktyvų AI."),
    ],
    "lv": [
        ("Gemini ievades laukā.",
         "aktīvā AI ievades laukā."),
        ("tā tiek ievietota tieši Gemini.",
         "tā tiek ievietota tieši aktīvajā AI."),
    ],
    "ms": [
        ("ke medan input Gemini.",
         "ke medan input AI aktif."),
        ("ia disisipkan terus ke Gemini.",
         "ia disisipkan terus ke AI aktif."),
    ],
    "bg": [
        ("в полето за въвеждане на Gemini.",
         "в полето за въвеждане на активния AI."),
        ("вмъква се директно в Gemini.",
         "вмъква се директно в активния AI."),
    ],
    "sl": [
        ("v vnosno polje Gemini.",
         "v vnosno polje aktivnega AI."),
        ("vstavi se neposredno v Gemini.",
         "vstavi se neposredno v aktivni AI."),
    ],
    "sr": [
        ("u polje za unos Gemini.",
         "u polje za unos aktivnog AI-ja."),
        ("ubacuje se direktno u Gemini.",
         "ubacuje se direktno u aktivni AI."),
    ],
    "hr": [
        ("u polje za unos Gemini.",
         "u polje za unos aktivnog AI-ja."),
        ("ubacuje se izravno u Gemini.",
         "ubacuje se izravno u aktivni AI."),
    ],
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

    # 2. Replace intro paragraph (first paragraph) with multi-site version
    if lang in INTRO_REPLACEMENTS:
        intro = INTRO_REPLACEMENTS[lang].format(af_name=af_name)
        first_blank = text.find('\n\n')
        if first_blank != -1:
            text = intro + '\n\n' + text[first_blank + 2:]

    # 2b. Replace the 2nd paragraph (GF "Gemini cockpit" line) with AF unified cockpit
    if lang in COCKPIT_REPLACEMENTS:
        cockpit = COCKPIT_REPLACEMENTS[lang].format(af_name=af_name)
        first_blank = text.find('\n\n')
        if first_blank != -1:
            second_blank = text.find('\n\n', first_blank + 2)
            if second_blank != -1:
                text = text[:first_blank + 2] + cockpit + text[second_blank:]

    # 3. Replace the Gem button bullet with new-conv buttons bullet
    if lang in GEM_REPLACEMENTS:
        new_bullet = GEM_REPLACEMENTS[lang]
        match = GEM_BULLET_PATTERN.search(text)
        if match:
            text = text[:match.start()] + new_bullet + text[match.end():]

    # 4. Replace version history section (v1.1 then v1.0)
    if lang in V1_NOTES:
        v1_1 = (V1_1_NOTES[lang] + '\n') if lang in V1_1_NOTES else ''
        match = VERSION_SECTION_PATTERN.search(text)
        if match:
            text = text[:match.start(1)] + v1_1 + V1_NOTES[lang] + '\n'
        else:
            text = text.rstrip() + '\n\n📢 VERSION:\n' + v1_1 + V1_NOTES[lang] + '\n'

    # 5. Replace gemini.google.com references with site list
    text = re.sub(
        r'gemini\.google\.com',
        'Gemini, Claude, ChatGPT, Copilot, Perplexity',
        text
    )

    # 6. Replace "Save to Gemini Folders" / equivalent in How-To section
    text = text.replace(f'"Save to {gf_name}"', f'"Save to {af_name}"') if gf_name else text
    text = text.replace('"Save to Gemini Folders"', f'"Save to {af_name}"')

    # 7. Strip version prefix from the ✨ section heading (handles "WORD WORD v4.0 —", "v4.0 WORD—", "4.0 WORD—")
    text = re.sub(r'(✨\s+)[^\n]*?v?4\.0[^\n—–\-]*[—–\-]+\s*', r'\1', text)

    # 8. Remove any line containing the 💎 Gem configure instruction in how-to
    text = re.sub(r'^[^\n]*💎[^\n]*\n?', '', text, flags=re.MULTILINE)

    # 9. Fix language count: GF said "27 languages", AF supports 43
    text = re.sub(r'(?<!\d)27(?!\d)', '43', text)

    # 10. Insert LOCAL LLM SUPPORT section before 🛠️ how-to section
    if lang in LOCAL_LLM_SECTION:
        section = LOCAL_LLM_SECTION[lang].format(af_name=af_name)
        idx = text.find('\n🛠️')
        if idx != -1:
            text = text[:idx] + '\n\n' + section + text[idx:]

    # 11. Fix injection lines: replace Gemini-specific fragments with active-AI equivalents
    if lang in INJECTION_FIXES:
        for old, new in INJECTION_FIXES[lang]:
            text = text.replace(old, new)

    # 12. Remove the GF cross-promo section for AI Folders — irrelevant in AF's own listing.
    #     Pattern: \n🤖 HEADER\n\nBODY\n\n👉 CTA: __AF_STORE_URL__\n
    text = re.sub(r'\n🤖[^\n]*\n\n[^\n]+\n\n👉[^\n]*__AF_STORE_URL__[^\n]*\n', '\n', text)

    return text


def main():
    os.makedirs(AF_PROMO_DIR, exist_ok=True)

    generated = 0
    for suffix, lang in sorted(PROMO_FILES.items()):
        # Find the GF promo file
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
