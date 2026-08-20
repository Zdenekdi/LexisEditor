/**
 * Testy linteru spisovné češtiny (js/lang/czech-style.js) — čistý transform.
 */
const { checkCzechStyle, parseAiLanguageIssues } = require('../../js/lang/czech-style');

const at = (text, issue) => text.substr(issue.index, issue.length);

describe('checkCzechStyle — nespisovné tvary', () => {
    test('bysme → bychom (se zachováním velikosti písmene)', () => {
        const iss = checkCzechStyle('Chtěli bysme to podat. Bysme rádi.');
        const b = iss.filter(i => i.rule === 'nespisovne');
        expect(b.length).toBe(2);
        expect(at('Chtěli bysme to podat. Bysme rádi.', b[0])).toBe('bysme');
        expect(b[0].fix).toBe('bychom');
        expect(b[1].fix).toBe('Bychom'); // velké B zachováno
    });

    test('víceslovné „aby jsme" → „abychom", „kdyby jste" → „kdybyste"', () => {
        const t = 'Aby jsme stihli lhůtu a kdyby jste chtěli.';
        const iss = checkCzechStyle(t).filter(i => i.rule === 'nespisovne');
        const fixes = iss.map(i => i.fix);
        expect(fixes).toContain('Abychom');
        expect(fixes).toContain('kdybyste');
        // offset ukazuje přesně na nalezenou vazbu
        iss.forEach(i => expect(at(t, i).toLowerCase()).toMatch(/^(aby jsme|kdyby jste)$/));
    });

    test('seš → jsi; nepravdivé shody se nehlásí (běžná slova)', () => {
        expect(checkCzechStyle('Seš tady?').some(i => i.fix === 'Jsi')).toBe(true);
        // „byste", „bychom" jsou spisovné → nesmí se hlásit
        expect(checkCzechStyle('Kdybyste podali včas, byli bychom rádi.').filter(i => i.rule === 'nespisovne')).toEqual([]);
    });

    test('čistý spisovný text → žádné nálezy typu nespisovne', () => {
        const iss = checkCzechStyle('Navrhovatel podává návrh a žádá, aby soud rozhodl.');
        expect(iss.filter(i => i.rule === 'nespisovne')).toEqual([]);
    });
});

describe('checkCzechStyle — typografie', () => {
    test('vícenásobná mezera → oprava na jednu', () => {
        const t = 'slovo   druhé';
        const iss = checkCzechStyle(t).filter(i => i.rule === 'mezera');
        expect(iss.length).toBe(1);
        expect(iss[0].fix).toBe(' ');
        expect(at(t, iss[0])).toBe('   ');
    });
    test('mezera před interpunkcí', () => {
        const t = 'Dobře , děkuji .';
        const iss = checkCzechStyle(t).filter(i => i.rule === 'mezera-pred');
        expect(iss.length).toBe(2);
        expect(iss[0].fix).toBe(',');
    });
    test('tři tečky → výpustka …', () => {
        const iss = checkCzechStyle('a tak dále...').filter(i => i.rule === 'vypustka');
        expect(iss.length).toBe(1);
        expect(iss[0].fix).toBe('…');
        expect(iss[0].length).toBe(3);
    });
    test('nový řádek za tečkou se NEhlásí jako mezera před interpunkcí', () => {
        expect(checkCzechStyle('Konec věty.\nDalší.').filter(i => i.rule === 'mezera-pred')).toEqual([]);
    });
});

describe('parseAiLanguageIssues', () => {
    const doc = 'Toto je testovací věta s chybama a hovorovým slovem furt.';
    test('naparsuje JSON pole a lokalizuje úryvek v textu', () => {
        const ai = '[{"uryvek":"s chybama","problem":"Nespisovný tvar","navrh":"s chybami"}]';
        const out = parseAiLanguageIssues(ai, doc);
        expect(out.length).toBe(1);
        expect(doc.substr(out[0].index, out[0].length)).toBe('s chybama');
        expect(out[0].fix).toBe('s chybami');
        expect(out[0].rule).toBe('ai');
    });
    test('zvládne ```json obal i text okolo', () => {
        const ai = 'Zde jsou nálezy:\n```json\n[{"uryvek":"furt","problem":"hovorové","navrh":"stále"}]\n```\nHotovo.';
        const out = parseAiLanguageIssues(ai, doc);
        expect(out.length).toBe(1);
        expect(out[0].fix).toBe('stále');
    });
    test('úryvek, který v textu není, se zahodí', () => {
        const ai = '[{"uryvek":"neexistuje v textu","problem":"x","navrh":"y"}]';
        expect(parseAiLanguageIssues(ai, doc)).toEqual([]);
    });
    test('nevalidní JSON → prázdné pole (bez pádu)', () => {
        expect(parseAiLanguageIssues('toto není json', doc)).toEqual([]);
        expect(parseAiLanguageIssues('', doc)).toEqual([]);
    });
    test('dlouhý návrh (rozsáhlá přeformulace) → jen upozornění bez auto-opravy', () => {
        const long = 'x'.repeat(200);
        const ai = `[{"uryvek":"furt","problem":"přeformulovat","navrh":"${long}"}]`;
        const out = parseAiLanguageIssues(ai, doc);
        expect(out[0].fix).toBeUndefined();
    });
});
