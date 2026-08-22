/**
 * lexis-citations.js — rozpoznávání a normalizace ČESKÝCH soudních citací a
 * sestavení SEZNAMU CITOVANÉ JUDIKATURY (obdoba „table of authorities"). Čistý,
 * deterministický modul (bez DOM/Quillu) → plně testovatelný. UMD.
 *
 * Rozpozná spisové značky typu „21 Cdo 1234/2019", „III. ÚS 1234/19",
 * „Pl. ÚS 12/34", „1 As 12/2020", „12 C 34/2026" a zařadí je podle soudu
 * (Nejvyšší soud / Ústavní soud / Nejvyšší správní soud / obecný soud).
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LexisCitations = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Druhy věcí (rejstříky) → soud. Nejvyšší soud: Cdo, Odo, Tdo, Cdon, Nd, Tz…
    // NSS: As, Afs, Ao, Ars, Azs, Ads, Aps, Ans… ; Ústavní soud: ÚS.
    const NS_KINDS = /^(Cdo|Cdon|Odo|Tdo|Tz|Nd|ICdo|NSČR|Cul)$/i;
    const NSS_KINDS = /^(As|Afs|Ao|Ars|Azs|Ads|Aps|Ans|Aos|Komp|Konf|Na|Nad|Vol)$/i;

    // Spisová značka obecná: „<senát> <druh> <číslo>/<rok>" (druh = 1–5 písmen).
    // Např. 21 Cdo 1234/2019, 1 As 12/2020, 12 C 34/2026, 30 Cdo 2/2019.
    const RE_SPZN = /\b(\d{1,3})\s+([A-Za-zÁ-Žá-ž]{1,5})\s+(\d{1,5})\/(\d{2,4})\b/g;

    // Ústavní soud: „III. ÚS 1234/19", „Pl. ÚS 12/34", „I. ÚS 2/20".
    const RE_US = /\b((?:Pl\.|I{1,3}\.|IV\.)\s*ÚS)\s+(\d{1,5})\/(\d{2,4})\b/g;

    // Číslo jednací: „č. j. 12345/2026-ABC", „čj. 999/2026" (zkratka + referenční token).
    const RE_CJ = /(č\.\s?j\.|čj\.)\s*([0-9A-Za-zÁ-Žá-ž][\w./\-]{2,})/gi;

    function _norm2to4(year) {
        const y = String(year);
        if (y.length === 4) return y;
        const n = parseInt(y, 10);
        // 00–40 → 20xx, jinak 19xx (heuristika pro dvojmístný rok)
        return (n <= 40 ? 2000 + n : 1900 + n).toString();
    }

    function _courtOf(kind) {
        if (/^ÚS$/i.test(kind) || /ÚS/i.test(kind)) return 'Ústavní soud';
        if (NS_KINDS.test(kind)) return 'Nejvyšší soud';
        if (NSS_KINDS.test(kind)) return 'Nejvyšší správní soud';
        return 'Obecný soud';
    }

    /**
     * Vytáhne z textu všechny citace. Vrací pole { raw, court, normalized, sort }.
     * Deduplikováno podle normalized.
     */
    function extractCitations(text) {
        const src = String(text == null ? '' : text);
        const found = new Map(); // normalized → citace

        let m;
        // Ústavní soud (specifický formát) — první, ať nekoliduje s obecným.
        RE_US.lastIndex = 0;
        while ((m = RE_US.exec(src)) !== null) {
            const senate = m[1].replace(/\s+/g, ' ').trim(); // "III. ÚS" / "Pl. ÚS"
            const num = m[2], year = _norm2to4(m[3]);
            const normalized = `${senate} ${num}/${year}`;
            if (!found.has(normalized)) {
                found.set(normalized, { raw: m[0].trim(), court: 'Ústavní soud', normalized,
                    sort: `2_${year}_${num.padStart(6, '0')}` });
            }
        }

        // Obecná spisová značka.
        RE_SPZN.lastIndex = 0;
        while ((m = RE_SPZN.exec(src)) !== null) {
            const senate = m[1], kind = m[2], num = m[3], year = _norm2to4(m[4]);
            // Přeskoč, pokud „druh" je zjevně slovo, ne rejstřík (příliš dlouhé/malá písm. bez shody).
            // Rejstříkové značky mají velké první písmeno nebo jsou známé; jinak vynech.
            const looksKind = /^[A-ZÁ-Ž]/.test(kind) || NS_KINDS.test(kind) || NSS_KINDS.test(kind);
            if (!looksKind) continue;
            const court = _courtOf(kind);
            const normalized = `${senate} ${kind} ${num}/${year}`;
            if (!found.has(normalized)) {
                const courtRank = court === 'Ústavní soud' ? 2 : court === 'Nejvyšší soud' ? 0 : court === 'Nejvyšší správní soud' ? 1 : 3;
                found.set(normalized, { raw: m[0].trim(), court, normalized,
                    sort: `${courtRank}_${year}_${num.padStart(6, '0')}` });
            }
        }

        return Array.from(found.values()).sort((a, b) => a.sort.localeCompare(b.sort));
    }

    /**
     * Sestaví seznam citované judikatury z textu.
     * @returns { items: string[], count, byCourt: {court: string[]} }
     */
    function buildAuthorities(text) {
        const cites = extractCitations(text);
        const byCourt = {};
        for (const c of cites) {
            (byCourt[c.court] = byCourt[c.court] || []).push(c.normalized);
        }
        return { items: cites.map(c => c.normalized), count: cites.length, byCourt };
    }

    /**
     * Rozpozná VŠECHNY právní reference: spisové značky (přes extractCitations) i
     * čísla jednací. Vrací [{ type:'spisova_znacka'|'cislo_jednaci', value, raw, court? }].
     * Nešpiní buildAuthorities (to zůstává jen judikatura).
     */
    function extractReferences(text) {
        const src = String(text == null ? '' : text);
        const out = extractCitations(src).map(function (c) { return { type: 'spisova_znacka', value: c.normalized, raw: c.raw, court: c.court }; });
        const seen = {};
        out.forEach(function (o) { seen[o.value.toLowerCase()] = true; });
        let m; RE_CJ.lastIndex = 0;
        while ((m = RE_CJ.exec(src)) !== null) {
            const val = (m[1].replace(/\s+/g, ' ').trim() + ' ' + m[2]).trim();
            const key = val.toLowerCase();
            if (!seen[key]) { seen[key] = true; out.push({ type: 'cislo_jednaci', value: val, raw: m[0].trim() }); }
        }
        return out;
    }

    return { extractCitations, buildAuthorities, extractReferences };
});
