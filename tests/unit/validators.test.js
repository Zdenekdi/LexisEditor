/**
 * Testy validace českých identifikátorů (js/core/lexis-validators.js).
 * IČO = 8 číslic + kontrolní součet (modulo-11).
 */

const V = require('../../js/core/lexis-validators');

describe('isValidIco', () => {
    test('platná reálná IČO', () => {
        expect(V.isValidIco('27232433')).toBe(true); // ČEZ Prodej
        expect(V.isValidIco('26168685')).toBe(true); // Seznam.cz
        expect(V.isValidIco('27082440')).toBe(true);
    });

    test('mezery se ignorují', () => {
        expect(V.isValidIco('271 632 33'.replace(/x/, ''))).toBe(false); // špatný součet
        expect(V.isValidIco(' 27232433 ')).toBe(true);
    });

    test('špatný kontrolní součet → neplatné', () => {
        expect(V.isValidIco('27232434')).toBe(false);
        expect(V.isValidIco('12345678')).toBe(false);
    });

    test('špatná délka / nečíslice → neplatné', () => {
        expect(V.isValidIco('1234567')).toBe(false);   // 7 číslic
        expect(V.isValidIco('123456789')).toBe(false); // 9 číslic
        expect(V.isValidIco('2723243X')).toBe(false);
        expect(V.isValidIco('')).toBe(false);
        expect(V.isValidIco(null)).toBe(false);
    });

    test('IČO jako číslo (ne string) taky projde', () => {
        expect(V.isValidIco(27232433)).toBe(true);
    });
});
