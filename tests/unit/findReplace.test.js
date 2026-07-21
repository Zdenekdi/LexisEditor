/**
 * Testy skutečného Najít/Nahradit (js/ui/lexis-find-replace.js).
 * Ověřují hlavně to, co dřív bylo rozbité: nahrazení NESMÍ zahodit formátování
 * (musí jít přes deleteText+insertText se zachovaným formátem, ne přes setText),
 * a hromadné nahrazení nesmí posunout indexy (jde odzadu).
 */

// Mock Quilla nad prostým řetězcem — getText odráží mutace, getFormat vrací
// marker, který si u insertText ověříme (že se formát předává dál).
function makeQuill(initial) {
    let text = initial;
    const inserts = []; // { index, str, fmt }
    return {
        _text: () => text,
        _inserts: inserts,
        getText: (i, l) => (i == null ? text : text.substr(i, l)),
        getLength: () => text.length,
        getFormat: (i, l) => ({ marker: `fmt@${i}:${l}` }),
        getSelection: () => null,
        setSelection: () => {},
        getBounds: () => ({ top: 0, bottom: 10, left: 0, right: 10, height: 10, width: 10 }),
        root: { scrollTop: 0, clientHeight: 500 },
        deleteText: (i, l) => { text = text.slice(0, i) + text.slice(i + l); },
        insertText: (i, s, fmt) => { inserts.push({ index: i, str: s, fmt }); text = text.slice(0, i) + s + text.slice(i); }
    };
}

function setFind(v) {
    const el = document.getElementById('lfr-find');
    el.value = v;
    el.dispatchEvent(new window.Event('input'));
    jest.advanceTimersByTime(150); // překonat debounce
}
function setReplace(v) { document.getElementById('lfr-replace').value = v; }
function click(id) { document.getElementById(id).click(); }
function countText() { return document.getElementById('lfr-count').textContent; }

describe('LexisFindReplace', () => {
    beforeAll(() => {
        document.body.innerHTML = '<div id="app-container" style="display:flex"></div>';
        require('../../js/ui/lexis-find-replace');
    });
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { window.LexisFindReplace.close(); jest.useRealTimers(); });

    test('najde všechny výskyty a spočítá je', () => {
        const q = makeQuill('Praha a Brno a Praha a Praha');
        window.LexisFindReplace.open(q);
        setFind('Praha');
        expect(countText()).toBe('1 / 3');
    });

    test('rozlišení velkých/malých písmen', () => {
        const q = makeQuill('Text text TEXT');
        window.LexisFindReplace.open(q);
        setFind('text');
        expect(countText()).toBe('1 / 3');      // case-insensitive: 3
        click('lfr-case');                        // zapnout citlivost
        expect(countText()).toBe('1 / 1');        // jen přesné „text"
    });

    test('nahradit vše zachová formát a nezamotá indexy', () => {
        const q = makeQuill('aXaXa');
        window.LexisFindReplace.open(q);
        setFind('X');
        setReplace('YY');
        click('lfr-all');
        expect(q._text()).toBe('aYYaYYa');        // oba výskyty nahrazeny
        // formát se předával do insertText (ne holý text jako u setText)
        expect(q._inserts.length).toBe(2);
        expect(q._inserts.every(i => i.fmt && typeof i.fmt.marker === 'string')).toBe(true);
        expect(countText()).toBe('Nahrazeno: 2×');
    });

    test('nahradit jeden nahradí jen aktuální výskyt', () => {
        const q = makeQuill('koč koč koč');
        window.LexisFindReplace.open(q);
        setFind('koč');
        setReplace('pes');
        click('lfr-one');
        expect(q._text()).toBe('pes koč koč');    // jen první
        expect(q._inserts[0].str).toBe('pes');
    });

    test('prázdné hledání / nenalezeno', () => {
        const q = makeQuill('nic tu není');
        window.LexisFindReplace.open(q);
        setFind('xyz');
        expect(countText()).toBe('Nenalezeno');
    });

    test('nahradit vše prázdnou náhradou = smazání výskytů', () => {
        const q = makeQuill('a-b-c-');
        window.LexisFindReplace.open(q);
        setFind('-');
        setReplace('');
        click('lfr-all');
        expect(q._text()).toBe('abc');
    });
});
