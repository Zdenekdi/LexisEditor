/**
 * model-to-docx.js — převod normalizovaného dokumentového MODELU na .docx buffer
 * pomocí knihovny `docx` (OOXML). Běží v hlavním procesu (Node).
 *
 * Tohle je „druhá exportní cesta" vedle html-to-docx: na rozdíl od něj umí
 * wordovské konstrukce, které právní práce potřebuje a html-to-docx neumí:
 *   • SLEDOVÁNÍ ZMĚN — InsertedTextRun/DeletedTextRun → w:ins / w:del (autor+datum),
 *   • POZNÁMKY POD ČAROU — Document.footnotes + FootnoteReferenceRun → word/footnotes.xml,
 *   • OBSAH (TOC) — TableOfContents → pole { TOC }, které Word přepočítá.
 *
 * Vstupní MODEL (viz delta-to-model.js) je čistě datový a nezávislý na Quillu:
 *   { title, header:[Para]|null, footer:[Para]|null, footnotes:{id:[Para]}, body:[Para] }
 *   Para = { type:'normal'|'h1..h4'|'toc', align, list:'ordered'|'bullet'|null, indent, runs:[Run] }
 *   Run  = { text, bold, italic, underline, strike, script, color, size, link,
 *            change:{type:'ins'|'del',author,date,id}|null, footnoteId:number|null }
 */
'use strict';

const docx = require('docx');
const {
    Document, Packer, Paragraph, TextRun, InsertedTextRun, DeletedTextRun,
    FootnoteReferenceRun, ExternalHyperlink, TableOfContents, HeadingLevel,
    AlignmentType, LevelFormat, PageNumber, Header, Footer, ImageRun,
    CommentRangeStart, CommentRangeEnd, CommentReference,
    Table, TableRow, TableCell, WidthType, BorderStyle, ImportedXmlComponent
} = docx;

// XML/VML escape (atributy i text). VML „string" je atribut → escapujeme i uvozovky.
function _xmlEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Vodoznak jako wordovský WordArt (VML shape type #_x0000_t136) — stejný útvar,
// jaký generuje funkce „Vodoznak" ve Wordu: úhlopříčně přes stránku, za textem,
// opakuje se na každé stránce (proto patří do hlavičky). Vrací ImportedXmlComponent,
// nebo null když není co vykreslit. Barva = 6-místný hex bez #, jinak výchozí šeď.
function _watermarkChild(wm) {
    if (!wm || wm.type !== 'text') return null;
    const text = String(wm.text == null ? '' : wm.text).trim();
    if (!text) return null;
    let color = String(wm.color || '').replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(color)) color = 'd0d0d0';
    const font = wm.font ? String(wm.font) : 'Times New Roman';
    const vml =
        '<w:p><w:r><w:pict>' +
        '<v:shape id="LexisWatermark" o:spid="_x0000_s2049" type="#_x0000_t136" ' +
        'style="position:absolute;margin-left:0;margin-top:0;width:468pt;height:100pt;' +
        'rotation:315;z-index:-251654144;mso-position-horizontal:center;' +
        'mso-position-horizontal-relative:margin;mso-position-vertical:center;' +
        'mso-position-vertical-relative:margin" fillcolor="#' + color + '" stroked="f">' +
        '<v:fill opacity=".5"/>' +
        '<v:textpath style="font-family:&quot;' + _xmlEsc(font) + '&quot;;font-size:1pt" ' +
        'string="' + _xmlEsc(text) + '"/>' +
        '</v:shape>' +
        '</w:pict></w:r></w:p>';
    try {
        return ImportedXmlComponent.fromXmlString(vml);
    } catch (e) {
        return null;
    }
}

const _TBL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const _TBL_BORDERS = {
    top: _TBL_BORDER, bottom: _TBL_BORDER, left: _TBL_BORDER, right: _TBL_BORDER,
    insideHorizontal: _TBL_BORDER, insideVertical: _TBL_BORDER
};

// Výchozí písmo dokumentu — Times New Roman 12 (český soudní standard). Řeší i
// nesoulad s html-to-docx cestou (ta má TNR), aby text bez explicitního písma
// nevyšel jednou cestou Calibri a druhou TNR.
const DEFAULT_STYLES = {
    default: {
        document: { run: { font: 'Times New Roman', size: 24 } }
    }
};

// Zjistí typ, data a rozměry obrázku z data-URL (bez závislostí). Šířku omezí na
// obsahovou šířku A4 (≈ 468 pt) se zachováním poměru stran.
function _imageInfo(dataUrl) {
    const m = /^data:image\/(png|jpe?g|gif|bmp);base64,([\s\S]+)$/i.exec(String(dataUrl || ''));
    if (!m) return null;
    let type = m[1].toLowerCase();
    if (type === 'jpeg') type = 'jpg';
    const buffer = Buffer.from(m[2], 'base64');
    let width = 0, height = 0;
    try {
        if (type === 'png' && buffer.length > 24) {
            width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
        } else if (type === 'gif' && buffer.length > 10) {
            width = buffer.readUInt16LE(6); height = buffer.readUInt16LE(8);
        } else if (type === 'jpg') {
            let i = 2;
            while (i < buffer.length - 9) {
                if (buffer[i] !== 0xFF) { i++; continue; }
                const marker = buffer[i + 1];
                if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
                    height = buffer.readUInt16BE(i + 5); width = buffer.readUInt16BE(i + 7); break;
                }
                i += 2 + buffer.readUInt16BE(i + 2);
            }
        }
    } catch (e) { /* fallback níže */ }
    if (!width || !height) { width = 400; height = 300; }
    const MAXW = 468;
    if (width > MAXW) { height = Math.round(height * MAXW / width); width = MAXW; }
    return { buffer, type: type, width, height };
}

// A4 (210×297 mm) a okraje 2,5 cm v twip — shodné s buildDocxOptions v main.js.
const PAGE = {
    size: { width: 11906, height: 16838 },
    margin: { top: 1417, right: 1417, bottom: 1417, left: 1417, header: 708, footer: 708 }
};

const HEADINGS = {
    h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4
};
const ALIGN = {
    left: AlignmentType.LEFT, center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED
};

const OL_REF = 'lexis-ordered';

// --- Run → docx run ---------------------------------------------------------
function runProps(run) {
    const p = {};
    if (run.bold) p.bold = true;
    if (run.italic) p.italics = true;
    if (run.underline) p.underline = {};
    if (run.strike) p.strike = true;
    if (run.script === 'super') p.superScript = true;
    if (run.script === 'sub') p.subScript = true;
    if (run.color) p.color = String(run.color).replace('#', '');
    if (run.size) p.size = Math.round(run.size * 2); // pt → half-points
    return p;
}

function buildRun(run) {
    // Poznámka pod čarou: reference (číslo se generuje automaticky).
    if (run.footnoteId != null) {
        return new FootnoteReferenceRun(run.footnoteId);
    }
    // Obrázek (Quill embed → ImageRun; vloží se do word/media).
    if (run.image) {
        const info = _imageInfo(run.image);
        if (info) {
            return new ImageRun({ data: info.buffer, transformation: { width: info.width, height: info.height }, type: info.type });
        }
        return new TextRun('');
    }
    const text = run.text != null ? String(run.text) : '';
    const base = Object.assign({ text: text }, runProps(run));

    // Sledovaná změna → w:ins / w:del s autorem a datem.
    if (run.change && run.change.type === 'ins') {
        return new InsertedTextRun(Object.assign({}, base, {
            id: run.change.id || 1, author: run.change.author || 'LexisEditor', date: run.change.date || undefined
        }));
    }
    if (run.change && run.change.type === 'del') {
        return new DeletedTextRun(Object.assign({}, base, {
            id: run.change.id || 1, author: run.change.author || 'LexisEditor', date: run.change.date || undefined
        }));
    }

    const plain = new TextRun(base);
    // Hypertextový odkaz obalí run.
    if (run.link) {
        return new ExternalHyperlink({ children: [plain], link: run.link });
    }
    return plain;
}

// --- Tabulka → docx Table (100 % šířky, plné ohraničení) --------------------
function buildTable(el) {
    const rows = (el.rows || []).map(cells => new TableRow({
        children: (cells || []).map(cell => new TableCell({
            children: [new Paragraph({ children: buildRunsWithComments(cell.runs || []) })]
        }))
    }));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: _TBL_BORDERS,
        rows: rows.length ? rows : [new TableRow({ children: [new TableCell({ children: [new Paragraph('')] })] })]
    });
}

// --- Para → docx Paragraph --------------------------------------------------
function buildParagraph(para) {
    if (para.type === 'table') {
        return buildTable(para);
    }
    if (para.type === 'toc') {
        return new TableOfContents('Obsah', { hyperlink: true, headingStyleRange: '1-3' });
    }
    const opts = { children: buildRunsWithComments(para.runs) };
    if (HEADINGS[para.type]) opts.heading = HEADINGS[para.type];
    if (para.align && ALIGN[para.align]) opts.alignment = ALIGN[para.align];
    if (para.list === 'bullet') opts.bullet = { level: Math.min(para.indent || 0, 8) };
    else if (para.list === 'ordered') opts.numbering = { reference: OL_REF, level: Math.min(para.indent || 0, 8) };
    else if (para.indent) opts.indent = { left: para.indent * 720 }; // 0,5" na úroveň
    return new Paragraph(opts);
}

// Sestaví běhy odstavce a kolem souvislých běhů se stejným commentId vloží
// značky komentáře (CommentRangeStart/End + reference) → Word komentář.
function buildRunsWithComments(runs) {
    const children = [];
    let open = null;
    const close = () => {
        children.push(new CommentRangeEnd(open));
        children.push(new TextRun({ children: [new CommentReference(open)] }));
    };
    (runs || []).forEach(r => {
        const cid = (r.commentId != null) ? r.commentId : null;
        if (cid !== open) {
            if (open != null) close();
            if (cid != null) children.push(new CommentRangeStart(cid));
            open = cid;
        }
        children.push(buildRun(r));
    });
    if (open != null) close();
    return children;
}

function buildParas(arr) {
    return (arr || []).map(buildParagraph);
}

// --- Poznámky pod čarou -----------------------------------------------------
function buildFootnotes(footnotes) {
    const out = {};
    Object.keys(footnotes || {}).forEach(id => {
        out[id] = { children: buildParas(footnotes[id]) };
    });
    return out;
}

/**
 * Sestaví .docx buffer z modelu. Vrací Promise<Buffer>.
 */
// Word komentáře (word/comments.xml). Datum se převádí na Date (běží v Node).
function buildComments(comments) {
    const children = [];
    Object.keys(comments || {}).forEach(id => {
        const c = comments[id] || {};
        children.push({
            id: parseInt(id, 10),
            author: c.author || 'Advokát',
            date: c.date ? new Date(c.date) : new Date(),
            children: [new Paragraph({ children: [new TextRun(String(c.body || ''))] })]
        });
    });
    return children;
}

function modelToDocxBuffer(model) {
    model = model || {};
    const footnotes = buildFootnotes(model.footnotes);
    const commentsChildren = buildComments(model.comments);

    const sectionChildren = buildParas(model.body && model.body.length ? model.body : [{ type: 'normal', runs: [{ text: '' }] }]);

    // Hlavička = případný vodoznak (za textem, opakuje se na každé stránce) + text hlavičky.
    const wmChild = _watermarkChild(model.watermark);
    const headerParas = (model.header && model.header.length) ? buildParas(model.header) : [];
    const headerChildren = wmChild ? [wmChild].concat(headerParas) : headerParas;
    const headers = headerChildren.length
        ? { default: new Header({ children: headerChildren }) } : undefined;
    // Zápatí: buď z modelu, nebo aspoň číslo stránky (parita s dosavadním pageNumber:true).
    const footerChildren = model.footer && model.footer.length
        ? buildParas(model.footer)
        : [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun('Strana '), new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(' z '), new TextRun({ children: [PageNumber.TOTAL_PAGES] })
            ]
        })];

    const doc = new Document({
        creator: 'LexisEditor',
        title: model.title || '',
        styles: DEFAULT_STYLES, // výchozí Times New Roman 12
        features: { updateFields: true }, // Word po otevření přepočítá TOC
        numbering: {
            config: [{
                reference: OL_REF,
                // Víceúrovňové právní číslování: kumulativní „1. / 1.1. / 1.1.1."
                // (úroveň l zobrazí %1.%2.…%(l+1)). Odsazení roste s úrovní.
                levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(l => ({
                    level: l,
                    format: LevelFormat.DECIMAL,
                    text: Array.from({ length: l + 1 }, (_, k) => `%${k + 1}`).join('.') + '.',
                    alignment: AlignmentType.START,
                    style: { paragraph: { indent: { left: (l + 1) * 720, hanging: 360 } } }
                }))
            }]
        },
        footnotes: footnotes,
        comments: commentsChildren.length ? { children: commentsChildren } : undefined,
        sections: [{
            properties: { page: { size: PAGE.size, margin: PAGE.margin } },
            headers: headers,
            footers: { default: new Footer({ children: footerChildren }) },
            children: sectionChildren
        }]
    });

    return Packer.toBuffer(doc);
}

module.exports = { modelToDocxBuffer, PAGE };
