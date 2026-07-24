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

    test('parseCzechDate: číselné i slovní formáty', () => {
        expect(key(cal.parseCzechDate('dne 25. 7. 2026'))).toBe('2026-07-25');
        expect(key(cal.parseCzechDate('do 25.7.2026'))).toBe('2026-07-25');
        expect(key(cal.parseCzechDate('dne 25. července 2026'))).toBe('2026-07-25');
        expect(key(cal.parseCzechDate('nejpozději 1. ledna 2027'))).toBe('2027-01-01');
        expect(cal.parseCzechDate('bez data')).toBeNull();
    });

    test('findDeadlineDate: bere termín u spouštěče, ne datum vydání', () => {
        const doc = 'Č. j. KRPB-1/TČ-2026\nBrno 15. července 2026\nJste povinen se dostavit dne 25. července 2026 v 10:00.\nV Brně dne 15. července 2026';
        const r = cal.findDeadlineDate(doc);
        expect(key(r && r.date)).toBe('2026-07-25'); // předvolání, ne 15.7. vydání
    });

    test('findDeadlineDate: samotné datum vydání = null', () => {
        expect(cal.findDeadlineDate('V Praze dne 15. července 2026\nMgr. Novák')).toBeNull();
    });

    test('detectDeadlineDays: „lhůta 15 dní" i „do 30 dnů"', () => {
        const a = cal.detectDeadlineDays('Odpověz ve lhůtě 15 dnů od doručení tohoto usnesení.');
        expect(a).toHaveLength(1);
        expect(a[0].days).toBe(15);

        const b = cal.detectDeadlineDays('Vyjádření zašlete do 30 dnů, jinak bude rozhodnuto.');
        expect(b[0].days).toBe(30);
    });

    test('detectDeadlineDays: pracovních dní', () => {
        expect(cal.detectDeadlineDays('Lhůta činí 10 pracovních dní od převzetí.')[0].days).toBe(10);
    });

    test('detectDeadlineDays: bez duplicit a bez lhůty prázdné', () => {
        // „lhůta ... do 15 dnů" chytnou oba regexy, ale se stejným days+context → 1×
        expect(cal.detectDeadlineDays('Ve lhůtě do 15 dnů se vyjádřete.')).toHaveLength(1);
        expect(cal.detectDeadlineDays('Text bez jakékoli lhůty a bez čísel dní.')).toEqual([]);
        expect(cal.detectDeadlineDays('')).toEqual([]);
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

    // Zobecnění: hlavička už není „advokátní" napevno — funguje pro firmu i jednotlivce.
    test('obecný profil (bez ČAK) neobsahuje „advokát" ani „Advokátní kancelář"', () => {
        const h = LH.buildHeaderHtml({ firm: 'Pekárna Novák s.r.o.', ico: '12345678', tel: '777111222' });
        expect(h).toContain('Pekárna Novák s.r.o.');
        expect(h).not.toContain('advokát');
        expect(h).not.toContain('Advokátní kancelář');
    });

    test('advokátní profil (s ev. č. ČAK) zobrazí „advokát" i ČAK', () => {
        const h = LH.buildHeaderHtml({ name: 'Jan Novák', license: '12345' });
        expect(h).toContain('advokát');
        expect(h).toContain('ev. č. ČAK 12345');
    });

    test('vlastní role (např. jednatel) má přednost před „advokát"', () => {
        const h = LH.buildHeaderHtml({ firm: 'Firma s.r.o.', role: 'jednatel' });
        expect(h).toContain('jednatel');
        expect(h).not.toContain('advokát');
    });

    test('bez jména/firmy se nevykreslí prázdný název (jen kontakt)', () => {
        const h = LH.buildHeaderHtml({ email: 'kdo@firma.cz' });
        expect(h).toContain('kdo@firma.cz');
        expect(h).not.toContain('font-weight:700; font-size:13pt'); // žádný prázdný bold název
    });
});
