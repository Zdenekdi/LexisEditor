/**
 * @jest-environment jsdom
 *
 * Testy htmlToHeaderModel — převod HTML hlavičky/patičky na model odstavců
 * (formátování, zarovnání, logo). Běží v jsdom (potřebuje DOM).
 */
const { htmlToHeaderModel } = require('../../js/export/html-header-model');

describe('htmlToHeaderModel', () => {
    test('tučné + normální text v jednom odstavci, mezera mezi slovy zůstane', () => {
        const model = htmlToHeaderModel('<div><b>Advokátní kancelář</b> s.r.o.</div>', document);
        expect(model.length).toBe(1);
        const runs = model[0].runs;
        expect(runs[0]).toEqual({ text: 'Advokátní kancelář', bold: true });
        // mezera mezi „kancelář" a „s.r.o." se nesmí ztratit
        expect(runs.map(r => r.text).join('')).toContain('kancelář s.r.o.');
    });

    test('zarovnání na střed z inline stylu', () => {
        const model = htmlToHeaderModel('<div style="text-align:center">Nadpis</div>', document);
        expect(model[0].align).toBe('center');
        expect(model[0].runs[0].text).toBe('Nadpis');
    });

    test('kurzíva a podtržení (tagy i styl)', () => {
        const model = htmlToHeaderModel('<p><i>kurzíva</i> <span style="text-decoration:underline">podtržené</span></p>', document);
        const flat = model[0].runs;
        expect(flat.find(r => r.text === 'kurzíva').italic).toBe(true);
        expect(flat.find(r => r.text === 'podtržené').underline).toBe(true);
    });

    test('logo (data-URL <img>) → image run', () => {
        const png = 'data:image/png;base64,iVBORw0KGgo=';
        const model = htmlToHeaderModel(`<div><img src="${png}">Kancelář</div>`, document);
        expect(model[0].runs.some(r => r.image === png)).toBe(true);
        expect(model[0].runs.some(r => r.text === 'Kancelář')).toBe(true);
    });

    test('více odstavců přes <div> i <br>', () => {
        const model = htmlToHeaderModel('<div>Řádek 1</div><div>Řádek 2<br>Řádek 3</div>', document);
        const texts = model.map(p => p.runs.map(r => r.text).join('').trim());
        expect(texts).toEqual(['Řádek 1', 'Řádek 2', 'Řádek 3']);
    });

    test('prázdná/mezerová hlavička → prázdné pole (fallback na řádky se spustí jinde)', () => {
        expect(htmlToHeaderModel('', document)).toEqual([]);
        expect(htmlToHeaderModel('<div>   </div><p></p>', document)).toEqual([]);
        expect(htmlToHeaderModel(null, document)).toEqual([]);
    });

    test('ignoruje <img> bez data-URL (např. remote) a <script>', () => {
        const model = htmlToHeaderModel('<div><img src="https://x/y.png"><script>alert(1)</script>Text</div>', document);
        expect(model[0].runs.every(r => !r.image)).toBe(true);
        expect(model[0].runs.some(r => r.text === 'Text')).toBe(true);
    });
});
