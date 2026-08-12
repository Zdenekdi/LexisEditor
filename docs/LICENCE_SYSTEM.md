# Licencování / entitlement — LexisEditor

Mechanismus je **připravený, ale ZATÍM NEAKTIVNÍ**. Aplikace se dnes chová jako dřív
(výchozí edice `full` = vše zapnuté). Tento dokument popisuje, jak to funguje a jak to
aktivovat, až bude prodej.

## Princip: prodávej online, vynucuj offline

- **Vynucení = kryptograficky podepsaná licence (Ed25519), ověřená lokálně.** Žádná síť
  není potřeba (sedí na lokální/GDPR étos — advokát u soudu bez signálu se nezasekne).
- **Prodej + DPH = merchant-of-record** (Lemon Squeezy / Paddle apod.): vyřeší EU DPH,
  faktury, předplatné a přes webhook vydá/obnoví licenci. (Konkrétní podmínky služeb
  ověř aktuálně — mění se; DPH konzultuj s účetní.)

## Formát licence (`lexis_license.json`)

```json
{
  "payload": {
    "tier": "pro",              // free | pro | firm
    "name": "Jan Novak",
    "customerId": "CUST-123",
    "seats": 1,                  // pro Firm
    "issued": "2026-08-11",
    "expires": "2027-08-11"      // vynech = perpetual (trvalá)
  },
  "signature": "base64(Ed25519 podpis nad kanonickým payloadem)"
}
```

Ukládá se do složky `userData` aplikace. Podpis je nad payloadem s **seřazenými klíči**
(viz `canonicalPayload` v `js/core/lexis-license.js`) — proto podpis i ověření musí
používat stejnou kanonizaci (issue-license.js ji sdílí se stejným modulem).

## Vrstvy → edice

| tier | edice (`lexis-edition.js`) | co odemyká |
|------|----------------------------|------------|
| `free` | `core` | jen jádro (editor zdarma) |
| `pro`  | `legal` | + Legal pack (advokátní vertikála + AI) |
| `firm` | `full`  | + Business pack (firemní/týmové) |

## Soubory

- `js/core/lexis-license.js` — čistý validátor (`verifyLicense`, `tierToEditionId`). Testy: `tests/unit/license.test.js`.
- `js/core/lexis-license-key.js` — VEŘEJNÝ klíč (prázdné = neaktivní).
- `main.js` — `LICENSING_ENABLED` (master vypínač), `readLicenseStatus()`, IPC
  `get-license-status` (async, pro UI) a `get-license-edition-sync` (edice při startu).
- `preload.js` — `electronAPI.getLicenseStatus()` a `electronAPI.licenseEdition` (sync).
- `js/core/lexis-edition.js` — `resolveEditionId()` bere licenci s nejvyšší prioritou
  (prázdné = přeskočí → výchozí `full`).
- `tools/license/generate-keypair.js`, `tools/license/issue-license.js` — dev/ops nástroje.

## Aktivace (checklist, až bude prodej)

1. `node tools/license/generate-keypair.js` → vznikne pár v `.license-keys/` (gitignore).
2. VEŘEJNÝ klíč vlož do `js/core/lexis-license-key.js` (`LICENSE_PUBLIC_KEY_PEM`).
3. **PRIVÁTNÍ klíč ulož mimo repo** (trezor / secret v CI podepisovací služby). Nikdy necommituj.
4. V `main.js` přepni `LICENSING_ENABLED = true`.
5. Rozhodni chování u neplacených funkcí: dnešní `apply()` je **skryje**; alternativa je
   ukázat je s upsell výzvou („Součást Lexis Pro"). Doporučení: upsell u nejviditelnějších
   (datovky, lhůty, AI), zbytek skrýt.
6. Napoj vydávání licencí na webhook merchant-of-record (volá ekvivalent `issue-license.js`).
7. Zvaž, zda při aktivním licencování vypnout testovací přepínače `?edition=` / `localStorage`
   (aby nešly obejít) — licence už má v `resolveEditionId` nejvyšší prioritu.

## Předplatné vs. perpetual

- **Předplatné:** `expires` = konec období; při obnově vydej novou podepsanou licenci.
  Offline `grace` (výchozí 21 dní po expiraci) překlene výpadky, než proběhne online refresh.
- **Perpetual:** `expires` vynech; licence platí trvale (např. „koupě + rok aktualizací"
  řeš datem v jiném poli / verzí buildu).

## Firm (více uživatelů) — seaty

Seaty **nevynucuj na desktopu**, ale centrálně na LexisLocal backendu (režim klient-server
už má server + šev `principal`/`scopes`, viz `ARCHITECTURE.md`). Stejný formát licence,
ověření tímtéž modulem; to je samostatný krok firemního režimu.
