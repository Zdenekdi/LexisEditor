/**
 * Testy bezpečnostních a právně citlivých míst editoru:
 *  - LexisLink autorizace (token, CORS origin),
 *  - výpočet lhůt (pracovní dny, svátky, Velikonoce),
 *  - hlavičkový papír (escapování, bezpečné logo).
 */

const sec = require('../../js/core/lexis-link-security');
const cal = require('../../js/core/lexis-calendar');
require('../../js/ui/lexis-letterhead'); // nastaví window.LexisLetterhead (jsdom)

describe('LexisLink security', () => {
    const token = sec.generateToken();

    test('generateToken vrací 64 hex znaků (256 bitů)', () => {
        expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    test('platný token projde, neplatný ne', () => {
        const reqOk = { headers: { authorization: 'Bearer ' + token } };
        const reqBad = { headers: { authorization: 'Bearer ' + 'x'.repeat(64) } };
        expect(sec.isValidToken(reqOk, null, token)).toBe(true);
        expect(sec.isValidToken(reqBad, null, token)).toBe(false);
    });

    test('token z query parametru', () => {
        const req = { headers: {} };
        const url = { searchParams: new URLSearchParams('token=' + token) };
        expect(sec.isValidToken(req, url, token)).toBe(true);
    });

    test('chybějící / prázdný očekávaný token = neautorizováno', () => {
        expect(sec.isValidToken({ headers: {} }, null, token)).toBe(false);
        expect(sec.isValidToken({ headers: { authorization: 'Bearer x' } }, null, '')).toBe(false);
    });

    test('CORS: povolen jen localhost, cizí origin ne', () => {
        expect(sec.isKnownOrigin('http://localhost:3300', 3300, '192.168.1.5')).toBe(true);
        expect(sec.isKnownOrigin('http://127.0.0.1:3300', 3300, '192.168.1.5')).toBe(true);
        expect(sec.isKnownOrigin('http://192.168.1.5:3300', 3300, '192.168.1.5')).toBe(true);
        expect(sec.isKnownOrigin('https://evil.example', 3300, '192.168.1.5')).toBe(false);
        expect(sec.isKnownOrigin('', 3300, '192.168.1.5')).toBe(false);
    });
});

describe('Výpočet lhůt (§ 57 o.s.ř.)', () => {
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    test('Velikonoční neděle 2026 = 5.4.', () => {
        expect(key(cal.easterSunday(2026))).toBe('2026-04-05');
    });

    test('běžný pracovní den se neposouvá', () => {
        expect(key(cal.computeDeadline(new Date('2026-06-01T00:00:00'), 15))).toBe('2026-06-16'); // Út
    });

    test('lhůta padne na sobotu → nejbližší následující pracovní den (pondělí)', () => {
        // 2026-06-05 (Pá) + 15 = 2026-06-20 (So) → 2026-06-22 (Po)
        expect(key(cal.computeDeadline(new Date('2026-06-05T00:00:00'), 15))).toBe('2026-06-22');
    });

    test('řetěz neděle + svátek (5.7. a 6.7.) → úterý', () => {
        // 2026-06-20 + 15 = 2026-07-05 (Ne, svátek), 6.7. svátek → 7.7. (Út)
        expect(key(cal.computeDeadline(new Date('2026-06-20T00:00:00'), 15))).toBe('2026-07-07');
    });

    test('Velikonoční pondělí je den pracovního klidu', () => {
        expect(cal.isWorkingDay(new Date('2026-04-06T00:00:00'))).toBe(false); // Velik. pondělí
        expect(cal.isWorkingDay(new Date('2026-04-07T00:00:00'))).toBe(true);
    });

    test('svátky obsahují pevné i pohyblivé dny', () => {
        const h = cal.czechHolidays(2026);
        expect(h.has('2026-01-01')).toBe(true);
        expect(h.has('2026-12-24')).toBe(true);
        expect(h.has('2026-04-03')).toBe(true); // Velký pátek 2026
    });
});

describe('Hlavičkový papír', () => {
    const LH = global.window.LexisLetterhead;

    test('prázdný profil → prázdná hlavička', () => {
        expect(LH.buildHeaderHtml({})).toBe('');
    });

    test('tabulkové rozvržení (Word-safe), ne flexbox', () => {
        const h = LH.buildHeaderHtml({ name: 'Jan Novák', firm: 'AK' });
        expect(h).toContain('<table');
        expect(h).not.toContain('display:flex');
    });

    test('escapuje pole (XSS) a bez dvojitého escapování', () => {
        const h = LH.buildHeaderHtml({ name: '<script>x</script>', firm: 'A & B' });
        expect(h).not.toContain('<script>x');
        expect(h).toContain('A &amp; B');
        expect(h).not.toContain('&amp;amp;');
    });

    test('nebezpečné logo (javascript:) se odmítne, data:image projde', () => {
        expect(LH.safeLogo('javascript:alert(1)')).toBe('');
        expect(LH.safeLogo('data:image/png;base64,AAAA')).toContain('data:image/png');
    });
});
