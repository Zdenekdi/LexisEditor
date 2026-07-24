// --- LexisLegalDocs — generátory právních dokumentů (šablony) ---
// Vytaženo z lexis-dialogs.js. Dřív byla plná moc sestavovaná přímo v UI s jménem
// vkládaným SYROVĚ (bez escapování) a s napevno „V Praze". Tady je to čistá,
// testovatelná funkce: escapuje jméno a místo i datum jsou parametry.

'use strict';

(function () {
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Sestaví HTML plné moci. opts = { name, type ('procesní'|'obecná'), place, date }.
    // place = tvar po „V " (6. pád, např. „Praze", „Brně"); default „Praze" zachovává
    // dosavadní chování. date = předformátovaný řetězec; default = dnešní datum cs-CZ.
    function buildPowerOfAttorney(opts) {
        const o = opts || {};
        const name = esc((o.name != null && String(o.name).trim()) || '[JMÉNO ZMOCNITELE]');
        const place = esc(o.place || 'Praze');
        const date = esc(o.date || new Date().toLocaleDateString('cs-CZ'));
        const procesni = o.type === 'procesní';
        const nadpis = procesni ? 'PLNÁ MOC (PROCESNÍ)' : 'PLNÁ MOC (OBECNÁ)';
        const telo = procesni
            ? 'tímto uděluji procesní plnou moc advokátní kanceláři [DOPLNIT] k tomu, aby mě zastupovala ve všech právních věcech, před soudy, orgány státní správy i samosprávy a vůči třetím osobám v plném rozsahu.'
            : 'tímto zmocňuji pana/paní [DOPLNIT], nar. [DOPLNIT], trvale bytem [DOPLNIT], aby mě zastupoval/a ve všech běžných záležitostech a činil/a mým jménem veškeré právní úkony.';
        return `
            <h1>${nadpis}</h1>
            <p>Já, níže podepsaný/á:</p>
            <p><b>${name}</b>, nar. [DOPLNIT], trvale bytem [DOPLNIT]</p>
            <p>${telo}</p>
            <p>V ${place} dne ${date}</p>
            <p>.......................................<br><b>${name}</b> (zmocnitel)</p>
        `.replace(/ {2,}/g, '');
    }

    // Formální podpisový blok (dva podpisy vedle sebe). Místo i popisky jsou
    // parametry (default ZMOCNITEL/ZMOCNĚNEC a „V Praze") — dřív bylo „V Praze"
    // napevno. Datum se nechává k ručnímu doplnění (tečky).
    function buildSignatureBlock(opts) {
        const o = opts || {};
        const place = esc(o.place || 'Praze');
        const leftLabel = esc(o.leftLabel || 'ZMOCNITEL');
        const rightLabel = esc(o.rightLabel || 'ZMOCNĚNEC');
        const leftName = esc(o.leftName || '[Jméno zmocnitele]');
        const rightName = esc(o.rightName || '[Jméno zmocněnce]');
        const col = (label, name) => `
                <div>
                    <p style="margin-bottom: 40px;">V ${place} dne .............................</p>
                    <p style="border-top: 1px solid #cbd5e1; padding-top: 8px; margin: 0;">___________________________________<br><b>${label}</b><br>${name}</p>
                </div>`;
        return `
            <div style="margin-top: 40px; font-family: 'Inter', sans-serif; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 13px; line-height: 1.5; color: #1e293b;">
                ${col(leftLabel, leftName)}
                ${col(rightLabel, rightName)}
            </div>
            <p><br></p>
        `.replace(/ {2,}/g, '');
    }

    const api = { esc, buildPowerOfAttorney, buildSignatureBlock };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LexisLegalDocs = api;
})();
