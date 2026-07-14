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

// Výpočet data lhůty z data doručení + počtu dní.
// event = { title, deliveredAt, days, description?, location?, reminderDays? }
function computeDeadline(deliveredAt, days) {
    return addDays(deliveredAt, days);
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
    buildDeadlineIcs,
    googleCalendarUrl,
    outlookCalendarUrl,
    calendarTargets
};

if (typeof window !== 'undefined') {
    window.LexisCalendar = module.exports;
}
