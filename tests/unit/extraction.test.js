/**
 * Regresní testy extrakce náležitostí (č.j., spisová značka, soud) na REÁLNÝCH
 * formátech z ukázkových dokumentů (soud, ministerstvo, policie, platební rozkaz,
 * výzva § 114b). Chrání zejména č.j. proti „přilepení" následujícího slova.
 */

const court = require('../../js/core/court-data');
// lexis-reply deleguje detekci soudu na window.LexisCourt.detect (jeden zdroj) —
// v jsdom/jest nastavíme oba globály, které v appce nastaví court-data.js sám.
global.window = global.window || {};
window.COURT_PATTERNS = court.COURT_PATTERNS;
window.LexisCourt = court.LexisCourt;
require('../../js/ui/lexis-reply');
const { extract } = window.LexisReply;

describe('Extrakce náležitostí — reálné formáty', () => {
    test('soudní usnesení: spisová značka + soud + (bez č.j.)', () => {
        const t = 'OKRESNÍ SOUD V OLOMOUCI\nSpisová značka: 23 C 120/2026\nUSNESENÍ\nLhůta do 15 dnů od doručení.';
        const e = extract(t);
        expect(e.spzn).toBe('23 C 120/2026');
        expect(e.cj).toBe('');
        expect(e.court).toContain('Olomouc');
    });

    test('ministerstvo: č.j. písmenného formátu, nesmí natáhnout další slovo', () => {
        const t = 'MINISTERSTVO VNITRA\nČ. j.: MV-12345-2/OAM-2026\nPraha 15. července 2026\nROZHODNUTÍ';
        expect(extract(t).cj).toBe('MV-12345-2/OAM-2026');
        // i když je text slepený (bez mezery za rokem):
        expect(extract('Č. j.: MV-12345-2/OAM-2026Praha').cj).toBe('MV-12345-2/OAM-2026');
    });

    test('policie: č.j. KRPB-.../TČ-2026', () => {
        const t = 'POLICIE ČR\nČ. j. KRPB-12345/TČ-2026\nBrno 15. července 2026';
        expect(extract(t).cj).toBe('KRPB-12345/TČ-2026');
    });

    test('platební rozkaz: spisová značka EPR + IČO + soud', () => {
        const t = 'OBVODNÍ SOUD PRO PRAHU 1\nSpisová značka: 45 EPR 789/2026\nžalobce ČEZ Prodej, a.s., IČO: 27232433';
        const e = extract(t);
        expect(e.spzn).toBe('45 EPR 789/2026');
        expect(e.ico).toBe('27232433');
        expect(e.court).toContain('Praha');
    });

    test('výzva § 114b: spisová značka Cm + krajský soud', () => {
        const t = 'KRAJSKÝ SOUD V OSTRAVĚ\nSpisová značka: 15 Cm 45/2026\nVÝZVA K VYJÁDŘENÍ podle § 114b o.s.ř.';
        const e = extract(t);
        expect(e.spzn).toBe('15 Cm 45/2026');
        expect(e.court).toContain('Ostrav');
    });

    test('ministerstvo/policie nejsou soudy → soud se nedetekuje', () => {
        expect(extract('MINISTERSTVO VNITRA, odbor OAM').court).toBe('');
        expect(extract('POLICIE ČESKÉ REPUBLIKY, Krajské ředitelství').court).toBe('');
    });

    test('č.j. se bere jen s označením (holé číslo v próze se nechytí)', () => {
        expect(extract('Zaplaťte 12345678 na účet do konce měsíce.').cj).toBe('');
    });
});

// Join detekce soudu (1. pád) → registr ISDS/adres (6. pád). Dřív selhával
// u všech krajských soudů a Prahy, protože názvy se lišily pádem
// („Krajský soud Brno" vs „Krajský soud v Brně").
describe('Join soud → registr (ISDS lookup)', () => {
    const registry = require('../../js/core/court-registry');
    const { COURT_PATTERNS } = court;

    test('všechny detekované soudy (kromě známé mezery) najdou ISDS v registru', () => {
        const gaps = COURT_PATTERNS
            .filter(p => { const r = registry.findCourtInRegistry(p.nazev); return !(r && r.isds); })
            .map(p => p.nazev);
        // Jediná akceptovaná mezera: Městský soud Brno (v registru chybí — fail-safe null).
        expect(gaps).toEqual(['Městský soud Brno']);
    });

    test('pádové tvary se napojí na správný soud', () => {
        expect(registry.findCourtInRegistry('Krajský soud Brno').nazev).toBe('Krajský soud v Brně');
        expect(registry.findCourtInRegistry('Krajský soud Plzeň').nazev).toBe('Krajský soud v Plzni');
        expect(registry.findCourtInRegistry('Vrchní soud Praha').nazev).toBe('Vrchní soud v Praze');
    });

    test('Praha 1 vs Praha 10 se nezamění (přesná shoda čísel)', () => {
        expect(registry.findCourtInRegistry('Obvodní soud Praha 1').nazev).toBe('Obvodní soud pro Prahu 1');
        expect(registry.findCourtInRegistry('Obvodní soud Praha 10').nazev).toBe('Obvodní soud pro Prahu 10');
    });

    test('podobné názvy se nezamění (Kladno ≠ Klatovy, Jičín ≠ Nový Jičín)', () => {
        expect(registry.findCourtInRegistry('Okresní soud Kladno').nazev).toBe('Okresní soud Kladno');
        expect(registry.findCourtInRegistry('Okresní soud Klatovy').nazev).toBe('Okresní soud Klatovy');
        expect(registry.findCourtInRegistry('Okresní soud Jičín').nazev).toBe('Okresní soud Jičín');
        expect(registry.findCourtInRegistry('Okresní soud Nový Jičín').nazev).toBe('Okresní soud Nový Jičín');
    });

    test('přijme i detekovaný objekt { nazev, kod }', () => {
        const detected = COURT_PATTERNS.find(p => /Ostrava/.test(p.nazev));
        expect(registry.findCourtInRegistry(detected).nazev).toContain('Ostrav');
    });

    test('neznámý soud → null (radši nic než špatná datovka)', () => {
        expect(registry.findCourtInRegistry('Vymyšlený soud Kdesi')).toBeNull();
    });
});

// parseSpzn — strukturovaný rozklad spisové značky pro hlídání jednání.
// Dřív měl sken jednání v lexis-ui.js vlastní regex; teď jeden zdroj pravdy.
describe('LexisReply.parseSpzn (strukturovaná spisová značka)', () => {
    const { parseSpzn } = window.LexisReply;

    test('rozloží „12 C 34/2026" na senát/druh/číslo/ročník', () => {
        expect(parseSpzn('12 C 34/2026')).toEqual({
            cisloSenatu: 12, druhVeci: 'C', bcVec: 34, rocnik: 2026, fullText: '12 C 34/2026'
        });
    });

    test('dvojmístný rok se normalizuje na čtyřmístný', () => {
        expect(parseSpzn('7 T 12/26').rocnik).toBe(2026);
    });

    test('druh věci se převede na velká písmena', () => {
        expect(parseSpzn('45 epr 789/2026').druhVeci).toBe('EPR');
    });

    test('nesmyslný vstup → null', () => {
        expect(parseSpzn('bez značky')).toBeNull();
        expect(parseSpzn('')).toBeNull();
        expect(parseSpzn(null)).toBeNull();
    });

    test('napojení na extract: řetězec z extract() projde parseSpzn()', () => {
        const s = extract('OKRESNÍ SOUD V OLOMOUCI\nSpisová značka: 23 C 120/2026').spzn;
        expect(parseSpzn(s)).toMatchObject({ cisloSenatu: 23, druhVeci: 'C', bcVec: 120, rocnik: 2026 });
    });
});

// Bezpečnostní pojistka: appka NESMÍ automaticky odeslat do neověřené datové
// schránky. Vestavěné ISDS soudů nejsou ověřené (ISDS_DATA_VERIFIED=false), takže
// verified musí být VŽDY false — volající pak musí vyžádat ruční potvrzení.
describe('Bezpečnost ISDS soudů (getCourtIsds)', () => {
    const registry = require('../../js/core/court-registry');

    test('formát ISDS: 7 znaků [a-z0-9]', () => {
        expect(registry.isValidIsdsFormat('5azzytb')).toBe(true);
        expect(registry.isValidIsdsFormat('ABC1234')).toBe(false); // velká písmena
        expect(registry.isValidIsdsFormat('abc12')).toBe(false);   // krátké
        expect(registry.isValidIsdsFormat('abc-234')).toBe(false); // nepovolený znak
        expect(registry.isValidIsdsFormat(null)).toBe(false);
    });

    test('ISDS_DATA_VERIFIED je false (data nejsou ověřená proti registru)', () => {
        expect(registry.ISDS_DATA_VERIFIED).toBe(false);
    });

    test('známý soud vrátí ISDS, ale verified=false (nutné ruční ověření)', () => {
        const r = registry.getCourtIsds('Krajský soud Brno');
        expect(r.isds).toMatch(/^[a-z0-9]{7}$/);
        expect(r.valid).toBe(true);
        expect(r.verified).toBe(false); // klíčová pojistka: neodesílat automaticky
    });

    test('neznámý soud → žádná schránka, nic k odeslání', () => {
        expect(registry.getCourtIsds('Vymyšlený soud')).toEqual({ isds: null, valid: false, verified: false });
    });

    test('verified nikdy není true, dokud ISDS_DATA_VERIFIED=false', () => {
        const anyVerified = registry.COURT_REGISTRY
            .filter(c => c.isds)
            .some(c => registry.getCourtIsds(c).verified === true);
        expect(anyVerified).toBe(false);
    });
});
