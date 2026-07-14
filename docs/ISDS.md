# Napojení na datové schránky (ISDS)

LexisEditor komunikuje s webovými službami ISDS přes modul `js/core/isds-client.js`
(staví a parsuje SOAP zprávy) a IPC handlery v `main.js`. Modul je čistý a
testovatelný bez Electronu.

## Operace

| Účel | Operace | Služba (cesta) | IPC / preload |
|---|---|---|---|
| Test přihlášení | `GetOwnerInfoFromLogin` | `/DS/DsManage` | `testIsdsConnection(creds)` |
| Ověření schránky | `FindDataBox` | `/DS/df` | `isdsFindDataBox(creds, query)` |
| Odeslání zprávy | `CreateMessage` | `/DS/dz` | `isdsSendMessage(creds, message)` |
| Doručenka / stav | `GetDeliveryInfo` | `/DS/dx` | `isdsGetDeliveryInfo(creds, dmID)` |

SOAP 1.1, jmenný prostor `http://isds.czechpoint.cz/v20`, autentizace HTTP Basic
(jméno + heslo). Pro přístup přes certifikát nastav `host`/`basePath` v `creds`
(např. `https://ws1c.mojedatovaschranka.cz` + `/cert/DS`).

## Endpointy

- **Testovací prostředí (czebox):** `https://ws1.czebox.cz/DS/<služba>`
- **Produkce:** `https://ws1.mojedatovaschranka.cz/DS/<služba>`

> Přesný host a cesta se liší podle typu přihlášení a verze WS. Endpointy jsou
> proto konfigurovatelné (`creds.host`, `creds.basePath`). Ověř je proti údajům,
> které dostaneš k WS přístupu.

## Jak otestovat na vlastní / testovací schránce

1. Získej přístup k **webovým službám** ISDS (ne jen do webového rozhraní) a pro
   testy si zřiď schránku v testovacím prostředí **czebox**.
2. Spusť smoke test bez GUI:

   ```bash
   ISDS_ENV=test ISDS_LOGIN=jmeno ISDS_PASSWORD=heslo \
   node scripts/isds-test.js
   ```

3. Volitelně ověř konkrétní schránku a pošli zprávu sám sobě:

   ```bash
   ISDS_ENV=test ISDS_LOGIN=... ISDS_PASSWORD=... \
   ISDS_FIND_IC=12345678 ISDS_SEND_TO=xxxxxxx \
   node scripts/isds-test.js
   ```

Skript vypíše přihlášení, výsledek vyhledání schránky (včetně stavu
doručitelnosti), odeslání (`dmID`) a události doručenky.

## Poznámky

- Ověření schránky (`FindDataBox`) je určené k **nahrazení odhadování ISDS z IČO**
  a fabrikovaných ISDS soudů — vrací skutečnou schránku a její stav.
- Na produkci mohou být **komerční** datové zprávy zpoplatněné; testuj primárně na
  czebox a se schránkou sám sobě.
- Parsování odpovědí je zatím regexové (kvůli konzistenci se zbytkem kódu a bez
  další závislosti). Pro produkční nasazení zvaž robustní XML parser.
