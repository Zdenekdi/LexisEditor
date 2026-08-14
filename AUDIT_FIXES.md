# Audit — stav oprav (2026-08)

Návazně na `AUDIT_2026-08.md`. Testy: `npm test` = **59/59 zelené**
(5 sad: court-consistency, legal-calc, legal-linker, outbox, isds-transport,
research, helpers).

## ✅ Opraveno (dávky A–E)

**Dávka A — XSS**
- `data-spis` z importu se escapuje před vložením do innerHTML (obcházelo DOMPurify) — `lexis-core.js`.
- Mail-merge náhled (hlavičky i buňky CSV) — `lexis-ui-5.js`.
- Doručená pošta `doc.summary` — `lexis-ui-4.js`.
- Soudní jednání (InfoJednání: druh/síň/soudce/organizace) — `lexis-ui-5.js`.
- AI výstup v chatu (escapováno před markdownem) — `lexis-ui-2.js`.
- Dialog `customPrompt` — escapování `defaultValue` v atributu — `lexis-dialogs.js`.
- ISDS panel (list i detail: odesílatel/předmět/přílohy; tělo přes DOMPurify) — `lexis-ui.js`.

**Dávka B — korektnost**
- Vyplnění proměnných: dřív vložilo jen první znak a rozbíjelo Quill model — přepsáno (šablona + Quill API + escapování) — `lexis-ui-3.js`.
- Legal Linker: hltavý regex pohlcoval prózu za § — zúžen; +testy — `lexis-legal-linker.js`.

**Dávka C — ISDS doručování**
- **D1:** odeslání soudu jde přes OVĚŘENÉ ISDS z registru (dotaz dbID, ne jméno); při víc/nejednoznačných schránkách se nepřidává naslepo — `lexis-datovka.js`.
- **D2:** nejistý výsledek odeslání → stav `review` (žádné tiché auto-opakování = žádné duplicitní podání); +testy — `isds-outbox.js`.
- **D3:** nedoručitelná (stav 7) → `failed`, ne „odesláno".
- **D4a:** sp. zn. bez návěští jen z hlavičky dokumentu (ne cizí citace z těla) — `lexis-reply.js`.

**Dávka D — bezpečnost (main)**
- **S3:** SSRF — override ISDS endpointu jen na oficiální domény (mojedatovaschranka.cz/czebox.cz); +testy — `isds-transport.js`.
- **S2:** LexisLink `/api/command` — jen POST + token + allow-list příkazů — `main.js`.
- **S5:** upozornění na slabý „basic_text" backend safeStorage na Linuxu — `main.js`.
- Startovní zámek už nesundá overlay bez ověření (používá `authenticateBiometric`) — `renderer-bootstrap.js`.

**Dávka E — S1: hesla se nevrací do rendereru**
- `get-isds-config`/`get-post-config` vrací `hasPassword` místo hesla; `save-*` zachová uložené heslo při prázdném poli; `test-isds-connection` doplní heslo z main procesu; formulář ukazuje placeholder — `main.js`, `lexis-isds-settings.js`.

**Dávka F (dřívější, commit)**
- Soudní poplatek strop 250 mil.; `LexisStorage.get()` falsy; CSV parser kontaktů; `insertAresData` (core.quill); `saveDetectedDeadlineDate`; Ctrl+F guard zámku; příloha datovky allow-list přípon; mrtvá záloha klíče (preload most); falešné „Lhůta ✓"; escapování chyb importu ZFO.

## ✅ Dokončeno i zbývající tři (dávka G)

- **S4 — dokumenty v localStorage nyní ŠIFROVANÉ at-rest.** Historie verzí i autosave se šifrují systémovým safeStorage přes main proces (sync IPC `secure-encrypt/decrypt-sync`, prefix `enc:`, migrace starých plaintext dat). Bez šifrování (web) fallback na plaintext. — `main.js`, `preload.js`, `lexis-versions.js`, `lexis-actions.js`.
- **D4b — odpověď vytáhne č.j./sp. zn. i z PDF příloh.** Nový `extract-file-text` (pdf-parse) v main + `extractFileText` v preloadu; reply-inbox hydratuje `f.text` z PDF příloh před extrakcí náležitostí; +testy. — `main.js`, `preload.js`, `lexis-reply-inbox.js`.
- **Mrtvý kód — UKLIZENO.** Z `lexis-ui.js` odstraněno **10 přebitých metod** (620 řádků; 2092→1472) přes AST (acorn). Ověřeno harness porovnáním LexisUI.prototype před/po: **218 metod, 0 rozdílů** → funkčně beze změny. (Bonus: potvrzeno, že živá detekce jednání v `-5` už používá robustní `LexisCourt.detect` — dřívější úprava dead kopie neměla vliv, žádná mezera.)

**Stav testů po dávce G:** `npm test` = **62/62** (8 sad).

## Zbývá mimo audit (dřívější)
- Commit/push všech změn; DirectCase OAuth (Fáze 1b); doladit mapování polí LawGPT po spuštění; code signing (čeká na IČO).
