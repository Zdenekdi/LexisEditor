# Před beta testováním — co zbývá na tobě

*Věci, které nejde udělat z kódu — vyžadují tvoje účty, certifikáty, adresy nebo
běžící appku. U každé je uvedeno, co už je v kódu připravené, ať to máš jen „dopojit".*

---

## 🔴 Blockery bety (bez nich to k advokátům nepustíš)

### 1. Produkční ISDS přístup + reálný E2E test
- **Ty:** zřídit WS přístup k datovým schránkám (účet + přístupové údaje k webovým
  službám, popř. klientský certifikát .p12) a udělat jeden reálný test odeslání/příjmu.
- **Připraveno:** celý ISDS engine (odeslání, outbox, inbox, doručenky, fikce,
  `.zfo`), testovací prostředí czebox, přepínač test/produkce a přihlášení
  certifikátem. Nově i **22 testů** ISDS klienta (endpointy, doručitelnost, stavy).
  Stačí zadat produkční údaje v „Nastavení DS" a ověřit spojení.

### 2. Podepsaný a notarizovaný build (instalátor)
- **Ty:** pořídit podpisové certifikáty a build podepsat.
  - **macOS:** Apple Developer Program (99 USD/rok) — Developer ID + notarizace zdarma.
  - **Windows** (jen když vydáváš win build): Azure Artifact Signing (~10 USD/měs,
    zkus jako organizace/OSVČ přes IČO) nebo OV certifikát (~150–300 USD/rok + token).
- **Připraveno:** nic v kódu nechybí; jde o certifikáty a build konfiguraci
  (electron-builder). Bez podpisu tester musí obcházet Gatekeeper/SmartScreen
  (popsáno v `BETA_TESTING.md`).

### 3. Reálné e-mailové adresy (podpora)
- **Ty:** nastavit skutečnou adresu podpory pro „Nahlásit chybu".
- **Připraveno:** adresa **už není natvrdo** — bere se z konfigurace edice
  (`supportEmail` v `js/core/lexis-edition.js`) nebo z `window.LEXIS_SUPPORT_EMAIL`.
  Stačí doplnit reálné adresy k edicím (teď placeholdery `podpora@lexiseditor.cz` /
  `podpora@nexus-editor.cz`).

### 4. Povinný API token (backend LexisLocal)
- **Ty:** rozhodnout a odzkoušet (smoke test), že per-request API token bude
  **povinný** — editor i dashboard si ho musí umět automaticky vzít, jinak se appka
  „zamkne".
- **Připraveno:** backend je zabezpečený (bind na 127.0.0.1, CORS, Host-guard),
  token je zatím **opt-in**. Zbývá ho udělat povinným s reálným smoke testem.

---

## 🟠 Nastavení, aby fungovaly nové funkce

### 5. SMTP pro odesílání e-mailu klientovi (přeposlání datovky)
- **Ty:** v LexisLocalu → **Nastavení e-mailu** vyplnit SMTP (server, port, **heslo**
  — pole jsem doplnil) a udělat `npm install` (kvůli `nodemailer`).
- **Připraveno:** backend `mailer.js` + endpoint `/api/email/send` (i s přílohou),
  8 testů. Bez SMTP appka poctivě řekne, že přes SMTP poslat nejde (nabídne mailto).

### 6. Otestovat „nové okno pošty s přílohou" na reálném stroji
- **Ty:** vyzkoušet na Macu s **Apple Mail** (a případně Windows s **Outlookem**),
  že se otevře okno pošty i s připojenou přílohou.
- **Připraveno:** AppleScript/PowerShell přes `main.js` + escapování ověřené testy;
  v sandboxu to nešlo spustit. Při selhání to bezpečně spadne na `mailto`.

### 7. Vyplnit „Místo" v profilu
- **Ty:** v profilu doplnit **Místo** (6. pád — „Praze", „Brně"), ať plná moc,
  podpis i podpisový blok mají správné město (default zůstává „Praze").
- **Připraveno:** pole v profilu i napojení hotové a otestované.

---

## 🟢 Volitelné / rozhodnutí

### 8. Git push
- Po každé dávce změn `git add -A && git commit && git push` v obou repo (děláš ty).

### 9. Doladit rozdělení Core vs Business
- Rozhodnout hraniční funkce (ARES, adresář, e-podpis, úroky, mail merge…) —
  co patří do core (jednotlivec) a co do business (firma). Teď jsou v core;
  přeřazení je jen atribut `data-pack`.

### 10. Reálná cloudová záloha (volitelné)
- Dnes je datová suverenita (lokální šifrované úložiště) — pokud budeš chtít
  týmové sdílení/synchronizaci, je to samostatné téma (jiný trust model).

---

## Stav připravenosti (co je hotové z kódu)

- Bezpečnost (šifrování, klíč mimo data, zámek, LexisLink token), ISDS engine +
  testy, výpočet lhůt (§ 57) + testy, extrakce náležitostí + testy, kalkulačky
  (poplatek/tarif/úrok) + testy, odstraněné „falešné úspěchy", Najít/Nahradit,
  přeposílání datovek klientovi se zápisem do spisu, architektura edic
  (Core/Business/Legal), zobecněný profil/hlavička. **Testy: 127 zelených.**
