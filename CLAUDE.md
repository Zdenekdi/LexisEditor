# CLAUDE.md — LexisEditor

Kontext pro Claude Code. LexisEditor je Electron desktop aplikace (AI-native editor pro advokáty).
Hlavní části: `main.js` (Electron main / IPC), `preload.js` (contextBridge), `index.html` (renderer),
`js/core/*` (mj. `lexis-lock.js` — zámek/scrypt, `lexis-zfo.js` — parsování .zfo, `lexis-link-security.js`),
`js/providers/ai-provider.js`, `js/ui/*`. Sesterský projekt: **LexisLocal** (lokální AI backend).

Build/test: `npm start`, `npm test` (jest), `npm run test:e2e` (playwright), `npm run dist`.

---

## TODO / Známé problémy

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

- [~] **Doplnit testy kolem bezpečnostních míst v `main.js` — z velké části HOTOVO.** Bezpečnostní logika
  byla vytažena z `main.js` do čistých, testovatelných modulů: **`js/core/lexis-lock.js`**
  (`hashPassword`/`verifyPassword` — scrypt + konstantní porovnání) a **`js/core/lexis-zfo.js`**
  (`extractZfoXml` — PKCS#7/CMS parsování). Přibyly testy `lock.test.js`, `zfo.test.js`, `isdsInbox.test.js`,
  `isdsOutbox.test.js`, `contacts.test.js`; LexisLink má `lexis-link-security.test.js`. **Zbývá:** přímé
  integrační testy IPC handlerů v `main.js` (ISDS auth flow) — logika je ale už krytá přes vytažené moduly.
