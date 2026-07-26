// lexis-merge.js — čistá logika hromadného generování (mail-merge / kampaně):
//   • parseCsvToRecords: CSV → pole záznamů {hlavička: hodnota}, S PODPOROU UVOZOVEK
//     (pole s čárkou, např. adresa „Václavské nám. 1, Praha", se nerozbije),
//   • fillTemplate: dosazení proměnných {{Klíč}} z jednoho záznamu do šablony.
// Bez DOM/IPC → testovatelné (jest). UI (lexis-ui) na tuto logiku deleguje.

'use strict';

// Rozdělí jeden CSV řádek na pole. Uvozovky ("...") umožní čárku uvnitř pole;
// zdvojená uvozovka ("") uvnitř = doslovná uvozovka. Bez uvozovek se chová jako
// prosté dělení podle čárky (zpětně kompatibilní s dřívějším parserem).
function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    const s = String(line == null ? '' : line);
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQ) {
            if (c === '"') {
                if (s[i + 1] === '"') { cur += '"'; i++; }
                else inQ = false;
            } else cur += c;
        } else {
            if (c === '"') inQ = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
}

function parseCsvToRecords(csvText) {
    const lines = String(csvText == null ? '' : csvText).trim().split('\n').filter(function (l) { return l.trim(); });
    if (lines.length < 2) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(function (line) {
        const vals = splitCsvLine(line);
        const record = {};
        headers.forEach(function (h, i) { record[h] = vals[i] || ''; });
        return record;
    });
}

// Dosadí do šablony všechny proměnné {{Klíč}} podle záznamu. Neznámé proměnné
// v šabloně zůstanou nedotčené (advokát je pak vidí a doplní).
function fillTemplate(template, record) {
    let out = String(template == null ? '' : template);
    const rec = record || {};
    Object.keys(rec).forEach(function (k) {
        const val = rec[k] == null ? '' : String(rec[k]);
        out = out.split('{{' + k + '}}').join(val);
    });
    return out;
}

const api = { splitCsvLine: splitCsvLine, parseCsvToRecords: parseCsvToRecords, fillTemplate: fillTemplate };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LexisMerge = api;
