/**
 * Testy mechaniky edic (js/core/lexis-edition.js): skládání balíčků, guard
 * Edition.has(), a deklarativní skrývání prvků podle data-pack. Klíčové je, že
 * výchozí edice „full" nic neskrývá (dnešní chování se nemění) a že edice bez
 * balíčku „legal" právní prvky schová.
 */

const ed = require('../../js/core/lexis-edition');

describe('skládání balíčků a Edition.has()', () => {
    test('full má core+business+legal', () => {
        const e = ed.make('full');
        expect(e.has('core')).toBe(true);
        expect(e.has('business')).toBe(true);
        expect(e.has('legal')).toBe(true);
    });

    test('core nemá legal ani business', () => {
        const e = ed.make('core');
        expect(e.has('core')).toBe(true);
        expect(e.has('legal')).toBe(false);
        expect(e.has('business')).toBe(false);
    });

    test('neznámá edice spadne na výchozí full', () => {
        expect(ed.make('xyz').packs).toEqual(ed.EDITIONS[ed.DEFAULT_ID].packs);
    });

    test('výchozí edice je full (dnešní chování = vše zapnuté)', () => {
        expect(ed.DEFAULT_ID).toBe('full');
    });

    test('edice nese brand a support e-mail (brand = konfigurace)', () => {
        expect(ed.make('legal').brandName).toBe('Lexis');
        expect(ed.make('legal').supportEmail).toMatch(/@/);
        expect(ed.make('core').brandName).toBe('Nexus Editor');
        expect(ed.make('core').supportEmail).toMatch(/@/);
    });
});

describe('elementAllowed (víc balíčků = OR)', () => {
    test('prvek business+legal se ukáže, když edice má ASPOŇ JEDEN z nich', () => {
        expect(ed.elementAllowed(['core', 'legal'], 'legal')).toBe(true);
        expect(ed.elementAllowed(['core', 'legal'], 'business legal')).toBe(true);   // má legal → OK
        expect(ed.elementAllowed(['core', 'business'], 'business,legal')).toBe(true); // má business → OK
        expect(ed.elementAllowed(['core'], 'business legal')).toBe(false);            // ani jeden → skryté
    });
    test('prázdný data-pack = vždy povoleno', () => {
        expect(ed.elementAllowed(['core'], '')).toBe(true);
    });
});

describe('apply() skrývá jen prvky mimo edici', () => {
    function fixture() {
        const root = document.createElement('div');
        root.innerHTML = `
            <button id="a" data-pack="legal">Datovky</button>
            <button id="b" data-pack="business">Tým</button>
            <button id="c">Uložit</button>
        `;
        return root;
    }

    test('edice core skryje legal i business, jádro nechá', () => {
        const root = fixture();
        ed.make('core').apply(root);
        expect(root.querySelector('#a').style.display).toBe('none');
        expect(root.querySelector('#b').style.display).toBe('none');
        expect(root.querySelector('#c').style.display).toBe('');
    });

    test('edice full nic neskryje (non-breaking)', () => {
        const root = fixture();
        ed.make('full').apply(root);
        expect(root.querySelector('#a').style.display).toBe('');
        expect(root.querySelector('#b').style.display).toBe('');
        expect(root.querySelector('#c').style.display).toBe('');
    });

    test('legal edice: datovky zůstanou, týmové (business) zmizí', () => {
        const root = fixture();
        ed.make('legal').apply(root);
        expect(root.querySelector('#a').style.display).toBe('');       // legal má
        expect(root.querySelector('#b').style.display).toBe('none');   // business nemá
    });

    test('brand se propíše do [data-brand-name]', () => {
        const root = document.createElement('div');
        root.innerHTML = '<span data-brand-name></span>';
        ed.make('core').apply(root);
        expect(root.querySelector('[data-brand-name]').textContent).toBe('Nexus Editor');
    });
});

describe('runtime alias na window', () => {
    test('window.Edition existuje a výchozí je full (nic neschované)', () => {
        expect(window.Edition).toBeTruthy();
        expect(window.Edition.has('legal')).toBe(true); // default full
    });
});
