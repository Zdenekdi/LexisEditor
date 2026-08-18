# Návrh: dosažení Word-parity — sledování změn, poznámky pod čarou, obsah

_Technický návrh k rozhodnutí. Cílem je dotáhnout tři konstrukce, kde LexisEditor zaostává za MS Word na tom, na čem u soudu a při revizích záleží: **sledování změn (redlining)**, **poznámky pod čarou** a **automatický obsah (TOC)**. Nic se tímto neimplementuje — je to plán a doporučení pořadí._

---

## 1. Shrnutí

Dobrá zpráva: **editor už tyto věci z velké části modeluje.** V `js/core/lexis-core.js` jsou registrované bloty `InsertionBlot` / `DeletionBlot` (sledování změn) i `FootnoteBlot` (`<sup class="footnote-ref" data-text="…">`), je tu `isTrackChangesActive`, `handleTrackChanges`, `insertFootnote`, `updateFootnoteNumbers`; v UI jsou tlačítka i tooltipy (`toggleTrackChanges`, `insertFootnote`, `insertTOC`, přijmout/odmítnout).

Špatná zpráva: **export to celé zahodí.** `exportToDocx` (`js/ui/lexis-ui-3.js`) pošle jen `core.getContent()` (tj. `innerHTML`) do `html-to-docx` (`main.js` → IPC `export-docx`). A `html-to-docx` neumí wordovské revize ani poznámky pod čarou:

- **Poznámka pod čarou** se ve Wordu stane jen horním indexem s číslem — **tělo poznámky (uložené v `data-text`) se ztratí.**
- **Sledované změny** se stanou obyčejným barevným / přeškrtnutým textem — **ne skutečnými `w:ins` / `w:del`**, takže je ve Wordu nelze přijmout/odmítnout.
- **Obsah (TOC)** se vloží jako statický text, ne jako pole, které Word přepočítá.

Jinými slovy: je to dnes **kosmetika, ne interoperabilita.** Tento návrh řeší, jak z toho udělat plnohodnotné wordovské konstrukce.

---

## 2. Kde přesně je problém

Jsou tři nezávislá místa, každé se musí ošetřit:

1. **Serializace (export do .docx)** — největší mezera. `html-to-docx` neumí `w:ins`/`w:del` ani `word/footnotes.xml`. Bez výměny exportního jádra je zbytek marný.
2. **Model v editoru** — bloty existují, ale nesou jen boolean „insertion/deletion". Chybí **autor a čas** změny (Word je vyžaduje u `w:ins`/`w:date`) a chybí **přijmout/odmítnout**. U poznámek je tělo v `data-text`, což stačí, ale chce to postranní panel pro editaci.
3. **Import z Wordu** — `mammoth` revize i poznámky pod čarou zahazuje. Pro obousměrnost je potřeba vlastní čtečka `word/document.xml` + `word/footnotes.xml`.

---

## 3. Doporučené řešení

### 3.1 Exportní jádro: přejít z `html-to-docx` na `docx` (dolanmiu)

`html-to-docx` je fajn na jednoduchý HTML→DOCX, ale je to slepá ulička pro revize/poznámky. Doporučuji vedle něj postavit **druhou exportní cestu** postavenou na knihovně **`docx`** (npm `docx`, dolanmiu), která tyto konstrukce podporuje nativně:

- **Sledování změn:** `InsertedTextRun` / `DeletedTextRun` (nesou `author` + `date`) → generují `w:ins` / `w:del`.
- **Poznámky pod čarou:** poznámky se předají do `Document({ footnotes: {...} })` a v textu se odkážou `FootnoteReferenceRun(id)`.
- **Obsah:** `TableOfContents(...)` → pole `{ TOC \o "1-3" }` + `updateFields`, které Word po otevření přepočítá.
- Stránkové vlastnosti (A4, okraje) už máme vyřešené — přenesou se sem 1:1 (viz `buildDocxOptions` v `main.js`).

**Klíčová architektonická změna:** exportér by neměl číst `innerHTML`, ale **Quill Delta** (`quill.getContents()`). Delta nese vložení/smazání/poznámky **strukturovaně** (jako atributy operací), takže mapování Delta → `docx` je čisté a neztrácí metadata. HTML je pro tyto konstrukce ztrátové mezikolo.

Doporučuji ponechat `html-to-docx` jako **fallback** pro triviální dokumenty bez revizí/poznámek (rychlé, ověřené), a novou Delta→`docx` cestu použít, jakmile dokument obsahuje revize, poznámky nebo TOC.

### 3.2 Zpevnění modelu v editoru

- **Autor + čas na změnách.** Rozšířit `InsertionBlot`/`DeletionBlot` o `data-author` a `data-date` (dnes nesou jen boolean). Nutné pro `w:ins`/`w:del` a pro vícekolové revize. Autor = jméno z profilu advokáta (`readLawyerProfile`).
- **Přijmout/odmítnout.** Doplnit `acceptChange` / `rejectChange` (tlačítka v UI už jsou): přijmout vložení = zrušit formát a text nechat; přijmout smazání = text odstranit; odmítnout = opačně. Plus „přijmout/odmítnout vše".
- **Panel poznámek.** Tělo poznámky je dnes v `data-text` (tooltip). Přidat postranní panel pro psaní/editaci delších poznámek a spolehlivé přečíslování (`updateFootnoteNumbers` už existuje).

### 3.3 Import z Wordu

`mammoth` (i s novým `styleMap`) revize a poznámky nepřenese. Pro plnou obousměrnost přidat v `main.js` (Node) **vlastní čtečku OOXML**: `.docx` je ZIP → rozbalit `word/document.xml` (číst `w:ins`/`w:del` → bloty insertion/deletion) a `word/footnotes.xml` (→ FootnoteBlot s tělem). To je největší kus a patří až nakonec.

---

## 4. Fázový plán (podle poměru přínos/náročnost)

| Fáze | Co | Náročnost | Proč v tomto pořadí |
|---|---|:---:|---|
| **0** | Rozhodnout exportní jádro (`docx` lib), ověřit API revizí/poznámek v aktuální verzi, postavit kostru Delta→`docx` mapperu | S | Základ pro vše ostatní |
| **1** | **Poznámky pod čarou** — export (real `word/footnotes.xml`) + panel pro tělo | S–M | Izolované, rychlá viditelná parita; model už existuje |
| **2** | **Sledování změn** — autor/čas v blotech, export `w:ins`/`w:del`, přijmout/odmítnout | M–L | Jádro redliningu; nejvyšší hodnota pro advokáta |
| **3** | **Automatický obsah (TOC)** — pole `{ TOC }` + záložky na nadpisech | S | Malé, staví na nadpisech (h1–h3), které už umíme |
| **4** | **Import revizí a poznámek z Wordu** — vlastní OOXML čtečka | L | Uzavře obousměrnost; nejnáročnější, proto poslední |

Písmena: S ≈ malé, M ≈ střední, L ≈ velké. Fáze 1–3 dají „exportní" paritu (dokument odejde ven správně); fáze 4 dá „importní" paritu.

---

## 5. Datový model a perzistence

Dokument se ukládá/načítá přes `getContent()` / `setContent()` jako **sanitizovaný HTML** (`innerHTML` přes DOMPurify) — a je i šifrovaně ukládán lokálně. Aby revize a poznámky přežily uložení/načtení:

- ins/del i poznámky **musí být plně v HTML reprezentaci** (což dnes jsou: třídy `insertion`/`deletion`, `<sup data-text data-id>`). Rozšíření o `data-author`/`data-date` do HTML jen přidá atributy — DOMPurify je musí v allow-listu **propustit** (ověřit konfiguraci sanitizace, jinak se metadata při načtení zahodí).
- Export bere `getContents()` (Delta), takže při exportu musí být dokument v editoru „živý" — což je (export běží z otevřeného dokumentu). Bundle `.lexis` může navíc ukládat Delta jako zdroj pravdy.

---

## 6. Rizika a kompatibilita

- **Verze knihovny `docx`.** API revizí/poznámek ověřit hned ve fázi 0 (názvy `InsertedTextRun`/`DeletedTextRun`, footnotes API) — teprve pak stavět mapper.
- **Velikost balíčku / Electron.** `docx` je čistě JS, běží v `main.js` (Node) jako dnes `html-to-docx` → bez nároků na podpis nativních modulů.
- **WYSIWYG shoda.** Vizuální podoba revizí v editoru (barvy, přeškrtnutí) se musí shodovat s tím, jak je zobrazí Word — sladit CSS s wordovským redliningem.
- **Testy (round-trip).** Ke každé fázi automatický test, který vygeneruje `.docx`, rozbalí ZIP a ověří konstrukce: `word/footnotes.xml` existuje a obsahuje tělo; `document.xml` má `w:ins`/`w:del` se správným `w:author`/`w:date`; TOC pole je `{ TOC }`. (Stejný princip jako ověření A4 přes `unzip -p … word/document.xml`.)

---

## 7. Doporučení / minimální životaschopná verze

Kdybys chtěl jeden hmatatelný krok s nejlepším poměrem přínos/práce: **Fáze 0 + 1 (poznámky pod čarou)**. Model už existuje, chybí jen skutečná serializace do `word/footnotes.xml` přes `docx` lib — a rázem má LexisEditor poznámky pod čarou na úrovni Wordu, což je u právních podání častá potřeba. **Fáze 2 (sledování změn)** je pak ta největší hodnota pro revizní práci s protistranou a stojí za samostatný blok práce.

Celé to dohromady posune LexisEditor z „hezký vlastní editor" na „nástroj, jehož `.docx` obstojí ve wordovském světě soudů a protistran" — při zachování jeho výhod (lokální AI, soukromí, napojení na spisovou službu).

Rád postavím Fázi 0+1 (poznámky pod čarou) jako první konkrétní krok, včetně round-trip testu.
