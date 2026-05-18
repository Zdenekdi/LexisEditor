# Changelog - LexisEditor

Všechny podstatné změny v tomto projektu budou zaznamenány v tomto souboru.

## [3.2.0] - 2026-05-18
### Přidáno
- **LexisLocal (Offline Swarm)**: Integrace s lokálním AI ekosystémem LexisLocal.
- **Agent Swarm Control**: Možnost volby specializovaného agenta (Rešeršník, Stylista, Kontrolor) a lokálního modelu přímo v AI sidebar panelu.
- **Kontextové vyhledávání (Highlight Context)**: Automatické odesílání označeného textu v editoru jako kontextu pro rychlou analýzu a úpravy právních doložek.

## [3.1.1] - 2026-05-18
### Opraveno
- **Odstranění testovacích dat**: Hloubkové pročištění celého kódu od natvrdo zapsaných osobních údajů, jmen a lokálních cest k certifikátům.
- **Dynamické šablony**: Všechny právní ribbonové nástroje, podpisy, záhlaví a generátory titulních stran nyní načítají údaje plně dynamicky z IndexedDB profilu advokáta.

## [3.1.0] - 2026-05-17
### Přidáno
- **ISDS Manager**: Plnohodnotný prohlížeč Datových schránek s inboxem, detailem zpráv a simulátorem.
- **ISDS attachment import**: Možnost jednosměrného importu textového obsahu příloh do editoru.
- **Digital PDF Signatures**: Zaručený elektronický podpis PDF advokátním certifikátem s vizuální doložkou.
- **Legal Dashboard**: Přehledná historie nedávných dokumentů na úvodní obrazovce se sledováním lhůt a workflow fázemi.

## [3.0.0] - 2026-05-16
### Přidáno
- **AI Privacy Suite**: Upgrade anonymizátoru o detekci entit (jména, firmy) pomocí LLM.
- **Znalostní báze (RAG)**: Indexace dokumentů a sémantické vyhledávání v historii přímo v AI Toolboxu.
- **Voice Suite**: Hlasové diktování (Speech-to-Text) optimalizované pro češtinu.
- **Onboarding**: Interaktivní průvodce (Tutorial) pro nové uživatele.
- **Word Shortcuts**: Kompletní sada klávesových zkratek (Ctrl+B, I, U, 1-3, atd.).

## [2.5.0] - 2026-05-15
### Přidáno
- **Ultimate Legal Suite**: Knihovna doložek (Clause Library) pro ukládání know-how.
- **Dynamické proměnné**: Automatické vyplňování textu přes boční panel pomocí `{{...}}`.
- **Obsah (ToC)**: Automatické generování interaktivního obsahu dokumentu.
- **ISDS Data Mapper**: Export metadat pro .zfo formuláře a Datové schránky.
- **Sanity Test Suite**: Automatizované testy integrity před nasazením.

## [2.4.0] - 2026-05-15
### Přidáno
- **Mobilní skenování**: Integrace s LexisLink Remote pro focení dokumentů mobilem.
- **AI OCR**: Převod naskenovaných dokumentů na text s extrakcí metadat.
- **Premium Branding**: Nová vizuální identita (Deep Navy & Gold), font Outfit.

## [2.3.0] - 2026-05-15
### Přidáno
- **LexisConnect**: Veřejné API pro integraci s Evolio, SingleCase a dalšími.
- **Web Preview**: Statický HTML export dokumentu pro sdílení bez nutnosti editoru.

## [2.2.0] - 2026-05-15
### Přidáno
- **Sledování změn (Redlining)**: Profesionální revizní režim (návrhy/schvalování).
- **Version Diff (Blackline)**: Vizuální porovnání dvou verzí dokumentu.

## [2.1.0] - 2026-05-13
### Přidáno
- **SafeStorage**: Hardwarově vázané šifrování pro AI API klíče.
- **LexisLink**: Vzdálené ovládání editoru z mobilních zařízení.
- **Nápověda**: Integrovaný systém návodů přímo v Ribbonu.
