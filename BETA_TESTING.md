# LexisEditor — příručka pro beta testery

Děkujeme, že testujete LexisEditor. Cílem bety je najít chyby a ověřit, že klíčové
funkce fungují v reálné praxi advokáta. Níže je, jak aplikaci spustit, co vyzkoušet
a jak nahlásit problém.

---

## 1. Instalace a první spuštění

Beta verze zatím **není podepsaná certifikátem**, takže operační systém při prvním
spuštění zobrazí bezpečnostní varování. Je to očekávané — aplikaci spustíte takto:

**Windows**
1. Spusťte stažený instalátor.
2. Objeví-li se „Windows ochránil váš počítač", klikněte na **Více informací** → **Přesto spustit**.

**macOS**
1. Otevřete `.dmg` a přetáhněte LexisEditor do složky Aplikace.
2. Spusťte aplikaci. Zobrazí-li se, že ji nelze ověřit:
   - **macOS Sonoma a starší:** klikněte na aplikaci pravým tlačítkem → **Otevřít** → **Otevřít**.
   - **macOS Sequoia (15) a novější:** jděte do **Nastavení systému → Soukromí a zabezpečení**, sjeďte dolů a klikněte na **Přesto otevřít**, pak potvrďte.

> Na firemních/spravovaných počítačích může správce toto obejití zakázat. Pokud aplikaci
> nejde spustit ani podle návodu, dejte nám vědět — pošleme podepsanou verzi.

Po spuštění doporučujeme nastavit **Profil advokáta / hlavičkový papír** (tlačítko 👤)
a **Zálohu šifrovacího klíče** (🔐 Záloha klíče) — viz níže.

---

## 2. Co prosím vyzkoušejte

- **Vytvoření dokumentu** a automatická **hlavička** (vyplňte profil → nový dokument by měl mít vaši hlavičku). Vyzkoušejte i tlačítko **Vložit hlavičku** a export do **PDF/Wordu**.
- **Datová schránka** (⚙️ Nastavení DS): zadejte údaje (nejdřív v prostředí *Testovací*), ověřte spojení. Kdo má produkční přístup, může zkusit i odeslání.
- **Odpověď na jedno kliknutí** (Odpovědět) — na dokumentu s č. j. / spisovou značkou.
- **Vložit stranu** — soud z databáze i kontakt z adresáře.
- **Lhůty a kalendář** — ověřte, že se lhůta posouvá přes víkend/svátek na pracovní den.
- **AI asistent** — vyzkoušejte generování; pamatujte, že výstupy AI je nutné ověřit (nejsou právní rada).
- **Záloha klíče** (🔐) — zálohujte si klíč a zkuste si, že se dá obnovit.

---

## 3. Data safety — DŮLEŽITÉ

Vaše spisy a databáze jsou **šifrované**. Šifrovací klíč leží mimo datovou složku
(`~/.lexislocal/lexis.key`), aby se nesynchronizoval s daty do cloudu.

**Bez klíče nejdou data obnovit.** Proto hned na začátku:
1. Klikněte na **🔐 Záloha klíče → Zálohovat klíč do souboru**.
2. Uložte soubor na **bezpečné, oddělené místo** (šifrovaný USB disk nebo správce hesel),
   NE do stejné složky jako spisy.

---

## 4. Jak nahlásit chybu

V aplikaci klikněte na **🐞 Nahlásit chybu**, popište:
- co jste dělal/a,
- co jste čekal/a,
- co se stalo místo toho.

Report (verze, systém, poslední chyby) se přidá automaticky. Pak buď **Odeslat e-mailem**,
nebo **Zkopírovat report** a poslat nám ho zprávou. Pomáhá i screenshot.

Díky moc — každý nález nám pomůže dotáhnout aplikaci k ostrému provozu.
