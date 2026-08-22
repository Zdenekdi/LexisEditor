/**
 * Testy české typografie (pevné mezery) a rozpoznávání referencí.
 *  - hardenTypography: nezalomitelné mezery uvnitř sp. zn./č.j., po jednopísmenných
 *    předložkách, u § a jednotek, oddělovač tisíců.
 *  - extractReferences: rozpozná spisové značky i čísla jednací.
 */
'use strict';

const { hardenTypography } = require('../../js/lang/czech-style');
const { extractReferences } = require('../../js/core/lexis-citations');

const NBSP = ' ';

describe('hardenTypography — pevné mezery', () => {
    test('jednopísmenné předložky/spojky', () => {
        expect(hardenTypography('podal k soudu v Praze')).toBe('podal k' + NBSP + 'soudu v' + NBSP + 'Praze');
    });
    test('§ + číslo', () => {
        expect(hardenTypography('podle § 2048')).toBe('podle §' + NBSP + '2048');
    });
    test('číslo + jednotka a oddělovač tisíců', () => {
        expect(hardenTypography('zaplatí 50 000 Kč')).toBe('zaplatí 50' + NBSP + '000' + NBSP + 'Kč');
    });
    test('spisová značka se nezalomí', () => {
        expect(hardenTypography('15 C 123/2026')).toBe('15' + NBSP + 'C' + NBSP + '123/2026');
    });
    test('sp. zn. a č. j. zkratky', () => {
        const out = hardenTypography('sp. zn. 8 As 9/2026, č. j. 123/2026-X');
        expect(out).toContain('sp.' + NBSP + 'zn.');
        expect(out).toContain('č.' + NBSP + 'j.');
    });
    test('lhůta 14 dnů', () => {
        expect(hardenTypography('do 14 dnů')).toBe('do 14' + NBSP + 'dnů');
    });
    test('idempotence — druhý průchod nic nezmění', () => {
        const once = hardenTypography('k soudu § 5 a 14 dnů');
        expect(hardenTypography(once)).toBe(once);
    });
});

describe('extractReferences — rozpoznání', () => {
    test('spisové značky i číslo jednací', () => {
        const refs = extractReferences('sp. zn. 21 Cdo 1234/2019 a č. j. 12345/2026-ABC, III. ÚS 12/20');
        const types = refs.map(r => r.type);
        expect(types).toContain('spisova_znacka');
        expect(types).toContain('cislo_jednaci');
        expect(refs.some(r => r.value === '21 Cdo 1234/2019')).toBe(true);
        expect(refs.some(r => r.type === 'cislo_jednaci' && /12345\/2026-ABC/.test(r.value))).toBe(true);
    });
});
