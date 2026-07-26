const { buildClientDraft, mailtoHref } = require('../../js/core/lexis-mail-draft');

describe('lexis-mail-draft.buildClientDraft', () => {
    test('spisová značka má přednost, předmět a oslovení sedí', () => {
        const d = buildClientDraft({
            contact: { jmeno: 'Jan Novák', email: 'jan@novak.cz' },
            lawyer: { name: 'Mgr. Petr Advokát', firm: 'AK Advokát' },
            docTitle: 'Odvolání', spzn: '12 C 34/2025', cj: '5 T 1/2024',
            attachmentName: 'Odvolani.pdf'
        });
        expect(d.to).toBe('jan@novak.cz');
        expect(d.subject).toBe('Odvolání – sp. zn. 12 C 34/2025');
        expect(d.body).toContain('Vážený/á Jan Novák,');
        expect(d.body).toContain('ve věci sp. zn. 12 C 34/2025');
        expect(d.body).toContain('zasílám Odvolání.');
        expect(d.body).toContain('Příloha: Odvolani.pdf');
        expect(d.body).toContain('Mgr. Petr Advokát');
        expect(d.body).toContain('AK Advokát');
    });

    test('bez spzn se použije číslo jednací', () => {
        const d = buildClientDraft({ contact: { email: 'a@b.cz' }, docTitle: 'Podání', cj: '9 A 2/2023' });
        expect(d.subject).toBe('Podání – č. j. 9 A 2/2023');
        expect(d.body).toContain('ve věci č. j. 9 A 2/2023');
    });

    test('bez reference a bez jména: neutrální oslovení, čistý předmět', () => {
        const d = buildClientDraft({ contact: { email: 'x@y.cz' }, docTitle: 'Smlouva' });
        expect(d.subject).toBe('Smlouva');
        expect(d.body).toContain('Vážená paní, vážený pane,');
        expect(d.body).not.toContain('ve věci');
    });

    test('prázdný vstup nespadne, má rozumné defaulty', () => {
        const d = buildClientDraft({});
        expect(d.to).toBe('');
        expect(d.subject).toBe('dokument');
        expect(typeof d.body).toBe('string');
        expect(d.body).toContain('S pozdravem');
    });

    test('mailtoHref správně enkóduje', () => {
        const href = mailtoHref('a@b.cz', 'Před & mět', 'Řádek 1\nŘádek 2');
        expect(href.startsWith('mailto:a%40b.cz?subject=')).toBe(true);
        expect(href).toContain('%26'); // &
        expect(href).toContain('%0A'); // newline
    });
});
