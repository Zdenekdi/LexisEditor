/**
 * czech-style.js — LINTER SPISOVNÉ ČEŠTINY pro LexisEditor (rychlá, offline vrstva).
 *
 * checkCzechStyle(text) vrací pole nálezů ve stejném tvaru, jaký používá audit panel
 * (renderAuditResults): { type, msg, index, length, fix?, rule }. Řeší VYSOCE JISTÉ
 * nespisovné/hovorové tvary (bysme→bychom, „aby jsme"→„abychom", seš→jsi…) a typografii
 * (dvojitá mezera, mezera před interpunkcí, „..."→„…"). Kontextovou gramatiku a sloh
 * řeší AI vrstva (viz parseAiLanguageIssues + checkLanguageAI v UI).
 *
 * Čistá funkce (bez DOM) → testovatelná; v prohlížeči se navěsí na window.LexisCzechStyle.
 */
(function (root) {
    'use strict';

    // Zachová velikost prvního písmene originálu na opravě.
    function _matchCase(original, replacement) {
        if (!original) return replacement;
        const first = original[0];
        if (first === first.toUpperCase() && first !== first.toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    }

    // Jednoslovné nespisovné → spisovné (klíč malými písmeny). Jen jednoznačné případy.
    const WORD_FIXES = {
        'bysme': 'bychom',
        'abysme': 'abychom',
        'kdybysme': 'kdybychom',
        'seš': 'jsi',
        'jseš': 'jsi',
        'sme': 'jsme',
        'furt': 'stále',
        'dyť': 'vždyť',
        'nashle': 'na shledanou'
    };

    // Víceslovné nespisovné vazby (časté i ve formálním psaní) → spisovné.
    const PHRASE_FIXES = [
        { re: /(?<![\p{L}])aby\s+jsme(?![\p{L}])/giu, fix: 'abychom' },
        { re: /(?<![\p{L}])aby\s+jste(?![\p{L}])/giu, fix: 'abyste' },
        { re: /(?<![\p{L}])kdyby\s+jsme(?![\p{L}])/giu, fix: 'kdybychom' },
        { re: /(?<![\p{L}])kdyby\s+jste(?![\p{L}])/giu, fix: 'kdybyste' },
        { re: /(?<![\p{L}])aby\s+jsem(?![\p{L}])/giu, fix: 'abych' },
        { re: /(?<![\p{L}])kdyby\s+jsem(?![\p{L}])/giu, fix: 'kdybych' }
    ];

    function checkCzechStyle(text) {
        text = String(text == null ? '' : text);
        const issues = [];

        // 1) Jednoslovné nespisovné tvary — po slovech (hranice = ne-písmeno).
        const wordRe = /\p{L}+/gu;
        let m;
        while ((m = wordRe.exec(text)) !== null) {
            const w = m[0];
            const key = w.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(WORD_FIXES, key)) {
                const fix = _matchCase(w, WORD_FIXES[key]);
                issues.push({
                    type: 'warning', rule: 'nespisovne',
                    msg: `Nespisovný tvar „${w}" — spisovně „${fix}".`,
                    index: m.index, length: w.length, fix: fix
                });
            }
        }

        // 2) Víceslovné vazby.
        PHRASE_FIXES.forEach(p => {
            let mm;
            p.re.lastIndex = 0;
            while ((mm = p.re.exec(text)) !== null) {
                const found = mm[0];
                issues.push({
                    type: 'warning', rule: 'nespisovne',
                    msg: `Nespisovná vazba „${found}" — spisovně „${_matchCase(found, p.fix)}".`,
                    index: mm.index, length: found.length, fix: _matchCase(found, p.fix)
                });
            }
        });

        // 3) Typografie.
        let t;
        const dbl = / {2,}/g;
        while ((t = dbl.exec(text)) !== null) {
            issues.push({ type: 'info', rule: 'mezera', msg: 'Vícenásobná mezera — nahraď jednou.', index: t.index, length: t[0].length, fix: ' ' });
        }
        const spaceBefore = /\s+([,.;:!?])/g;
        while ((t = spaceBefore.exec(text)) !== null) {
            // vynech případ, kdy je „mezera" ve skutečnosti nový řádek za koncem věty
            if (t[0].indexOf('\n') !== -1) continue;
            issues.push({ type: 'info', rule: 'mezera-pred', msg: `Mezera před „${t[1]}" — má být bez mezery.`, index: t.index, length: t[0].length, fix: t[1] });
        }
        const ellipsis = /\.\.\./g;
        while ((t = ellipsis.exec(text)) !== null) {
            issues.push({ type: 'info', rule: 'vypustka', msg: 'Tři tečky → výpustka „…".', index: t.index, length: 3, fix: '…' });
        }

        issues.sort((a, b) => a.index - b.index);
        return issues;
    }

    /**
     * parseAiLanguageIssues — z odpovědi AI (JSON pole {uryvek, problem, navrh}) sestaví
     * nálezy pro audit panel a LOKALIZUJE úryvek v textu dokumentu (indexOf). Nálezy bez
     * dohledatelného úryvku se zahodí (nemá je kam ukázat). Čisté → testovatelné.
     */
    function parseAiLanguageIssues(aiResponse, docText) {
        docText = String(docText == null ? '' : docText);
        let raw = String(aiResponse == null ? '' : aiResponse).trim();
        // odstranit případné ```json ... ``` obaly
        raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        // vyříznout první [ ... ] pokud model přidal text okolo
        const lb = raw.indexOf('['), rb = raw.lastIndexOf(']');
        if (lb !== -1 && rb !== -1 && rb > lb) raw = raw.slice(lb, rb + 1);

        let arr;
        try { arr = JSON.parse(raw); } catch (e) { return []; }
        if (!Array.isArray(arr)) return [];

        const out = [];
        const usedFrom = {}; // ať se stejný úryvek mapuje na další výskyt
        arr.forEach(it => {
            if (!it || typeof it !== 'object') return;
            const uryvek = String(it.uryvek || it.úryvek || '').trim();
            const problem = String(it.problem || it.problém || '').trim();
            const navrh = String(it.navrh || it.návrh || '').trim();
            if (!uryvek || !problem) return;
            const from = usedFrom[uryvek] || 0;
            const idx = docText.indexOf(uryvek, from);
            if (idx === -1) return;
            usedFrom[uryvek] = idx + uryvek.length;
            const issue = {
                type: 'warning', rule: 'ai',
                msg: navrh ? `${problem} → „${navrh}".` : problem,
                index: idx, length: uryvek.length
            };
            // fix jen když je návrh krátký a jednoznačný (jinak jen upozornění)
            if (navrh && navrh.length <= uryvek.length + 40) issue.fix = navrh;
            out.push(issue);
        });
        out.sort((a, b) => a.index - b.index);
        return out;
    }

    const api = { checkCzechStyle, parseAiLanguageIssues };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LexisCzechStyle = api;
})(typeof window !== 'undefined' ? window : null);
