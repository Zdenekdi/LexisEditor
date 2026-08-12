// tests/unit/court-consistency.test.js
// -----------------------------------------------------------------------------
// Konzistence tabulek soudů: DETEKCE (js/core/court-data.js, COURT_PATTERNS)
// ↔ REGISTR (js/core/court-registry.js, COURT_REGISTRY + findCourtInRegistry).
//
// Proč: když se soud v textu detekuje, ale nejde dohledat v registru (nebo má
// špatné/duplicitní ISDS), hrozí odeslání podání do datové schránky ŠPATNÉHO
// soudu. Tento test to hlídá a známé nedodělky v datech při každém běhu vypíše.
//
// KNOWN_* = známé chyby v datech, které vyžadují ověření reálného ISDS
// (mojedatovaschranka.cz / justice.cz). Test je kvůli nim ZELENÝ, aby chytal
// NOVÉ regrese; po opravě dat prostě odeber položku z allow-listu a test
// začne vynucovat 100% konzistenci.
// -----------------------------------------------------------------------------

const { COURT_PATTERNS } = require('../../js/core/court-data.js');
const registry = require('../../js/core/court-registry.js');
const { COURT_REGISTRY, findCourtInRegistry, getCourtIsds, isValidIsdsFormat } = registry;

// TODO(data): doplnit do COURT_REGISTRY s ověřeným ISDS.
const KNOWN_UNRESOLVED = ['Městský soud Brno'];

// TODO(data): OVĚŘIT a opravit — každý soud má vlastní datovku, tyto se sdílí:
//   snkabbm → Krajský soud v Praze + Městský soud v Praze
//   5nkzumb → Krajský soud v Brně + Okresní soud Brno-venkov
//   ep6abbm → Krajský soud v Hradci Králové + Okresní soud Hradec Králové
const KNOWN_DUPLICATE_ISDS = ['snkabbm', '5nkzumb', 'ep6abbm'];

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
  test('každý detekovatelný soud jde dohledat v registru (mimo známé mezery)', () => {
    const unresolved = COURT_PATTERNS
      .filter(c => !findCourtInRegistry(c.nazev))
      .map(c => c.nazev);

    const stillKnown = unresolved.filter(n => KNOWN_UNRESOLVED.includes(n));
    if (stillKnown.length) {
      // eslint-disable-next-line no-console
      console.warn('[soudy] ZNÁMÉ nedohledatelné soudy (doplnit do registru):', stillKnown);
    }
    const unexpected = unresolved.filter(n => !KNOWN_UNRESOLVED.includes(n));
    expect(unexpected).toEqual([]);
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
  test('žádné NOVÉ duplicitní ISDS (mimo známé k opravě)', () => {
    const byIsds = {};
    for (const c of COURT_REGISTRY) {
      if (!c.isds) continue;
      (byIsds[c.isds] = byIsds[c.isds] || []).push(c.nazev);
    }
    const dups = Object.entries(byIsds).filter(([, v]) => v.length > 1);

    const known = dups.filter(([isds]) => KNOWN_DUPLICATE_ISDS.includes(isds));
    if (known.length) {
      // eslint-disable-next-line no-console
      console.warn('[soudy] ZNÁMÉ duplicitní ISDS — OVĚŘIT a opravit:',
        known.map(([isds, v]) => `${isds} → ${v.join(', ')}`).join(' | '));
    }
    const unexpected = dups
      .filter(([isds]) => !KNOWN_DUPLICATE_ISDS.includes(isds))
      .map(([isds, v]) => `${isds}: ${v.join(' + ')}`);
    expect(unexpected).toEqual([]);
  });
});
