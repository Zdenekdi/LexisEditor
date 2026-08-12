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

// Přičte měsíce s ošetřením konce měsíce (§ 57 odst. 2 o.s.ř.): výsledek má stejné
// číslo dne; není-li takový den v cílovém měsíci (např. 31. → únor), vezme se
// POSLEDNÍ den měsíce. Rok = 12 měsíců.
function addMonthsClamped(d, months) {
    const date = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    const total = date.getMonth() + (parseInt(months, 10) || 0);
    const y = date.getFullYear() + Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    const lastDay = new Date(y, m + 1, 0).getDate(); // 0. den následujícího měsíce = poslední den cílového
    return new Date(y, m, Math.min(date.getDate(), lastDay));
}

// Obecný výpočet konce lhůty podle jednotky. § 57 o.s.ř.:
//   • dny: poslední den = doručení + N (den doručení se nepočítá),
//   • týdny/měsíce/roky (odst. 2): končí dnem, který se OZNAČENÍM shoduje se dnem
//     počátku (u týdnů = stejný den v týdnu → + 7·N dní; u měsíců/let = stejné číslo
//     dne s ošetřením konce měsíce).
// V každém případě: padne-li konec na So/Ne/svátek, posun na následující pracovní den.
// unit ∈ {'day','week','month','year'} (default 'day').
function computeDeadlineByUnit(deliveredAt, amount, unit) {
    const n = parseInt(amount, 10) || 0;
    let end;
    switch (unit) {
        case 'week':  end = addDays(deliveredAt, n * 7); break;
        case 'month': end = addMonthsClamped(deliveredAt, n); break;
        case 'year':  end = addMonthsClamped(deliveredAt, n * 12); break;
        case 'day':
        default:      end = addDays(deliveredAt, n); break;
    }
    return nextWorkingDay(end);
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

// Najde v textu lhůty zadané POČTEM DNÍ („lhůta 15 dní", „do 30 dnů",
// „ve lhůtě 15 pracovních dní"). Vrací pole { days, context } bez duplicit.
// (Konkrétní datum lhůty řeší findDeadlineDate výše.) Dřív byly tyto regexy
// přímo v UI ve scanTextForDeadlines.
function detectDeadlineDays(text) {
    if (!text) return [];
    const regexes = [
        /(?:lhůt[ěau]|lhůta|termín)\s+(?:k\s+[a-zá-ž]+\s+)?(?:činí\s+)?(?:do\s+)?(\d+)\s+(?:pracovních\s+)?(?:dn[ůí]|dní)/gi,
        /\bdo\s+(\d+)\s+(?:pracovních\s+)?(?:dn[ůí]|dní)/gi
    ];
    const detected = [];
    for (const line of String(text).split('\n')) {
        if (line.trim().length < 10) continue;
        for (const regex of regexes) {
            let m;
            regex.lastIndex = 0;
            while ((m = regex.exec(line)) !== null) {
                const days = parseInt(m[1], 10);
                const context = line.trim().replace(/\s+/g, ' ');
                if (!detected.some(d => d.days === days && d.context === context)) {
                    detected.push({ days, context });
                }
            }
        }
    }
    return detected;
}

// České číslovky (1–30, běžné tvary vč. skloňování) → číslo. Jen jednoznačné.
var _CZ_NUM = {
    'jeden':1,'jednoho':1,'jedne':1,'jednu':1,'jedna':1,
    'dva':2,'dvou':2,'dve':2,'dvema':2,
    'tri':3,'trech':3,'trem':3,
    'ctyri':4,'ctyr':4,'ctyrech':4,
    'pet':5,'peti':5,'sest':6,'sesti':6,'sedm':7,'sedmi':7,'osm':8,'osmi':8,
    'devet':9,'deviti':9,'deset':10,'desiti':10,
    'patnact':15,'patnacti':15,'dvacet':20,'dvaceti':20,'tricet':30,'triceti':30
};
function _deaccent(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function _parseNum(token) {
    if (token == null) return null;
    var s = String(token).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var key = _deaccent(s);
    return Object.prototype.hasOwnProperty.call(_CZ_NUM, key) ? _CZ_NUM[key] : null;
}

// Detekuje lhůty zadané POČTEM + JEDNOTKOU (dny/týdny/měsíce/roky), digit i slovní
// číslovkou. Vrací [{ amount, unit, context }] bez duplicit (unit: 'day'|'week'|'month'|'year').
// Pozor na false-positive: měsíce/týdny/roky bere jen v řádcích s lhůtovým kontextem
// (lhůta, do…, nejpozději, podat, vyjádření, odvolání, dovolání, žaloba, stížnost, termín…).
// Doplňuje detectDeadlineDays (ta zůstává pro zpětnou kompatibilitu jen na dny).
function detectDeadlines(text) {
    if (!text) return [];
    var NUM = '(\\d+|jed(?:en|noho|n[eé]|nu|na)|dv(?:a|ou|[eě]|[eě]ma)|t[rř][ií]|t[rř]ech|t[rř]em|[cč]ty[rř](?:i|ech)?|p[eě]t|p[eě]ti|[sš]est|[sš]esti|sedm|sedmi|osm|osmi|dev[eě]t|dev[ií]ti|deset|des[ií]ti|patn[aá]ct|patn[aá]cti|dvacet|dvaceti|t[rř]icet|t[rř]iceti)';
    var END = '(?![a-zá-žA-ZÁ-Ž])'; // konec slova i za českou diakritikou (\b je u á-ž nespolehlivé)
    var pat = {
        day:   new RegExp(NUM + '\\s+(?:pracovn[ií]ch\\s+)?(?:den|dnech|dn[uůíey])' + END, 'gi'),
        week:  new RegExp(NUM + '\\s+(?:t[yý]dnech|t[yý]den|t[yý]dn[uůyeí])' + END, 'gi'),
        month: new RegExp(NUM + '\\s+m[eě]s[ií]c[uůeieí]*' + END, 'gi'),
        year:  new RegExp(NUM + '\\s+(?:let|roky|rok[uůy]?|roce)' + END, 'gi')
    };
    // Kontext lhůty (pro měsíce/týdny/roky povinný; pro dny volnější, jako dřív).
    var ctxRe = /(lh[uů]t|nejpozd|ve lh[uů]t|do\s+\d|do\s+[a-zá-ž]+\s+(?:m[eě]s|t[yý]d|dn|rok|let)|podat|vyj[aá]d[rř]|odvol|dovol|n[aá]mitk|[zž]alob|st[ií][zž]nost|kasa[cč]n|term[ií]n)/i;
    var out = [];
    var lines = String(text).split(/[\n\r]+/);
    for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        if (line.trim().length < 8) continue;
        var hasCtx = ctxRe.test(line);
        var ctx = line.trim().replace(/\s+/g, ' ');
        ['day', 'week', 'month', 'year'].forEach(function (unit) {
            if (unit !== 'day' && !hasCtx) return; // měsíce/týdny/roky jen v lhůtovém kontextu
            var re = pat[unit]; re.lastIndex = 0; var m;
            while ((m = re.exec(line)) !== null) {
                var amount = _parseNum(m[1]);
                if (!amount || amount <= 0) continue;
                if (!out.some(function (d) { return d.amount === amount && d.unit === unit && d.context === ctx; })) {
                    out.push({ amount: amount, unit: unit, context: ctx });
                }
            }
        });
    }
    return out;
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

const __lexisCalendarExports = {
    escapeIcsText,
    toDateStamp,
    toIsoDate,
    addDays,
    computeDeadline,
    computeDeadlineByUnit,
    addMonthsClamped,
    czechHolidays,
    isWorkingDay,
    nextWorkingDay,
    easterSunday,
    parseCzechDate,
    findDeadlineDate,
    detectDeadlineDays,
    detectDeadlines,
    buildDeadlineIcs,
    googleCalendarUrl,
    outlookCalendarUrl,
    calendarTargets
};

// Pozn.: v prohlížeči (Electron renderer) `module` neexistuje — proto guard,
// jinak nezajištěný `module.exports` vyhodí ReferenceError a přeruší skript
// (kvůli čemuž se dřív window.LexisCalendar vůbec nenastavil).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = __lexisCalendarExports;
}

if (typeof window !== 'undefined') {
    window.LexisCalendar = __lexisCalendarExports;
}
