<div align="center">
  <img src="https://ui-avatars.com/api/?name=Lexis+Editor&background=2563eb&color=fff&size=150&rounded=true&font-size=0.33" width="120" alt="LexisEditor Logo" style="border-radius: 20px;">
  
  # LexisEditor v1.1 ULTIMATE
  **AI-Native Legal Word Processor & Workspace**
  
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#)
  [![Tech](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js%20%7C%20Quill-blue.svg)](#)
  [![Privacy](https://img.shields.io/badge/privacy-100%25%20Offline%20First-success.svg)](#)
</div>

---

## 🏛 O Projektu
**LexisEditor** není jen textový editor, je to plnohodnotné, nativní LegalTech prostředí (IDE pro právníky). Byl navržen od základů jako náhrada Microsoft Wordu s primárním zaměřením na absolutní kontrolu nad daty, integraci lokální umělé inteligence a automatizaci rutinních právních úkonů.

Díky architektuře založené na Electronu běží aplikace nezávisle, přímo přistupuje k souborovému systému a zaručuje 100% ochranu klientských dat.
### ✨ Klíčové vlastnosti v1.3.0

#### ⏰ 1. Proaktivní hlídání lhůt
Editor v reálném čase analyzuje text a detekuje termíny (např. "ve lhůtě 15 dnů"). Jedním kliknutím lhůtu uložíte do bočního panelu, kde ji editor hlídá, odpočítává dny a včas vás varuje vizuální signalizací. Podporuje export do kalendářů (.ics).

#### 💰 2. Právní Toolbox "All-in-One"
- **Advokátní tarif:** Automatický výpočet odměny podle hodnoty sporu a počtu úkonů.
- **Inteligentní anonymizace:** Automatické vyhledání a maskování RC, dat narození a kontaktů před odesláním dokumentu.
- **Kalkulačky:** Soudní poplatky, zákonné úroky z prodlení a smluvní pokuty.

#### 🏗️ 3. Inteligentní šablony a Auto-fill
Systém detekuje pole v hranatých závorkách `[ ]`. Vyplněním jednoho pole v bočním panelu dojde k okamžité aktualizaci všech výskytů v celém dokumentu.

#### 🔌 4. Integrace a Konektivita
LexisEditor je připraven na moderní svět. Díky podpoře Webhooků jej lze propojit se systémy jako Evolio, SingleCase nebo Zapier/Make.

## 🛠 Instalace a Build

### Prerekvizity
- Node.js (v18 nebo novější)
- Npm nebo Yarn

### Spuštění ve vývojovém režimu
Naklonujte repozitář a nainstalujte závislosti:
```bash
git clone https://github.com/vase_jmeno/LexisEditor.git
cd LexisEditor
npm install
npm start
```

### Kompilace pro produkci (Zabalení do .dmg / .exe)
Aplikace využívá `electron-builder` pro tvorbu distribučních balíčků.
```bash
npm run dist
```
*Poznámka: Výsledný instalační soubor bude vygenerován do složky `dist/`.*

## 🔒 Zabezpečení a Soukromí (Privacy by Design)
LexisEditor byl vyvinut s důrazem na mlčenlivost advokáta. Veškeré návrhy, dokumenty, komentáře i AI analýzy probíhají **lokálně v operační paměti a na disku uživatele**. Aplikace defaultně nepřenáší telemetrická data třetím stranám.

---
<div align="center">
  Vyvinuto pro moderní advokátní praxi. <br/>
  © 2026
</div>
