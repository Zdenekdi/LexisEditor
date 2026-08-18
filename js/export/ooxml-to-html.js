/**
 * ooxml-to-html.js — čtečka .docx (OOXML) → HTML pro editor, se zachováním
 * SLEDOVANÝCH ZMĚN (w:ins/w:del) a POZNÁMEK POD ČAROU, které mammoth zahazuje.
 * Čistá funkce (regex nad XML), plně testovatelná; běží v hlavním procesu.
 *
 * Rozsah (záměrně cílený na to, co mammoth neumí + běžné formátování):
 * odstavce, nadpisy (Heading/Nadpis 1–4), zarovnání, tučné/kurzíva/podtržení/
 * přeškrtnutí, w:ins → <span class="ql-insertion">, w:del → <span class="ql-deletion">,
 * footnoteReference → <sup class="footnote-ref" data-text="…">. Tabulky/obrázky
 * tato cesta neřeší — proto se používá jen pro dokumenty s revizemi/poznámkami;
 * ostatní jdou přes mammoth (viz importDocument).
 */
'use strict';

function _decode(s) {
    return String(s == null ? '' : s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function _escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _escAttr(s) {
    return _escHtml(s).replace(/"/g, '&quot;');
}

// word/footnotes.xml → mapa numerickeId → text (id ≤ 0 jsou oddělovače, přeskočit).
function parseFootnotes(fnXml) {
    const map = {};
    if (!fnXml) return map;
    const re = /<w:footnote\b[^>]*w:id="(-?\d+)"[^>]*>([\s\S]*?)<\/w:footnote>/g;
    let m;
    while ((m = re.exec(fnXml)) !== null) {
        const id = parseInt(m[1], 10);
        if (!(id > 0)) continue;
        map[id] = _extractText(m[2]);
    }
    return map;
}
function _extractText(xml) {
    const parts = [];
    const re = /<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g;
    let m;
    while ((m = re.exec(xml)) !== null) parts.push(_decode(m[1]));
    return parts.join('');
}

function _runToHtml(runXml, footnotes) {
    const fnr = runXml.match(/<w:footnoteReference\b[^>]*w:id="(-?\d+)"/);
    if (fnr) {
        const id = parseInt(fnr[1], 10);
        const body = footnotes[id] || '';
        return `<sup class="footnote-ref" data-id="fn-${id}" data-text="${_escAttr(body)}" title="${_escAttr(body)}">${id}</sup>`;
    }
    const rPr = (runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [])[1] || '';
    const bold = /<w:b\b(?![a-zA-Z])(?![^>]*w:val="(?:0|false)")/.test(rPr);
    const italic = /<w:i\b(?![a-zA-Z])(?![^>]*w:val="(?:0|false)")/.test(rPr);
    const underline = /<w:u\b/.test(rPr);
    const strike = /<w:strike\b(?![^>]*w:val="(?:0|false)")/.test(rPr);

    let text = '';
    const tre = /<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g;
    let tm;
    while ((tm = tre.exec(runXml)) !== null) text += _decode(tm[1]);
    if (!text) return '';

    let h = _escHtml(text);
    if (bold) h = `<strong>${h}</strong>`;
    if (italic) h = `<em>${h}</em>`;
    if (underline) h = `<u>${h}</u>`;
    if (strike) h = `<s>${h}</s>`;
    return h;
}

// word/comments.xml → mapa id → { author, date, body }.
function parseComments(cXml) {
    const map = {};
    if (!cXml) return map;
    const re = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g;
    let m;
    while ((m = re.exec(cXml)) !== null) {
        const id = (m[1].match(/w:id="(-?\d+)"/) || [])[1];
        if (id == null) continue;
        const author = (m[1].match(/w:author="([^"]*)"/) || [])[1] || '';
        map[id] = { author: _decode(author), body: _extractText(m[2]) };
    }
    return map;
}

// Sekvenčně projde obsah odstavce a v pořadí zpracuje w:ins / w:del / w:r a
// obalený rozsah komentáře (commentwrap, vzniklý v pre-passu _paragraphToHtml).
function _processInline(xml, ctx) {
    let out = '';
    const re = /<w:(ins|del|r|commentwrap)\b([^>]*)>([\s\S]*?)<\/w:\1>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const tag = m[1];
        if (tag === 'r') out += _runToHtml(m[0], ctx.footnotes);
        else if (tag === 'ins') out += `<span class="ql-insertion">${_processInline(m[3], ctx)}</span>`;
        else if (tag === 'del') out += `<span class="ql-deletion">${_processInline(m[3], ctx)}</span>`;
        else if (tag === 'commentwrap') {
            const id = (m[2].match(/w:id="(\d+)"/) || [])[1];
            const c = (ctx.comments && ctx.comments[id]) || {};
            const tip = (c.author ? c.author + ': ' : '') + (c.body || '');
            out += `<span class="comment-highlight" data-comment-id="${id}" data-comment-author="${_escAttr(c.author || '')}" data-comment-text="${_escAttr(c.body || '')}" title="${_escAttr(tip)}">${_processInline(m[3], ctx)}</span>`;
        }
    }
    return out;
}

function _paragraphToHtml(pXml, ctx) {
    const pPr = (pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || '';
    const styleVal = (pPr.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/) || [])[1] || '';
    const jc = (pPr.match(/<w:jc\b[^>]*w:val="([^"]+)"/) || [])[1] || '';

    // Obsah odstavce = vše za </w:pPr> (nebo celé, pokud pPr chybí).
    let content = pXml;
    const end = pXml.indexOf('</w:pPr>');
    if (end >= 0) content = pXml.slice(end + '</w:pPr>'.length);

    // Pre-pass: obal rozsah komentáře (v rámci odstavce) do <w:commentwrap>.
    content = content.replace(
        /<w:commentRangeStart\b[^>]*w:id="(\d+)"\s*\/>([\s\S]*?)<w:commentRangeEnd\b[^>]*w:id="\1"\s*\/>/g,
        (mm, id, inner) => `<w:commentwrap w:id="${id}">${inner}</w:commentwrap>`
    );

    const body = _processInline(content, ctx) || '<br>';
    const alignMap = { center: 'center', right: 'right', both: 'justify', justify: 'justify' };
    const align = alignMap[jc];
    const styleAttr = align ? ` style="text-align:${align}"` : '';

    let tag = 'p';
    const hm = styleVal.match(/(?:Heading|Nadpis)\s*([1-4])/i);
    if (hm) tag = 'h' + hm[1];
    return `<${tag}${styleAttr}>${body}</${tag}>`;
}

function ooxmlToHtml(docXml, fnXml, commentsXml) {
    const ctx = { footnotes: parseFootnotes(fnXml), comments: parseComments(commentsXml) };
    const bodyM = docXml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/);
    const body = bodyM ? bodyM[1] : docXml;
    let html = '';
    const pre = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    let pm;
    while ((pm = pre.exec(body)) !== null) {
        html += _paragraphToHtml(pm[0], ctx);
    }
    return html || '<p><br></p>';
}

// Prostý text dokumentu (řádek na odstavec) — pro porovnání verzí (Compare).
function ooxmlToText(docXml) {
    const bodyM = docXml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/);
    const body = bodyM ? bodyM[1] : docXml;
    const lines = [];
    const pre = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    let pm;
    while ((pm = pre.exec(body)) !== null) lines.push(_extractText(pm[0]));
    return lines.join('\n');
}

module.exports = { ooxmlToHtml, ooxmlToText, parseFootnotes, parseComments };
