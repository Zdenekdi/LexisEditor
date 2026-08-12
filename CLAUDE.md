# CLAUDE.md — LexisEditor

Kontext pro Claude Code. LexisEditor je Electron desktop aplikace (AI-native editor pro advokáty).
Hlavní části: `main.js` (Electron main / IPC), `preload.js` (contextBridge), `index.html` (renderer),
`js/core/*` (mj. `lexis-lock.js` — zámek/scrypt, `lexis-zfo.js` — parsování .zfo, `lexis-link-security.js`),
`js/providers/ai-provider.js`, `js/ui/*`. Sesterský projekt: **LexisLocal** (lokální AI backend).

Build/test: `npm start`, `npm test` (jest), `npm run test:e2e` (playwright), `npm run dist`.

---

## TODO / Známé problémy

> ✅ **Lhůty v měsících/týdnech — v editoru HOTOVO.** `lexis-calendar` počítá (`computeDeadlineByUnit`,
> § 57/2) i detekuje (`detectDeadlines` — dny/týdny/měsíce/roky, digit i slovní číslovky, s ochranou proti
> false-positive) lhůty; `scanTextForDeadlines` je zobrazuje k potvrzení a ukládá se správně spočtené datum.
> **Backend:** `extraction.js` má nově `calculateDeadlineByUnit` (§ 57/2) i `detectDeadlines` (mirror editoru)
> + testy; `calculateDeadlineDate` beze změny. **Zbývá jen napojení:** pipeline `watcher.js`/`paperless.js`
> a AI extraktor pořád ukládají jen `deadlineDays` — přepnout na jednotky (auto-ukládá bez potvrzení,
> doporučuji projít s tebou).
> ✅ End-to-end HOTOVO: pipeline (watcher.js/paperless.js) uklada nedenni lhuty do detectedDeadlines[] s needsReview; editor je v inboxu zobrazuje jako Lhuty k overeni s tlacitkem Potvrdit (ulozi do hlidace pres promptAddDeadlineDate).


Seřazeno podle priority. Backendové položky (LexisLocal) jsou v CLAUDE.md tamního repa.

### 🔴 Kritické (bezpečnost)

- [x] **HOTOVO — LexisLink server (port 3300) zabezpečen.** Párovací token se generuje při startu
  (`js/core/lexis-link-security.js`, 32 B náhody, porovnání v konstantním čase) a je vynucený u
  `/api/command`, `/api/import`, `/api/upload` i u `/remote` stránky (jinak 401). CORS je omezený na
  známé originy (`isKnownOrigin`), tělo má strop velikosti (obrana proti DoS). Bind zůstává na LAN
  (telefon ↔ PC) záměrně, ale chráněný tokenem z QR kódu.

### 🟠 Vysoké

- [x] **HOTOVO — Offline „AI model" už nevymýšlí právo.** `js/providers/ai-provider.js` fallback dřív
  podle klíčových slov vracel konkrétní paragrafy i spisové značky a vydával to za analýzu. Nově vrací
  jen jasné upozornění „AI je offline, toto není právní stanovisko" bez jakýchkoli citací. README claim
  ověřen (žádný přehnaný text tam není).

### 🟡 Střední

- [x] **HOTOVO (z větší části) — Zámek aplikace.** `lock-verify-password` používá **scrypt hash se solí**
  a **konstantní porovnání** (`crypto.timingSafeEqual`), heslo se nevrací do rendereru, legacy hash se
  při ověření migruje na scrypt. Doplněna **minimální délka hesla (8) vynucená v main procesu**. Zbývá
  jen posun vynucení zámku z rendereru do main (obcházení přes devtools) — akceptovatelné pro betu
  (vlastní stroj/vlastní data).

- [x] **HOTOVO — Parsování `.zfo`.** `import-zfo` nově parsuje PKCS#7/CMS korektně přes **node-forge**
  (ASN.1 → zapouzdřený obsah), tolerantně k namespace prefixům a s `dmFileDescr` jako atributem i
  elementem; heuristika zůstává jako fallback. Ověřeno na uměle podepsaném CMS.

- [x] **HOTOVO — Hromadné generování: vytažená a testovaná logika + oprava CSV.** Čistá logika
  mail-merge (CSV → záznamy, dosazení `{{Klíč}}`) je v `js/core/lexis-merge.js` (+ testy
  `tests/unit/merge.test.js`); `lexis-ui.js` na ni deleguje. Parser CSV nově zvládá **uvozovky**
  (adresa s čárkou, např. „nám. Míru 7, Praha 2", se nerozbije) — pro CSV bez uvozovek beze změny.

- [x] **HOTOVO — Odpověď na příchozí datovku.** Přijaté datové zprávy mají nově akci „↩️ Odpovědět“,
  která vytáhne č.j./sp. zn. z přijaté zprávy (`LexisReply.extract`) a vloží do editoru koncept odpovědi
  s hlavičkou (`LexisReply.buildReplyHtml`). Logika je v `js/ui/lexis-reply-inbox.js` (+ test
  `tests/unit/replyInbox.test.js`), `lexis-reply.js` zůstal netknutý. Advokát koncept zkontroluje a odešle.

- [x] **HOTOVO — E-mail klientovi z dokumentu (odchozí tok).** Z otevřeného dokumentu jedním klikem
  („📧 E-mail klientovi" v ribbonu Export) připraví PDF přílohu a předvyplní e-mail klientovi z adresáře.
  Čistá logika `js/core/lexis-mail-draft.js` (+ testy `tests/unit/mailDraft.test.js`), UI `js/ui/lexis-mail-client.js`;
  `compose-email-attach` v `main.js` nově umí přílohy jako base64. Nic se neodesílá samo — otevře se okno
  pošty ke kontrole; fallback na `mailto` bez přílohy.

- [x] **HOTOVO — Automatické napojení na LexisLocal token.** Editor si API token LexisLocalu **čte sám**
  z lokálního souboru (`<LEXIS_KEY_DIR|~/.lexislocal>/api_token`) přes IPC (`get-lexislocal-token` +
  synchronní varianta), `preload.js` ho vystavuje jako `electronAPI.lexisLocalToken`. `ai-provider.js`
  i `lexis-ui.js` ho automaticky posílají v hlavičce `X-API-Token`. Uživatel nic nevkládá ručně — až se
  na backendu zapne vynucení tokenu (`LEXIS_ENFORCE_TOKEN=1`), editor bude fungovat bez zásahu.

- [x] **Rozbít monolity — HOTOVO.** `js/ui/lexis-ui.js` rozděleno z 6472 na ~805 řádků — 203 metod
  vytaženo do 6 prototype-mixin modulů (`lexis-ui-1..6.js`). Renderer skript (414 ř.) oddělen z `index.html`
  do `js/renderer-bootstrap.js` (index.html 2116 → ~1707 ř.). Rozbití přes AST (@babel/parser), ověřeno
  `node --check` + vm-harnessem (všech 213 metod na prototypu).

### 🟢 Nízké (hygiena)

- [x] **HOTOVO (.gitignore) — Uklidit repo.** Do `.gitignore` přidány `chunk-*.js`, `*-temp.js`,
  `temp_script.js`, `build/`. (Pokud jsou některé z nich ještě trackované, doplnit `git rm --cached`.)

- [x] **Sjednotit verze — HOTOVO.** `package.json` = **3.4.1**, README **v3.4.1**, CHANGELOG doplněn
  (záznam **3.4.1** = Windows Hello + kalkulátor tarifu, + sekce **Nevydáno** s červencovou bezpečnostní
  a refaktoringovou prací). Pozn.: `package.json` je pořád 3.4.1 — červencové změny jsou zatím „Nevydáno";
  před releasem zvážit bump na 3.4.2. Ideál dlouhodobě: verzi v UI číst z `package.json`.

- [x] **Doplnit testy kolem bezpečnostních míst v `main.js` — HOTOVO.** Rozhodovací logika ISDS toku
  (prostředí test/produkce, Basic auth, volba klientského certifikátu, TLS volby, endpoint) vytažena z
  `isdsCall` do testovaného `js/core/isds-transport.js` (+ `tests/unit/isdsTransport.test.js`); `main.js`
  na ni deleguje, I/O a HTTP zůstávají v main. Spolu s dříve vytaženými `lexis-lock`/`lexis-zfo` jsou
  bezpečnostní místa `main.js` pokrytá.

  Dřív vytažené moduly: `js/core/lexis-lock.js` (scrypt zámek), `js/core/lexis-zfo.js` (PKCS#7/CMS),
  plus testy `lock`, `zfo`, `isdsInbox`, `isdsOutbox`, `contacts`, `lexis-link-security`.

---

## Nasazení / build (body 3 a 4)

- [x] **Startovací sada českých vzorů.** `defaultTemplates` v `main.js` rozšířeno na 10
  vzorů (kupní smlouva, plná moc, žaloba, předžalobní výzva § 142a o.s.ř., smlouva o dílo
  § 2586, nájemní smlouva bytu § 2235, odstoupení, uznání dluhu § 2053, odvolání § 201
  o.s.ř., hlavičkový papír) s placeholdery `[JMÉNO]`, `[ČÁSTKA]`, `[DATUM]`, `[MĚSTO]`…
- [x] **Opraven rozbitý load šablon.** Renderer volal `getTemplateContent`, které NEBYLO
  v `preload.js` ani v `main.js` → kliknutí na vzor otevřelo prázdný dokument. Doplněn IPC
  `get-template-content` (vrací `{title, content}`) + expozice v preloadu + úprava
  `openStartDocument` (nastaví i titul dle vzoru). `get-templates` nově slučuje vestavěné
  vzory s uloženými (`{...defaultTemplates, ...saved}`) — nové vzory se objeví i starším
  uživatelům, jejich úpravy mají přednost.
- [x] **Build integrita: ikony opraveny.** `build/icon.png` i `build/background.png` byly
  JPEGy přejmenované na `.png` → přeuloženy jako skutečné PNG 1024×1024.
- [x] **`RELEASE_CHECKLIST.md`** — postup buildu/vydání. POZOR: `npm run dist` zvyšuje patch
  verzi (`npm version patch`); auto-update na macOS potřebuje podpis (bod 1).

### Bez dev účtů / bez podpisu (přidáno)
- [x] **Build bez podpisu:** `build.mac.identity=null` + `notarize=false`; `release.yml`
  má `CSC_IDENTITY_AUTO_DISCOVERY=false`. `INSTALL_UNSIGNED.md` = návod pro betatestery
  (macOS pravý klik → Otevřít / `xattr -dr com.apple.quarantine`, Windows SmartScreen).
- [x] **CI:** `.github/workflows/ci.yml` (node --check nad main/preload/js + `npm test`).
- [x] **Token:** ověřeno, že editor posílá `X-API-Token` na všech voláních backendu
  (`getLexisLocalConnection` + ai-provider) → funguje i s vynuceným tokenem na backendu.

### Cenové vrstvy — hybrid (rozhodnuto)
- [x] **Mapování vrstev na edice** (`lexis-edition.js`, pole `tier`): Free=`core`,
  Pro=`legal` (core+legal), Firm=`full` (core+business+legal). Ověřeno gatingem
  (`allowed()`): free vidí jen Core, pro přidá legal, firm přidá business.
- [x] **Přerovnané tagy:** Článek/Paragraf/Znak § přesunuty do Core (zdarma) — paid
  hranice nesahá do běžného psaní. Datovky, lhůty, tarify, judikatura, Dopis Online,
  E-podpis = `legal` (Pro); hromadná gen./kampaně, time/výkazy = `business` (Firm).
  Kontrola struktury/Pojmy/Citace zůstávají placené. Detail v `docs/Architektura_edice_a_znacka.md` §7.
- [ ] **Zbývá (samostatný krok, licenční rozhodnutí):** entitlement (jak se pozná
  zaplacená vrstva; dnes default `full`=vše), skrýt vs. upsell u neplacených funkcí,
  výchozí edice per build.

### Licencování / entitlement (PŘIPRAVENO, NEAKTIVNÍ)
- [x] **Offline validátor licencí** (Ed25519): `js/core/lexis-license.js` (+ `lexis-license-key.js`
  = veřejný klíč, prázdný = neaktivní). Podpis nad kanonickým payloadem, kontrola tier/expirace/grace.
  Testy `tests/unit/license.test.js` (tamper, expired, grace, wrong-key, perpetual).
- [x] **Nástroje** `tools/license/generate-keypair.js` + `issue-license.js` (privátní klíč a licence
  jsou v `.gitignore`).
- [x] **Napojení (za vypínačem):** `main.js` `LICENSING_ENABLED=false` + IPC `get-license-status`
  / `get-license-edition-sync`; `preload.js` `getLicenseStatus`/`licenseEdition`; `lexis-edition.js`
  bere licenci s nejvyšší prioritou (prázdné → výchozí `full`). Ověřeno: default zůstává `full`.
- Aktivace a MoR napojení: `docs/LICENCE_SYSTEM.md`.

### Redesign UI (dle Claude Design předlohy „LexisEditor Redesign")
- [x] **Designový základ:** nová paleta (teplý papír + jantar) jako CSS tokeny v `:root`
  + `body.dark-mode` (světlá i tmavá), font **Source Serif 4**, rozšířená sada tokenů
  (povrchy, texty, jantarové tinty, invertované tlačítko, poloměry, stíny, mono labely).
  Úvodní obrazovka přebarvená (launcher).
- [x] **Přepínač režimů shellu (turn 1+2) — krok 1:** `js/core/lexis-shell.js` — tři režimy
  `ribbon|single|paper` přes `body[data-shell]`, čip ve stavovém řádku (2a) s nabídkou
  (světlá/tmavá), klávesy ⌘⌥1/2/3 + ⌘⌥D, stav v localStorage (`lexis_shell`), výchozí
  `ribbon` = beze změny. Efekty single/paper zatím základní (schování `.tool-groups-container`
  / `.ribbon-tabs`).
- [x] **Jedna lišta (1c) — krok 2:** plovoucí formátovací lišta při výběru textu
  (`.lx-float` v lexis-shell.js): B/I/U přes Quill + § Odstavec/Citace zákona/Přepsat s AI
  (formatLegal/insertCitation/toggleAIDrawer). Jen v režimu single/paper, světlá i tmavá.
- [x] **Papír (1e) — krok 3:** plovoucí spodní dok (`#lexis-paper-dock`): Zeptat se LexisAI
  (toggleAIDrawer) · B/I (Quill) · § (formatLegal) · Doložka (popover 6 doložek → insertClause)
  · Audit (runFinalAudit) · Odeslat (openDatovkaDialog). Jen v režimu paper, světlá i tmavá.
  Plovoucí výběrová lišta omezena na režim single.
- [x] **⌘K paleta (2c) + horní příkazová lišta (single) + záložka Zobrazení (2b) — krok 4:**
  `window.LexisCmdK` (⌘K/Ctrl+K) — grupy Režim rozhraní/Zobrazení/Akce, filtr, klávesy;
  příkazové pole `#lx-cmdfield` v title-baru (jen single); skupina Režim rozhraní v tab-view.
  **Systém shellu KOMPLETNÍ** (3 režimy × 3 místa přepínače).
- [x] **Sjednocení barev:** 177 studených hex v CSS namapováno na teplou paletu (žádné
  modré/šedé zbytky v hlavních komponentách); vybrané inline barvy ve status-baru.
- [x] **Kompletní reskin barev (2 pásy):** ~970 studených hex (modré/šedé/fialové/zelené/
  červené) v index.html, css i **všech JS rendererech** (nedávné dokumenty, doručené, dialogy,
  datovka…) namapováno na teplou paletu — celá appka vč. dynamického obsahu je koherentní.
- [ ] **Zbývá (přestavba obrazovek — k rozhodnutí):**
  přestavba obrazovek (úvodní 3a, LexisAI panel 3c, záhlaví/zápatí 3d, datovky 4a,
  zámek 4b, hledání+komentáře 4c, historie verzí 4d, kampaň 3e, mobil 5).

### Vlastní ikona aplikace
- [x] **Nová ikona** (redesign: tmavý teplý squircle, serifové „L" + jantarový „§", 1024×1024
  s průhlednými rohy) → `build/icon.png` (electron-builder) i `logo.png` (úvodní obrazovka).
- [x] **Napojení i ve vývoji:** `main.js` — `icon:` v BrowserWindow + `app.dock.setIcon(...)`
  na macOS ve `whenReady` (bez toho Electron ukazuje vlastní ikonu v Docku při `electron .`).
  Zdroj ikony (HTML) lze snadno předělat (velikost §, akcent, světlá varianta).

### Zámek aplikace (4b) + nález chyby
- [x] **Startup zámek přebarven do 4b:** čistý SVG zámek (bez 🛡️ emoji), titul „Dokumenty
  jsou zamčené", podtitul o lokálních datech, invertované tlačítko, zelená tečka + Mac tip
  bez emoji. Světlá i tmavá (ikona přes `--btn-primary-bg/text`). Hook `requestStartupUnlock()`
  zachován; na security flow nesaháno.
- [ ] **NÁLEZ — duplicitní `id="lock-screen"`** v index.html (řádek ~47 startup zámek +
  ~1587 runtime „glass" zámek s heslem/Touch ID). `getElementById` vrací první → druhý (fialový
  s heslem) se přes `lockScreen.showLockScreen()` nemusí zobrazit správně. **K rozhodnutí:**
  sjednotit na jeden zámek nebo přejmenovat ID (vyžaduje pochopení obou flow + živý test).
  Fialový blok B jsem zatím nechal (security-kritický, nesahat naslepo).
