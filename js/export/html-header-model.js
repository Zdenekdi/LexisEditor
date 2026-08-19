/**
 * html-header-model.js — převede HTML hlavičky/patičky (prosté DOM divy v editoru,
 * ne Quill) na dokumentový MODEL odstavců, aby nativní export (model-to-docx) zachoval
 * FORMÁTOVÁNÍ (tučné/kurzíva/podtržení), ZAROVNÁNÍ a LOGO (obrázek) — dosud se hlavička
 * do .docx přenášela jen jako prostý text (innerText).
 *
 * Výstup má stejný tvar jako _linesToParas v delta-to-model.js:
 *   [ { type:'normal', align:'left'|'center'|'right'|'justify'|null, runs:[Run] } ]
 *   Run = { text, bold?, italic?, underline? } | { image:'data:image/...' }
 *
 * Běží V RENDERERU (parsuje header-area DOM), proto UMD: v prohlížeči se navěsí na
 * window.LexisHeaderModel, v Node/jest jde přes module.exports. Čistá funkce
 * s explicitně předaným `documentImpl` (kvůli testům v jsdom). Nespouští skripty
 * (jen čte odpojený <div>).
 */
(function (root) {
    'use strict';

    const BLOCK = /^(P|DIV|H1|H2|H3|H4|H5|H6|LI|SECTION|HEADER|FOOTER)$/;

    function _alignOf(el) {
        const st = el && el.style;
        let ta = (st && st.textAlign) || '';
        if (!ta && el && el.getAttribute) ta = (el.getAttribute('align') || '');
        ta = String(ta).toLowerCase();
        if (ta === 'justify') return 'justify';
        if (ta === 'left' || ta === 'center' || ta === 'right') return ta;
        return null;
    }

    function htmlToHeaderModel(html, documentImpl) {
        const doc = documentImpl || (typeof document !== 'undefined' ? document : null);
        if (!doc || html == null) return [];

        const container = doc.createElement('div');
        container.innerHTML = String(html);

        const paras = [];
        let cur = null;
        const newPara = (align) => { cur = { type: 'normal', align: align || null, runs: [] }; paras.push(cur); };
        const ensure = () => { if (!cur) newPara(null); };

        const pushText = (raw, fmt) => {
            const t = String(raw == null ? '' : raw).replace(/\s+/g, ' ');
            if (!t) return;
            ensure();
            const run = { text: t };
            if (fmt.bold) run.bold = true;
            if (fmt.italic) run.italic = true;
            if (fmt.underline) run.underline = true;
            cur.runs.push(run);
        };

        const walk = (node, fmt) => {
            const kids = node.childNodes || [];
            for (let i = 0; i < kids.length; i++) {
                const child = kids[i];
                if (child.nodeType === 3) {            // textový uzel
                    pushText(child.nodeValue, fmt);
                    continue;
                }
                if (child.nodeType !== 1) continue;    // komentáře apod. ignoruj
                const tag = String(child.tagName || '').toUpperCase();

                if (tag === 'BR') { newPara(cur ? cur.align : null); continue; }
                if (tag === 'IMG') {
                    const src = (child.getAttribute && child.getAttribute('src')) || '';
                    if (/^data:image\//i.test(src)) { ensure(); cur.runs.push({ image: src }); }
                    continue;
                }
                if (tag === 'STYLE' || tag === 'SCRIPT') continue;

                // Zděděné formátování z tagu i z inline stylu.
                const nf = { bold: fmt.bold, italic: fmt.italic, underline: fmt.underline };
                if (tag === 'B' || tag === 'STRONG') nf.bold = true;
                if (tag === 'I' || tag === 'EM') nf.italic = true;
                if (tag === 'U' || tag === 'INS') nf.underline = true;
                const st = child.style || {};
                const fw = String(st.fontWeight || '');
                if (fw === 'bold' || fw === 'bolder' || (parseInt(fw, 10) >= 600)) nf.bold = true;
                if (String(st.fontStyle || '') === 'italic') nf.italic = true;
                if (String(st.textDecoration || st.textDecorationLine || '').indexOf('underline') !== -1) nf.underline = true;

                if (BLOCK.test(tag)) {
                    newPara(_alignOf(child));   // nový odstavec se zarovnáním bloku
                    walk(child, nf);
                } else {
                    walk(child, nf);            // inline (span, a, …) — jen zdědí formát
                }
            }
        };

        walk(container, { bold: false, italic: false, underline: false });

        // Zahoď úplně prázdné runy (délka 0), ale mezery MEZI slovy zachovej (jinak by se
        // „Firma s.r.o." slilo). Odstavce bez reálného obsahu (jen mezery) vyhoď celé.
        return paras
            .map(p => ({
                type: 'normal',
                align: p.align,
                runs: p.runs.filter(r => r.image || (r.text && r.text.length))
            }))
            .filter(p => p.runs.some(r => r.image || (r.text && r.text.trim().length)));
    }

    const api = { htmlToHeaderModel };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LexisHeaderModel = api;
})(typeof window !== 'undefined' ? window : null);
