/* global window */
/**
 * LexisLetterhead — sestavení „hlavičkového papíru" advokáta ze uloženého profilu.
 * Z profilu (jméno/AK, sídlo, IČO/DIČ, ev. č. ČAK, kontakt, datová schránka, logo)
 * vygeneruje HTML do záhlaví dokumentu — tak, jak je u advokátních podání zvykem.
 * Vkládá se automaticky do nových dokumentů (viz resetHeaderFooterDOM v lexis-ui),
 * s možností vypnout přepínačem v profilu.
 */
(function () {
    'use strict';

    // Seznam polí profilu (klíče v úložišti settings mají prefix `lawyer-`).
    const FIELDS = ['title', 'name', 'firm', 'license', 'address', 'ico', 'dic', 'tel', 'email', 'web', 'isds', 'logo', 'auto'];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // Má profil aspoň nějaký smysluplný obsah pro hlavičku?
    function hasContent(p) {
        if (!p) return false;
        return !!(p.name || p.firm || p.address || p.ico || p.license || p.tel || p.email || p.web || p.isds || p.logo);
    }

    // Bezpečné logo: jen data:image/... (žádné externí URL / skripty).
    function safeLogo(logo) {
        const s = String(logo || '');
        return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(s) ? s : '';
    }

    // Sestaví HTML hlavičky (levý sloupec = identita + logo, pravý = kontakt).
    // Mezihodnoty jsou RAW; escapuje se JEN na výstupu (žádné dvojité escapování).
    function buildHeaderHtml(p) {
        if (!hasContent(p)) return '';
        const nameFull = [p.title, p.name].filter(Boolean).join(' ');
        const firm = p.firm || '';
        const mainName = firm || nameFull || 'Advokátní kancelář';
        const subName = firm && nameFull ? nameFull : '';

        const roleBits = ['advokát'];
        if (p.license) roleBits.push('ev. č. ČAK ' + p.license);

        const contact = [];
        if (p.address) contact.push(p.address);
        const idline = [];
        if (p.ico) idline.push('IČO: ' + p.ico);
        if (p.dic) idline.push('DIČ: ' + p.dic);
        if (idline.length) contact.push(idline.join(' · '));
        const commLine = [];
        if (p.tel) commLine.push('tel. ' + p.tel);
        if (p.email) commLine.push(p.email);
        if (commLine.length) contact.push(commLine.join(' · '));
        if (p.web) contact.push(p.web);
        if (p.isds) contact.push('datová schránka: ' + p.isds);

        const logo = safeLogo(p.logo);
        const logoHtml = logo
            ? `<img src="${logo}" alt="logo" style="max-height:52px; max-width:150px; vertical-align:middle;">`
            : '';

        // Tabulkové rozvržení (ne flexbox) — spolehlivě přežije i export do Wordu (DOCX).
        // Levá buňka: logo + identita, pravá buňka: kontakt zarovnaný vpravo.
        const identity = `
            <div style="font-weight:700; font-size:13pt; color:#111;">${esc(mainName)}</div>
            ${subName ? `<div style="font-size:10pt; color:#222;">${esc(subName)}</div>` : ''}
            <div style="font-size:8.5pt; color:#555;">${roleBits.map(esc).join(' · ')}</div>`;
        const leftCell = logoHtml
            ? `<table style="border-collapse:collapse;"><tr>
                   <td style="vertical-align:middle; padding-right:12px;">${logoHtml}</td>
                   <td style="vertical-align:middle;">${identity}</td>
               </tr></table>`
            : identity;

        return `
<table style="width:100%; border-collapse:collapse; font-family:'Times New Roman', serif; border-bottom:1px solid #cbd5e1;">
    <tr>
        <td style="vertical-align:top; padding-bottom:6px;">${leftCell}</td>
        <td style="vertical-align:top; text-align:right; font-size:8.5pt; color:#333; line-height:1.45; padding-bottom:6px;">
            ${contact.map(l => `<div>${esc(l)}</div>`).join('')}
        </td>
    </tr>
</table>`.trim();
    }

    // Patička: název AK / web + místo pro číslování stran (necháváme původní pravý blok).
    function buildFooterHtml(p) {
        if (!hasContent(p)) return '';
        const left = esc(p.web || p.firm || (p.name ? (p.title ? p.title + ' ' : '') + p.name : '') || '');
        return `<div>${left}</div><div style="text-align:right;">Strana 1 z 1</div>`;
    }

    window.LexisLetterhead = { FIELDS, buildHeaderHtml, buildFooterHtml, hasContent, safeLogo };
})();
