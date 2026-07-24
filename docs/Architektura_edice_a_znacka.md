# LexisEditor / LexisLocal — jádro, balíčky a značka

*Architektonická poznámka. Cíl: z dnešního „produktu pro advokáty" udělat **obecný
základ** použitelný firmami i jednotlivci, a advokátní funkce z něj oddělit do
volitelného balíčku. Vše v jednom kódu, edice se skládají z konfigurace — žádný fork.*

---

## 1. Princip: jedno jádro + skládatelné balíčky

Ne „základní verze vs. Pro", ale **jádro + oborové/segmentové balíčky (packs)**, které
se navzájem skládají:

- **Core** — editor a vše obecné. Samostatně použitelný produkt (jednotlivec, freelancer).
- **Business pack** — co potřebují firmy (sdílené šablony, firemní hlavička, týmy/licence, zakázky/čas).
- **Legal pack (Advokáti)** — celá právní vertikála. Značka **Lexis**.

Advokátní kancelář = Core + Business + Legal. Účetní kancelář (kdykoli v budoucnu) =
Core + Business + Accounting pack. Jednotlivec = Core (+ případně jeden pack).

Klíčové: **jeden repozitář, jedna sada testů, edice vzniká z konfigurace.** Fork do
dvou projektů ne — znamenal by dvakrát opravovat každou chybu a edice by se rozešly.

---

## 2. Co je jádro a co balíček

Rozdělení podle dnešních modulů (většina právních věcí už žije v samostatných
`js/ui/*.js` / `js/core/*.js`, takže šev tam prakticky je).

### LexisEditor

**Core (obecné, samostatná hodnota):**

- Editor: Quill, formátování, styly, tabulky, obrázky, poznámky pod čarou, čísla
  stránek, záložky, sledování změn, komentáře, porovnání verzí, historie.
- Najít/Nahradit, čištění metadat, diktování.
- Dokumenty a šablony: nový dokument, import PDF/DOCX/text, náhled PDF, šablony
  (uložení/správa/tovární), titulní strana, obsah (TOC).
- **Hlavičkový papír jako obecný „profil"** (jméno/firma/IČO/DIČ/kontakt/logo) —
  dnes je to „profil advokáta", stačí zobecnit popisky.
- Připomínky k datu + export do kalendáře (.ics / Google / Outlook) — *obecná* část
  dnešního kalendáře.
- Export: DOCX, PDF, e-mail (mailto/SMTP), bundle.
- Bezpečnost: zámek (scrypt/Touch ID), záloha klíče, anonymizace/PII shield, LexisLink
  (ovládání z telefonu).
- Onboarding, i18n, panel rychlých akcí, nahlásit chybu, samodiagnostika.

**Business pack (firmy):**

- Sdílená knihovna šablon a doložek, firemní branding/hlavička.
- Týmy / více licencí (seaty), sdílený adresář kontaktů.
- Time tracking a timesheets, evidence zakázek (dnešní „profitabilita/matters" jde
  zobecnit z „případů" na „projekty/zakázky").

**Legal pack — Lexis (advokáti):**

- Datové schránky (odeslání, outbox, inbox, doručenky, fikce doručení, `.zfo`,
  přeposlání zprávy klientovi).
- Databáze soudů (`court-data` / `court-registry`), lustrace ARES/ISIR, konflikt zájmů.
- Lhůty dle **§ 57 o.s.ř.** (pracovní dny, svátky, Velikonoce), rozpoznání pevného data.
- Kalkulačky: soudní poplatek, advokátní tarif (177/1996 Sb.), úrok z prodlení.
- Plná moc, odpověď soudu na jedno kliknutí, extrakce č.j./spisové značky, Legal Linker,
  rejstřík citované judikatury.
- Transparency ledger a audit v rozsahu pro advokáty.

### LexisLocal

Tady je poměr obrácený — je to z velké části právo. Proto ho neber jako „druhý
produkt", ale jako **engine + oborové balíčky**:

- **Engine (obecné plumbing):** lokální AI orchestrace (Ollama), RAG / vektorová DB,
  embeddingy, file watcher, OCR, šifrovaná DB + audit + rotace klíče, archivace
  (Dublin Core), workflow engine, e-mailový asistent / SMTP mailer, green metriky,
  Paperless integrace.
- **Legal pack:** 5 právních agentů + jejich prompty, ARES/ISIR, konflikt zájmů,
  judikatura, lhůty a jednání, timeline spisu.

Engine sám o sobě není spotřebitelský produkt — je to infrastruktura, na kterou se
věší oborové balíčky. Jeho obecnost se **vyplatí až u druhé vertikály**, přesně proto,
že cílíš i mimo advokáty.

---

## 3. Mechanika edic

Jeden zdroj pravdy — konfigurační objekt edice:

```
edition = {
  id: 'legal',                 // 'core' | 'business' | 'legal' | kombinace
  brandName: 'Lexis',          // zobrazované jméno (viz kap. 5)
  packs: ['core','business','legal'],
  flags: { isds:true, courts:true, deadlines57:true, tariffs:true, ... }
}
```

Z toho se řídí:

1. **Které moduly se načtou** — `<script>` includy v `index.html` se generují/filtrují
   podle `packs` (dnes jsou napevno; nahradit načtením podle manifestu).
2. **Které panely/tlačítka se zobrazí** — guard `Edition.has('legal')` kolem tlačítek
   „Datové schránky", „Tarif", „Odpověď soudu" atd.
3. **Texty značky** — všude, kde je dnes napevno „LexisEditor", se čte `edition.brandName`.

Manifest balíčků (co → který pack) vychází přímo z inventury funkcí, kterou už máme
(`funkcionality.md`).

---

## 4. Pořadí prací (ať se nic nerozbije)

1. **Manifest balíčků** — seznam modulů a jejich pack (core/business/legal).
2. **Edition config + brand konstanta** — jeden zdroj; nahradit hardcoded „LexisEditor"
   v UI odkazem na config (POZOR: jen zobrazované texty, ne interní identifikátory — kap. 5).
3. **Guard mechanismus** — `Edition.has(pack)` pro podmíněné načtení modulů a UI.
4. **Inkrementální extrakce legal kódu z monolitu** (`lexis-ui.js` 373 KB, `index.html`)
   do legal modulů za guard. Tím se **současně rozbije monolit** (dnešní TODO) — dvě
   mouchy jednou ranou.
5. **Build profily** — `dist:core`, `dist:business`, `dist:legal` (electron-builder).
6. **Testy** — core testy vždy; pack testy jen s daným packem; smoke test každé edice.

Doporučené tempo: nejdřív ať **Core obstojí jako samostatný použitelný editor**, teprve
pak vrstvit packy. Jinak hrozí stavět univerzálnost „do foroty".

---

## 5. Značka a přejmenování

**„Lexis" ponech jako vlajku právní edice** — do práva sedí („lex" = zákon), je to
hodnota. Pro **jádro zvol neutrální jméno** (v kódu ti zůstala adresa `nexusstack.eu`
— pokud je „Nexus" tvá zastřešující značka, nabízí se `Nexus Editor` pro jádro a
`Lexis` pro advokáty). Pozor: „Lexis…" u právního produktu zvaž i kvůli možné záměně
s LexisNexis (a tady mě neber za slovo — právník jsi ty).

Zásadní rozlišení, ať přejmenování nebolí:

**Přejmenovat lze snadno (zobrazované / brand):** název aplikace a oken, `productName`
v buildu, README/web, marketing, `.cz` domény, podpůrný e-mail.

**NEPŘEJMENOVÁVAT (interní identifikátory — jinak osiří data / rozbije instalace):**

- cesta ke klíči `~/.lexislocal/lexis.key`, proměnná `LEXIS_KEY_DIR`,
- datové složky / `WATCH_DIR`,
- ISDS `PRODID` v `.ics` (`-//LexisEditor//…`),
- klíče v IndexedDB / nastavení (`contacts-db`, `datovka-client-map`, `lawyer-*`, …),
- řetězce uživatele v auditním logu (`LexisEditor`, `LexisLocal`),
- cesty API endpointů.

Pravidlo: **brand = konfigurace; technické identifikátory zůstávají stabilní.** Kdyby
ses někdy rozhodl přejmenovat i klíč/složky, musí to jít přes **migraci** (přesun +
přečtení starého), jak už to umíme u `lexis.key`.

---

## 6. Na co dát pozor

- **Jedna codebase, ne fork.** Edice = konfigurace, ne druhý repozitář.
- **Nepřekombinovat packy dřív, než Core obstojí sám.** Obecný editor musí být
  použitelný produkt, jinak je to práce do foroty.
- **Testovací matice roste** s počtem edic — řešit build/CI profily per edice.
- **Firmy = jiný trust model.** „Data neopouštějí počítač" platí u jednotlivce; u týmů
  přijde otázka sdílení/synchronizace (možná server) — velké téma na později, ne teď.
  Pozor, ať se to nesrazí s tím, co je dnes záměrně lokální.
- **Technické identifikátory zmrazit / migrovat opatrně** (viz kap. 5).
