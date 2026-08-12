# RELEASE CHECKLIST — LexisEditor

Postup pro sestavení a vydání desktopové aplikace (Electron, electron-builder).
Aktuální verze: viz `package.json` (`version`). Publish cíl: GitHub `Zdenekdi/LexisEditor`.

> Pozn.: kód se needituje na této VM; tento checklist popisuje ruční kroky na Macu/PC.

## 1. Před buildem
- [ ] Zelené testy: `npm test` (jest) a ideálně `npm run test:all` (+ e2e).
- [ ] `node --check main.js preload.js` a klíčové `js/**` bez syntaktických chyb.
- [ ] Doplnit **CHANGELOG.md** o aktuální verzi (zaostával na 3.4.0 — auto-updater ukazuje changelog uživateli).
- [ ] Zkontrolovat, že verze v UI se čte z `package.json` (jeden zdroj pravdy).

## 2. Ikony a assety (OVĚŘENO)
- [x] `build/icon.png` = **skutečné PNG 1024×1024** (dřív to byl JPEG přejmenovaný na .png → build ikon by selhal; opraveno).
- [x] `build/background.png` = skutečné PNG (pozadí DMG).
- electron-builder generuje `.icns`/`.ico` automaticky z `build/icon.png` (žádný explicitní `mac.icon` není potřeba).
- Pozn.: `dmg.background` je 1024×1024; okno DMG je menší — obrázek se přeškáluje (kosmetika, ne blocker).

## 3. Verze — POZOR na auto-bump
- Skript `dist` = `npm version patch --no-git-tag-version && electron-builder` → **každé `npm run dist` zvýší patch verzi** (3.4.1 → 3.4.2).
- Chceš-li build bez zvýšení verze: `npm run pack` (jen `--dir`, bez instalátoru) nebo přímo `npx electron-builder`.

## 4. Build
- macOS (na Macu): `npm run dist`  → `dist/*.dmg` + `*.zip` (zip je nutný pro auto-update na macOS).
- Windows: `npx electron-builder --win`  → `dist/*.exe` (NSIS). Na Macu vyžaduje wine, jinak buildit na Windows.
- Rychlý test balení bez instalátoru: `npm run pack`.

## 5. Podpis a notarizace (ZATÍM NEDĚLÁME — bod 1, čeká na certifikáty)
- macOS: bez Apple Developer certifikátu ($99/rok) + notarizace bude aplikace hlásit „poškozeno / neznámý vývojář“. Pro distribuci nutné doplnit `mac.hardenedRuntime`, `entitlements`, `notarize`.
- Windows: bez code-signing certifikátu ukáže SmartScreen varování.
- **Důležité pro auto-update:** neподepsaná macOS aplikace se přes electron-updater spolehlivě neaktualizuje. Do vyřešení podpisu počítat s ručním stažením.

## 6. Publish / auto-update
- Auto-update je zapnutý (`electron-updater`, `checkForUpdatesAndNotify`, `autoInstallOnAppQuit`).
- Publikace na GitHub Releases: potřeba `GH_TOKEN` v prostředí; `electron-builder ... -p always` nahraje artefakty + `latest.yml`/`latest-mac.yml` + blockmapy.
- [ ] Vytvořit git tag verze a GitHub Release; ověřit, že `latest*.yml` odpovídá nahraným souborům.

## 7. Po buildu — smoke test balíčku
- [ ] Nainstalovat DMG/EXE na čistém profilu, spustit.
- [ ] Ověřit ikonu v Docku/liště a v okně „O aplikaci“.
- [ ] Otevřít vzor z úvodní obrazovky (šablony) → musí se načíst obsah (ne prázdný dokument).
- [ ] Vyzkoušet napojení na LexisLocal (token se čte automaticky), AI dotaz, export DOCX/PDF.
- [ ] (Po podpisu) ověřit auto-update z předchozí verze.

## Známé mezery
- Podpis/notarizace (bod 1) — čeká na certifikáty.
- CHANGELOG doplnit k aktuální verzi.
