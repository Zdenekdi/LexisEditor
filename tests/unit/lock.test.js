/**
 * Testy zámku aplikace (js/core/lexis-lock.js) — scrypt hash + ověření.
 * Bezpečnostně kritické: round-trip, špatné heslo, konstantní formát, keylen.
 */

const { hashPassword, verifyPassword, KEYLEN } = require('../../js/core/lexis-lock');

describe('lexis-lock', () => {
    test('hashPassword vrací {salt, hash, keylen} v hex; nikdy heslo v plaintextu', () => {
        const h = hashPassword('Tajne-Heslo-123');
        expect(h.salt).toMatch(/^[0-9a-f]{32}$/);       // 16 B soli
        expect(h.hash).toMatch(/^[0-9a-f]{128}$/);       // 64 B derivát
        expect(h.keylen).toBe(KEYLEN);
        expect(h.hash).not.toContain('Tajne');
    });

    test('round-trip: správné heslo ověří', () => {
        const h = hashPassword('spravne-heslo');
        expect(verifyPassword(h, 'spravne-heslo')).toBe(true);
    });

    test('špatné heslo neověří', () => {
        const h = hashPassword('spravne-heslo');
        expect(verifyPassword(h, 'spatne-heslo')).toBe(false);
        expect(verifyPassword(h, '')).toBe(false);
    });

    test('stejné heslo → jiná sůl → jiný hash (sůl je náhodná)', () => {
        const a = hashPassword('x');
        const b = hashPassword('x');
        expect(a.salt).not.toBe(b.salt);
        expect(a.hash).not.toBe(b.hash);
        // ale obě se ověří proti svému heslu
        expect(verifyPassword(a, 'x')).toBe(true);
        expect(verifyPassword(b, 'x')).toBe(true);
    });

    test('chybějící/poškozený uložený hash → false (bez pádu)', () => {
        expect(verifyPassword(null, 'x')).toBe(false);
        expect(verifyPassword({}, 'x')).toBe(false);
        expect(verifyPassword({ salt: 'aa' }, 'x')).toBe(false);
    });

    test('respektuje uložený keylen (zpětná kompatibilita formátu)', () => {
        const h = hashPassword('heslo');
        expect(h.keylen).toBe(64);
        // ověření čte keylen z uloženého objektu
        expect(verifyPassword({ ...h }, 'heslo')).toBe(true);
    });

    test('pozměněný uložený hash neověří (integrita)', () => {
        const h = hashPassword('heslo');
        const tampered = { ...h, hash: h.hash.slice(0, -2) + (h.hash.endsWith('00') ? '11' : '00') };
        expect(verifyPassword(tampered, 'heslo')).toBe(false);
    });
});
