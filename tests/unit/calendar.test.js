/**
 * Testy lexis-calendar.js — PRÁVNĚ KRITICKÉ: výpočet lhůt (§ 57 o.s.ř.), české
 * svátky vč. Velikonoc, pracovní dny a generování .ics. Chybná lhůta = zmeškaný
 * soudní termín, proto je pokrytí zásadní.
 */
const C = require('../../js/core/lexis-calendar');

describe('Velikonoce (Meeus/Jones/Butcher)', () => {
    const cases = { 2023: '2023-04-09', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05' };
    Object.entries(cases).forEach(([y, iso]) => {
        test(`velikonoční neděle ${y} = ${iso}`, () => {
            expect(C.toIsoDate(C.easterSunday(+y))).toBe(iso);
        });
    });
});

describe('České svátky', () => {
    test('pevné svátky 2025 jsou v sadě', () => {
        const h = C.czechHolidays(2025);
        ['2025-01-01', '2025-05-01', '2025-05-08', '2025-07-05', '2025-07-06',
         '2025-09-28', '2025-10-28', '2025-11-17', '2025-12-24', '2025-12-25', '2025-12-26']
            .forEach(d => expect(h.has(d)).toBe(true));
    });
    test('pohyblivé: Velký pátek a Velikonoční pondělí 2025', () => {
        const h = C.czechHolidays(2025); // Velikonoce 2025 = 20. 4.
        expect(h.has('2025-04-18')).toBe(true); // Velký pátek
        expect(h.has('2025-04-21')).toBe(true); // Velikonoční pondělí
    });
});

describe('Pracovní dny', () => {
    test('víkend a svátek nejsou pracovní; všední den ano', () => {
        expect(C.isWorkingDay(new Date(2025, 0, 1))).toBe(false); // St, Nový rok
        expect(C.isWorkingDay(new Date(2025, 0, 4))).toBe(false); // So
        expect(C.isWorkingDay(new Date(2025, 0, 5))).toBe(false); // Ne
        expect(C.isWorkingDay(new Date(2025, 0, 2))).toBe(true);  // Čt
        expect(C.isWorkingDay(new Date(2025, 0, 6))).toBe(true);  // Po
    });
    test('nextWorkingDay: sobota → pondělí; pracovní den → beze změny', () => {
        expect(C.toIsoDate(C.nextWorkingDay(new Date(2025, 0, 4)))).toBe('2025-01-06'); // So→Po
        expect(C.toIsoDate(C.nextWorkingDay(new Date(2025, 0, 6)))).toBe('2025-01-06'); // Po→Po
    });
});

describe('computeDeadline (§ 57 o.s.ř.)', () => {
    test('poslední den = doručení + N; padne-li na pracovní den, drží', () => {
        // doručeno Čt 2. 1. 2025, +15 = Pá 17. 1. 2025 (pracovní)
        expect(C.toIsoDate(C.computeDeadline(new Date(2025, 0, 2), 15))).toBe('2025-01-17');
    });
    test('padne-li poslední den na víkend, posune se na následující pracovní den', () => {
        // doručeno Pá 3. 1. 2025, +1 = So 4. 1. → posun na Po 6. 1. 2025
        expect(C.toIsoDate(C.computeDeadline(new Date(2025, 0, 3), 1))).toBe('2025-01-06');
    });
});

describe('parseCzechDate', () => {
    test('číselné i slovní datum → stejný den', () => {
        expect(C.toIsoDate(C.parseCzechDate('25. 7. 2026'))).toBe('2026-07-25');
        expect(C.toIsoDate(C.parseCzechDate('25.7.2026'))).toBe('2026-07-25');
        expect(C.toIsoDate(C.parseCzechDate('25. července 2026'))).toBe('2026-07-25');
    });
    test('neplatný vstup → null', () => {
        expect(C.parseCzechDate('bez data')).toBeNull();
        expect(C.parseCzechDate('')).toBeNull();
    });
});

describe('findDeadlineDate (nechytá datum vydání dokumentu)', () => {
    test('vezme datum u termínového spouštěče, ne datum „V Praze dne…"', () => {
        const text = 'V Praze dne 15. července 2026\nNařizuje se jednání na den 20. srpna 2026';
        const r = C.findDeadlineDate(text);
        expect(r).not.toBeNull();
        expect(C.toIsoDate(r.date)).toBe('2026-08-20');
    });
    test('bez spouštěče → null', () => {
        expect(C.findDeadlineDate('V Praze dne 15. července 2026')).toBeNull();
    });
});

describe('detectDeadlineDays', () => {
    test('vytáhne lhůty zadané počtem dní, bez duplicit', () => {
        const text = 'Odvolání lze podat ve lhůtě 15 dnů od doručení.\nVyjádření zašlete do 30 dnů.';
        const d = C.detectDeadlineDays(text);
        const days = d.map(x => x.days).sort((a, b) => a - b);
        expect(days).toContain(15);
        expect(days).toContain(30);
    });
    test('prázdný text → prázdné pole', () => {
        expect(C.detectDeadlineDays('')).toEqual([]);
    });
});

describe('buildDeadlineIcs', () => {
    const ev = { title: 'Odvolání; lhůta', date: new Date(2026, 6, 25), description: 'sp. zn. 1 C 2/2025', reminderDays: 2 };
    test('validní ICS struktura s celodenní událostí a alarmem', () => {
        const ics = C.buildDeadlineIcs(ev);
        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('BEGIN:VEVENT');
        expect(ics).toContain('DTSTART;VALUE=DATE:20260725');
        expect(ics).toContain('DTEND;VALUE=DATE:20260726');
        expect(ics).toContain('BEGIN:VALARM');
        expect(ics).toContain('TRIGGER:-P2D');
        expect(ics).toContain('END:VCALENDAR');
        expect(ics.includes('\r\n')).toBe(true); // CRLF dle RFC 5545
    });
    test('escapuje středník/čárku v SUMMARY', () => {
        const ics = C.buildDeadlineIcs(ev);
        expect(ics).toContain('SUMMARY:Odvolání\\; lhůta');
    });
    test('deterministické (bez Date.now/random) → stejný vstup, stejný výstup', () => {
        expect(C.buildDeadlineIcs(ev)).toBe(C.buildDeadlineIcs(ev));
    });
    test('výchozí připomenutí = 1 den', () => {
        const ics = C.buildDeadlineIcs({ title: 'X', date: new Date(2026, 0, 5) });
        expect(ics).toContain('TRIGGER:-P1D');
    });
});

describe('escapeIcsText', () => {
    test('escapuje zpětné lomítko, středník, čárku a nový řádek', () => {
        expect(C.escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    });
});

describe('calendarTargets / URL', () => {
    test('google URL nese název a datum', () => {
        const u = C.googleCalendarUrl({ title: 'Lhůta X', date: new Date(2026, 6, 25) });
        expect(u).toContain('calendar.google.com');
        expect(u).toContain('20260725');
    });
    test('calendarTargets vrací ics + tři odkazy', () => {
        const t = C.calendarTargets({ title: 'X', date: new Date(2026, 0, 5) });
        expect(t.ics).toContain('BEGIN:VCALENDAR');
        expect(t.google).toContain('http');
        expect(t.outlookOffice).toContain('outlook.office.com');
        expect(t.outlookLive).toContain('outlook.live.com');
    });
});
