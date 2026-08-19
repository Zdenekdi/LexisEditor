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

## Zbývající mezery vůči Wordu (velké / vzácné)
- [ ] **Sledování změn FORMÁTOVÁNÍ** (`w:rPrChange`) a **přesunů textu**
  (`w:moveFrom`/`w:moveTo`). Vyžaduje hluboké zachytávání operací v editoru,
  slabá podpora v knihovně, v praxi vzácné.
- [ ] **Tabulky — editace buněk.** Vkládání, import i export tabulek hotové
  (`TableBlot`, `model-to-docx buildTable`, `ooxml-to-html _tableToHtml`).
  Buňky jsou `contenteditable`, ale plné napojení na Quill model (výběry, undo,
  přidat/ubrat řádek/sloupec) chce runtime doladění, případně tabulkový modul.
- [ ] **Endnoty** (poznámky na konci) — dnes jen poznámky pod čarou.
- [ ] **Pole nad rámec TOC:** křížové odkazy, popisky/číslování obrázků,
  rejstřík (u práva „table of authorities" = seznam citované judikatury).
- [ ] **Bohatší hlavička/patička** — dnes prostý text; formátování, taby, logo.
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
- [ ] **In-editor česká kontrola pravopisu** (zbývá z původní položky „vodoznak +
  pravopis") — potřebuje slovník/hunspell integraci, odloženo.

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
