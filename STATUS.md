# LexisEditor — stav zralosti (poctivá matice)

Záměrně **nepřeprodává**. **Unit** = pokryto testy (logika). **Runtime** = ověřeno
v běžící Electron aplikaci. **Prod** = ověřeno v reálném provozu u advokáta.
Testy spustíš `npm test`.

| Funkce | Unit | Runtime | Prod | Poznámka |
|---|:--:|:--:|:--:|---|
| Editor jádro (A4, Times, číslování, „Strana X z Y") | ✅ | 🟡 | ❌ | Vizuální chování ověřit v běhu. |
| Sledované změny / redline / recenzní panel | ✅ | 🟡 | ❌ | OOXML round-trip testován; otevření v MS Wordu ověřit. |
| AI revize (redline), poznámky, komentáře | ✅ | 🟡 | ❌ | Kvalita AI závisí na modelu; runtime neověřeno. |
| Nativní export .docx (hlavička+logo, vodoznak, tabulky) | ✅ | 🟡 | ❌ | Round-trip v testech; **otevření výsledku v MS Wordu neověřeno**. |
| Autorské API (applyDocumentSpec/getDocumentSpec/tableOps/authorities/odkazy) | ✅ | 🟡 | ❌ | 52 testů; vykreslení embedů přes `setContents` runtime neověřeno. |
| Kontrola pravopisu (Chromium) + jazyk/spisovnost | ✅ | 🟡 | ❌ | Electron runtime funkce; ověřeno proti typům, ne v běhu. |
| ISDS / e-Gov (transport, inbox, ZFO, ARES, ISIR) | ✅ | 🟡 | ❌ | Data ISDS soudů ověřena proti registru; **reálné odeslání/příjem neověřeno v provozu**. |
| Hlídání lhůt (§607 – víkend/svátek) | ✅ | 🟡 | ❌ | Logika testována. |
| **Elektronický podpis PDF** | ❌ | ❌ | ❌ | **Zatím jen VIZUÁLNÍ doložka — NEpodepisuje kryptograficky, neověří se v Acrobatu.** Skutečný podpis vyžaduje kvalifikovaný certifikát + PAdES (v přípravě). |
| Šifrování (SecureVault) | ✅ | 🟡 | ❌ | **Trvalé uložení klíčů vyžaduje desktopový build**; bez něj jen pro relaci. |

## Co je potřeba k „produkčně hotovo"
- **Runtime smoke** v Electronu: export do Wordu, redline/poznámky/tabulky, vodoznak,
  `applyDocumentSpec` (vykreslení embedů), reálné odeslání/příjem datovou schránkou.
- Code-signing certifikáty (Apple/Windows) — odstraní varování „neznámý vývojář".
- Reálné uživatelské testování u advokátní kanceláře (design partner) + bezpečnostní review.

Rozhraní pro AI agenty je popsáno v `AGENT_API.md`.
