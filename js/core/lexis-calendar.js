// --- LexisCalendar — lhůty do kalendáře (Apple/iCalendar, Google, Outlook) ---
// Čisté (bezstavové) funkce: generují standardní .ics událost (rozumí jí Apple,
// Google i Outlook) a „přidat do kalendáře" odkazy pro Google a Outlook.
// Data zůstávají u uživatele — odkazy jen předvyplní událost v jeho vlastním
// kalendáři (žádná veřejná URL, žádné sdílení citlivého obsahu).

'use strict';

// Escapování textu do ICS dle RFC 5545.
function escapeIcsText(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

// YYYYMMDD z Date nebo 'YYYY-MM-DD'.
function toDateStamp(d) {
    const date = (d instanceof Date) ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

// Přičte dny k datu (Date nebo string) a vrátí Date.
function addDays(d, days) {
    const date = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    date.setDate(date.getDate() + (parseInt(days, 10) || 0));
    return date;
}

// Lokální klíč data 'YYYY-MM-DD' (bez posunu časové zóny).
function dateKey(d) {
    const date = (d instanceof Date) ? d : new Date(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Velikonoční neděle (Meeus/Jones/Butcher, gregoriánský kalendář).
function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=březen, 4=duben
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

// České dny pracovního klidu pro daný rok (zákon č. 245/2000 Sb.) — pevné svátky
// + pohyblivé Velký pátek a Velikonoční pondělí. Vrací Set klíčů 'YYYY-MM-DD'.
const _holidayCache = {};
function czechHolidays(year) {
    if (_holidayCache[year]) return _holidayCache[year];
    const fixed = ['01-01', '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26'];
    const set = new Set(fixed.map(md => `${year}-${md}`));
    const easter = easterSunday(year);
    set.add(dateKey(addDays(easter, -2))); // Velký pátek
    set.add(dateKey(addDays(easter, 1)));  // Velikonoční pondělí
    _holidayCache[year] = set;
    return set;
}

// Je den pracovní? (ne sobota, ne neděle, ne státní svátek / den pracovního klidu)
function isWorkingDay(d) {
    const date = (d instanceof Date) ? d : new Date(d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false; // Ne / So
    return !czechHolidays(date.getFullYear()).has(dateKey(date));
}

// Nejbližší NÁSLEDUJÍCÍ pracovní den (posun jen dopředu; když už je pracovní, vrátí ho).
function nextWorkingDay(d) {
    let date = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    let guard = 0;
    while (!isWorkingDay(date) && guard < 30) { date = addDays(date, 1); guard++; }
    return date;
}

// Výpočet data lhůty z data doručení + počtu dní.
// Lhůta počítá ode dne následujícího po doručení → poslední den = doručení + N dní
// (§ 57 odst. 1 o.s.ř.). Padne-li poslední den na sobotu, neděli nebo svátek,
// posouvá se na nejbližší NÁSLEDUJÍCÍ pracovní den (§ 57 odst. 2 o.s.ř.).
function computeDeadline(deliveredAt, days) {
    return nextWorkingDay(addDays(deliveredAt, days));
}

// České měsíce (genitiv, jak se píší v datu „25. července 2026"), bez diakritiky.
const CZ_MONTHS = {
    ledna: 1, unora: 2, brezna: 3, dubna: 4, kvetna: 5, cervna: 6,
    cervence: 7, srpna: 8, zari: 9, rijna: 10, listopadu: 11, prosince: 12
};

// Rozparsuje české datum: číselné „25. 7. 2026" / „25.7.2026" nebo slovní
// „25. července 2026". Vrací Date, nebo null.
function parseCzechDate(s) {
    if (!s) return null;
    let m = String(s).match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
    if (m) {
        const d = new Date(+m[3], +m[2] - 1, +m[1]);
        return isNaN(d.getTime()) ? null : d;
    }
    const norm = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    m = norm.match(/\b(\d{1,2})\.?\s+([a-z]+)\s+(\d{4})\b/);
    if (m && CZ_MONTHS[m[2]]) {
        const d = new Date(+m[3], CZ_MONTHS[m[2]] - 1, +m[1]);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

// Najde v textu KONKRÉTNÍ datum lhůty/termínu (předvolání, jednání, „nejpozději do…").
// Bere jen datum u termínového spouštěče, aby nechytalo datum VYDÁNÍ dokumentu
// („V Praze dne 15. července 2026"). Vrací { date, context } nebo null.
function findDeadlineDate(text) {
    if (!text) return null;
    const trigger = /(dostav\w*|předvol\w*|nejpozd[ěe]ji|ke dni|do dne|v termínu|ve lh[ůu]t[ěe] do|se kon[áa]|naři[zř]uje\w*|jedn[áa]n[íi]|term[íi]n\w*)/i;
    const lines = String(text).split(/[\n\r]+/);
    for (const line of lines) {
        if (!trigger.test(line)) continue;
        const d = parseCzechDate(line);
        if (d) return { date: d, context: line.trim().replace(/\s+/g, ' ') };
    }
    return null;
}

// Sestaví .ics (celodenní událost lhůty s připomenutím).
// event = { uid?, title, date (Date|'YYYY-MM-DD'), description?, location?, reminderDays? }
function buildDeadlineIcs(event) {
    const e = event || {};
    const start = toDateStamp(e.date);
    const endD = addDays(e.date, 1); // DTEND je u celodenní události následující den
    const end = toDateStamp(endD);
    const uid = e.uid || `lhuta_${start}_${Math.abs(hashStr(e.title || '') % 100000)}@lexiseditor`;
    // DTSTAMP: bez závislosti na aktuálním čase používáme půlnoc data lhůty.
    const dtstamp = `${start}T000000Z`;
    const reminderDays = (e.reminderDays == null) ? 1 : parseInt(e.reminderDays, 10);
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//LexisEditor//Lhuty//CS',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcsText(e.title || 'Lhůta')}`,
        `DESCRIPTION:${escapeIcsText(e.description || '')}`
    ];
    if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
    lines.push('BEGIN:VALARM');
    lines.push(`TRIGGER:-P${isFinite(reminderDays) && reminderDays >= 0 ? reminderDays : 1}D`);
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcsText('Připomenutí lhůty: ' + (e.title || ''))}`);
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

// Jednoduchý stabilní hash (bez Math.random kvůli deterministickému UID).
function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
}

// „Přidat do Google kalendáře" — předvyplněná událost (celodenní).
function googleCalendarUrl(event) {
    const e = event || {};
    const start = toDateStamp(e.date);
    const end = toDateStamp(addDays(e.date, 1));
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: e.title || 'Lhůta',
        dates: `${start}/${end}`,
        details: e.description || '',
        location: e.location || ''
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
}

// „Přidat do Outlook kalendáře" (Office 365 / outlook.com). variant: 'office'|'live'.
function outlookCalendarUrl(event, variant) {
    const e = event || {};
    const host = variant === 'live' ? 'https://outlook.live.com' : 'https://outlook.office.com';
    const startIso = toIsoDate(e.date);
    const endIso = toIsoDate(addDays(e.date, 1));
    const params = new URLSearchParams({
        path: '/calendar/action/compose',
        rru: 'addevent',
        subject: e.title || 'Lhůta',
        startdt: startIso,
        enddt: endIso,
        allday: 'true',
        body: e.description || '',
        location: e.location || ''
    });
    return `${host}/calendar/0/deeplink/compose?` + params.toString();
}

function toIsoDate(d) {
    const date = (d instanceof Date) ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Vrátí sadu možností pro událost (pro UI: „přidat do…").
function calendarTargets(event) {
    return {
        ics: buildDeadlineIcs(event),
        google: googleCalendarUrl(event),
        outlookOffice: outlookCalendarUrl(event, 'office'),
        outlookLive: outlookCalendarUrl(event, 'live')
    };
}

module.exports = {
    escapeIcsText,
    toDateStamp,
    toIsoDate,
    addDays,
    computeDeadline,
    czechHolidays,
    isWorkingDay,
    nextWorkingDay,
    easterSunday,
    parseCzechDate,
    findDeadlineDate,
    buildDeadlineIcs,
    googleCalendarUrl,
    outlookCalendarUrl,
    calendarTargets
};

if (typeof window !== 'undefined') {
    window.LexisCalendar = module.exports;
}
