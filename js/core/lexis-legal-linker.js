// --- LexisLegalLinker — převod českých právních citací na odkazy ---
// Vytaženo z convertCitationsToLinks v lexis-ui.js (monolit). UI si nechává jen
// procházení DOM; tady je čistá, testovatelná logika: detekce citací (§ …, zákon
// č. …/… Sb.) a sestavení odkazu na „Zákony pro lidi" nebo Google.
//
// Pozn.: dřív se v UI aplikovaly dva regexy za sebou (§-citace, pak zákony) na už
// prolinkovaný text, což mohlo vytvořit VNOŘENÉ odkazy. Tady je jeden průchod
// (alternace), takže se každá citace odkazuje právě jednou.

'use strict';

(function () {
    // §-citace (volitelně odst., „zákona č. X/Y Sb." nebo navazující text).
    const CITATION_SRC = '§\\s*\\d+[a-z]?(?:\\s+(?:odst\\.|odstavce)\\s*\\d+)?\\s*(?:zákona\\s+)?(?:č\\.\\s*)?(?:\\d+\\/\\d+\\s+Sb\\.|[a-zá-žA-Z0-9.\\s]{2,})';
    // Samostatný odkaz na zákon „zákon(a/u) č. X/Y Sb.".
    const LAW_SRC = 'zákon(?:a|u)?\\s+(?:č\\.\\s*)?\\d+\\/\\d+\\s*Sb\\.';

    function urlFor(query, target) {
        const q = encodeURIComponent(String(query).trim());
        return target === 'google'
            ? `https://www.google.com/search?q=${q}`
            : `https://www.zakonyprolidi.cz/hledani?q=${q}`;
    }

    function linkHtml(match, target) {
        return `<a href="${urlFor(match, target)}" target="_blank" class="legal-link" style="color: #0284c7; text-decoration: underline; font-weight: 500;">${match}</a>`;
    }

    // Prolinkuje citace v prostém textu (jednoho textového uzlu — bez HTML tagů).
    // Vrací { html, count, changed }. target: 'google' | jinak 'zakonyprolidi'.
    function linkifyLegalCitations(text, target) {
        if (!text) return { html: text || '', count: 0, changed: false };
        let count = 0;
        const re = new RegExp('(' + CITATION_SRC + ')|(' + LAW_SRC + ')', 'gi');
        const html = String(text).replace(re, (m) => {
            if (m.trim().length < 5) return m; // filtr šumu
            count++;
            return linkHtml(m, target);
        });
        return { html, count, changed: html !== text };
    }

    const api = { linkifyLegalCitations, urlFor, CITATION_SRC, LAW_SRC };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LexisLegalLinker = api;
})();
