/**
 * Testy rozpoznávání citací a seznamu judikatury (js/core/lexis-citations.js).
 * Čistý modul — testuje se přímo, bez DOM.
 */
const { extractCitations, buildAuthorities } = require('../../js/core/lexis-citations');

describe('extractCitations', () => {
    test('rozpozná NS, ÚS, NSS a obecný soud a zařadí je', () => {
        const t = 'Rozsudek NS sp. zn. 21 Cdo 1234/2019, nález III. ÚS 3136/17, NSS 1 As 12/2020 a 12 C 34/2026.';
        const c = extractCitations(t);
        const byNorm = Object.fromEntries(c.map(x => [x.normalized, x.court]));
        expect(byNorm['21 Cdo 1234/2019']).toBe('Nejvyšší soud');
        expect(byNorm['III. ÚS 3136/2017']).toBe('Ústavní soud');
        expect(byNorm['1 As 12/2020']).toBe('Nejvyšší správní soud');
        expect(byNorm['12 C 34/2026']).toBe('Obecný soud');
    });
    test('deduplikuje opakované citace', () => {
        const c = extractCitations('21 Cdo 1234/2019 a znovu 21 Cdo 1234/2019.');
        expect(c.filter(x => x.normalized === '21 Cdo 1234/2019').length).toBe(1);
    });
    test('normalizuje dvojmístný rok na čtyřmístný', () => {
        const c = extractCitations('III. ÚS 3136/17');
        expect(c[0].normalized).toBe('III. ÚS 3136/2017');
    });
    test('Pl. ÚS se rozpozná', () => {
        const c = extractCitations('Nález Pl. ÚS 12/19 k ústavnosti.');
        expect(c.some(x => /^Pl\. ÚS 12\/2019$/.test(x.normalized))).toBe(true);
    });
    test('prázdný / bezcitační text → prázdné pole', () => {
        expect(extractCitations('')).toEqual([]);
        expect(extractCitations('Text bez jakékoli spisové značky.')).toEqual([]);
        expect(extractCitations(null)).toEqual([]);
    });
    test('řadí: nejprve NS, pak NSS, pak ÚS, pak obecné', () => {
        const c = extractCitations('12 C 34/2026, III. ÚS 1/2019, 1 As 2/2020, 30 Cdo 3/2018.');
        const courts = c.map(x => x.court);
        expect(courts.indexOf('Nejvyšší soud')).toBeLessThan(courts.indexOf('Ústavní soud'));
        expect(courts.indexOf('Nejvyšší správní soud')).toBeLessThan(courts.indexOf('Obecný soud'));
    });
});

describe('buildAuthorities', () => {
    test('vrátí items, count a rozdělení podle soudu', () => {
        const r = buildAuthorities('21 Cdo 1/2019, III. ÚS 2/2018, 21 Cdo 1/2019.');
        expect(r.count).toBe(2);
        expect(r.items).toContain('21 Cdo 1/2019');
        expect(r.byCourt['Nejvyšší soud']).toEqual(['21 Cdo 1/2019']);
        expect(r.byCourt['Ústavní soud']).toEqual(['III. ÚS 2/2018']);
    });
});
