/**
 * @jest-environment node
 *
 * Testy Word-parity exportu/importu (.docx): sledované změny, poznámky pod čarou,
 * obsah. Čisté transformy (delta→model, ooxml→html) běží vždy; plný OOXML
 * round-trip se spustí jen když jsou nainstalované `docx` a `jszip`.
 */
const { deltaToModel, needsNativeExport } = require('../../js/export/delta-to-model');
const { ooxmlToHtml } = require('../../js/export/ooxml-to-html');

let ooxmlLibs = true;
try { require.resolve('docx'); require.resolve('jszip'); } catch (e) { ooxmlLibs = false; }
const describeOoxml = ooxmlLibs ? describe : describe.skip;

describe('delta-to-model (čistý transform)', () => {
    test('needsNativeExport detekuje revize / poznámky / obsah', () => {
        expect(needsNativeExport({ ops: [{ insert: 'x' }] })).toBe(false);
        expect(needsNativeExport({ ops: [{ insert: 'x', attributes: { insertion: true } }] })).toBe(true);
        expect(needsNativeExport({ ops: [{ insert: { footnote: { text: 'a' } } }] })).toBe(true);
        expect(needsNativeExport({ ops: [{ insert: { toc: true } }] })).toBe(true);
    });

    test('mapuje nadpis, revize s autorem, poznámku, seznam a zarovnání', () => {
        const delta = { ops: [
            { insert: 'Nadpis' }, { insert: '\n', attributes: { header: 2 } },
            { insert: 'text ' },
            { insert: 'nový', attributes: { insertion: { author: 'Advokát', date: '2026-08-18T10:00:00Z', id: 'c1' }, bold: true } },
            { insert: 'smaz', attributes: { deletion: { author: 'Advokát' } } },
            { insert: { footnote: { text: 'Pozn.' } } },
            { insert: '\n', attributes: { align: 'justify' } },
            { insert: 'bod' }, { insert: '\n', attributes: { list: 'ordered' } }
        ] };
        const model = deltaToModel(delta, { title: 'T', headerLines: ['Soud'] });
        expect(model.body[0].type).toBe('h2');
        const para = model.body[1];
        expect(para.align).toBe('justify');
        const ins = para.runs.find(r => r.change && r.change.type === 'ins');
        expect(ins).toBeTruthy();
        expect(ins.change.author).toBe('Advokát');
        expect(ins.bold).toBe(true);
        expect(para.runs.some(r => r.change && r.change.type === 'del')).toBe(true);
        expect(para.runs.some(r => r.footnoteId != null)).toBe(true);
        expect(Object.keys(model.footnotes).length).toBe(1);
        expect(model.body[2].list).toBe('ordered');
        expect(model.header[0].runs[0].text).toBe('Soud');
    });

    test('obrázek → image run, komentář → commentId + model.comments', () => {
        const delta = { ops: [
            { insert: 'a ' },
            { insert: 'sporné', attributes: { comment: { id: 'k1', text: 'Ověřit.', author: 'X' } } },
            { insert: ' b' },
            { insert: { image: 'data:image/png;base64,AAAA' } },
            { insert: '\n' }
        ] };
        const model = deltaToModel(delta, {});
        const p = model.body[0];
        expect(p.runs.some(r => r.commentId === 0)).toBe(true);
        expect(model.comments[0].body).toBe('Ověřit.');
        expect(p.runs.some(r => r.image)).toBe(true);
    });
});

describe('compare (porovnání verzí → redline)', () => {
    const { compareTexts } = require('../../js/export/compare');
    test('změna slova → ql-deletion + ql-insertion, beze změny zůstává text', () => {
        const html = compareTexts('Zaplatit 100 Kč.\nBeze změny.', 'Zaplatit 200 Kč.\nBeze změny.', { author: 'X' });
        expect(html).toContain('ql-deletion');
        expect(html).toContain('ql-insertion');
        expect(html).toContain('Beze změny.');
        // nezměněný odstavec nesmí být označen
        expect(html).toMatch(/<p>Beze změny\.<\/p>/);
    });
    test('přidaný odstavec → celý vložený, odebraný → celý smazaný', () => {
        const html = compareTexts('A\nB', 'A\nB\nC', { author: 'X' });
        expect(html).toContain('<span class="ql-insertion"');
        expect(html).toContain('>C</span>');
    });
});

describe('AI redline (buildRedline — přepis výběru jako sledovaná změna)', () => {
    const { buildRedline } = require('../../js/export/compare');
    test('jednořádkový výběr → inline redline BEZ vnějšího <p> (nerozbije odstavec)', () => {
        const rl = buildRedline('smluvní pokuta 0,05 %', 'smluvní pokuta 0,1 %', { author: 'AI · Advokát' });
        expect(rl.changed).toBe(true);
        expect(rl.html.startsWith('<p>')).toBe(false); // inline, ne blok
        expect(rl.html).toContain('ql-deletion');
        expect(rl.html).toContain('ql-insertion');
        expect(rl.html).toContain('data-author="AI · Advokát"');
        // nezměněný společný text zůstává neoznačený
        expect(rl.html).toContain('smluvní pokuta');
    });
    test('víceřádkový výběr → blokový redline s <p>', () => {
        const rl = buildRedline('Odstavec jedna.\nStaré znění.', 'Odstavec jedna.\nNové znění.', { author: 'AI' });
        expect(rl.changed).toBe(true);
        expect(rl.html).toContain('<p>');
        expect(rl.html).toContain('ql-insertion');
    });
    test('beze změny → changed=false, prázdné html (nic se nevkládá)', () => {
        const rl = buildRedline('Totožné znění.', 'Totožné znění.', { author: 'AI' });
        expect(rl.changed).toBe(false);
        expect(rl.html).toBe('');
    });
    test('ořízne koncové zlomy (výběr s trailing \\n z Quillu)', () => {
        const rl = buildRedline('věta A\n', 'věta B', { author: 'AI' });
        expect(rl.changed).toBe(true);
        expect(rl.html).toContain('ql-insertion');
    });
});

describe('ooxml-to-html (import revizí a poznámek)', () => {
    test('w:ins/w:del → span, footnoteReference → sup s tělem', () => {
        const fn = '<w:footnotes><w:footnote w:id="1"><w:p><w:r><w:t>Viz zákon</w:t></w:r></w:p></w:footnote></w:footnotes>';
        const doc = '<w:document><w:body>' +
            '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Žaloba</w:t></w:r></w:p>' +
            '<w:p><w:pPr><w:jc w:val="both"/></w:pPr>' +
            '<w:r><w:t xml:space="preserve">a </w:t></w:r>' +
            '<w:ins w:author="Advokát"><w:r><w:rPr><w:b/></w:rPr><w:t>vlož</w:t></w:r></w:ins>' +
            '<w:del w:author="Advokát"><w:r><w:delText>maz</w:delText></w:r></w:del>' +
            '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>' +
            '</w:p></w:body></w:document>';
        const html = ooxmlToHtml(doc, fn);
        expect(html).toContain('<h1>Žaloba</h1>');
        expect(html).toContain('text-align:justify');
        expect(html).toContain('<span class="ql-insertion"><strong>vlož</strong></span>');
        expect(html).toContain('<span class="ql-deletion">maz</span>');
        expect(html).toContain('footnote-ref');
        expect(html).toContain('data-text="Viz zákon"');
    });

    test('import tabulky: <w:tbl> → <table> s obsahem buněk', () => {
        const cell = (t) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
        const doc = '<w:document><w:body><w:tbl>' +
            `<w:tr>${cell('A1')}${cell('B1')}</w:tr>` +
            `<w:tr>${cell('A2')}${cell('B2')}</w:tr>` +
            '</w:tbl></w:body></w:document>';
        const html = ooxmlToHtml(doc, '');
        expect(html).toContain('<table');
        expect(html).toContain('A1');
        expect(html).toContain('B2');
        expect((html.match(/<tr>/g) || []).length).toBe(2);
    });
});

describeOoxml('OOXML round-trip (docx + jszip)', () => {
    test('export → .docx obsahuje w:ins/w:del/footnotes/TOC/A4 a zpětný import je vrátí', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const delta = { ops: [
            { insert: 'Žaloba' }, { insert: '\n', attributes: { header: 1 } },
            { insert: { toc: true } },
            { insert: 'text ' },
            { insert: 'nový', attributes: { insertion: { author: 'Mgr. X', date: '2026-08-18T10:00:00Z', id: 'c1' } } },
            { insert: 'chyba', attributes: { deletion: { author: 'Mgr. X' } } },
            { insert: { footnote: { text: 'Viz § 79 o.s.ř.' } } },
            { insert: '.\n', attributes: { align: 'justify' } }
        ] };
        const model = deltaToModel(delta, { title: 'Žaloba' });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const docXml = await zip.file('word/document.xml').async('string');
        const fnXml = await zip.file('word/footnotes.xml').async('string');

        expect(docXml).toMatch(/<w:ins\b/);
        expect(docXml).toMatch(/<w:del\b/);
        expect(docXml).toContain('w:author="Mgr. X"');
        expect(docXml).toContain('11906'); // A4
        expect(docXml).toMatch(/TOC/);
        expect(fnXml).toContain('79');

        const html = ooxmlToHtml(docXml, fnXml);
        expect(html).toContain('ql-insertion');
        expect(html).toContain('ql-deletion');
        expect(html).toContain('footnote-ref');
    });

    test('komentář + obrázek + výchozí písmo: export a zpětný import', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const delta = { ops: [
            { insert: 'a ' },
            { insert: 'sporná pasáž', attributes: { comment: { id: 'k1', text: 'Přeformulovat.', author: 'Mgr. X', date: '2026-08-18T10:00:00Z' } } },
            { insert: ' b\n' },
            { insert: { image: png } },
            { insert: '\n' }
        ] };
        const model = deltaToModel(delta, { title: 'C' });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const docXml = await zip.file('word/document.xml').async('string');
        const cXml = await zip.file('word/comments.xml').async('string');
        const stylesXml = await zip.file('word/styles.xml').async('string');

        expect(docXml).toMatch(/<w:commentRangeStart\b/);
        expect(cXml).toContain('Přeformulovat.');
        expect(stylesXml).toContain('Times New Roman'); // výchozí písmo
        // obrázek v media
        expect(Object.keys(zip.files).some(f => f.startsWith('word/media/'))).toBe(true);
        // "Strana X z Y" v zápatí
        const footer = await zip.file('word/footer1.xml').async('string');
        expect(footer).toContain('Strana');

        const html = ooxmlToHtml(docXml, cXml, cXml);
        expect(html).toContain('comment-highlight');
        expect(html).toContain('data-comment-text="Přeformulovat."');
    });

    test('víceúrovňové číslování: numbering.xml má kumulativní úrovně (1.1.)', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const delta = { ops: [
            { insert: 'První' }, { insert: '\n', attributes: { list: 'ordered' } },
            { insert: 'Podbod' }, { insert: '\n', attributes: { list: 'ordered', indent: 1 } }
        ] };
        // list samotný nespouští nativní cestu, proto model sestavíme přímo:
        const model = deltaToModel(delta, {});
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const numbering = await zip.file('word/numbering.xml').async('string');
        expect(numbering).toContain('%1.%2.'); // kumulativní 2. úroveň
    });

    test('vodoznak: model.watermark → WordArt (t136) v hlavičce, rotace 315°, za textem', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const delta = { ops: [{ insert: 'Koncept smlouvy.\n' }] };
        const model = deltaToModel(delta, { title: 'Koncept', watermark: { type: 'text', text: 'KONCEPT', color: '#c0c0c0' } });
        expect(model.watermark).toEqual({ type: 'text', text: 'KONCEPT', color: '#c0c0c0' });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const header = await zip.file('word/header1.xml').async('string');
        expect(header).toContain('#_x0000_t136');       // WordArt shape
        expect(header).toContain('rotation:315');        // úhlopříčně
        expect(header).toContain('string="KONCEPT"');    // text vodoznaku
        expect(header).toContain('fillcolor="#c0c0c0"'); // barva bez #
        expect(header).toContain('mso-position-horizontal:center'); // vystředěno
        expect(header).not.toMatch(/<w:p><w:p>/);        // nerozbije strukturu
    });

    test('vodoznak: nevalidní barva → výchozí šeď, text se XML-escapuje', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const model = deltaToModel({ ops: [{ insert: 'x\n' }] }, { watermark: { type: 'text', text: 'A & <B>', color: 'zzz' } });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const header = await zip.file('word/header1.xml').async('string');
        expect(header).toContain('fillcolor="#d0d0d0"');        // fallback šeď
        expect(header).toContain('string="A &amp; &lt;B&gt;"'); // escapováno
    });

    test('vodoznak + hlavička: vodoznak je PŘED textem hlavičky (obojí zůstane)', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const model = deltaToModel({ ops: [{ insert: 'x\n' }] }, { headerLines: ['Okresní soud v Brně'], watermark: { type: 'text', text: 'VZOR' } });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const header = await zip.file('word/header1.xml').async('string');
        expect(header).toContain('string="VZOR"');
        expect(header).toContain('Okresní soud v Brně');
        expect(header.indexOf('_x0000_t136')).toBeLessThan(header.indexOf('Okresní soud'));
    });

    test('bez vodoznaku: hlavička beze změny (žádný t136)', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const model = deltaToModel({ ops: [{ insert: 'x\n' }] }, { headerLines: ['Soud'] });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const header = await zip.file('word/header1.xml').async('string');
        expect(header).not.toContain('_x0000_t136');
        expect(header).toContain('Soud');
    });

    test('bohatší hlavička: headerModel (tučné + zarovnání + logo) → w:b, jc, media', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const headerModel = [
            { type: 'normal', align: 'center', runs: [{ image: png }] },
            { type: 'normal', align: 'center', runs: [{ text: 'Advokátní kancelář Dias', bold: true }] },
            { type: 'normal', align: 'right', runs: [{ text: 'V Brně dne 14. 7. 2026' }] }
        ];
        const model = deltaToModel({ ops: [{ insert: 'Tělo.\n' }] }, { headerModel: headerModel });
        // headerModel má přednost před headerLines
        expect(model.header).toBe(headerModel);
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const header = await zip.file('word/header1.xml').async('string');
        expect(header).toContain('Advokátní kancelář Dias');
        expect(header).toMatch(/<w:b\b/);              // tučné
        expect(header).toContain('w:val="center"');    // zarovnání na střed
        expect(header).toContain('w:val="right"');     // zarovnání vpravo
        // logo skončí v word/media
        expect(Object.keys(zip.files).some(f => f.startsWith('word/media/'))).toBe(true);
    });

    test('bohatší hlavička: prázdný headerModel → fallback na headerLines', () => {
        const model = deltaToModel({ ops: [{ insert: 'x\n' }] }, { headerModel: [], headerLines: ['Náhradní řádek'] });
        expect(model.header).toEqual([{ type: 'normal', runs: [{ text: 'Náhradní řádek' }] }]);
    });

    test('AI redline: revize s autorem „AI · …" → export do w:ins/w:del se zachovaným autorem', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        // Delta, jaká vznikne po vložení redline z buildRedline (smazané staré + vložené nové),
        // autor pochází z AI přepisu výběru.
        const delta = { ops: [
            { insert: 'Smluvní pokuta ' },
            { insert: '0,05', attributes: { deletion: { author: 'AI · Mgr. Dias', date: '2026-08-18T10:00:00Z', id: 'c1' } } },
            { insert: '0,1', attributes: { insertion: { author: 'AI · Mgr. Dias', date: '2026-08-18T10:00:00Z', id: 'c2' } } },
            { insert: ' % denně.\n' }
        ] };
        expect(needsNativeExport(delta)).toBe(true); // revize → nativní cesta
        const model = deltaToModel(delta, { title: 'Smlouva' });
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const docXml = await zip.file('word/document.xml').async('string');
        expect(docXml).toMatch(/<w:ins\b/);
        expect(docXml).toMatch(/<w:del\b/);
        expect(docXml).toContain('w:author="AI · Mgr. Dias"');
        // zpětný import redline zobrazí jako sledované změny
        const html = ooxmlToHtml(docXml, '');
        expect(html).toContain('ql-insertion');
        expect(html).toContain('ql-deletion');
    });

    test('tabulka: embed → model → docx <w:tbl> s buňkami', async () => {
        const { modelToDocxBuffer } = require('../../js/export/model-to-docx');
        const JSZip = require('jszip');
        const delta = { ops: [
            { insert: { table: { rows: [['A1', 'B1'], ['A2', 'B2']] } } },
            { insert: '\n' }
        ] };
        const model = deltaToModel(delta, {});
        expect(model.body[0].type).toBe('table');
        const buf = await modelToDocxBuffer(model);
        const zip = await JSZip.loadAsync(buf);
        const docXml = await zip.file('word/document.xml').async('string');
        expect(docXml).toContain('<w:tbl>');
        expect((docXml.match(/<w:tr>/g) || []).length).toBe(2);
        expect(docXml).toContain('A1');
        expect(docXml).toContain('B2');
    });
});
