/**
 * @jest-environment node
 *
 * Testy Word-parity exportu/importu (.docx): sledované změny, poznámky pod čarou,
 * obsah. Čisté transformy (delta→model, ooxml→html) běží vždy; plný OOXML
 * round-trip se spustí jen když jsou nainstalované `docx` a `jszip`.
 */
const { deltaToModel, needsNativeExport } = require('../js/export/delta-to-model');
const { ooxmlToHtml } = require('../js/export/ooxml-to-html');

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
});

describeOoxml('OOXML round-trip (docx + jszip)', () => {
    test('export → .docx obsahuje w:ins/w:del/footnotes/TOC/A4 a zpětný import je vrátí', async () => {
        const { modelToDocxBuffer } = require('../js/export/model-to-docx');
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
});
