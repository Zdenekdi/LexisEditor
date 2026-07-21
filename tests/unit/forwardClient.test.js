/**
 * Testy přiřazení příchozí datovky klientovi a přeposlání e-mailem
 * (js/ui/lexis-forward-client.js) — čisté funkce bez DOM:
 *  - návrh klienta ze zapamatované vazby (sp. zn. / odesílatel),
 *  - uložení vazby,
 *  - kompletní automatické sestavení e-mailu (předmět + tělo + mailto).
 */

global.window = global.window || {};
require('../../js/ui/lexis-forward-client');
const F = window.LexisForward;

describe('LexisForward — návrh klienta z historie', () => {
    const map = { bySpzn: { '12 c 34/2026': 'cl-1' }, bySender: { 'Okresní soud v Brně': 'cl-2' } };

    test('navrhne klienta podle sp. zn. (přednostně)', () => {
        expect(F._suggestClient(map, '12 C 34/2026', 'Okresní soud v Brně')).toBe('cl-1');
    });

    test('když sp. zn. není v mapě, zkusí odesílatele', () => {
        expect(F._suggestClient(map, '99 X 1/2026', 'Okresní soud v Brně')).toBe('cl-2');
    });

    test('nic neznámého → null', () => {
        expect(F._suggestClient(map, 'X', 'Neznámý')).toBeNull();
    });

    test('normalizace sp. zn. (mezery/velikost) sedí', () => {
        expect(F._suggestClient(map, '  12   c   34/2026 ', '')).toBe('cl-1');
    });
});

describe('LexisForward — zapamatování vazby', () => {
    test('uloží sp. zn. i odesílatele → klient a nezničí předchozí', () => {
        const m0 = { bySpzn: { 'a': 'x' }, bySender: {} };
        const m1 = F._updateMap(m0, '5 T 12/2026', 'Policie ČR', 'cl-9');
        expect(m1.bySpzn['5 t 12/2026']).toBe('cl-9');
        expect(m1.bySender['Policie ČR']).toBe('cl-9');
        expect(m1.bySpzn['a']).toBe('x');       // původní zůstává
        expect(m0.bySpzn['5 t 12/2026']).toBeUndefined(); // původní objekt nezmutován
    });

    test('bez sp. zn. uloží jen odesílatele', () => {
        const m = F._updateMap({}, '', 'ČSSZ', 'cl-3');
        expect(Object.keys(m.bySpzn).length).toBe(0);
        expect(m.bySender['ČSSZ']).toBe('cl-3');
    });
});

describe('LexisForward — kompletně automatické sestavení e-mailu', () => {
    const item = {
        sender: 'Okresní soud v Brně',
        annotation: 'Předvolání k jednání',
        deliveryTime: '2026-07-20T09:30:00',
        files: [{ name: 'predvolani.pdf', path: '/x/predvolani.pdf' }]
    };
    const client = { id: 'cl-1', jmeno: 'Jan Novák', email: 'jan.novak@example.cz' };
    const lawyer = { name: 'Mgr. Petra Dvořáková', firm: 'AK Dvořáková' };

    test('předmět i tělo se vyplní z metadat zprávy', () => {
        const e = F._buildEmail({ item, client, spzn: '12 C 34/2026', cj: '', lawyer });
        expect(e.to).toBe('jan.novak@example.cz');
        expect(e.subject).toContain('Předvolání k jednání');
        expect(e.body).toContain('Odesílatel: Okresní soud v Brně');
        expect(e.body).toContain('Spisová značka: 12 C 34/2026');
        expect(e.body).toContain('Doručeno: 2026-07-20 09:30');
        expect(e.body).toContain('predvolani.pdf');
        expect(e.body).toContain('Mgr. Petra Dvořáková'); // podpis z profilu advokáta
    });

    test('č.j. se přidá jen když existuje', () => {
        const withCj = F._buildEmail({ item, client, spzn: '', cj: 'KRPB-1/TČ-2026', lawyer });
        expect(withCj.body).toContain('Číslo jednací: KRPB-1/TČ-2026');
        const without = F._buildEmail({ item, client, spzn: '', cj: '', lawyer });
        expect(without.body).not.toContain('Číslo jednací');
    });

    test('mailto zakóduje příjemce, předmět i tělo', () => {
        const e = F._buildEmail({ item, client, spzn: '12 C 34/2026', cj: '', lawyer });
        const url = F._toMailto(e.to, e.subject, e.body);
        expect(url.startsWith('mailto:jan.novak%40example.cz?')).toBe(true);
        expect(url).toContain('subject=');
        expect(url).toContain('body=');
        // mezery a diakritika musí být zakódované (ne syrové)
        expect(url).not.toMatch(/subject=[^&]*\s/);
    });

    test('klient bez e-mailu → prázdný příjemce (UI to pak odmítne)', () => {
        const e = F._buildEmail({ item, client: { jmeno: 'Bez Mailu' }, spzn: '', cj: '', lawyer: {} });
        expect(e.to).toBe('');
    });
});

describe('LexisForward — payload pro zápis do spisu (LexisLocal)', () => {
    const item = { sender: 'Okresní soud v Brně', annotation: 'Předvolání', dmID: '98765' };
    const client = { id: 'cl-1', jmeno: 'Jan Novák', email: 'jan@example.cz' };

    test('caseNumber = spisová značka; nese klienta, příjemce i dmID', () => {
        const p = F._caseLogPayload(item, client, '12 C 34/2026', 'KRPB-1/TČ-2026', 'Vlastní předmět');
        expect(p.caseNumber).toBe('12 C 34/2026');
        expect(p.cj).toBe('KRPB-1/TČ-2026');
        expect(p.clientName).toBe('Jan Novák');
        expect(p.recipientEmail).toBe('jan@example.cz');
        expect(p.sender).toBe('Okresní soud v Brně');
        expect(p.dmID).toBe('98765');
        expect(p.subject).toBe('Vlastní předmět');
    });

    test('bez sp. zn. → prázdný caseNumber (backend nenaváže na spis) a předmět z anotace', () => {
        const p = F._caseLogPayload(item, client, '', '', '');
        expect(p.caseNumber).toBe('');
        expect(p.subject).toBe('Předvolání');
    });
});
