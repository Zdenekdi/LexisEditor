# CLAUDE.md — LexisEditor

Kontext pro Claude Code. LexisEditor je Electron desktop aplikace (AI-native editor pro advokáty).
Hlavní části: `main.js` (Electron main / IPC), `preload.js` (contextBridge), `index.html` (renderer),
`js/core/*`, `js/providers/ai-provider.js`, `js/ui/*`. Sesterský projekt: **LexisLocal** (lokální AI backend).

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

- [ ] **Rozbít monolity.** `js/ui/lexis-ui.js` (372 KB) a `index.html` (143 KB) jsou obří. Rozdělit
  `lexis-ui.js` do domén, oddělit renderer JS od `index.html`.

### 🟢 Nízké (hygiena)

- [x] **HOTOVO (.gitignore) — Uklidit repo.** Do `.gitignore` přidány `chunk-*.js`, `*-temp.js`,
  `temp_script.js`, `build/`. (Pokud jsou některé z nich ještě trackované, doplnit `git rm --cached`.)

- [ ] **Sjednotit verze.** Nekonzistence: `package.json` 3.4.1 vs README v3.3.2 vs CHANGELOG 3.4.0.
  Načítat verzi z `package.json` (jeden zdroj pravdy), srovnat README/CHANGELOG. Důležité kvůli
  auto-updateru.

- [ ] **Doplnit testy kolem bezpečnostních míst v `main.js`.** Editor má jen 1 unit + 1 smoke e2e;
  ISDS auth, LexisLink, `lock-verify-password` a zfo import nejsou pokryté. Doplnit unit/integration testy
  pro tyto IPC handlery a lock logiku (backend LexisLocal má solidní sadu – použít jako vzor).
