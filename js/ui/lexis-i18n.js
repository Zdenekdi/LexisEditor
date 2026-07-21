/**
 * LexisEditor — lehká i18n vrstva (cs ↔ en).
 * FOUNDATION: runtime slovník přesných shod textu + přepínač jazyka (persist v localStorage).
 * Slovník rozšiřuj postupně. Dlouhodobě robustní cesta je externalizovat stringy do klíčů
 * (aby se nespoléhalo na shodu textu) — tohle je funkční základ a demonstrace.
 */
/* global localStorage */
(function () {
  const STORE_KEY = 'lexis_lang';

  // cs → en. Klíč = přesný český text (po trim). Rozšiřuj dle potřeby.
  const DICT = {
    // Úvodní obrazovka
    'Prémiové právní prostředí s umělou inteligencí': 'Premium AI legal workspace',
    'Nový dokument': 'New document',
    'Čistý list s právním formátováním': 'Blank page with legal formatting',
    'Otevřít dokument': 'Open document',
    'Z disku, PDF nebo Datové schránky': 'From disk, PDF or Data box',
    'Příručka': 'Guide',
    'Jak používat LexisLink a AI Audit': 'How to use LexisLink and AI Audit',
    // Ribbon záložky
    'Soubor': 'File', 'Domů': 'Home', 'Vložit': 'Insert', 'Právní nástroje': 'Legal tools',
    'Revize': 'Review', 'Zobrazení': 'View', 'Nápověda': 'Help',
    // Ribbon – Domů
    'Kopírovat': 'Copy', 'Najít': 'Find', 'Diktovat': 'Dictate',
    'ÚPRAVY & SCHRÁNKA': 'EDITING & CLIPBOARD', 'PÍSMO & EFEKTY': 'FONT & EFFECTS',
    'ODSTAVEC & ŘÁDKOVÁNÍ': 'PARAGRAPH & SPACING', 'ZAROVNÁNÍ': 'ALIGNMENT',
    // Ribbon – LexisAI
    'Analyzovat': 'Analyze', 'Přepsat': 'Rewrite', 'Vysvětlit': 'Explain', 'Přeložit': 'Translate',
    'Hledat rizika': 'Find risks', 'Shrnutí': 'Summary', 'Nová doložka': 'New clause', 'Dopsat AI': 'AI complete',
    'ANALÝZA A ÚPRAVY VÝBĚRU': 'ANALYSIS & SELECTION EDITS',
    'CELÝ DOKUMENT A TVORBA': 'WHOLE DOCUMENT & DRAFTING', 'PROPOJENÍ': 'CONNECTION',
    // Boční panely
    'KNIHOVNA': 'LIBRARY', 'REFERENCE': 'REFERENCE', 'REVIZE': 'REVIEW',
    'KNIHOVNA A DOLOŽKY': 'LIBRARY & CLAUSES', 'OSNOVA DOKUMENTU': 'DOCUMENT OUTLINE',
    'KNIHOVNA DOLOŽEK': 'CLAUSE LIBRARY', 'AKTIVNÍ LHŮTY': 'ACTIVE DEADLINES',
    'GENERÁTORY': 'GENERATORS', 'VLASTNÍ DOLOŽKY': 'CUSTOM CLAUSES',
    'Obchodní právo': 'Commercial law', 'Ochrana dat & IT': 'Data protection & IT',
    'Rozhodčí doložka': 'Arbitration clause', 'Prorogační doložka': 'Choice-of-court clause',
    'Smluvní pokuta': 'Contractual penalty', 'GDPR ustanovení': 'GDPR provision',
    'Mlčenlivost (NDA)': 'Confidentiality (NDA)', 'Uložit vybrané...': 'Save selection...',
    'Nová Plná moc': 'New Power of Attorney',
    'Prázdná osnova. Použijte styl Nadpis pro zobrazení osnovy.': 'Empty outline. Use the Heading style to show it.',
    'Žádné aktivní lhůty ke sledování.': 'No active deadlines to track.',
    'Zatím žádné vlastní doložky': 'No custom clauses yet',
    // Status bar / titulek
    'Nepojmenovaný dokument': 'Untitled document', 'Rozpracované': 'Draft',
    'AI: Aktivní': 'AI: Active', 'Uloženo': 'Saved', 'Synchronizováno': 'Synced'
  };

  // Uchovává originální (cs) text přeložených uzlů kvůli návratu.
  const originals = new Map();
  let observer = null;

  function translateTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const raw = node.nodeValue;
      const key = raw.trim();
      if (!key) continue;
      if (DICT[key]) {
        if (!originals.has(node)) originals.set(node, raw);
        node.nodeValue = raw.replace(key, DICT[key]);
      }
    }
  }

  function revertAll() {
    for (const [node, orig] of originals) {
      try { node.nodeValue = orig; } catch (e) { /* uzel mohl zmizet */ }
    }
    originals.clear();
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((muts) => {
      observer.disconnect();
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) translateTextNodes(node);
        }
      }
      observer.observe(document.body, { childList: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  function apply(lang) {
    if (lang === 'en') {
      observer && observer.disconnect();
      translateTextNodes(document.body);
      startObserver();
    } else {
      stopObserver();
      revertAll();
    }
    document.documentElement.setAttribute('lang', lang);
    const btn = document.getElementById('lexis-lang-toggle');
    if (btn) btn.textContent = lang === 'en' ? 'CS' : 'EN';
  }

  function setLang(lang) {
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    apply(lang);
  }
  function getLang() {
    try { return localStorage.getItem(STORE_KEY) || 'cs'; } catch (e) { return 'cs'; }
  }

  function injectToggle() {
    if (document.getElementById('lexis-lang-toggle')) return;
    const host = document.querySelector('.title-right-tools') || document.body;
    const btn = document.createElement('div');
    btn.id = 'lexis-lang-toggle';
    btn.className = 'qa-btn';
    btn.title = 'Přepnout jazyk / Switch language';
    btn.style.cssText = 'font-size:11px;font-weight:700;min-width:26px;text-align:center;';
    btn.textContent = getLang() === 'en' ? 'CS' : 'EN';
    btn.onclick = () => setLang(getLang() === 'en' ? 'cs' : 'en');
    host.prepend(btn);
  }

  function boot() {
    injectToggle();
    if (getLang() === 'en') apply('en');
    setTimeout(injectToggle, 800); // pro případ pozdějšího vykreslení title baru
  }

  window.LexisI18n = { setLang, getLang, apply, DICT };
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
