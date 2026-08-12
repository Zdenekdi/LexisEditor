# Návrh integrace „Externí rešerše" (MCP) do LexisEditoru

*Verze 2 · 2026-08-12 · volitelný modul, opt-in · DirectCase + LawGPT*

> **Rozhodnutí (2026-08-12):** (1) každý uživatel **vlastním účtem** (BYO-account); (2) MVP = **obě** akce „Ověřit citaci" + „Najít judikaturu"; (3) sekce pojmenována obecně **„Externí rešerše"**, DirectCase je první z více poskytovatelů. Abstrakce tedy počítá s víc poskytovateli od začátku (viz §8).

## 1. Shrnutí a doporučení

DirectCase je český AI nástroj pro právní rešerši (~1,39 mil. ověřených zdrojů, citace ověřitelné na klik, EU/GDPR) a nabízí **MCP konektor** na `https://mcp.directcase.ai` s autentizací přes OAuth. Doporučení zůstává: brát DirectCase jako **komplementární volitelný modul**, ne jako konkurenta. My jsme editor + doručování (ISDS) + lhůty; DirectCase dodá to, co dnes umíme jen omezeně a s rizikem halucinací — **ověřenou judikaturu a citace**.

Klíčové architektonické rozhodnutí: DirectCase **není** další „provider" do `LexisAIProvider`. Ta funkce očekává chat-completion (systém + prompt → text). DirectCase MCP naopak vystavuje **nástroje** (hledej judikaturu, ověř citaci, vyhledej v zákonech). Patří proto jako **samostatný modul** `js/providers/directcase-connector.js` napojený na konkrétní akce v LexisAI panelu, ne do dispatch větve v `ai-provider.js`.

## 2. Jak to zapadá do architektury

Dnešní stav (`js/providers/ai-provider.js`): jedna `async` funkce přepíná podle `#ai-provider` na ollama / apfel / openai / deepseek / lmstudio / anthropic / google / lexislocal a vrací text. Nastavení se drží v `localStorage['lexis_ai_settings']`.

DirectCase se zapojí **vedle** toho:

```
LexisAI panel
├─ AI Engine  (generování textu)      → LexisAIProvider  (beze změny)
└─ Rešerše    (ověřená judikatura)     → LexisDirectCase  (NOVÝ modul)
       │
       │  MCP klient (JSON-RPC přes HTTP/SSE)
       ▼
   Electron main proces  ──OAuth──►  https://mcp.directcase.ai
       │
       └─ token uložen v SafeStorage (Keychain/DPAPI), stejně jako ISDS/Pošta klíče
```

Proč MCP klient v **main procesu**, ne v rendereru:

- OAuth vyžaduje otevření přihlašovacího okna a bezpečné převzetí tokenu (redirect/loopback). To patří do Node/main, ne do webového rendereru.
- Token je credential → musí do **SafeStorage** (Keychain na macOS / DPAPI na Windows), přesně jako už chráníme ISDS a poštu. Nikdy do `localStorage`.
- Renderer volá main přes `window.electronAPI` (stejný vzor jako `lexisLocalToken` a ISDS). Renderer se tokenu vůbec nedotkne.

## 3. Uživatelský tok a datová suverenita (nejcitlivější bod)

DirectCase je **cloud** — dotaz opouští počítač. To je v napětí s naším claimem „offline / datová suverenita", takže integrace musí být neomylně **opt-in a vizuálně odlišená** od lokální AI:

1. **Výchozí stav = vypnuto.** Modul se needituje, dokud ho uživatel v Nastavení → *LexisAI → Rešerše (DirectCase)* explicitně nezapne a nepřihlásí se svým účtem.
2. **Jednoznačné upozornění při zapnutí** (jednorázový `customConfirm`): „Rešerše DirectCase odesílá váš dotaz do cloudu DirectCase (servery v EU). Není to lokální/offline režim. Neodesílejte citlivé osobní údaje klienta bez jeho souhlasu." + odkaz na jejich zásady.
3. **Trvalý vizuální marker.** Akce běžící přes DirectCase mají jiný odznak/barvu než lokální AI (např. „☁ Cloud · DirectCase"), aby uživatel v žádném okamžiku nezaměnil cloudovou rešerši s offline analýzou.
4. **Jen výběr, ne celý spis.** Do DirectCase posílat cíleně označený text / konkrétní citaci k ověření — ne automaticky celý dokument. Před odesláním nabídnout **anonymizaci** (už máme GDPR Shield) na jedno kliknutí.

## 4. MCP nástroje → konkrétní akce v LexisEditoru

Podle dokumentace konektor vystavuje: vyhledávání v judikatuře českých soudů, vyhledávání v zákonech/regulacích, odpověď s odkazem na konkrétní rozsudek/paragraf, ověření citací a analýzu nahraného dokumentu. Mapování na naše UI:

| MCP schopnost | Akce v LexisEditoru | Kam v UI |
|---|---|---|
| Ověření citace | **Ověřit citaci** — nad označenou sp. zn. / § ověří existenci a vrátí odkaz na zdroj | kontextové menu nad výběrem; Právní nástroje |
| Vyhledání judikatury | **Najít judikaturu** — k označené právní otázce vrátí relevantní rozhodnutí s právní větou | LexisAI panel → Rešerše |
| Vyhledání v zákonech | **Dohledat ustanovení** — doplní přesné znění a číslo předpisu | Legal Linker (posílení) |
| Analýza dokumentu | **Rešerše k dokumentu** — návrh relevantních zdrojů k celému podání (opt-in, po anonymizaci) | LexisAI panel |

Největší synergie: náš **Legal Linker** dnes řeší halucinované sp. zn. jen heuristicky. DirectCase „Ověřit citaci" dá tvrdé ověření proti reálné databázi → z Legal Linkeru se stává skutečně důvěryhodný nástroj.

## 5. Fázový plán

**Fáze 0 — ověřit před kódem (blokující):**
- Licenční podmínky MCP: smí *third-party aplikace* konektor zprostředkovat, nebo se každý uživatel připojuje **vlastním** účtem? Čistší a nejspíš bezproblémová je varianta „vlastní účet" (BYO-account) — každý advokát má své předplatné a limity.
- Ověřit reálný tvar OAuth (redirect URI, scopes) a formát MCP transportu (HTTP+SSE vs. streamable HTTP).

**Fáze 1 — MVP „Ověřit citaci" (BYO-account):**
- `js/providers/directcase-connector.js` (renderer fasáda) + IPC handlery v main procesu (MCP klient + OAuth + SafeStorage).
- Nastavení: sekce *Rešerše (DirectCase)* se stavem přihlášení, tlačítka Přihlásit/Odhlásit.
- Jedna akce nad výběrem: **Ověřit citaci** + jasný cloud marker.

**Fáze 2 — Rešerše:**
- **Najít judikaturu** a **Dohledat ustanovení** v LexisAI panelu.
- Napojení výsledků do dokumentu (vložit citaci s ověřeným odkazem).

**Fáze 3 — Legal Linker boost + dokumentová rešerše:**
- Legal Linker volitelně ověřuje přes DirectCase.
- Rešerše k celému dokumentu s povinnou anonymizací.

## 6. Bezpečnost a soukromí — kontrolní seznam

- Token DirectCase **jen** v SafeStorage (Keychain/DPAPI), nikdy v `localStorage` ani v logu.
- OAuth okno jen na oficiální doménu DirectCase; redirect na loopback/registrovaný scheme.
- Odchozí data: pouze uživatelem označený text; před odesláním nabídnout anonymizaci.
- Offline chování: když je modul vypnutý nebo bez připojení, akce se **skryjí/zašednou** — žádný tichý fallback, který by vypadal jako lokální analýza (drží se principu z `ai-provider.js`, že offline nikdy nevymýšlí právní obsah).
- Marker „☁ Cloud" u každé DirectCase akce.

## 8. Další poskytovatelé rešerše (proč obecná abstrakce)

Sekce se jmenuje „Externí rešerše", protože DirectCase není jediný systém s MCP. Modul proto navrhuju jako **registr poskytovatelů** — jednotné rozhraní `{ id, nazev, typ, endpoint, auth, tools }`, na které se DirectCase i další jen „zaregistrují". Přehled trhu k 2026-08:

| Poskytovatel | MCP / API | Autentizace | Cena | Zdroje | Vhodnost |
|---|---|---|---|---|---|
| **DirectCase** | MCP `https://mcp.directcase.ai` | OAuth (účet) | placené předplatné | ~1,39 mil. ověřených (judikatura, zákony ČR/EU, regulátoři) | **Fáze 1** — nejširší ověřená databáze |
| **LawGPT.cz** | MCP `https://lawgpt.cz/mcp` | **žádná** (veřejné, read-only) | **zdarma** | eSbírka (zákony) + judikatura (soudy + ÚS); tools `search_laws`, `get_paragraph`, `search_judgments` | **Fáze 2** — bezplatná vrstva bez přihlášení |
| ASPI (Wolters Kluwer) | uzavřený portál, bez veřejného MCP | — | placené | rozsáhlé, incumbent | jen přes partnerství / jejich API |
| CODEXIS (ATLAS) | doplněk „AI Judikatura CZ", bez veřejného MCP | — | placené | incumbent PIS | jen přes partnerství |
| Beck-online / Beck-Noxtua (C.H. Beck) | AI produkt, bez veřejného MCP | — | placené | komentářová literatura + judikatura | jen přes partnerství |
| Lawrence AI | MCP/API neověřeno | ? | ? | ? | ověřit |

Praktický dopad: **LawGPT.cz** je skvělý druhý poskytovatel — veřejný, zdarma, bez OAuth, čistě český (eSbírka + soudy + ÚS). Lze ho nabídnout jako **výchozí bezplatnou vrstvu** (funguje hned, bez účtu), zatímco DirectCase je „premium" volba pro širší a hlouběji ověřenou databázi. Oba jsou ale **cloud**, takže i pro LawGPT platí stejný opt-in a cloud marker z §3.

Velcí incumbenti (ASPI, CODEXIS, Beck) mají AI, ale bez veřejného MCP — jejich zapojení by vyžadovalo partnerství nebo jejich vlastní API. Díky registru poskytovatelů je ale přidáme kdykoli později bez zásahu do zbytku aplikace.

## 9. Rozhodnuté a stav

- **Licence:** BYO-account (každý uživatel svým účtem) — odstraňuje potřebu řešit zprostředkování přes aplikaci. U LawGPT není účet vůbec potřeba.
- **MVP rozsah:** „Ověřit citaci" **i** „Najít judikaturu".
- **Positioning:** obecná sekce „Externí rešerše" s registrem poskytovatelů.

Zbývá ověřit už jen technické detaily při implementaci (přesné scopes OAuth u DirectCase, tvar MCP transportu). Můžu rovnou začít kód Fáze 1: registr poskytovatelů + modul + IPC skeleton (MCP klient v main procesu) + sekce „Externí rešerše" v nastavení — vše vypnuté ve výchozím stavu, s DirectCase (OAuth) a LawGPT (bez účtu) jako prvními dvěma poskytovateli.
