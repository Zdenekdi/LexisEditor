/**
 * lexis-authoring.js — AUTORSKÉ API pro AI agenty (applyDocumentSpec).
 *
 * Umožňuje agentovi sestavit CELÝ dokument z jednoho strukturovaného JSON popisu
 * (spec) deterministicky, bez klikání v GUI a bez ručního počítání pozic. Jádrem je
 * ČISTÁ funkce `buildDelta(spec)`, která spec převede na Quill Delta (data) — proto
 * je plně pokrytelná testy nezávisle na Quillu/Electronu. Runtime `apply(spec, ctx)`
 * pak Deltu vloží přes `quill.setContents`, sestaví hlavičku/patičku z profilu
 * (včetně loga) a nastaví vodoznak. UMD: v prohlížeči na window.LexisAuthoring,
 * v Node/jest přes module.exports.
 *
 * SCHÉMA spec (vše volitelné):
 * {
 *   title: "Nadpis",                       // vycentrovaný tučný titul
 *   letterhead: { profile: { name, firm, address, ico, dic, license, tel, email, web, isds, logo } },
 *   watermark: { text: "KONCEPT", color: "#e0dbd3" },
 *   blocks: [
 *     { type:"heading", level:1|2|3, text:"…" },
 *     { type:"paragraph", text:"…", align:"left|center|right|justify", footnote:"…" },
 *     { type:"paragraph", runs:[ {text:"…", bold, italic, underline, link:"https://…"} ], align:"…" },
 *     { type:"list", ordered:true|false, items:["…", …] },
 *     { type:"table", rows:2, cols:3, cells:[["a","b","c"],["d","e","f"]] },
 *     { type:"toc" },
 *     { type:"pageBreak" }
 *   ]
 * }
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LexisAuthoring = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_TABLE_ROWS = 50, MAX_TABLE_COLS = 12;
    const ALIGN_OK = { left: 1, center: 1, right: 1, justify: 1 };

    function _str(x) { return x == null ? '' : String(x); }

    // Sestaví inline atributy jednoho běhu textu (run).
    function _inlineAttrs(run) {
        const a = {};
        if (run.bold) a.bold = true;
        if (run.italic) a.italic = true;
        if (run.underline) a.underline = true;
        if (run.link) a.link = _str(run.link);
        return Object.keys(a).length ? a : null;
    }

    // Atributy odstavce (block-level jdou na koncový \n).
    function _blockAttrs(block) {
        const a = {};
        if (block.align && ALIGN_OK[block.align] && block.align !== 'left') a.align = block.align;
        return a;
    }

    function _pushText(ops, text, attrs) {
        if (text === '') return;
        ops.push(attrs ? { insert: text, attributes: attrs } : { insert: text });
    }
    function _pushNewline(ops, attrs) {
        ops.push(attrs && Object.keys(attrs).length ? { insert: '\n', attributes: attrs } : { insert: '\n' });
    }

    // Normalizace odstavce: buď `runs`, nebo prosté `text`.
    function _runsOf(block) {
        if (Array.isArray(block.runs) && block.runs.length) return block.runs;
        return [{ text: _str(block.text) }];
    }

    /**
     * Čistý převod spec → Quill Delta (pole ops). Testovatelný bez Quillu.
     * @returns {{ops: Array}}
     */
    function buildDelta(spec) {
        if (!spec || typeof spec !== 'object') throw new Error('buildDelta: spec musí být objekt.');
        const ops = [];
        let fnCounter = 0;

        // Titul (vycentrovaný tučný) — samostatný odstavec.
        if (spec.title != null && _str(spec.title).trim() !== '') {
            _pushText(ops, _str(spec.title), { bold: true });
            _pushNewline(ops, { align: 'center' });
        }

        const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
        for (const block of blocks) {
            if (!block || typeof block !== 'object') continue;
            const type = block.type || 'paragraph';

            if (type === 'heading') {
                let lvl = parseInt(block.level, 10); if (!(lvl >= 1 && lvl <= 6)) lvl = 1;
                _pushText(ops, _str(block.text));
                _pushNewline(ops, { header: lvl });

            } else if (type === 'paragraph') {
                for (const run of _runsOf(block)) _pushText(ops, _str(run.text), _inlineAttrs(run));
                if (block.footnote != null && _str(block.footnote).trim() !== '') {
                    ops.push({ insert: { footnote: { id: 'fn-' + (++fnCounter), text: _str(block.footnote), number: '?' } } });
                }
                _pushNewline(ops, _blockAttrs(block));

            } else if (type === 'list') {
                const ordered = !!block.ordered;
                const items = Array.isArray(block.items) ? block.items : [];
                for (const it of items) {
                    _pushText(ops, _str(it));
                    _pushNewline(ops, { list: ordered ? 'ordered' : 'bullet' });
                }

            } else if (type === 'table') {
                let r = Math.max(1, Math.min(parseInt(block.rows, 10) || (Array.isArray(block.cells) ? block.cells.length : 3), MAX_TABLE_ROWS));
                let c = Math.max(1, Math.min(parseInt(block.cols, 10) || (Array.isArray(block.cells) && block.cells[0] ? block.cells[0].length : 3), MAX_TABLE_COLS));
                const cells = Array.isArray(block.cells) ? block.cells : null;
                const grid = Array.from({ length: r }, (_, i) =>
                    Array.from({ length: c }, (_, j) => _str(cells && cells[i] ? cells[i][j] : '')));
                ops.push({ insert: { table: { rows: grid } } });
                _pushNewline(ops, {});

            } else if (type === 'toc') {
                ops.push({ insert: { toc: true } });
                _pushNewline(ops, {});

            } else if (type === 'footnote') {
                ops.push({ insert: { footnote: { id: 'fn-' + (++fnCounter), text: _str(block.text), number: '?' } } });
                _pushNewline(ops, {});

            } else if (type === 'pageBreak') {
                ops.push({ insert: { 'page-break': true } });
                _pushNewline(ops, {});
            }
        }

        // Quill vyžaduje, aby dokument končil \n a nebyl prázdný.
        if (ops.length === 0) ops.push({ insert: '\n' });
        else {
            const last = ops[ops.length - 1];
            const endsNl = typeof last.insert === 'string' && last.insert.endsWith('\n');
            if (!endsNl) ops.push({ insert: '\n' });
        }
        return { ops };
    }

    // Hlavička/patička z profilu (potřebuje window.LexisLetterhead; jinak vrátí null).
    function buildHeaderFooter(spec, LetterheadImpl) {
        const LH = LetterheadImpl || (typeof window !== 'undefined' ? window.LexisLetterhead : null);
        if (!spec || !spec.letterhead || !spec.letterhead.profile || !LH) return null;
        const p = spec.letterhead.profile;
        return { headerHtml: LH.buildHeaderHtml(p), footerHtml: LH.buildFooterHtml(p) };
    }

    /**
     * Runtime aplikace spec do editoru.
     * @param {object} spec
     * @param {object} ctx { quill, core, Delta, document, sanitize, escapeHTML, LexisLetterhead }
     * @returns {{blocks:number, header:boolean, watermark:boolean, opCount:number}}
     */
    function apply(spec, ctx) {
        ctx = ctx || {};
        const quill = ctx.quill || (typeof window !== 'undefined' ? window.quill : null);
        const core = ctx.core || (typeof window !== 'undefined' ? window.lexisCore : null);
        const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
        const sanitize = ctx.sanitize || (typeof DOMPurify !== 'undefined' ? (h) => DOMPurify.sanitize(h) : (h) => h);
        const esc = ctx.escapeHTML || (typeof window !== 'undefined' && window.escapeHTML) || ((s) => _str(s));
        if (!quill) throw new Error('apply: chybí quill v kontextu.');

        const built = buildDelta(spec);
        const Delta = ctx.Delta || (typeof window !== 'undefined' && window.Quill ? window.Quill.import('delta') : null);
        if (Delta) quill.setContents(new Delta(built.ops), 'user');
        else quill.setContents(built.ops, 'user');
        if (core && typeof core.updateFootnoteNumbers === 'function') core.updateFootnoteNumbers();

        // Hlavička/patička (z profilu, včetně loga — LexisLetterhead ošetří safeLogo).
        let header = false;
        const hf = buildHeaderFooter(spec, ctx.LexisLetterhead);
        if (hf && doc) {
            const h = doc.getElementById('header-area');
            const f = doc.getElementById('footer-area');
            if (h) { h.innerHTML = sanitize(hf.headerHtml); header = true; }
            if (f) { f.innerHTML = sanitize(hf.footerHtml); }
        }

        // Vodoznak (data-atributy čte export do PDF/DOCX).
        let watermark = false;
        if (spec && spec.watermark && _str(spec.watermark.text).trim() !== '' && doc) {
            const wrapper = doc.getElementById('editor-wrapper');
            if (wrapper) {
                let wm = doc.getElementById('watermark-layer');
                if (!wm) {
                    wm = doc.createElement('div');
                    wm.id = 'watermark-layer';
                    wm.style = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:0; pointer-events:none; display:flex; align-items:center; justify-content:center; overflow:hidden;';
                    wrapper.insertBefore(wm, wrapper.firstChild);
                }
                const text = _str(spec.watermark.text);
                const color = _str(spec.watermark.color || '#e0dbd3');
                wm.setAttribute('data-watermark-type', 'text');
                wm.setAttribute('data-watermark-text', text);
                wm.setAttribute('data-watermark-color', color);
                wm.innerHTML = `<div style="transform: rotate(-45deg); font-size: 150px; font-weight: 800; color: ${esc(color)}; opacity: 0.3; white-space: nowrap; user-select: none;">${esc(text)}</div>`;
                watermark = true;
            }
        }

        return { blocks: Array.isArray(spec.blocks) ? spec.blocks.length : 0, header, watermark, opCount: built.ops.length };
    }

    return { buildDelta, buildHeaderFooter, apply, MAX_TABLE_ROWS, MAX_TABLE_COLS };
});
