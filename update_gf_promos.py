"""
update_gf_promos.py
Updates all non-English Gemini Folders promo files with:
  1. Shortened v4.2 changelog (+ ↓/↑ mention)
  2. ↓/↑ added to the Prompt Trigger feature bullet

Run: python update_gf_promos.py
"""
import os, re

GF_PROMO_DIR = "Marketing/gemini-folders"

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

# New shortened v4.2 changelog per language
V4_2_NOTES = {
    "fr":    "Version 4.2 (Déclenchement de prompt) : Tapez # dans le champ de saisie de Gemini pour voir vos prompts filtrés en temps réel. Utilisez ↓/↑ pour naviguer entre les suggestions, Espace pour autocompléter ou injecter — sans jamais ouvrir le panneau.",
    "de":    "Version 4.2 (Prompt-Auslöser): Geben Sie # in das Eingabefeld von Gemini ein, um gespeicherte Prompts in Echtzeit gefiltert zu sehen. Verwenden Sie ↓/↑ zum Navigieren durch Vorschläge, Leertaste zum Autovervollständigen oder Einsetzen — ohne das Panel zu öffnen.",
    "es":    "Versión 4.2 (Disparador de prompts): Escribe # en el campo de chat de Gemini para ver tus prompts filtrados en tiempo real. Usa ↓/↑ para navegar entre sugerencias, Espacio para autocompletar o inyectar — sin abrir jamás el panel.",
    "it":    "Versione 4.2 (Prompt Trigger): Digita # nel campo di chat di Gemini per vedere i tuoi prompt filtrati in tempo reale. Usa ↓/↑ per navigare tra i suggerimenti, Spazio per autocompletare o iniettare — senza mai aprire il pannello.",
    "pt_BR": "Versão 4.2 (Gatilho de Prompt): Digite # no campo de chat do Gemini para ver seus prompts filtrados em tempo real. Use ↓/↑ para navegar entre sugestões, Espaço para autocompletar ou injetar — sem abrir o painel.",
    "pt_PT": "Versão 4.2 (Gatilho de Prompt): Escreva # no campo de chat do Gemini para ver os seus prompts filtrados em tempo real. Use ↓/↑ para navegar entre sugestões, Espaço para autocompletar ou injetar — sem abrir o painel.",
    "pl":    "Wersja 4.2 (Wyzwalacz Promptów): Wpisz # w polu czatu Gemini, aby zobaczyć swoje prompty filtrowane w czasie rzeczywistym. Użyj ↓/↑ do nawigacji między sugestiami, Spacji do autouzupełniania lub wstrzyknięcia — bez otwierania panelu.",
    "ru":    "Версия 4.2 (Триггер промптов): Введите # в поле чата Gemini, чтобы видеть сохранённые промпты с фильтрацией в реальном времени. Используйте ↓/↑ для навигации по подсказкам, пробел для автодополнения или вставки — без открытия панели.",
    "zh_CN": "版本 4.2（提示词触发器）：在 Gemini 聊天框输入 # 即可实时过滤查看已保存的提示词。用 ↓/↑ 浏览建议，空格键自动补全或注入 — 无需打开面板。",
    "ja":    "バージョン 4.2（プロンプトトリガー）：Gemini のチャット欄に # を入力すると、保存済みプロンプトがリアルタイムで絞り込まれて表示されます。↓/↑ で候補を選択し、スペースでオートコンプリートまたは挿入 — パネルを開かずに。",
    "ko":    "버전 4.2 (프롬프트 트리거): Gemini 채팅 필드에 #을 입력하면 저장된 프롬프트가 실시간으로 필터링됩니다. ↓/↑로 제안 사항을 탐색하고, 스페이스로 자동 완성 또는 주입 — 패널을 열지 않아도 됩니다.",
    "hi":    "संस्करण 4.2 (प्रॉम्प्ट ट्रिगर): Gemini के चैट फ़ील्ड में # टाइप करें और अपने सहेजे गए प्रॉम्प्ट को रीयल टाइम में फ़िल्टर होते देखें। सुझावों में नेविगेट करने के लिए ↓/↑ का उपयोग करें, ऑटोकंप्लीट या इंजेक्ट करने के लिए स्पेस — पैनल खोले बिना।",
    "ro":    "Versiunea 4.2 (Declanșatorul de Prompturi): Tastați # în câmpul de chat al Gemini pentru a vedea prompturile salvate filtrate în timp real. Folosiți ↓/↑ pentru a naviga prin sugestii, Spațiu pentru autocompletare sau injectare — fără a deschide vreodată panoul.",
    "cs":    "Verze 4.2 (Spouštěč promptů): Zadejte # do pole chatu Gemini a zobrazte si uložené prompty filtrované v reálném čase. Pomocí ↓/↑ procházejte návrhy, mezerníkem je automaticky dokončete nebo vložte — bez otevření panelu.",
    "sk":    "Verzia 4.2 (Spúšťač promptov): Zadajte # do poľa chatu Gemini a zobrazte si uložené prompty filtrované v reálnom čase. Pomocou ↓/↑ prechádzajte návrhy, medzerníkom ich automaticky dokončite alebo vložte — bez otvorenia panela.",
    "tr":    "Sürüm 4.2 (Prompt Tetikleyici): Gemini sohbet alanına # yazarak kayıtlı promptlarınızı gerçek zamanlı filtrelenmiş görün. Öneriler arasında gezinmek için ↓/↑ kullanın, otomatik tamamlamak veya eklemek için Boşluk — paneli açmadan.",
    "id":    "Versi 4.2 (Pemicu Prompt): Ketik # di kolom chat Gemini untuk melihat prompt yang tersimpan difilter secara real time. Gunakan ↓/↑ untuk menavigasi saran, Spasi untuk melengkapi otomatis atau menyuntikkan — tanpa membuka panel.",
    "zh_TW": "版本 4.2（提示詞觸發器）：在 Gemini 聊天框輸入 # 即可即時篩選查看已儲存的提示詞。用 ↓/↑ 瀏覽建議，空白鍵自動補全或插入 — 無需開啟面板。",
    "vi":    "Phiên bản 4.2 (Kích hoạt Prompt): Nhập # vào trường chat Gemini để xem các prompt đã lưu được lọc theo thời gian thực. Dùng ↓/↑ để điều hướng gợi ý, phím Cách để tự hoàn thành hoặc chèn — mà không cần mở bảng.",
    "bn":    "সংস্করণ 4.2 (প্রম্পট ট্রিগার): Gemini চ্যাট ফিল্ডে # টাইপ করুন এবং রিয়েল টাইমে ফিল্টার করা সংরক্ষিত প্রম্পটগুলি দেখুন। পরামর্শে নেভিগেট করতে ↓/↑ ব্যবহার করুন, অটোকমপ্লিট বা ইনজেক্ট করতে স্পেস — প্যানেল না খুলেই।",
    "nl":    "Versie 4.2 (Prompt-trigger): Typ # in het chatv eld van Gemini om uw opgeslagen prompts in realtime gefilterd te zien. Gebruik ↓/↑ om door suggesties te navigeren, Spatie om automatisch aan te vullen of in te voegen — zonder het panel te openen.",
    "sw":    "Toleo 4.2 (Kichocheo cha Amri): Andika # katika uwanja wa mazungumzo wa Gemini ili uone maagizo yako yaliyohifadhiwa yakichujwa kwa wakati halisi. Tumia ↓/↑ kuvinjari mapendekezo, Spacebar kukamilisha kiotomatiki au kuingiza — bila kufungua paneli.",
    "tl":    "Bersyon 4.2 (Prompt Trigger): I-type ang # sa chat field ng Gemini para makita ang iyong mga na-save na prompt na na-filter sa real time. Gamitin ang ↓/↑ para mag-navigate sa mga mungkahi, Space para mag-autocomplete o mag-inject — nang hindi binubuksan ang panel.",
    "th":    "เวอร์ชัน 4.2 (ตัวกระตุ้น Prompt): พิมพ์ # ในช่องแชทของ Gemini เพื่อดูพรอมต์ที่บันทึกไว้แบบกรองแบบเรียลไทม์ ใช้ ↓/↑ เพื่อเลือกคำแนะนำ กด Space เพื่อเติมอัตโนมัติหรือแทรก — โดยไม่ต้องเปิดแผง",
    "ar":    "الإصدار 4.2 (مُشغِّل الإرشادات): اكتب # في حقل دردشة Gemini لرؤية إرشاداتك المحفوظة مفلترةً في الوقت الفعلي. استخدم ↓/↑ للتنقل بين الاقتراحات، ومسافة للإكمال التلقائي أو الإدراج — دون فتح اللوحة.",
    "hu":    "4.2-es verzió (Prompt-kiváltó): Írjon # jelet a Gemini chat mezőbe, hogy valós időben szűrve lássa mentett promptjait. Használja a ↓/↑ billentyűket a javaslatok közötti navigáláshoz, a szóközt az automatikus kiegészítéshez vagy beillesztéshez — a panel megnyitása nélkül.",
    "nb":    "Versjon 4.2 (Promptutløser): Skriv # i Geminis chatfelt for å se dine lagrede prompter filtrert i sanntid. Bruk ↓/↑ til å navigere gjennom forslag, Mellomrom for å autofullføre eller injisere — uten å åpne panelet.",
    "sv":    "Version 4.2 (Promptutlösare): Skriv # i Geminis chattfält för att se dina sparade promptar filtrerade i realtid. Använd ↓/↑ för att navigera bland förslag, Blanksteg för att autokomplettera eller injicera — utan att öppna panelen.",
    "fi":    "Versio 4.2 (Kehotteen laukaisin): Kirjoita # Geminin chat-kenttään nähdäksesi tallennetut kehotteesi suodatettuina reaaliajassa. Käytä ↓/↑ ehdotusten selailuun, välilyöntiä automaattitäydennykseen tai lisäämiseen — avaamatta paneelia.",
    "ca":    "Versió 4.2 (Disparador de Prompts): Escriviu # al camp de xat de Gemini per veure els vostres prompts filtrats en temps real. Useu ↓/↑ per navegar pels suggeriments, Espai per autocompletar o injectar — sense obrir mai el panell.",
    "da":    "Version 4.2 (Prompt-udløser): Skriv # i Geminis chatfelt for at se dine gemte prompts filtreret i realtid. Brug ↓/↑ til at navigere gennem forslag, Mellemrum for at autofuldføre eller injicere — uden at åbne panelet.",
    "uk":    "Версія 4.2 (Тригер підказок): Введіть # у поле чату Gemini, щоб бачити збережені підказки з фільтрацією в реальному часі. Використовуйте ↓/↑ для навігації між пропозиціями, пробіл для автодоповнення або вставки — без відкриття панелі.",
    "el":    "Έκδοση 4.2 (Ενεργοποιητής Prompt): Πληκτρολογήστε # στο πεδίο chat του Gemini για να δείτε τα αποθηκευμένα σας prompts φιλτραρισμένα σε πραγματικό χρόνο. Χρησιμοποιήστε ↓/↑ για πλοήγηση στις προτάσεις, Κενό για αυτόματη συμπλήρωση ή εισαγωγή — χωρίς να ανοίξετε τον πίνακα.",
    "he":    "גרסה 4.2 (מפעיל Prompt): הקלד # בשדה הצ'אט של Gemini כדי לראות את ה-Prompt השמורים מסוננים בזמן אמת. השתמש ב-↓/↑ לניווט בין הצעות, רווח להשלמה אוטומטית או הזרקה — מבלי לפתוח את הפאנל.",
    "et":    "Versioon 4.2 (Viipade käivitaja): Sisestage # Gemini vestlusväljale, et näha salvestatud viipasid reaalajas filtreerituna. Kasutage ↓/↑ soovituste vahel liikumiseks, Tühikut automaatseks täitmiseks või lisamiseks — ilma paneeli avamata.",
    "lt":    "Versija 4.2 (Raginimų paleidiklis): Įveskite # Gemini pokalbių lauke, kad realiuoju laiku matytumėte filtruotus išsaugotus raginimus. Naudokite ↓/↑ naršyti pasiūlymams, tarpą automatiškai užbaigti ar įterpti — neatidarant skydelio.",
    "lv":    "Versija 4.2 (Uzvedņu aktivizētājs): Ievadiet # Gemini tērzēšanas laukā, lai reāllaikā filtrētu saglabātās uzvednes. Izmantojiet ↓/↑, lai pārvietotos starp ieteikumiem, Atstarpi automātiskai pabeigšanai vai ievietošanai — neatverot paneli.",
    "ms":    "Versi 4.2 (Pencetus Prompt): Taip # dalam medan chat Gemini untuk melihat arahan tersimpan anda ditapis dalam masa nyata. Gunakan ↓/↑ untuk navigasi cadangan, Ruang untuk autoisi atau suntik — tanpa membuka panel.",
    "bg":    "Версия 4.2 (Тригер за подсказки): Въведете # в полето за чат на Gemini, за да видите запазените подсказки, филтрирани в реално време. Използвайте ↓/↑ за навигация между предложенията, интервала за автодовършване или вмъкване — без да отваряте панела.",
    "sl":    "Različica 4.2 (Sprožilec pozivov): Vnesite # v polje za klepet Gemini in v realnem času glejte filtrirane shranjene pozive. Uporabite ↓/↑ za krmarjenje med predlogi, preslednico za samodejno dokončanje ali vstavljanje — brez odpiranja plošče.",
    "sr":    "Верзија 4.2 (Окидач промптова): Унесите # у поље за разговор са Gemini да бисте у реалном времену видели филтриране сачуване промптове. Користите ↓/↑ за навигацију кроз предлоге, размак за аутодовршавање или убацивање — без отварања панела.",
    "hr":    "Verzija 4.2 (Okidač upita): Unesite # u polje za chat s Geminijem kako biste u stvarnom vremenu vidjeli filtrirane spremljene upite. Koristite ↓/↑ za navigaciju kroz prijedloge, Razmak za automatsko dovršavanje ili ubacivanje — bez otvaranja panela.",
}

# Text to prepend before "Space" in the Prompt Trigger bullet (per language)
# Format: (text_to_insert, search_anchor) — inserts `text_to_insert` before `search_anchor`
TRIGGER_ARROW_ADDITION = {
    "fr":    ("Utilisez ↓/↑ pour naviguer entre les suggestions, appuyez", "Appuyez"),
    "de":    ("Verwenden Sie ↓/↑ zum Navigieren, drücken Sie", "Drücken Sie"),
    "es":    ("Usa ↓/↑ para navegar entre sugerencias, presiona", "Presiona"),
    "it":    ("Usa ↓/↑ per navigare tra i suggerimenti, premi", "Premi"),
    "pt_BR": ("Use ↓/↑ para navegar entre sugestões, pressione", "Pressione"),
    "pt_PT": ("Use ↓/↑ para navegar entre sugestões, pressione", "Pressione"),
    "pl":    ("Użyj ↓/↑ do nawigacji między sugestiami, naciśnij", "Naciśnij"),
    "ru":    ("Используйте ↓/↑ для навигации, нажмите", "Нажмите"),
    "zh_CN": ("用 ↓/↑ 浏览建议，按", "按"),
    "ja":    ("↓/↑ で候補を選択し、", "スペース"),
    "ko":    ("↓/↑로 제안 탐색 후 ", "스페이스"),
    "hi":    ("↓/↑ से नेविगेट करें, फिर स्पेस", "स्पेस"),
    "ro":    ("Folosiți ↓/↑ pentru a naviga, apăsați", "Apăsați"),
    "cs":    ("Pomocí ↓/↑ procházejte návrhy, stiskněte", "Stiskněte"),
    "sk":    ("Pomocou ↓/↑ prechádzajte návrhy, stlačte", "Stlačte"),
    "tr":    ("↓/↑ ile gezinin, ardından", "Boşluk"),
    "id":    ("Gunakan ↓/↑ untuk navigasi, tekan", "Tekan"),
    "zh_TW": ("用 ↓/↑ 瀏覽建議，按", "按"),
    "vi":    ("Dùng ↓/↑ để điều hướng, nhấn", "Nhấn"),
    "bn":    ("↓/↑ দিয়ে নেভিগেট করুন, তারপর স্পেস", "স্পেস"),
    "nl":    ("Gebruik ↓/↑ om te navigeren, druk op", "Druk op"),
    "sw":    ("Tumia ↓/↑ kuvinjari, kisha bonyeza", "Bonyeza"),
    "tl":    ("Gamitin ang ↓/↑ para mag-navigate, pindutin ang", "Pindutin"),
    "th":    ("ใช้ ↓/↑ เพื่อเลือก แล้วกด", "กด"),
    "ar":    ("استخدم ↓/↑ للتنقل، ثم اضغط", "اضغط"),
    "hu":    ("Használja a ↓/↑ billentyűket a navigáláshoz, majd nyomja meg", "Nyomja meg"),
    "nb":    ("Bruk ↓/↑ for å navigere, trykk", "Trykk"),
    "sv":    ("Använd ↓/↑ för att navigera, tryck", "Tryck"),
    "fi":    ("Käytä ↓/↑ selailuun, paina", "Paina"),
    "ca":    ("Useu ↓/↑ per navegar, premeu", "Premeu"),
    "da":    ("Brug ↓/↑ til at navigere, tryk på", "Tryk på"),
    "uk":    ("Використовуйте ↓/↑ для навігації, натисніть", "Натисніть"),
    "el":    ("Χρησιμοποιήστε ↓/↑ για πλοήγηση, πατήστε", "Πατήστε"),
    "he":    ("השתמש ב-↓/↑ לניווט, לחץ", "לחץ"),
    "et":    ("Kasutage ↓/↑ navigeerimiseks, vajutage", "Vajutage"),
    "lt":    ("Naudokite ↓/↑ naršymui, paspauskite", "Paspauskite"),
    "lv":    ("Izmantojiet ↓/↑ navigācijai, nospiediet", "Nospiediet"),
    "ms":    ("Gunakan ↓/↑ untuk navigasi, tekan", "Tekan"),
    "bg":    ("Използвайте ↓/↑ за навигация, натиснете", "Натиснете"),
    "sl":    ("Uporabite ↓/↑ za krmarjenje, pritisnite", "Pritisnite"),
    "sr":    ("Користите ↓/↑ за навигацију, притисните", "Притисните"),
    "hr":    ("Koristite ↓/↑ za navigaciju, pritisnite", "Pritisnite"),
}


def update_file(path, lang):
    with open(path, encoding='utf-8') as f:
        text = f.read()

    changed = False

    # 1. Replace the v4.2 changelog line
    if lang in V4_2_NOTES:
        new_text = re.sub(
            r'^\S+\s+4\.2\b[^\n]*',
            V4_2_NOTES[lang],
            text,
            flags=re.MULTILINE
        )
        if new_text != text:
            text = new_text
            changed = True

    # 2. Add ↓/↑ to the Prompt Trigger feature bullet (⌨️ line) if not already present
    if lang in TRIGGER_ARROW_ADDITION:
        insert_text, anchor = TRIGGER_ARROW_ADDITION[lang]
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if line.startswith('⌨️') and anchor in line and '↓' not in line:
                # insert_text already includes the lowercase form of anchor at its end;
                # replace anchor with insert_text so the rest of the sentence flows on.
                lines[i] = line.replace(anchor, insert_text, 1)
                changed = True
                break
        text = '\n'.join(lines)

    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        return True
    return False


def main():
    updated = 0
    for suffix, lang in sorted(PROMO_FILES.items()):
        path = os.path.join(GF_PROMO_DIR, f'Promo{suffix}.txt')
        if not os.path.exists(path):
            print(f'  SKIP {lang:6s} — file not found')
            continue
        if update_file(path, lang):
            print(f'  OK   {lang:6s}')
            updated += 1
        else:
            print(f'  SKIP {lang:6s} — no changes needed')
    print(f'\nDone — {updated} files updated.')


if __name__ == '__main__':
    main()
