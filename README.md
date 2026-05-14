<div align="center">
  <img src="https://via.placeholder.com/150/2563eb/ffffff?text=LE" width="120" alt="LexisEditor Logo" style="border-radius: 20px;">
  
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

## ✨ Klíčové vlastnosti

### 1. Nativní správa dokumentů
- **.DOCX Export:** Integrace `html-to-docx` pro generování nativních Word dokumentů plně kompatibilních s úřady a protistranami.
- **Glassmorphism UI:** Moderní, nerušivé uživatelské rozhraní se strukturou podobnou Ribbonu MS Word.

### 2. Právní Toolbox (Legal Powerhouse)
- **Kalkulátory:** Automatický výpočet soudních poplatků, úroků z prodlení a procesních lhůt.
- **Validace:** Kontrola hierarchie paragrafů (prevence formálních chyb v číslování) a inteligentní vkládání podpisových doložek s detekcí stran.
- **Registry:** Příprava na napojení do systémů ARES a ISDS (Datové schránky).

### 3. Local-First AI Integrace (LexisAI)
- **Bezpečná syntéza:** Plná podpora lokálních modelů přes **Ollama** (Llama 3, Mistral) – žádná data neopouštějí váš počítač.
- **AI Assistent:** Rychlé generování doložek, smluvních ustanovení a revize smluv přes vestavěný boční panel.

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
