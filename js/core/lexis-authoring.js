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
    let _idSeq = 0;
    function _genId() { return 'b' + (++_idSeq).toString(36); }
    function _pushNewline(ops, attrs, bid) {
        const a = Object.assign({}, attrs || {});
        if (bid) a.blockId = bid;
        ops.push(Object.keys(a).length ? { insert: '\n', attributes: a } : { insert: '\n' });
    }

    // Normalizace odstavce: buď `runs`, nebo prosté `text`.
    function _runsOf(block) {
        if (Array.isArray(block.runs) && block.runs.length) return block.runs;
        return [{ text: _str(block.text) }];
    }

    // Římská číslice (1. úroveň nadpisů).
    function _roman(n) {
        const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
        let r = ''; n = Math.max(0, Math.floor(n));
        for (const pair of map) { while (n >= pair[0]) { r += pair[1]; n -= pair[0]; } }
        return r || '0';
    }
    // Očísluje nadpisy: 1. úroveň římsky (I, II…), hlubší arabsky (II.1, II.1.1).
    // Vrací { byBlock: Map(blockObj→number), byId: { id→{number,text} } }.
    function _numberHeadings(blocks) {
        const counters = [0, 0, 0, 0, 0, 0];
        const byBlock = new Map();
        const byId = {};
        for (const b of blocks) {
            if (!b || b.type !== 'heading') continue;
            let L = parseInt(b.level, 10); if (!(L >= 1 && L <= 6)) L = 1;
            counters[L - 1]++;
            for (let l = L; l < 6; l++) counters[l] = 0;
            const parts = [];
            for (let l = 1; l <= L; l++) parts.push(l === 1 ? _roman(counters[0]) : String(counters[l - 1]));
            const number = parts.join('.');
            byBlock.set(b, number);
            if (b.id) byId[b.id] = { number: number, text: _str(b.text) };
        }
        return { byBlock: byBlock, byId: byId };
    }

    // Zdroj rozpoznávání citací (Node: require; prohlížeč: window.LexisCitations).
    function _citations() {
        if (typeof require === 'function') { try { return require('./lexis-citations'); } catch (e) { /* ignore */ } }
        return (typeof window !== 'undefined' ? window.LexisCitations : null);
    }

    // Posbírá veškerý text ze spec (pro seznam citované judikatury).
    function _collectText(spec) {
        const parts = [];
        if (spec.title) parts.push(_str(spec.title));
        const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
        for (const b of blocks) {
            if (!b || typeof b !== 'object') continue;
            if (b.text) parts.push(_str(b.text));
            if (Array.isArray(b.runs)) for (const r of b.runs) parts.push(_str(r && r.text));
            if (b.footnote) parts.push(_str(b.footnote));
            if (Array.isArray(b.items)) parts.push(b.items.map(_str).join(' '));
            if (Array.isArray(b.cells)) for (const row of b.cells) if (Array.isArray(row)) parts.push(row.map(_str).join(' '));
        }
        return parts.join('\n');
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
        const numbering = _numberHeadings(blocks);
        const numberOn = !!spec.numberHeadings;
        for (const block of blocks) {
            if (!block || typeof block !== 'object') continue;
            const type = block.type || 'paragraph';
            const _bid = block.id || _genId();

            if (type === 'heading') {
                let lvl = parseInt(block.level, 10); if (!(lvl >= 1 && lvl <= 6)) lvl = 1;
                const num = numbering.byBlock.get(block);
                const prefix = (numberOn && num) ? (num + (lvl === 1 ? '. ' : ' ')) : '';
                _pushText(ops, prefix + _str(block.text));
                _pushNewline(ops, { header: lvl }, _bid);

            } else if (type === 'paragraph') {
                for (const run of _runsOf(block)) {
                    if (run && run.ref) {
                        const target = numbering.byId[run.ref];
                        const val = target ? (run.as === 'title' ? target.text : target.number) : '?';
                        _pushText(ops, _str(val), _inlineAttrs(run));
                    } else {
                        _pushText(ops, _str(run.text), _inlineAttrs(run));
                    }
                }
                if (block.footnote != null && _str(block.footnote).trim() !== '') {
                    ops.push({ insert: { footnote: { id: 'fn-' + (++fnCounter), text: _str(block.footnote), number: '?' } } });
                }
                _pushNewline(ops, _blockAttrs(block), _bid);

            } else if (type === 'list') {
                const ordered = !!block.ordered;
                const items = Array.isArray(block.items) ? block.items : [];
                for (const it of items) {
                    _pushText(ops, _str(it));
                    _pushNewline(ops, { list: ordered ? 'ordered' : 'bullet' }, _bid);
                }

            } else if (type === 'table') {
                let r = Math.max(1, Math.min(parseInt(block.rows, 10) || (Array.isArray(block.cells) ? block.cells.length : 3), MAX_TABLE_ROWS));
                let c = Math.max(1, Math.min(parseInt(block.cols, 10) || (Array.isArray(block.cells) && block.cells[0] ? block.cells[0].length : 3), MAX_TABLE_COLS));
                const cells = Array.isArray(block.cells) ? block.cells : null;
                const grid = Array.from({ length: r }, (_, i) =>
                    Array.from({ length: c }, (_, j) => _str(cells && cells[i] ? cells[i][j] : '')));
                ops.push({ insert: { table: { rows: grid } } });
                _pushNewline(ops, {}, _bid);

            } else if (type === 'toc') {
                ops.push({ insert: { toc: true } });
                _pushNewline(ops, {}, _bid);

            } else if (type === 'footnote') {
                ops.push({ insert: { footnote: { id: 'fn-' + (++fnCounter), text: _str(block.text), number: '?' } } });
                _pushNewline(ops, {}, _bid);

            } else if (type === 'authorities') {
                const C = _citations();
                const title = (block.title != null && _str(block.title).trim() !== '') ? _str(block.title) : 'Seznam citované judikatury';
                _pushText(ops, title);
                _pushNewline(ops, { header: 2 }, _bid);
                const list = C ? C.buildAuthorities(_collectText(spec)).items : [];
                if (list.length === 0) {
                    _pushText(ops, 'Žádná judikatura nebyla citována.');
                    _pushNewline(ops, {});
                } else {
                    for (const item of list) { _pushText(ops, item); _pushNewline(ops, { list: 'bullet' }); }
                }

            } else if (type === 'pageBreak') {
                ops.push({ insert: { 'page-break': true } });
                _pushNewline(ops, {}, _bid);
            }
        }

        // Označení AI (EU AI Act, čl. 50): volitelná viditelná doložka na konec dokumentu.
        if (spec.aiDisclosure) {
            const txt = (typeof spec.aiDisclosure === 'string' && spec.aiDisclosure.trim())
                ? _str(spec.aiDisclosure)
                : 'Tento dokument byl vytvořen s asistencí umělé inteligence; obsah prošel kontrolou a redakční odpovědnost nese advokát.';
            _pushText(ops, txt, { italic: true });
            _pushNewline(ops, {});
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
        } else if (spec && spec.letterheadHtml && doc) {
            // Round-trip .docx: obnov PŘESNĚ zachycenou hlavičku/patičku (readSpec →
            // letterheadHtml), aby se uložením do .docx a opětovným otevřením neztratila.
            const h = doc.getElementById('header-area');
            const f = doc.getElementById('footer-area');
            if (h && spec.letterheadHtml.headerHtml != null) { h.innerHTML = sanitize(spec.letterheadHtml.headerHtml); header = true; }
            if (f && spec.letterheadHtml.footerHtml != null) { f.innerHTML = sanitize(spec.letterheadHtml.footerHtml); }
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

        // Strojově čitelné označení AI původu (EU AI Act, čl. 50) — export může přečíst.
        let aiMarked = false;
        if (spec && spec.aiDisclosure && doc) {
            const wrap = doc.getElementById('editor-wrapper');
            if (wrap) { wrap.setAttribute('data-ai-assisted', 'true'); aiMarked = true; }
        }

        return { blocks: Array.isArray(spec.blocks) ? spec.blocks.length : 0, header, watermark, aiMarked, opCount: built.ops.length };
    }

    // ===== READ API: Delta → spec (inverzní k buildDelta) =====
    function _run(text, attrs) {
        const r = { text };
        if (attrs.bold) r.bold = true;
        if (attrs.italic) r.italic = true;
        if (attrs.underline) r.underline = true;
        if (attrs.link) r.link = _str(attrs.link);
        return r;
    }
    function _joinText(runs) { return runs.map(r => r.text).join(''); }
    function _makeParagraph(runs, align) {
        const block = { type: 'paragraph' };
        const formatted = runs.some(r => r.bold || r.italic || r.underline || r.link);
        if (runs.length <= 1 && !formatted) block.text = _joinText(runs);
        else block.runs = runs;
        if (align && align !== 'left') block.align = align;
        return block;
    }

    // Zrekonstruuje spec.blocks z Quill Delta ops. Prázdné odstavce (jen mezery)
    // vynechá; hlavička/patička a vodoznak se čtou zvlášť v readSpec z DOM.
    function deltaToSpec(ops) {
        ops = Array.isArray(ops) ? ops : [];
        const blocks = [];
        let lineRuns = [];
        let pendingFootnote = null;
        let listBuffer = null;

        function flushList() { if (listBuffer) { const lb = { type: 'list', ordered: listBuffer.ordered, items: listBuffer.items }; if (listBuffer.id) lb.id = listBuffer.id; blocks.push(lb); listBuffer = null; } }

        function endLine(battrs) {
            battrs = battrs || {};
            if (battrs.header) {
                flushList();
                const hb = { type: 'heading', level: battrs.header, text: _joinText(lineRuns) };
                if (battrs.blockId) hb.id = battrs.blockId;
                blocks.push(hb);
            } else if (battrs.list) {
                const ordered = battrs.list === 'ordered';
                const item = _joinText(lineRuns);
                const _bid = battrs.blockId;
                if (listBuffer && listBuffer.ordered === ordered && listBuffer.id === _bid) listBuffer.items.push(item);
                else { flushList(); listBuffer = { ordered, id: _bid, items: [item] }; }
                lineRuns = [];
                return;
            } else {
                const empty0 = lineRuns.length === 0;
                // Koncový \n za embedem (tabulka/toc/pageBreak) nese blockId → připni ho embedu.
                if (empty0 && battrs.blockId && pendingFootnote == null && blocks.length) {
                    const lb = blocks[blocks.length - 1];
                    if (lb && !lb.id && (lb.type === 'table' || lb.type === 'toc' || lb.type === 'pageBreak')) {
                        lb.id = battrs.blockId; lineRuns = []; return;
                    }
                }
                flushList();
                const pp = _makeParagraph(lineRuns, battrs.align);
                const empty = !(pp.runs && pp.runs.length) && (pp.text === '' || pp.text == null);
                if (pendingFootnote != null) { pp.footnote = pendingFootnote; if (battrs.blockId) pp.id = battrs.blockId; pendingFootnote = null; blocks.push(pp); }
                else if (!empty) { if (battrs.blockId) pp.id = battrs.blockId; blocks.push(pp); }
            }
            lineRuns = [];
        }

        for (const op of ops) {
            const ins = op.insert;
            const attrs = op.attributes || {};
            if (ins && typeof ins === 'object') {
                if (ins.table) { flushList(); blocks.push({ type: 'table', cells: ins.table.rows }); }
                else if (ins.toc) { flushList(); blocks.push({ type: 'toc' }); }
                else if (ins['page-break']) { flushList(); blocks.push({ type: 'pageBreak' }); }
                else if (ins.footnote) { pendingFootnote = ins.footnote.text; }
                continue;
            }
            const segs = _str(ins).split('\n');
            for (let i = 0; i < segs.length; i++) {
                if (i < segs.length - 1) {
                    if (segs[i] !== '') lineRuns.push(_run(segs[i], attrs));
                    endLine(attrs);
                } else {
                    if (segs[i] !== '') lineRuns.push(_run(segs[i], attrs));
                }
            }
        }
        flushList();
        return { blocks };
    }

    // Runtime: přečte AKTUÁLNÍ dokument z editoru do spec (round-trip pro agenty).
    function readSpec(ctx) {
        ctx = ctx || {};
        const quill = ctx.quill || (typeof window !== 'undefined' ? window.quill : null);
        const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
        if (!quill || typeof quill.getContents !== 'function') throw new Error('readSpec: chybí quill.getContents v kontextu.');
        const contents = quill.getContents() || { ops: [] };
        const spec = deltaToSpec(contents.ops || []);
        if (doc) {
            const h = doc.getElementById('header-area');
            const f = doc.getElementById('footer-area');
            const hHtml = h ? _str(h.innerHTML).trim() : '';
            const fHtml = f ? _str(f.innerHTML).trim() : '';
            if (hHtml || fHtml) spec.letterheadHtml = { headerHtml: hHtml, footerHtml: fHtml };
            const wm = doc.getElementById('watermark-layer');
            if (wm && wm.getAttribute('data-watermark-text')) {
                spec.watermark = { text: wm.getAttribute('data-watermark-text') };
                const col = wm.getAttribute('data-watermark-color');
                if (col) spec.watermark.color = col;
            }
        }
        return spec;
    }

    // ===== Programová editace tabulek (nad blokem { type:'table', cells:[[...]] }) =====
    // Čisté operace pro agenta: přečti dokument (readSpec) → uprav tabulku → applyDocumentSpec.
    function _ensureCells(block) {
        if (!block || block.type !== 'table') throw new Error('tableOps: blok není tabulka.');
        if (!Array.isArray(block.cells)) block.cells = [];
        return block;
    }
    function _width(cells) { return cells.reduce((w, row) => Math.max(w, Array.isArray(row) ? row.length : 0), 0); }
    function _rectangularize(cells) {
        const w = _width(cells) || 1;
        for (let i = 0; i < cells.length; i++) {
            if (!Array.isArray(cells[i])) cells[i] = [];
            while (cells[i].length < w) cells[i].push('');
        }
        return cells;
    }
    const tableOps = {
        setCell(block, r, c, value) {
            _ensureCells(block);
            while (block.cells.length <= r) block.cells.push([]);
            const w = Math.max(_width(block.cells), c + 1);
            _rectangularize(block.cells);
            while (block.cells[r].length <= c) block.cells[r].push('');
            block.cells[r][c] = _str(value);
            _rectangularize(block.cells);
            return block;
        },
        addRow(block, atIndex, rowValues) {
            _ensureCells(block);
            const w = Math.max(_width(block.cells), Array.isArray(rowValues) ? rowValues.length : 0, 1);
            const row = Array.from({ length: w }, (_, j) => _str(rowValues && rowValues[j] != null ? rowValues[j] : ''));
            const idx = (atIndex == null || atIndex > block.cells.length) ? block.cells.length : Math.max(0, atIndex);
            block.cells.splice(idx, 0, row);
            _rectangularize(block.cells);
            return block;
        },
        removeRow(block, index) {
            _ensureCells(block);
            if (index >= 0 && index < block.cells.length) block.cells.splice(index, 1);
            return block;
        },
        addColumn(block, atIndex, colValues) {
            _ensureCells(block);
            _rectangularize(block.cells);
            const w = _width(block.cells);
            const idx = (atIndex == null || atIndex > w) ? w : Math.max(0, atIndex);
            block.cells.forEach((row, i) => row.splice(idx, 0, _str(colValues && colValues[i] != null ? colValues[i] : '')));
            return block;
        },
        removeColumn(block, index) {
            _ensureCells(block);
            _rectangularize(block.cells);
            block.cells.forEach(row => { if (index >= 0 && index < row.length) row.splice(index, 1); });
            return block;
        },
        dimensions(block) {
            _ensureCells(block);
            return { rows: block.cells.length, cols: _width(block.cells) };
        }
    };

    // ===== VALIDÁTOR dokumentu (agent si po zápisu ověří sám sebe) =====
    // Vrací { valid, errors:[{blockId?, index, severity:'error'|'warning', code, message}] }.
    function _blockText(b) {
        const parts = [];
        if (b.text) parts.push(_str(b.text));
        if (Array.isArray(b.runs)) for (const r of b.runs) parts.push(_str(r && r.text));
        if (b.footnote) parts.push(_str(b.footnote));
        if (Array.isArray(b.items)) parts.push(b.items.map(_str).join(' '));
        if (Array.isArray(b.cells)) for (const row of b.cells) if (Array.isArray(row)) parts.push(row.map(_str).join(' '));
        return parts.join(' ');
    }
    const KNOWN_TYPES = { heading: 1, paragraph: 1, list: 1, table: 1, toc: 1, footnote: 1, pageBreak: 1, authorities: 1 };
    function validate(spec) {
        const errors = [];
        const add = (severity, code, message, i, blockId) => errors.push({ severity, code, message, index: i, blockId: blockId || null });
        if (!spec || typeof spec !== 'object') { add('error', 'spec', 'Spec musí být objekt.', -1); return { valid: false, errors }; }
        const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
        const seenIds = new Set();

        blocks.forEach((b, i) => {
            if (!b || typeof b !== 'object') { add('error', 'block', 'Blok není objekt.', i); return; }
            const type = b.type || 'paragraph';
            const bid = b.id || null;
            if (!KNOWN_TYPES[type]) add('error', 'unknown-type', `Neznámý typ bloku „${type}".`, i, bid);
            if (bid) { if (seenIds.has(bid)) add('error', 'dup-id', `Duplicitní id bloku „${bid}".`, i, bid); seenIds.add(bid); }

            // Strukturní kontroly
            if (type === 'heading') {
                const lvl = parseInt(b.level, 10);
                if (!(lvl >= 1 && lvl <= 6)) add('error', 'heading-level', 'Úroveň nadpisu musí být 1–6.', i, bid);
                if (!_str(b.text).trim()) add('warning', 'empty-heading', 'Prázdný nadpis.', i, bid);
            }
            if (type === 'list' && !(Array.isArray(b.items) && b.items.length)) add('error', 'list-items', 'Seznam nemá položky (items).', i, bid);
            if (type === 'table') {
                if (!Array.isArray(b.cells) || !b.cells.length) add('error', 'table-cells', 'Tabulka nemá buňky (cells).', i, bid);
                else {
                    const w = b.cells[0].length;
                    if (b.cells.some(r => !Array.isArray(r) || r.length !== w)) add('error', 'table-shape', 'Řádky tabulky mají různý počet sloupců.', i, bid);
                }
            }
            // Bezpečnost odkazů
            if (Array.isArray(b.runs)) b.runs.forEach(r => {
                if (r && r.link && !/^(https?:|mailto:)/i.test(_str(r.link))) add('error', 'link-scheme', `Nepovolený odkaz „${_str(r.link).slice(0, 40)}" (jen http/https/mailto).`, i, bid);
            });

            // Právní „lint" (třída korupce, kterou popsal agent)
            const t = _blockText(b);
            if (/\[[^\]]*(doplňte|SPISOVÁ ZNAČKA|JMÉNO ADVOKÁTA|Sem doplňte|doplnit)/i.test(t))
                add('warning', 'placeholder', 'Nevyplněný zástupný text (placeholder).', i, bid);
            if (/(odst|písm|čl)\.\d/i.test(t))
                add('warning', 'glued-odst', 'Slepené „odst./písm./čl." s číslem bez mezery (možná koroze).', i, bid);
            if (/§\s*(?=[^\d\s]|$)/.test(t) && !/§\s*\d/.test(t) && /§/.test(t))
                add('warning', 'para-no-number', '„§" bez následujícího čísla.', i, bid);
        });

        return { valid: !errors.some(e => e.severity === 'error'), errors };
    }

    // ===== Inkrementální čtení (osnova → sekce) — levné pro agenta =====
    // Osnova = jen nadpisy [{id, level, text}]. Agent načte pár tokenů místo celého dokumentu.
    function outline(spec) {
        const blocks = (spec && Array.isArray(spec.blocks)) ? spec.blocks : [];
        return blocks.filter(b => b && b.type === 'heading').map(b => ({ id: b.id || null, level: b.level, text: _str(b.text) }));
    }
    // Jeden blok podle id (čtení konkrétní sekce bez načítání zbytku).
    function getBlockById(spec, id) {
        const blocks = (spec && Array.isArray(spec.blocks)) ? spec.blocks : [];
        return blocks.find(b => b && b.id === id) || null;
    }

    return { buildDelta, buildHeaderFooter, apply, deltaToSpec, readSpec, tableOps, validate, outline, getBlockById, MAX_TABLE_ROWS, MAX_TABLE_COLS };
});
