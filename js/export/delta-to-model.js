/**
 * delta-to-model.js — čistý převod Quill Delta → dokumentový MODEL (viz
 * model-to-docx.js). Bez závislosti na Quillu/DOM → plně testovatelné.
 *
 * Mapuje Quillovské inline atributy (bold/italic/underline/strike/script/color/
 * size/link) i vlastní formáty editoru:
 *   • `insertion` / `deletion` (bool nebo {author,date}) → sledované změny,
 *   • embed `{footnote:{id,text,number}}` nebo stejnojmenný inline atribut → poznámka,
 *   • embed `{toc:true}` → odstavec typu obsah.
 *
 * Blokové atributy (header/list/align/indent/blockquote) se berou z operace, která
 * nese ukončující `\n` daného odstavce — přesně jak je Quill emituje.
 */
'use strict';

function _num(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

// Quill 'size' může být '14px', '14', nebo pojmenované ('small'|'large'|'huge').
function _size(v) {
    if (v == null) return null;
    const s = String(v).trim();
    const named = { small: 10, normal: null, large: 14, huge: 24 };
    if (Object.prototype.hasOwnProperty.call(named, s)) return named[s];
    const m = s.match(/^(\d+(?:\.\d+)?)\s*px$/i) || s.match(/^(\d+(?:\.\d+)?)$/);
    if (m) return Math.round(parseFloat(m[1]) * 0.75); // px → pt
    return null;
}

function _color(v) {
    if (!v) return null;
    const s = String(v).trim();
    return /^#?[0-9a-fA-F]{6}$/.test(s) ? s.replace('#', '') : null;
}

// Sledovaná změna z atributu (podpora starého boolean i nového objektu s autorem).
function _change(attr) {
    const src = attr.insertion ? 'ins' : (attr.deletion ? 'del' : null);
    if (!src) return null;
    const meta = attr.insertion && typeof attr.insertion === 'object' ? attr.insertion
        : (attr.deletion && typeof attr.deletion === 'object' ? attr.deletion : {});
    return { type: src, author: meta.author || attr.changeAuthor || null, date: meta.date || attr.changeDate || null, id: meta.id || null };
}

function _makeRun(text, attr) {
    attr = attr || {};
    const run = { text: text };
    if (attr.bold) run.bold = true;
    if (attr.italic) run.italic = true;
    if (attr.underline) run.underline = true;
    if (attr.strike) run.strike = true;
    if (attr.script === 'super' || attr.script === 'sub') run.script = attr.script;
    const c = _color(attr.color); if (c) run.color = c;
    const sz = _size(attr.size); if (sz) run.size = sz;
    if (attr.link) run.link = String(attr.link);
    const ch = _change(attr); if (ch) run.change = ch;
    return run;
}

function _blockType(attr) {
    if (attr.header) {
        const h = _num(attr.header);
        if (h >= 1 && h <= 4) return 'h' + h;
    }
    return 'normal';
}

/**
 * Převede Quill Delta ({ops:[...]}) na pole odstavců modelu.
 * Vrací { paragraphs, footnotes, hasUnsupported }.
 * `footnotes` je mapa numerickeId → [Para] (tělo poznámky).
 */
function deltaToParagraphs(delta, startFootnoteId) {
    const ops = (delta && delta.ops) || [];
    const paragraphs = [];
    const footnotes = {};
    const comments = {};            // numericId → { author, date, body }
    const commentMap = {};          // zdrojové id komentáře → numericId
    let commentCounter = 0;         // komentáře v OOXML číslují od 0
    let fnCounter = startFootnoteId || 1;
    let hasUnsupported = false;

    const resolveComment = (c) => {
        const src = c.id || ('c:' + (c.text || c.body || '') + ':' + (c.author || ''));
        if (commentMap[src] != null) return commentMap[src];
        const id = commentCounter++;
        commentMap[src] = id;
        comments[id] = { author: c.author || 'Advokát', date: c.date || null, body: String(c.text || c.body || '') };
        return id;
    };

    let runs = [];
    const flush = (attr) => {
        attr = attr || {};
        const para = {
            type: _blockType(attr),
            align: attr.align || null,
            list: attr.list === 'ordered' || attr.list === 'bullet' ? attr.list : null,
            indent: (_num(attr.indent) || 0) + (attr.blockquote ? 1 : 0),
            runs: runs
        };
        paragraphs.push(para);
        runs = [];
    };

    const addFootnote = (fnValue) => {
        const id = fnCounter++;
        const body = (fnValue && (fnValue.text || fnValue.body)) || '';
        footnotes[id] = [{ type: 'normal', runs: [{ text: String(body) }] }];
        runs.push({ text: '', footnoteId: id });
    };

    ops.forEach(op => {
        const attr = op.attributes || {};
        if (typeof op.insert === 'string') {
            const parts = op.insert.split('\n');
            parts.forEach((part, i) => {
                if (part) {
                    // Inline atribut 'footnote' (varianta, kdy je poznámka Inline blot).
                    if (attr.footnote && typeof attr.footnote === 'object') {
                        addFootnote(attr.footnote);
                    } else {
                        const run = _makeRun(part, attr);
                        if (attr.comment && typeof attr.comment === 'object') {
                            run.commentId = resolveComment(attr.comment);
                        }
                        runs.push(run);
                    }
                }
                if (i < parts.length - 1) flush(attr);
            });
        } else if (op.insert && typeof op.insert === 'object') {
            if (op.insert.footnote) {
                addFootnote(op.insert.footnote);
            } else if (op.insert.toc) {
                if (runs.length) flush(attr);
                paragraphs.push({ type: 'toc', runs: [] });
            } else if (op.insert.image) {
                // Obrázek (Quill embed) → image run; rozměry/typ dořeší model-to-docx.
                runs.push({ image: op.insert.image });
            } else {
                // video, vzorec apod. — v nativním exportu (zatím) nepodporováno.
                hasUnsupported = true;
            }
        }
    });
    // Zbytek bez koncového \n.
    if (runs.length) flush({});

    return { paragraphs, footnotes, comments, hasUnsupported };
}

// Hlavička/patička jsou v editoru prosté HTML divy (ne Quill) — do modelu je
// bereme jako textové řádky (pole stringů) a děláme z nich prosté odstavce.
function _linesToParas(lines) {
    if (!Array.isArray(lines)) return null;
    const clean = lines.map(l => String(l == null ? '' : l));
    if (!clean.length) return null;
    return clean.map(line => ({ type: 'normal', runs: [{ text: line }] }));
}

/**
 * Sestaví kompletní MODEL z hlavního Delta + volitelných řádků hlavičky/patičky.
 * @param main   Delta těla dokumentu
 * @param opts   { title, headerLines:[string], footerLines:[string] }
 */
function deltaToModel(main, opts) {
    opts = opts || {};
    const body = deltaToParagraphs(main, 1);
    let hasUnsupported = body.hasUnsupported;

    const header = _linesToParas(opts.headerLines);
    const footer = _linesToParas(opts.footerLines);

    return {
        title: opts.title || '',
        header: header,
        footer: footer,
        footnotes: body.footnotes,
        comments: body.comments || {},
        body: body.paragraphs,
        hasUnsupported: hasUnsupported
    };
}

// Detekce, zda dokument obsahuje konstrukce, kvůli kterým má smysl nativní cesta
// (poznámky / sledované změny / obsah). Jinak stačí html-to-docx.
function needsNativeExport(delta) {
    const ops = (delta && delta.ops) || [];
    return ops.some(op => {
        const a = op.attributes || {};
        if (a.insertion || a.deletion || a.footnote || a.comment) return true;
        if (op.insert && typeof op.insert === 'object' && (op.insert.footnote || op.insert.toc)) return true;
        return false;
    });
}

module.exports = { deltaToModel, deltaToParagraphs, needsNativeExport, _makeRun, _size, _color };
