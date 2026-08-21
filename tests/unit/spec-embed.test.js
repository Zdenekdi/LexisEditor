/**
 * Test vnoření LexisEditor spec do .docx (custom XML part). Ověřuje, že se spec
 * uloží a přečte identicky a že plain .docx bez spec vrací null. Word část ignoruje.
 */
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { embedSpec, extractSpec } = require('../../js/export/spec-embed');

async function makeDocx(text) {
    const d = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text || 'Test')] })] }] });
    return Packer.toBuffer(d);
}

jest.setTimeout(20000);

test('embed → extract vrátí identický spec', async () => {
    const base = await makeDocx('Kupní smlouva');
    const spec = { title: 'Kupní smlouva', blocks: [
        { type: 'heading', level: 1, id: 'h1', text: 'I. Předmět' },
        { type: 'paragraph', id: 'p1', text: 'Text.' },
        { type: 'table', id: 't1', cells: [['A', 'B']] }
    ], aiDisclosure: true };
    const withSpec = await embedSpec(base, spec);
    expect(withSpec.length).toBeGreaterThan(base.length);
    const got = await extractSpec(withSpec);
    expect(got).toEqual(spec);
});

test('plain .docx bez spec → null', async () => {
    const base = await makeDocx('Bez spec');
    expect(await extractSpec(base)).toBeNull();
});

test('výsledek je stále validní ZIP/.docx (má word/document.xml)', async () => {
    const JSZip = require('jszip');
    const withSpec = await embedSpec(await makeDocx('X'), { title: 'X', blocks: [] });
    const zip = await JSZip.loadAsync(withSpec);
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('customXml/item1.xml')).toBeTruthy();
});
