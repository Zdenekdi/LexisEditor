# 📖 Návod na zprovoznění lokální AI (Apple Intelligence & Ollama) v LexisEditoru

Vítejte u kompletního průvodce pro nastavení **100% offline umělé inteligence** ve vašem textovém procesoru LexisEditor. Tento návod je navržen speciálně pro advokáty a právní kanceláře, které vyžadují nekompromisní ochranu klientských dat (GDPR, advokátní tajemství) a chtějí využít plný výkon svého vlastního hardwaru bez placení API klíčů či odesílání dat na externí cloudové servery.

---

## 🍏 Metoda A: Apple Intelligence (přes nástroj `apfel`)

Tato metoda vám umožní přímý a svobodný přístup k lokálnímu AI modelu (LLM) o velikosti **~3 miliard parametrů**, který je vestavěný v každém moderním Macu s procesorem Apple Silicon jako součást systému Apple Intelligence. 

Framework `apfel` (od autora *Arthur-Ficial*) tento integrovaný model „vytahuje ven“ na lokální port a dává vám ho plně k dispozici pro rešerše, audity a psaní smluv přímo v LexisEditoru.

### 📋 Systémové požadavky
*   **Hardware**: Libovolný Mac s procesorem Apple Silicon (**M1, M2, M3, M4** nebo vyšší).
*   **Operační systém**: macOS 15.0+ (Sequoia) nebo novější.
*   **Nastavení systému**: Aktivovaná funkce **Apple Intelligence** v *Nastavení systému -> Apple Intelligence a Siri* (musí být stažen lokální model a nastaven podporovaný jazyk).

### 🛠️ Krok za krokem:

#### Krok 1: Instalace balíčkovacího manažeru Homebrew
Pokud ještě nemáte na svém Macu nainstalovaný vývojářský balíčkovač Homebrew, otevřete systémovou aplikaci **Terminál** (stiskněte `Cmd + Mezerník`, napište *Terminál* a stiskněte Enter) a vložte následující příkaz:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
*(Postupujte podle pokynů na obrazovce, zadejte heslo k Macu a potvrďte.)*

#### Krok 2: Instalace nástroje `apfel`
Jakmile je Homebrew připraven, zadejte do Terminálu tento jediný příkaz pro stažení a instalaci `apfel`:
```bash
brew install Arthur-Ficial/tap/apfel
```

#### Krok 3: Spuštění lokálního AI serveru
Pro aktivaci rozhraní, se kterým dokáže LexisEditor komunikovat, spusťte v Terminálu:
```bash
apfel --serve
```
> [!IMPORTANT]
> Okno Terminálu s běžícím příkazem `apfel --serve` nechte otevřené na pozadí po celou dobu práce v LexisEditoru. Pokud chcete, aby se server spouštěl automaticky při startu počítače, můžete jej přidat do přihlašovacích položek (Login Items) v macOS.

#### Krok 4: Výběr v LexisEditoru
1. Spusťte **LexisEditor**.
2. V horním Ribbon menu přejděte na kartu **LexisAI**.
3. V pravé části v sekci **AI Engine** rozklikněte nabídku **Poskytovatel** a zvolte **Apple Intelligence (apfel)**.
4. Systém automaticky předvyplní:
   * **Model**: `apple-intelligence`
   * **Endpoint**: `http://localhost:11434/v1/chat/completions`
5. Hotovo! Nyní můžete vyzkoušet stisknout **Otevřít AI Bridge** v postranním panelu a zadat svůj první právní dotaz.

---

## 🦙 Metoda B: Ollama (Univerzální lokální AI)

Pokud nepoužíváte Mac s Apple Silicon (např. pracujete na Windows nebo starším Intel Macu), nebo chcete experimentovat s jinými specializovanými open-source modely (např. *Llama 3*, *Mistral*, *Qwen*), je skvělou volbou platforma **Ollama**.

### 📋 Systémové požadavky
*   **Windows / macOS (Intel i Silicon) / Linux**.
*   Doporučeno alespoň 8 GB RAM (pro modely o velikosti 3B/7B) nebo 16 GB RAM (pro modely 8B+).

### 🛠️ Krok za krokem:

#### Krok 1: Stažení Ollama
1. Navštivte oficiální web [ollama.com](https://ollama.com).
2. Stáhněte si instalační soubor pro váš operační systém (Windows, macOS nebo Linux) a nainstalujte jej jako běžnou aplikaci.

#### Krok 2: Stažení doporučeného modelu
Po spuštění Ollamy (v liště se zobrazí ikona lamy) otevřete **Terminál** (macOS) nebo **Příkazový řádek / PowerShell** (Windows) a stáhněte si rychlý a mimořádně schopný model **Llama 3**:
```bash
ollama run llama3
```
*(Ollama stáhne model a spustí interaktivní chat. Chat můžete ukončit napsáním `/exit` a stisknutím Enter. Ollama nadále poběží tiše na pozadí.)*

#### Krok 3: Výběr v LexisEditoru
1. Otevřete kartu **LexisAI** v Ribbonu.
2. V sekci **AI Engine** zvolte poskytovatele **Ollama (Local)**.
3. Systém automaticky předvyplní:
   * **Model**: `llama3` (případně přepište na stažený model, např. `mistral` nebo `qwen`)
   * **Endpoint**: `http://localhost:11434/api/generate`
4. Vše je připraveno k okamžité offline rešerši!

---

## ⚖️ Rychlé srovnání lokálních řešení

| Vlastnost | Apple Intelligence (`apfel`) | Ollama (Local) |
| :--- | :--- | :--- |
| **Podporovaný hardware** | Výhradně Apple Silicon (M1/M2/M3/M4) | Všechny platformy (Win, Mac, Linux, GPU/CPU) |
| **Spotřeba RAM/Energie** | Extrémně nízká (nativní optimalizace macOS) | Střední až vyšší (podle velikosti modelu) |
| **Rychlost odezvy** | Blesková (využívá integrovaný NPU čip) | Velmi rychlá na GPU, pomalejší na starších CPU |
| **Flexibilita modelů** | Fixní systémový model Apple | Možnost stáhnout stovky různých modelů (Mistral, Llama...) |
| **Offline režim** | Ano (100% lokální) | Ano (100% lokální) |

---

## ❓ Často kladené dotazy & Řešení problémů (Troubleshooting)

### AI Bridge hlásí "Externí API selhalo, aktivuji offline fallback." Co s tím?
1. **Ověřte, zda server běží**: Otevřete internetový prohlížeč a zadejte do adresního řádku: `http://localhost:11434`. 
   * Pokud prohlížeč napíše *"Ollama is running"* (u Ollamy) nebo vrátí JSON (u `apfel`), server je v pořádku aktivní.
   * Pokud se stránka nenačte, server neběží. Spusťte Terminál a zadejte `apfel --serve` (pro Apple Intelligence) nebo spusťte aplikaci Ollama.
2. **Překontrolujte nastavení endpointu**: Ujistěte se, že endpoint přesně odpovídá předvyplněné hodnotě na kartě *LexisAI -> AI Engine* (zejména lomítka a chybějící překlepy).

### Je používání těchto lokálních modelů zpoplatněno?
**Ne, nikdy.** Veškerý výpočetní výkon zajišťuje váš vlastní procesor a grafická karta. Nepotřebujete žádné registrace, žádné platební karty ani API klíče. Vše je 100% zdarma a neomezené.

### Uvidí někdo texty mých smluv?
**Absolutně ne.** Na rozdíl od ChatGPT, MS Copilotu nebo Google Gemini, které posílají texty přes internet do obřích serverových datacenter, Apple Intelligence (přes `apfel`) a Ollama zpracovávají každé jedno slovo lokálně v operační paměti vašeho počítače. Žádná data neopouštějí váš stroj.
