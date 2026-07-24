/**
 * Testy generátoru právních dokumentů (js/core/lexis-legal-docs.js).
 * Dřív byla plná moc v UI se syrově vkládaným jménem a napevno „V Praze".
 */

const D = require('../../js/core/lexis-legal-docs');

describe('buildPowerOfAttorney', () => {
    test('procesní vs obecná — správný nadpis a tělo', () => {
        const p = D.buildPowerOfAttorney({ name: 'Jan Novák', type: 'procesní', date: '1. 1. 2026' });
        expect(p).toContain('PLNÁ MOC (PROCESNÍ)');
        expect(p).toContain('procesní plnou moc advokátní kanceláři');

        const o = D.buildPowerOfAttorney({ name: 'Jan Novák', type: 'obecná', date: '1. 1. 2026' });
        expect(o).toContain('PLNÁ MOC (OBECNÁ)');
        expect(o).toContain('zmocňuji pana/paní');
    });

    test('jméno se escapuje (nevloží se syrové HTML)', () => {
        const h = D.buildPowerOfAttorney({ name: '<script>alert(1)</script>', type: 'obecná', date: '1. 1. 2026' });
        expect(h).not.toContain('<script>alert(1)');
        expect(h).toContain('&lt;script&gt;');
    });

    test('prázdné jméno → placeholder', () => {
        expect(D.buildPowerOfAttorney({ name: '', type: 'obecná', date: '1. 1. 2026' })).toContain('[JMÉNO ZMOCNITELE]');
        expect(D.buildPowerOfAttorney({ type: 'obecná', date: '1. 1. 2026' })).toContain('[JMÉNO ZMOCNITELE]');
    });

    test('místo je parametr; default „V Praze"', () => {
        expect(D.buildPowerOfAttorney({ name: 'X', date: '1. 1. 2026' })).toContain('V Praze dne 1. 1. 2026');
        expect(D.buildPowerOfAttorney({ name: 'X', place: 'Brně', date: '1. 1. 2026' })).toContain('V Brně dne 1. 1. 2026');
    });

    test('jméno se objeví na dvou místech (v úvodu i u podpisu)', () => {
        const h = D.buildPowerOfAttorney({ name: 'Jan Novák', type: 'obecná', date: '1. 1. 2026' });
        expect((h.match(/Jan Novák/g) || []).length).toBe(2);
    });
});

describe('buildSignatureBlock', () => {
    test('default: ZMOCNITEL/ZMOCNĚNEC a „V Praze" 2×', () => {
        const h = D.buildSignatureBlock({});
        expect(h).toContain('ZMOCNITEL');
        expect(h).toContain('ZMOCNĚNEC');
        expect((h.match(/V Praze dne/g) || []).length).toBe(2);
    });

    test('místo je parametr (Brně)', () => {
        const h = D.buildSignatureBlock({ place: 'Brně' });
        expect((h.match(/V Brně dne/g) || []).length).toBe(2);
        expect(h).not.toContain('V Praze');
    });

    test('vlastní popisky a jména se escapují', () => {
        const h = D.buildSignatureBlock({ leftLabel: 'PRODÁVAJÍCÍ', rightLabel: 'KUPUJÍCÍ', leftName: 'A & B', rightName: '<x>' });
        expect(h).toContain('PRODÁVAJÍCÍ');
        expect(h).toContain('KUPUJÍCÍ');
        expect(h).toContain('A &amp; B');
        expect(h).not.toContain('<x>');
    });
});
