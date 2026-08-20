# Backlog — Word-parita a AI (LexisEditor)

Zbývající nápady/mezery vůči MS Word a k AI. Vše je vědomě odložené — jádro
Word-parity (A4, sledované změny s autorem + přijmout/odmítnout + recenzní panel,
poznámky pod čarou, komentáře, obsah/TOC, obrázky, výchozí Times New Roman 12,
víceúrovňové číslování, „Strana X z Y", porovnání verzí/redline, tabulky) je
hotové a otestované (`tests/unit/word-parity.test.js`).

## AI + revize (na přání uživatele)
- [x] **HOTOVO — AI navrhuje úpravy jako SLEDOVANÉ ZMĚNY (AI redline).** Uživatel
  označí text → „Přepsat (revize)" (pás Domů), kontextové menu, nebo Ctrl+Alt+R
  (s nepovinným pokynem, co upravit). AI přepíše jen výběr (systémový prompt „vrať
  POUZE upravené znění"), rozdíl se přes `compare.js` vloží jako sledované změny
  (`ql-insertion`/`ql-deletion` s autorem „AI · <advokát>"), otevře se recenzní
  panel k přijmout/odmítnout a export je uloží jako `w:ins`/`w:del`. Nová čistá
  funkce `LexisCompare.buildRedline` (compare + inline odlehčení odstavce),
  `core.insertRedlineFromRevision`, UI `lexisUI.reviseSelectionAsRedline`. Kryto
  testy (`buildRedline` inline/blok/beze-změny + OOXML round-trip s AI autorem).
- [x] **HOTOVO — AI vkládá poznámky pod čarou / komentáře.** Kontextové menu nad
  výběrem: „LexisAI: Poznámka pod čarou" (AI navrhne poznámku s právním pramenem,
  vloží se `insertFootnote` za tvrzení → export do `footnotes.xml`) a „LexisAI:
  Komentář k pasáži" (AI napíše redakční komentář, `insertComment` na výběr → export
  do `comments.xml`, otevře recenzní panel). Prompt hlídá halucinace pramenů
  („nejsi-li si jistý, napiš Srov. + oblast, nevymýšlej čísla"). UI
  `lexisUI.aiAnnotateSelection('footnote'|'comment')`, globály
  `aiFootnoteForSelection` / `aiCommentForSelection`. Staví na již otestovaných
  blotech footnote/comment.

- [x] **HOTOVO — Autorské API pro AI agenty (`applyDocumentSpec`).** Agent sestaví CELÝ
  dokument z jednoho strukturovaného JSON popisu (spec) deterministicky, bez klikání v GUI
  a bez ručního počítání pozic: nadpisy, formátovaný text (tučně/kurzíva/podtržení),
  ODKAZY, seznamy (číslované/odrážky), TABULKY (z `cells` i z rozměrů), poznámky pod čarou,
  TOC, zalomení stránky, a ŠABLONA se ZÁHLAVÍM/ZÁPATÍM z profilu (včetně LOGA přes
  `LexisLetterhead`) + VODOZNAK. Jádrem je čistá funkce `LexisAuthoring.buildDelta(spec)`
  (spec → Quill Delta, plně testovatelná bez Quillu) a runtime `apply(spec, ctx)`
  (`quill.setContents` + hlavička/patička + vodoznak). Globály `window.applyDocumentSpec`
  a `window.buildDocumentDelta`. Nový UMD modul `js/core/lexis-authoring.js`, kryto 22 testy
  (`tests/unit/authoring.test.js`) + integračním smoke se skutečným letterhead modulem.
  Tohle je klíčový krok k tomu, aby agent skládal podání sám a přesně.

## Zbývající mezery vůči Wordu (velké / vzácné)
- [ ] **Sledování změn FORMÁTOVÁNÍ** (`w:rPrChange`) a **přesunů textu**
  (`w:moveFrom`/`w:moveTo`). Vyžaduje hluboké zachytávání operací v editoru,
  slabá podpora v knihovně, v praxi vzácné.
- [ ] **Tabulky — editace buněk.** Vkládání, import i export tabulek hotové
  (`TableBlot`, `model-to-docx buildTable`, `ooxml-to-html _tableToHtml`).
  Buňky jsou `contenteditable`, ale plné napojení na Quill model (výběry, undo,
  přidat/ubrat řádek/sloupec) chce runtime doladění, případně tabulkový modul.
- [ ] **Endnoty** (poznámky na konci) — dnes jen poznámky pod čarou.
- [~] **Pole nad rámec TOC:** křížové odkazy a popisky/číslování obrázků zbývají;
  „table of authorities" = **seznam citované judikatury HOTOVO** (blok `authorities`
  + `lexis-citations.js`, kryto testy `tests/unit/citations.test.js`).
- [x] **HOTOVO — Bohatší hlavička/patička.** Nativní export dosud bral hlavičku/patičku
  jen jako prostý text (innerText). Nově se HTML hlavičky/patičky převede na model
  odstavců zachovávající **tučné/kurzívu/podtržení**, **zarovnání** (vlevo/střed/vpravo/
  do bloku) a **logo** (obrázek `data:` → do `word/media`). Nový UMD modul
  `js/export/html-header-model.js` (`htmlToHeaderModel`, běží v rendereru nad DOM),
  `delta-to-model` preferuje `headerModel`/`footerModel` (fallback na prosté řádky),
  `main.js` je předá, `exportToDocx` je spočítá. Kryto 7 jsdom testy parseru + 2 OOXML
  testy (formátovaná hlavička → `w:b`/zarovnání/media, prázdný model → fallback).
  Pozn.: taby (tab-stopy) nedělám — zarovnání per-odstavec pokrývá typické razítko
  „firma vlevo / datum vpravo".
- [x] **HOTOVO — Vodoznak do .docx.** Textový vodoznak (KONCEPT/NEPLATNÉ/VZOR…)
  nastavený na pozadí editoru se nově přenáší i do exportu do Wordu jako pravý
  wordovský WordArt (VML shape `#_x0000_t136`) v hlavičce: úhlopříčně (rotace 315°),
  vystředěný přes stránku, za textem, opakuje se na každé straně — stejný útvar jako
  funkce „Vodoznak" ve Wordu. Barva se přebírá z výběru, text i barva se sanitizují
  (XML-escape, fallback šeď). Přítomnost vodoznaku vynutí nativní exportní cestu
  (html-to-docx WordArt neumí). `model-to-docx _watermarkChild` + `model.watermark`,
  napojeno přes `delta-to-model`, `main.js export-docx-v2` a `exportToDocx`. Kryto
  4 testy (WordArt v hlavičce, rotace/vystředění, escapování, pořadí vůči hlavičce).
  Pozn.: obrázkový vodoznak (`applyImageWatermark`) zůstává zatím jen na obrazovce.
- [x] **HOTOVO — In-editor česká kontrola pravopisu.** Místo hunspellu využívá
  vestavěný Chromium spellchecker Electronu (žádný bundlovaný slovník): chybná slova
  se v editoru červeně podtrhnou. Na Win/Linux se vybere čeština (+ angličtina) z
  `availableSpellCheckerLanguages`; na macOS jazyk řídí systém (NSSpellChecker). Tlačítko
  „Pravopis" nově reálně **zapíná/vypíná** kontrolu (dřív jen falešně hlásilo, že běží).
  Návrhy oprav: pravé kliknutí na podtržené slovo → vlastní kontextové menu je doplní
  (hlavní proces posílá `misspelledWord` + `dictionarySuggestions` přes IPC). Oprava se
  provede přes Quill na rozsahu zachyceném při kliknutí (synchronní model + undo), s
  fallbackem na `replaceMisspelling`; k dispozici i „Přidat do slovníku". Čistá pomůcka
  `js/spellcheck-langs.js` (výběr jazyků) je kryta 6 testy; zbytek je Electron runtime
  (main IPC + preload most + `lexis-ui initContextMenu`), ověřeno proti typům Electronu 42.
- [x] **HOTOVO — Jazyková a slohová kontrola (spisovná čeština, v kontextu).** Dvě vrstvy
  nad rámec pravopisu: (1) rychlý OFFLINE linter `js/lang/czech-style.js` — nespisovné/
  hovorové tvary (bysme→bychom, „aby jsme"→„abychom", seš→jsi…) + typografie (vícenásobná
  mezera, mezera před interpunkcí, „…"); (2) HLOUBKOVÁ AI kontrola v kontextu věty i celého
  dokumentu (`checkLanguageAI` → `core.callAI` se spisovnostním promptem, návrhy oprav se
  lokalizují v textu). Obojí plní stávající audit panel (oprava jedním klikem). `applyAuditFix`
  nově posouvá offsety následujících nálezů (více oprav po sobě sedí). Tlačítka „Jazyk" a
  „Spisovnost AI" na pásu Kontrola + v audit panelu. Čisté funkce (`checkCzechStyle`,
  `parseAiLanguageIssues`) kryté 13 testy (`tests/unit/czech-style.test.js`).

## Nutné u uživatele (ne kód)
- [ ] `npm install` (přibylo `docx`, `jszip`).
- [ ] Runtime smoke test: export do Wordu (revize/poznámky/komentáře/obsah/
  tabulka), „Srovnat" (redline vůči staršímu .docx), komentář Ctrl+Alt+M,
  a otevření wordovského dokumentu s revizemi/komentáři/tabulkou.
- [ ] Runtime smoke test NOVÝCH AI funkcí: označit text → „Přepsat (revize)"
  (pás Domů) / Ctrl+Alt+R / kontextové menu → ověřit, že se rozdíl vloží jako
  sledované změny (přeškrtnuté + podtržené, autor „AI · …"), objeví se v recenzním
  panelu a po exportu jsou v .docx `w:ins`/`w:del`. Dále kontextové menu „LexisAI:
  Poznámka pod čarou" a „LexisAI: Komentář k pasáži" → export do
  `footnotes.xml`/`comments.xml`. (Kód ověřen proti Quill 1.3.6: vkládání přes
  clipboard zachovává bloty ins/del i autora; zbývá jen vizuální kontrola v editoru.)
- [ ] Runtime smoke test VODOZNAKU: nastav vodoznak (KONCEPT) → export do Wordu →
  otevřít v MS Wordu a ověřit úhlopříčný šedý nápis za textem na každé stránce.
- [ ] Runtime smoke test PRAVOPISU: napiš schválně překlep (např. „pravnický" místo
  „právnický") → ověř červené podtržení; pravým kliknutím na slovo vyber návrh opravy
  z kontextového menu → text se opraví (a undo funguje); vyzkoušej „Přidat do slovníku"
  a tlačítko „Pravopis" (zap/vyp). Na macOS měj v Nastavení systému povolenou češtinu
  pro pravopis (nebo „Automaticky podle jazyka").
- [ ] Runtime smoke test HLAVIČKY/PATIČKY: do hlavičky dej tučný název kanceláře, logo
  a vpravo zarovnané datum → export do Wordu → ověř, že se formátování i logo zachovaly
  (dřív se přenášel jen holý text).
- [ ] Runtime smoke test JAZYKOVÉ KONTROLY: napiš „Chtěli bysme aby jsme to podali..." →
  tlačítko „Jazyk" → v panelu Kontrola se objeví nálezy (bysme→bychom, aby jsme→abychom,
  …→…) → klik „Opravit" je aplikuje a offsety dalších sedí. Pak „Spisovnost AI" → AI doplní
  gramatické/slohové nálezy v kontextu (běží lokální model).
