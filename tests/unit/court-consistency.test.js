// tests/unit/court-consistency.test.js
// -----------------------------------------------------------------------------
// Konzistence tabulek soudů: DETEKCE (js/core/court-data.js, COURT_PATTERNS)
// ↔ REGISTR (js/core/court-registry.js, COURT_REGISTRY + findCourtInRegistry).
//
// Proč: když se soud v textu detekuje, ale nejde dohledat v registru (nebo má
// špatné/duplicitní ISDS), hrozí odeslání podání do datové schránky ŠPATNÉHO
// soudu. Tento test to hlídá a známé nedodělky v datech při každém běhu vypíše.
//
// Historicky (do 2026-08) zde byly allow-listy KNOWN_UNRESOLVED a
// KNOWN_DUPLICATE_ISDS pro dočasně tolerované chyby v datech. Po ověření
// reálných ISDS proti oficiálnímu registru (mojedatovaschranka.cz) byly
// všechny opraveny — test nyní vynucuje 100% konzistenci bez výjimek:
//   Krajský soud v Praze          hvbabbq  (dříve chybně snkabbm)
//   Krajský soud v Brně           5wwaa9j  (dříve chybně 5nkzumb)
//   Okresní soud Brno-venkov      w7wabin  (dříve chybně 5nkzumb)
//   Krajský soud v Hradci Králové ep7abae  (dříve chybně ep6abbm)
//   Okresní soud Hradec Králové   8paabmt  (dříve chybně ep6abbm)
//   Městský soud v Brně           7y7abii  (nově doplněn)
// -----------------------------------------------------------------------------

const { COURT_PATTERNS, detectCourt } = require('../../js/core/court-data.js');
const registry = require('../../js/core/court-registry.js');
const { COURT_REGISTRY, findCourtInRegistry, getCourtIsds, isValidIsdsFormat } = registry;

describe('Soudy — integrita dat', () => {
  test('každý pattern má název, kód a platný regex', () => {
    const bad = [];
    for (const c of COURT_PATTERNS) {
      if (!c.nazev || !c.kod || !c.pattern) { bad.push(`${c.nazev || '?'}: chybí pole`); continue; }
      try { new RegExp(c.pattern, 'i'); } catch (e) { bad.push(`${c.nazev}: neplatný regex (${e.message})`); }
    }
    expect(bad).toEqual([]);
  });

  test('kódy soudů (kod) jsou unikátní', () => {
    const seen = new Map();
    const dups = [];
    for (const c of COURT_PATTERNS) {
      if (seen.has(c.kod)) dups.push(`${c.kod}: ${seen.get(c.kod)} + ${c.nazev}`);
      else seen.set(c.kod, c.nazev);
    }
    expect(dups).toEqual([]);
  });

  test('každý záznam registru má platný formát ISDS', () => {
    const bad = COURT_REGISTRY
      .filter(c => !c.isds || !isValidIsdsFormat(c.isds))
      .map(c => `${c.nazev} (${c.isds})`);
    expect(bad).toEqual([]);
  });
});

describe('Soudy — detekce ↔ registr', () => {
  test('každý detekovatelný soud jde dohledat v registru', () => {
    const unresolved = COURT_PATTERNS
      .filter(c => !findCourtInRegistry(c.nazev))
      .map(c => c.nazev);
    expect(unresolved).toEqual([]);
  });

  test('dohledané soudy mají platný ISDS', () => {
    const bad = [];
    for (const c of COURT_PATTERNS) {
      if (!findCourtInRegistry(c.nazev)) continue; // řeší předchozí test
      const { isds, valid } = getCourtIsds(c.nazev);
      if (!isds || !valid) bad.push(`${c.nazev} (${isds})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('Soudy — unikátní ISDS (riziko doručení špatnému soudu)', () => {
  test('žádné duplicitní ISDS — každý soud má vlastní datovku', () => {
    const byIsds = {};
    for (const c of COURT_REGISTRY) {
      if (!c.isds) continue;
      (byIsds[c.isds] = byIsds[c.isds] || []).push(c.nazev);
    }
    const dups = Object.entries(byIsds)
      .filter(([, v]) => v.length > 1)
      .map(([isds, v]) => `${isds}: ${v.join(' + ')}`);
    expect(dups).toEqual([]);
  });
});

describe('Soudy — detekce z textu (robustní, se skloňováním)', () => {
  test('self-detekce: každý soud z registru se pozná podle svého názvu', () => {
    const bad = [];
    for (const c of COURT_REGISTRY) {
      const d = detectCourt(c.nazev);
      if (!d || d.nazev !== c.nazev) bad.push(`${c.nazev} → ${d && d.nazev}`);
    }
    expect(bad).toEqual([]);
  });

  // Reálné pádové tvary z podání + záludné dvojice (riziko špatné datovky).
  const cases = [
    ['Podávám dovolání k Nejvyššímu soudu v Brně.', 'Nejvyšší soud', 'kccaa9t'],
    ['Kasační stížnost k Nejvyššímu správnímu soudu.', 'Nejvyšší správní soud', 'wwjaa4f'],
    ['Ústavní stížnost podaná Ústavnímu soudu.', 'Ústavní soud', 'z2tadw5'],
    ['Krajskému soudu v Brně', 'Krajský soud v Brně', '5wwaa9j'],
    ['ke Krajskému soudu v Praze', 'Krajský soud v Praze', 'hvbabbq'],
    ['Městskému soudu v Praze', 'Městský soud v Praze', 'snkabbm'],
    ['Okresnímu soudu v Ostravě', 'Okresní soud Ostrava', '2mhaesg'],
    ['Okresní soud v Českých Budějovicích', 'Okresní soud České Budějovice', 'ws6abvh'],
    ['podání k Okresnímu soudu v Jindřichově Hradci', 'Okresní soud Jindřichův Hradec', 'c8kabvr'],
    ['Okresní soud v Novém Jičíně', 'Okresní soud Nový Jičín', '79naery'],
    ['Okresní soud v Jičíně', 'Okresní soud Jičín', 'n4qabm4'],
    ['Okresní soud ve Frýdku-Místku', 'Okresní soud Frýdek-Místek', 'nn4aera'],
    ['Okresní soud v Ústí nad Labem', 'Okresní soud Ústí nad Labem', 'r9uabnh'],
    ['Okresní soud v Ústí nad Orlicí', 'Okresní soud Ústí nad Orlicí', 'rjrabj7'],
    ['Obvodní soud pro Prahu 10', 'Obvodní soud pro Prahu 10', '8aiabyn'],
    ['Obvodní soud pro Prahu 1', 'Obvodní soud pro Prahu 1', 'pd3ab3a']
  ];
  test.each(cases)('detekuje %j → správný soud i ISDS', (text, expectName, expectIsds) => {
    const d = detectCourt(text);
    expect(d).toBeTruthy();
    expect(d.nazev).toBe(expectName);
    expect(getCourtIsds(d.nazev).isds).toBe(expectIsds);
  });

  test('„Nejvyšší správní soud" se NEzamění za „Nejvyšší soud"', () => {
    expect(detectCourt('Nejvyšší správní soud').nazev).toBe('Nejvyšší správní soud');
  });

  test('nejednoznačnost i prostý text → null (radši nic než špatná datovka)', () => {
    expect(detectCourt('Okresní soud v Plzni')).toBeNull();   // -jih/-město/-sever?
    expect(detectCourt('Smlouva o dílo mezi stranami')).toBeNull();
    expect(detectCourt('')).toBeNull();
  });
});
