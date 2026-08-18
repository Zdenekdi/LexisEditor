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
    AlignmentType, LevelFormat, PageNumber, Header, Footer
} = docx;

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

// --- Para → docx Paragraph --------------------------------------------------
function buildParagraph(para) {
    if (para.type === 'toc') {
        return new TableOfContents('Obsah', { hyperlink: true, headingStyleRange: '1-3' });
    }
    const opts = { children: (para.runs || []).map(buildRun) };
    if (HEADINGS[para.type]) opts.heading = HEADINGS[para.type];
    if (para.align && ALIGN[para.align]) opts.alignment = ALIGN[para.align];
    if (para.list === 'bullet') opts.bullet = { level: Math.min(para.indent || 0, 8) };
    else if (para.list === 'ordered') opts.numbering = { reference: OL_REF, level: Math.min(para.indent || 0, 8) };
    else if (para.indent) opts.indent = { left: para.indent * 720 }; // 0,5" na úroveň
    return new Paragraph(opts);
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
function modelToDocxBuffer(model) {
    model = model || {};
    const footnotes = buildFootnotes(model.footnotes);

    const sectionChildren = buildParas(model.body && model.body.length ? model.body : [{ type: 'normal', runs: [{ text: '' }] }]);

    const headers = model.header && model.header.length
        ? { default: new Header({ children: buildParas(model.header) }) } : undefined;
    // Zápatí: buď z modelu, nebo aspoň číslo stránky (parita s dosavadním pageNumber:true).
    const footerChildren = model.footer && model.footer.length
        ? buildParas(model.footer)
        : [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })];

    const doc = new Document({
        creator: 'LexisEditor',
        title: model.title || '',
        features: { updateFields: true }, // Word po otevření přepočítá TOC
        numbering: {
            config: [{
                reference: OL_REF,
                levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(l => ({
                    level: l,
                    format: LevelFormat.DECIMAL,
                    text: `%${l + 1}.`,
                    alignment: AlignmentType.START,
                    style: { paragraph: { indent: { left: (l + 1) * 720, hanging: 360 } } }
                }))
            }]
        },
        footnotes: footnotes,
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
