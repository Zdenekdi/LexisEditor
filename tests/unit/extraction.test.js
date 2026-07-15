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
