const { splitCsvLine, parseCsvToRecords, fillTemplate } = require('../../js/core/lexis-merge');

describe('splitCsvLine', () => {
    test('prosté dělení podle čárky (zpětná kompatibilita)', () => {
        expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });
    test('uvozovky drží čárku uvnitř pole', () => {
        expect(splitCsvLine('Jan,"Václavské nám. 1, Praha 1",abc'))
            .toEqual(['Jan', 'Václavské nám. 1, Praha 1', 'abc']);
    });
    test('zdvojená uvozovka = doslovná uvozovka', () => {
        expect(splitCsvLine('"a ""b"" c",d')).toEqual(['a "b" c', 'd']);
    });
});

describe('parseCsvToRecords', () => {
    test('hlavička + řádky → záznamy', () => {
        const r = parseCsvToRecords('Jmeno,Adresa\nJan Novák,Praha\nMarie,Brno');
        expect(r).toEqual([
            { Jmeno: 'Jan Novák', Adresa: 'Praha' },
            { Jmeno: 'Marie', Adresa: 'Brno' }
        ]);
    });
    test('adresa s čárkou v uvozovkách se nerozbije', () => {
        const r = parseCsvToRecords('Jmeno,Adresa\nJan,"nám. Míru 7, Praha 2"');
        expect(r[0].Adresa).toBe('nám. Míru 7, Praha 2');
    });
    test('méně než 2 řádky = žádné záznamy', () => {
        expect(parseCsvToRecords('jenom hlavička')).toEqual([]);
        expect(parseCsvToRecords('')).toEqual([]);
    });
    test('chybějící hodnota → prázdný řetězec', () => {
        const r = parseCsvToRecords('A,B,C\n1,2');
        expect(r[0]).toEqual({ A: '1', B: '2', C: '' });
    });
});

describe('fillTemplate', () => {
    test('dosadí {{Klíč}} ze záznamu', () => {
        expect(fillTemplate('Vážený {{Jmeno}}, adresa {{Adresa}}.', { Jmeno: 'Jan', Adresa: 'Praha' }))
            .toBe('Vážený Jan, adresa Praha.');
    });
    test('opakovaná proměnná se nahradí všude', () => {
        expect(fillTemplate('{{X}}-{{X}}', { X: 'a' })).toBe('a-a');
    });
    test('neznámá proměnná zůstane nedotčená', () => {
        expect(fillTemplate('{{A}} {{B}}', { A: 'x' })).toBe('x {{B}}');
    });
    test('prázdný/undefined vstup nespadne', () => {
        expect(fillTemplate(undefined, {})).toBe('');
        expect(fillTemplate('beze změn', null)).toBe('beze změn');
    });
});
