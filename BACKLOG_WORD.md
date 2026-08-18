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
- [ ] **Vodoznak do .docx**, in-editor česká kontrola pravopisu.

## Nutné u uživatele (ne kód)
- [ ] `npm install` (přibylo `docx`, `jszip`).
- [ ] Runtime smoke test: export do Wordu (revize/poznámky/komentáře/obsah/
  tabulka), „Srovnat" (redline vůči staršímu .docx), komentář Ctrl+Alt+M,
  a otevření wordovského dokumentu s revizemi/komentáři/tabulkou.
