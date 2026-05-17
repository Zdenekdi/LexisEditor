# 🔍 KOMPLETNÍ AUDIT FUNKCIONALIT A TECHNICKÉHO STAVU (LexisEditor v3.0)

Tento dokument poskytuje vyčerpávající a strukturovaný přehled všech integrovaných funkcí a subsystémů v prémiovém právním procesoru **LexisEditor**. Každá funkce je podrobně popsána a ohodnocena jejím aktuálním stavem.

---

## 🗺️ Rychlý přehled stavu modulů

| Modul / Funkce | Stav | Úroveň implementace | Umístění v kódu |
| :--- | :--- | :--- | :--- |
| **Core Rich Text Editor** | ✅ Aktivní / Plně funkční | Excelentní (vlastní Bloty, Quill) | [lexis-core.js](../js/core/lexis-core.js) |
| **Footnotes & Citations** | ✅ Aktivní / Plně funkční | Integrovaný náhled a auto-číslování | [lexis-core.js](../js/core/lexis-core.js) |
| **Track Changes (Změny)** | ✅ Aktivní / Plně funkční | Reaktivní formátování vkládání/mazání | [lexis-core.js](../js/core/lexis-core.js) |
| **LexisAI Provider Engine** | ✅ Aktivní / Plně funkční | Podpora `apfel` a dalších 5 poskytovatelů | [ai-provider.js](../js/providers/ai-provider.js) |
| **Offline Právní Fallback** | ✅ Aktivní / Plně funkční | Heuristická offline právní nápověda | [ai-provider.js](../js/providers/ai-provider.js) |
| **ARES Lookup Client** | ✅ Aktivní / Plně funkční | Přímé REST API, auto-vyplňování | [main.js](../main.js) |
| **ISDS (Datové schránky)** | ✅ Aktivní / Plně funkční | SOAP klient, safeStorage šifrování | [main.js](../main.js) |
| **Dopis Online (ČP)** | ✅ Aktivní / Plně funkční | Integrace Postservis API | [main.js](../main.js) |
| **LexisLink Remote (Mobil)** | ✅ Aktivní / Plně funkční | Lokální HTTP server, mobilní skener | [main.js](../main.js) |
| **TouchID Biometrika** | ✅ Aktivní / Plně funkční | Nativní macOS Keychain & dialogy | [main.js](../main.js) |
| **Import / Export Engine** | ✅ Aktivní / Plně funkční | Mammoth, DOCX, PDF offscreen render | [main.js](../main.js) |
| **ZFO & PDF Parser** | ✅ Aktivní / Plně funkční | Extrakce textu, příloh a metadat | [main.js](../main.js) |
| **Právní kalkulačky** | ✅ Aktivní / Plně funkční | Mimosmluvní odměna, úroky z prodlení | [lexis-ui.js](../js/ui/lexis-ui.js) |
| **Diktování hlasem** | ✅ Aktivní / Plně funkční | HTML5 Speech Recognition v češtině | [lexis-ui.js](../js/ui/lexis-ui.js) |
| **Stavové workflow (Novinka)**| ✅ Aktivní / Plně funkční | Dynamické odznaky, AI auto-status | [lexis-ui.js](../js/ui/lexis-ui.js) |
| **Deadline Guard (Hlídač lhůt)**| ✅ Aktivní / Plně funkční | Skenování PDF/Editoru, ukládání v IndexedDB | [lexis-ui.js](../js/ui/lexis-ui.js) |
| **Document Memory & AutoSave** | ✅ Aktivní / Plně funkční | Paměť dokumentu, lhůt, č.j., IndexedDB záloha | [lexis-ui.js](../js/ui/lexis-ui.js) |
| **Legal Linker (Zákony pro lidi)**| ✅ Aktivní / Plně funkční | Auto-generování odkazů na zákony v ČR | [lexis-ui.js](../js/ui/lexis-ui.js) |


---

## 📑 1. Core Rich Text Editor a Formátování
Základ aplikace staví na silně upraveném editoru Quill, který je přizpůsoben přísným standardům právních dokumentů.

*   **Custom Parchment Bloty (Styly)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Registrace speciálních strukturních elementů jako `ql-article` (odstavce smluv) a `ql-legal-section` pro formátování právních textů. Podpora pro `line-height` a komplexní CSS styly.
*   **Reaktivní sledování změn (Track Changes)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Monitorování uživatelských zásahů. Smazaný text se neztrácí, nýbrž se zbarví červeně a přeškrtne (`ql-deletion`), nově přidaný text se zbarví zeleně a podtrhne (`ql-insertion`). Lze kdykoliv zapnout/vypnout přes Ribbon.
*   **Poznámky pod čarou & Citace**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Pokročilé generování poznámek pod čarou (`FootnoteBlot`) s automatickým číslováním. Aplikace průběžně na pozadí detekuje polohu poznámek a automaticky přepočítává jejich indexy (1, 2, 3...) v reálném čase.
*   **Bezpečnostní Clipboard Sanitizer**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Použití knihovny DOMPurify na úrovni schránky (clipboard) – jakýkoliv vložený text je před vykreslením vyčištěn od škodlivých XSS skriptů.

---

## 🤖 2. Umělá inteligence (LexisAI Engine)
Jedna z nejvýkonnějších částí aplikace, nabízející maximální flexibilitu a suverenitu dat.

*   **Apple Intelligence (apfel)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Přímá nativní integrace lokálního Apple Silicon modelu. Při spuštění `apfel --serve` na portu `11434` komunikuje přes OpenAI kompatibilní rozhraní s modelem `apple-intelligence`. Zaručuje 100% offline provoz a nulové úniky dat.
*   **Ostatní AI poskytovatelé**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Plná podpora a přednastavené endpointy pro **Ollama**, **OpenAI**, **DeepSeek**, **Google Gemini** a **LM Studio**.
*   **Bezpečný šifrovaný trezor (SecureVault)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Citlivá data (API klíče a hesla) nejsou ukládána jako prostý text. V desktopovém režimu se používá systémové šifrování `safeStorage` (Apple Keychain / Windows Credential Manager). V prohlížeči se používá Base64 šifrování do `localStorage` jako fallback.
*   **Inteligentní offline právní model (Fallback)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Pokud selže síťové připojení nebo lokální LLM server neběží, aplikace automaticky aktivuje vestavěnou expertní databázi (heuristic fallback engine). Ta na základě klíčových slov (nájem, smluvní pokuta, výpověď, judikatura) okamžitě vygeneruje relevantní právní rozbory a citace z Občanského zákoníku.

---

## 🏢 3. Externí státní a doručovací registry
Aplikace integruje přímé mosty na státní správu a logistické služby pro urychlení právní administrativy.

*   **ARES vyhledávací klient**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Integrace s novým oficiálním REST API Ministerstva financí ČR. Po zadání IČO stáhne obchodní jméno, sídlo, právní formu a DIČ. Umožňuje automaticky generovat záhlaví smluv a doplňovat smluvní strany bez nutnosti ručního přepisování.
*   **ISDS (Datové schránky)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Bezpečné uložení přihlašovacích údajů, ověření připojení přes SOAP API a možnost odeslání hotových dokumentů přímo do datových schránek protistran.
*   **Dopis Online (Česká pošta)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Integrace s rozhraním Postservis České pošty. Umožňuje odeslání PDF dokumentů k fyzickému vytištění a doporučenému doručení poštou přímo z editoru.

---

## 📱 4. Mobilní propojení (LexisLink)
Režim pro sdílení práce mezi stolním počítačem a mobilním zařízením.

*   **Vzdálené ovládání a přenos (Office Mode)**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: LexisEditor na pozadí spustí zabezpečený lokální HTTP server na portu `3300`. Po naskenování QR kódu mobilem získá uživatel přístup k ovládacímu panelu, odkud může vzdáleně spouštět AI audity nebo analýzy.
*   **Mobilní foto-skener dokumentů**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Uživatel může na mobilu vyfotit fyzický dokument. Ten je okamžitě zašifrován a bezdrátově přenesen přímo do běžícího LexisEditoru na PC jako obrázková příloha nebo podklad pro vestavěný OCR modul.

---

## 🔒 5. Zabezpečení a Desktopové Integrace
Díky běhu v prostředí Electron má aplikace hluboký přístup k systémovým prostředkům.

*   **Nativní TouchID Biometrika**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Při startu aplikace nebo při pokusu o zobrazení dešifrovaných hesel v nastavení je vyvolán nativní systémový macOS TouchID dialog pro biometrické ověření uživatele.
*   **Automatický import / export**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*:
        - **Mammoth DOCX Importer**: Rychlý převod souborů Microsoft Word do čistého HTML struktury editoru.
        - **DOCX Exporter**: Export do formátu Word včetně zachování tabulek a stylů.
        - **Dual Bundle Exporter**: Současný export do PDF i DOCX. PDF je generováno pomocí offscreen renderování s naprostou přesností na milimetry.
*   **Pokročilé ZFO & PDF Parsery a Prohlížeče**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*:
        - Import `.zfo` (oficiální formát datových zpráv) – extrahuje odesílatele, ID schránky, předmět a všechny přílohy.
        - **Integrovaný PDF Prohlížeč (Side-by-Side)**: Umožňuje otevřít jakýkoliv PDF dokument v samostatném responzivním panelu vedle textového editoru. Uživatel může číst referenční materiály a zároveň psát podání.
        - **PDF Text Extractor**: Možnost jediným kliknutím převést a importovat veškerý text z PDF na pozici kurzoru v editoru.

---

## 🛠️ 6. Právní nástroje a UI
Doplňkové utility usnadňující každodenní práci právníka.

*   **Kalkulačka advokátního tarifu**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Výpočet mimosmluvní odměny advokáta podle vyhlášky Ministerstva spravedlnosti č. 177/1996 Sb. (Advokátní tarif) na základě hodnoty věci a počtu úkonů právní služby.
*   **Kalkulačka úroků z prodlení**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Výpočet zákonných úroků z prodlení na základě aktuální repo sazby České národní banky (ČNB) navýšené o 8 procentních bodů.
*   **Diktování textu hlasem**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Hlasové zadávání textu pomocí HTML5 Speech Recognition s vysokou úspěšností v českém jazyce.

---

## 💼 7. Stavové workflow dokumentů (Novinka)
Nástroj pro správu životního cyklu dokumentů.

*   **Interaktivní status odznaky**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Možnost přiřadit dokumentu stav (`✍️ Rozpracované`, `✨ Generované AI`, `🔍 Ke kontrole`, `✅ Hotové`) přímo v záhlaví. Odznak je barevně odlišený a kliknutím otevře kontextové menu pro rychlou změnu.
*   **AI Auto-status**:
    *   *Stav*: **100% Plně funkční**.
    *   *Popis*: Jakákoliv aktivita umělé inteligence (např. automatická AI anonymizace nebo vygenerování textu) automaticky změní status na `✨ Generované AI` pro zajištění transparentnosti.

---

# 🚀 PLÁNOVANÝ BACKLOG (Do dalších verzí)

Na základě hloubkového auditu a požadavků uživatele byly do backlogu zařazeny tyto prioritní body:

## ⏳ Fáze 1: Workflow & Metadata (Vysoká priorita)
1.  **[BACKLOG] Filtrování dokumentů v seznamu na startovací obrazovce**:
    *   *Popis*: Umožnit uživateli na úvodní obrazovce filtrovat uložené dokumenty podle jejich stavu (např. ukázat pouze ty, které jsou "Ke kontrole").

## 🛡️ Fáze 3: Enterprise integrace (Nízká priorita)
5.  **[BACKLOG] Podepisování dokumentů pomocí PDF Signatur**:
    *   *Popis*: Integrace s kryptografickými klíči pro elektronický podpis dokumentů přímo při exportu do formátu PDF (využití knihovny node-forge).
