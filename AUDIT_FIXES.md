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

## ⏳ Zbývá (vyžaduje rozhodnutí / větší zásah — NEspěchat bez běhového testu)

- **S4 — dokumenty v localStorage v plaintextu** (verze, autosave). Skutečná oprava = šifrování at-rest navázané na `lexis.key`; renderer dnes klíč nemá → je to architektonický úkol (šifrovaný store přes main/SafeStorage nebo přesun do šifrované DB). Doporučeno naplánovat samostatně.
- **D4b — odpověď neumí vytáhnout č.j./sp. zn. z PDF přílohy** (přílohy nesou jen cestu, ne text). Vyžaduje extrakci textu z příloh (PDF parser) v pipeline příjmu.
- **Mrtvý kód z override kolizí** (`lexis-ui.js` vs `lexis-ui-5.js`, ~33 metod). Úklid ~2000 řádků; nízké riziko funkční, ale vyšší riziko regrese → dělat opatrně s ověřením každé metody, ideálně samostatně.

## Zbývá mimo audit (dřívější)
- Commit/push všech změn; DirectCase OAuth (Fáze 1b); doladit mapování polí LawGPT po spuštění; code signing (čeká na IČO).
