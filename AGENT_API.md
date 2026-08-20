# LexisEditor — Agent API (autorské rozhraní pro AI agenty)

Rozhraní, kterým AI agent **sestaví, přečte a upraví** dokument v LexisEditoru
deterministicky — z jednoho JSON popisu (`spec`), bez klikání v GUI a bez počítání
pozic. Vše je vystaveno jako globální funkce v rendereru.

## Globální funkce

| Funkce | Popis |
|---|---|
| `applyDocumentSpec(spec)` | Sestaví CELÝ dokument z `spec` (vloží do editoru). Vrací souhrn `{ blocks, header, watermark, opCount }`. |
| `getDocumentSpec()` | Přečte AKTUÁLNÍ dokument zpět do `spec` (round-trip → agent může editovat). |
| `buildDocumentDelta(spec)` | Jen sestaví Quill Delta z `spec` (bez vložení) — pro náhled/testy. |

Nízkoúrovňově též `window.LexisAuthoring.{buildDelta, deltaToSpec, apply, readSpec}`
a `window.LexisCitations.{extractCitations, buildAuthorities}`.

## Schéma `spec`

```jsonc
{
  "title": "Nadpis",                    // volitelně: vycentrovaný tučný titul
  "letterhead": { "profile": {          // volitelně: hlavička/patička z profilu (vč. loga)
    "name": "JUDr. Jan Novák", "firm": "Advokátní kancelář Novák",
    "address": "…", "ico": "12345678", "dic": "…", "license": "01234",
    "tel": "…", "email": "…", "web": "…", "isds": "abc1234",
    "logo": "data:image/png;base64,…"   // pouze data: URL (bezpečnost)
  } },
  "watermark": { "text": "KONCEPT", "color": "#e0dbd3" },  // volitelně
  "aiDisclosure": true,                 // EU AI Act čl. 50: doložka + strojový marker (true nebo vlastní text)
  "blocks": [ /* … bloky v pořadí … */ ]
}
```

## Typy bloků

```jsonc
{ "type": "heading", "level": 1, "text": "Úvod", "id": "uvod" }   // level 1–6; id = cíl křížového odkazu

{ "type": "paragraph", "text": "Prostý text.", "align": "justify" }  // align: left|center|right|justify
{ "type": "paragraph", "align": "left",
  "runs": [                                                   // formátované běhy textu
    { "text": "tučně", "bold": true },
    { "text": " normálně " },
    { "text": "odkaz", "link": "https://justice.cz" },        // + italic, underline
  ],
  "footnote": "Srov. 21 Cdo 1234/2019." }                     // volitelná poznámka pod čarou

{ "type": "list", "ordered": true, "items": ["první", "druhý"] }   // ordered:false = odrážky

{ "type": "table", "cells": [["A","B"], ["C","D"]] }          // nebo "rows"/"cols" bez obsahu

{ "type": "authorities", "title": "Seznam citované judikatury" }  // AUTO seznam citované judikatury
                                                              // (projde dokument, rozpozná NS/ÚS/NSS/obecné, odduplikuje, setřídí)

{ "type": "toc" }                                             // automatický obsah
{ "type": "pageBreak" }                                       // zalomení stránky
```

## Příklad 1 — Žaloba

```json
{
  "title": "Žaloba o zaplacení 50 000 Kč",
  "letterhead": { "profile": { "firm": "AK Novák", "ico": "12345678", "isds": "abc1234" } },
  "watermark": { "text": "KONCEPT" },
  "blocks": [
    { "type": "heading", "level": 1, "text": "I. Označení účastníků" },
    { "type": "paragraph", "text": "Žalobce: … Žalovaný: …" },
    { "type": "heading", "level": 1, "text": "II. Skutkový stav" },
    { "type": "paragraph", "runs": [
      { "text": "Žalobce se domáhá zaplacení " },
      { "text": "50 000 Kč", "bold": true },
      { "text": " dle " },
      { "text": "§ 2079 NOZ", "link": "https://zakonyprolidi.cz" }
    ], "align": "justify", "footnote": "Srov. NS 33 Cdo 1234/2019." },
    { "type": "list", "ordered": true, "items": [
      "Dne 1. 1. 2025 byla uzavřena kupní smlouva.",
      "Žalovaný neuhradil kupní cenu."
    ] },
    { "type": "heading", "level": 1, "text": "III. Petit" },
    { "type": "paragraph", "text": "Navrhuji, aby soud vydal platební rozkaz…" },
    { "type": "authorities" }
  ]
}
```

## Příklad 2 — Předžalobní výzva (tabulka)

```json
{
  "title": "Předžalobní výzva k úhradě",
  "blocks": [
    { "type": "paragraph", "text": "Vyzývám Vás k úhradě níže uvedených faktur:" },
    { "type": "table", "cells": [
      ["Faktura", "Splatnost", "Částka"],
      ["2025/001", "15. 1. 2025", "50 000 Kč"]
    ] },
    { "type": "paragraph", "text": "…nejpozději do 7 dnů dle § 142a o. s. ř." }
  ]
}
```

## Křížové odkazy a číslování nadpisů

Zapni `"numberHeadings": true` → nadpisy dostanou číslo (1. úroveň římsky `I, II, III`,
hlubší arabsky `II.1`). Nadpis označ `"id"`, v textu odkaž během `{ "ref": "id" }`:

```json
{
  "numberHeadings": true,
  "blocks": [
    { "type": "heading", "level": 1, "text": "Skutkový stav", "id": "skutek" },
    { "type": "heading", "level": 1, "text": "Právní posouzení" },
    { "type": "paragraph", "runs": [
      { "text": "Jak plyne z čl. " }, { "ref": "skutek" }, { "text": ", nárok je důvodný." }
    ] }
  ]
}
```

`{ "ref": "skutek" }` → číslo cíle („I"); `{ "ref": "skutek", "as": "title" }` → text nadpisu;
neznámý odkaz → „?". Čísla se zapisují do textu při sestavení; na už očíslovaném dokumentu
`numberHeadings` znovu nezapínej.

## Editace tabulek (`window.LexisAuthoring.tableOps`)

Čisté operace nad blokem tabulky — agent přečte dokument, upraví tabulku a zapíše zpět:

```js
const spec = getDocumentSpec();
const t = spec.blocks.find(b => b.type === "table");
LexisAuthoring.tableOps.setCell(t, 1, 2, "50 000 Kč");   // řádek, sloupec, hodnota
LexisAuthoring.tableOps.addRow(t, null, ["2025/002", "…", "12 000 Kč"]);
LexisAuthoring.tableOps.addColumn(t, 0, ["#", "1", "2"]); // vloží sloupec vlevo
LexisAuthoring.tableOps.removeRow(t, 0);
LexisAuthoring.tableOps.dimensions(t);                     // { rows, cols }
applyDocumentSpec(spec);
```

Tabulka se udržuje obdélníková (chybějící buňky se doplní prázdné). Tím agent získává
plnou editaci buněk bez nutnosti runtime vázání na Quill.

## Round-trip (číst → upravit → zapsat)

```js
const spec = getDocumentSpec();                 // přečte hotový dokument do JSON
spec.blocks.push({ type: "authorities" });      // agent upraví
applyDocumentSpec(spec);                         // zapíše zpět
```

## Poznámky

- **Pozice se neřeší.** Agent popisuje strukturu; API deterministicky sestaví Delta a vloží.
- **Bezpečnost:** logo jen `data:` URL; HTML hlavičky/patičky se sanitizuje (DOMPurify);
  vodoznak i barvy se escapují.
- **Limity:** tabulka max 50×12; `getDocumentSpec` vrací hlavičku/patičku jako HTML
  (`letterheadHtml`), nikoli zpět jako profil.
- **Čisté funkce** `buildDelta`/`deltaToSpec`/`extractCitations` jsou plně otestované
  (`tests/unit/authoring.test.js`, `tests/unit/citations.test.js`).
