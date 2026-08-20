/**
 * @jest-environment jsdom
 *
 * Testy autorského API (js/core/lexis-authoring.js). buildDelta je čistý → testuje
 * se přímo; apply se testuje s fake quill/Delta nad globálním jsdom dokumentem.
 */
const A = require('../../js/core/lexis-authoring');

const findText = (ops, s) => ops.find(o => o.insert === s);
const nlWith = (ops, key) => ops.filter(o => o.insert === '\n' && o.attributes && o.attributes[key] !== undefined);

describe('buildDelta — bloky', () => {
    test('prázdný spec → jediný \\n', () => {
        expect(A.buildDelta({}).ops).toEqual([{ insert: '\n' }]);
    });
    test('nevalidní spec → chyba', () => {
        expect(() => A.buildDelta(null)).toThrow();
        expect(() => A.buildDelta('x')).toThrow();
    });
    test('title → tučný text + vycentrovaný odstavec', () => {
        const ops = A.buildDelta({ title: 'Kupní smlouva' }).ops;
        expect(ops[0]).toEqual({ insert: 'Kupní smlouva', attributes: { bold: true } });
        expect(ops[1]).toEqual({ insert: '\n', attributes: { align: 'center' } });
    });
    test('heading → newline s header atributem', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'heading', level: 2, text: 'Článek I' }] }).ops;
        expect(findText(ops, 'Článek I')).toBeDefined();
        expect(nlWith(ops, 'header')[0].attributes.header).toBe(2);
    });
    test('heading mimo rozsah → default 1', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'heading', text: 'H' }] }).ops;
        expect(nlWith(ops, 'header')[0].attributes.header).toBe(1);
    });
    test('paragraph + zarovnání', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'paragraph', text: 'Text.', align: 'justify' }] }).ops;
        expect(findText(ops, 'Text.')).toBeDefined();
        expect(nlWith(ops, 'align')[0].attributes.align).toBe('justify');
    });
    test('align left se nezapisuje', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'paragraph', text: 'X', align: 'left' }] }).ops;
        expect(nlWith(ops, 'align').length).toBe(0);
    });
    test('runs → inline bold/link', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'paragraph', runs: [
            { text: 'tučně', bold: true }, { text: ' a ' }, { text: 'odkaz', link: 'https://justice.cz' }
        ] }] }).ops;
        expect(findText(ops, 'tučně').attributes).toEqual({ bold: true });
        expect(findText(ops, 'odkaz').attributes).toEqual({ link: 'https://justice.cz' });
        expect(findText(ops, ' a ').attributes).toBeUndefined();
    });
    test('paragraph s poznámkou pod čarou → footnote embed', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'paragraph', text: 'Tvrzení', footnote: 'Srov. NS 21 Cdo 1/2020.' }] }).ops;
        const fn = ops.find(o => o.insert && o.insert.footnote);
        expect(fn.insert.footnote.text).toBe('Srov. NS 21 Cdo 1/2020.');
        expect(fn.insert.footnote.number).toBe('?');
    });
    test('list ordered/bullet', () => {
        const o1 = A.buildDelta({ blocks: [{ type: 'list', ordered: true, items: ['a', 'b'] }] }).ops;
        expect(nlWith(o1, 'list').map(x => x.attributes.list)).toEqual(['ordered', 'ordered']);
        const o2 = A.buildDelta({ blocks: [{ type: 'list', items: ['a'] }] }).ops;
        expect(nlWith(o2, 'list')[0].attributes.list).toBe('bullet');
    });
    test('table z cells', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'table', cells: [['A', 'B'], ['C', 'D']] }] }).ops;
        expect(ops.find(o => o.insert && o.insert.table).insert.table.rows).toEqual([['A', 'B'], ['C', 'D']]);
    });
    test('table z rows/cols bez cells', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'table', rows: 2, cols: 3 }] }).ops;
        const t = ops.find(o => o.insert && o.insert.table);
        expect(t.insert.table.rows.length).toBe(2);
        expect(t.insert.table.rows[0]).toEqual(['', '', '']);
    });
    test('table respektuje maxima (50×12)', () => {
        const t = A.buildDelta({ blocks: [{ type: 'table', rows: 999, cols: 999 }] }).ops.find(o => o.insert && o.insert.table);
        expect(t.insert.table.rows.length).toBe(50);
        expect(t.insert.table.rows[0].length).toBe(12);
    });
    test('toc a pageBreak → embedy', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'toc' }, { type: 'pageBreak' }] }).ops;
        expect(ops.find(o => o.insert && o.insert.toc === true)).toBeDefined();
        expect(ops.find(o => o.insert && o.insert['page-break'] === true)).toBeDefined();
    });
    test('dokument vždy končí \\n', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'table', cells: [['x']] }] }).ops;
        const last = ops[ops.length - 1];
        expect(typeof last.insert === 'string' && last.insert.endsWith('\n')).toBe(true);
    });
    test('neznámý typ bloku se ignoruje', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'quantum' }, { type: 'paragraph', text: 'ok' }] }).ops;
        expect(findText(ops, 'ok')).toBeDefined();
    });
});

describe('buildDelta — seznam citované judikatury (authorities)', () => {
    test('sesbírá a odduplikuje citace z celého dokumentu', () => {
        const ops = A.buildDelta({ blocks: [
            { type: 'paragraph', text: 'Viz 21 Cdo 1234/2019 a III. ÚS 3136/17.' },
            { type: 'paragraph', text: 'Znovu 21 Cdo 1234/2019 (duplicita) a NSS 1 As 12/2020.', footnote: 'Pl. ÚS 12/20' },
            { type: 'authorities', title: 'Seznam citované judikatury' }
        ] }).ops;
        // nadpis
        expect(findText(ops, 'Seznam citované judikatury')).toBeDefined();
        // položky jako bullet list
        const bullets = ops.filter(o => o.insert === '\n' && o.attributes && o.attributes.list === 'bullet').length;
        expect(bullets).toBe(4); // 21 Cdo, 1 As, III. ÚS, Pl. ÚS (bez duplicit)
        expect(findText(ops, '21 Cdo 1234/2019')).toBeDefined();
        expect(findText(ops, 'III. ÚS 3136/2017')).toBeDefined();
    });
    test('bez citací → informativní věta', () => {
        const ops = A.buildDelta({ blocks: [
            { type: 'paragraph', text: 'Text bez judikatury.' },
            { type: 'authorities' }
        ] }).ops;
        expect(findText(ops, 'Žádná judikatura nebyla citována.')).toBeDefined();
    });
});

describe('buildHeaderFooter', () => {
    const LH = { buildHeaderHtml: (p) => `<b>${p.firm}</b>`, buildFooterHtml: (p) => `<i>${p.ico}</i>` };
    test('z profilu vytvoří hlavičku i patičku', () => {
        const hf = A.buildHeaderFooter({ letterhead: { profile: { firm: 'AK Novák', ico: '123' } } }, LH);
        expect(hf.headerHtml).toBe('<b>AK Novák</b>');
        expect(hf.footerHtml).toBe('<i>123</i>');
    });
    test('bez profilu / bez impl → null', () => {
        expect(A.buildHeaderFooter({}, LH)).toBeNull();
        expect(A.buildHeaderFooter({ letterhead: { profile: {} } }, null)).toBeNull();
    });
});

describe('apply — runtime nad jsdom dokumentem', () => {
    function reset() {
        document.body.innerHTML = '<div id="editor-wrapper"></div><div id="header-area"></div><div id="footer-area"></div>';
    }
    function ctxFactory() {
        reset();
        const captured = {};
        const quill = { setContents: (delta) => { captured.delta = delta; } };
        function Delta(ops) { this.ops = ops; }
        const LH = { buildHeaderHtml: (p) => `HDR:${p.firm}`, buildFooterHtml: (p) => `FTR:${p.ico}`, safeLogo: (x) => x };
        return { captured, ctx: { quill, Delta, document, LexisLetterhead: LH,
            sanitize: (h) => h, escapeHTML: (s) => String(s), core: { updateFootnoteNumbers: () => { captured.fnCalled = true; } } } };
    }
    test('vloží Deltu a zavolá updateFootnoteNumbers', () => {
        const f = ctxFactory();
        const res = A.apply({ blocks: [{ type: 'paragraph', text: 'Ahoj' }] }, f.ctx);
        expect(f.captured.delta.ops.some(o => o.insert === 'Ahoj')).toBe(true);
        expect(f.captured.fnCalled).toBe(true);
        expect(res.blocks).toBe(1);
    });
    test('vyplní hlavičku i patičku z profilu', () => {
        const f = ctxFactory();
        const res = A.apply({ letterhead: { profile: { firm: 'AK X', ico: '99' } }, blocks: [] }, f.ctx);
        expect(document.getElementById('header-area').innerHTML).toBe('HDR:AK X');
        expect(document.getElementById('footer-area').innerHTML).toBe('FTR:99');
        expect(res.header).toBe(true);
    });
    test('nastaví vodoznak s data-atributy', () => {
        const f = ctxFactory();
        const res = A.apply({ watermark: { text: 'KONCEPT', color: '#ccc' }, blocks: [] }, f.ctx);
        const wm = document.getElementById('watermark-layer');
        expect(wm).not.toBeNull();
        expect(wm.getAttribute('data-watermark-text')).toBe('KONCEPT');
        expect(res.watermark).toBe(true);
    });
    test('bez quill → chyba', () => {
        expect(() => A.apply({ blocks: [] }, { document: null, quill: null })).toThrow();
    });
});

describe('deltaToSpec + round-trip (READ API)', () => {
    test('heading/paragraph/list/table/footnote se zrekonstruují', () => {
        const ops = [
            { insert: 'Nadpis' }, { insert: '\n', attributes: { header: 1 } },
            { insert: 'Text ' }, { insert: 'tučně', attributes: { bold: true } },
            { insert: { footnote: { id: 'fn-1', text: 'Srov. 21 Cdo 1/2019.', number: '?' } } },
            { insert: '\n', attributes: { align: 'justify' } },
            { insert: 'a' }, { insert: '\n', attributes: { list: 'ordered' } },
            { insert: 'b' }, { insert: '\n', attributes: { list: 'ordered' } },
            { insert: { table: { rows: [['X', 'Y']] } } }, { insert: '\n' },
            { insert: '\n' }
        ];
        const spec = A.deltaToSpec(ops);
        expect(spec.blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'list', 'table']);
        expect(spec.blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Nadpis' });
        expect(spec.blocks[1].align).toBe('justify');
        expect(spec.blocks[1].footnote).toBe('Srov. 21 Cdo 1/2019.');
        expect(spec.blocks[1].runs.find(r => r.bold).text).toBe('tučně');
        expect(spec.blocks[2]).toEqual({ type: 'list', ordered: true, items: ['a', 'b'] });
        expect(spec.blocks[3]).toEqual({ type: 'table', cells: [['X', 'Y']] });
    });

    test('prázdné odstavce (jen mezery) se vynechají', () => {
        const ops = [{ insert: 'A' }, { insert: '\n' }, { insert: '\n' }, { insert: '\n' }, { insert: 'B' }, { insert: '\n' }];
        const spec = A.deltaToSpec(ops);
        expect(spec.blocks.map(b => b.text)).toEqual(['A', 'B']);
    });

    test('round-trip: buildDelta → deltaToSpec zachová strukturu', () => {
        const original = { blocks: [
            { type: 'heading', level: 2, text: 'Článek I' },
            { type: 'paragraph', runs: [{ text: 'Viz ' }, { text: 'odkaz', link: 'https://justice.cz' }], align: 'justify' },
            { type: 'list', ordered: false, items: ['jedna', 'dva'] },
            { type: 'table', cells: [['a', 'b'], ['c', 'd']] }
        ] };
        const round = A.deltaToSpec(A.buildDelta(original).ops);
        expect(round.blocks).toEqual(original.blocks);
    });

    test('samostatná poznámka pod čarou přežije round-trip jako footnote', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'paragraph', text: 'Tvrzení', footnote: 'Pozn.' }] }).ops;
        const round = A.deltaToSpec(ops);
        expect(round.blocks[0].footnote).toBe('Pozn.');
    });
});

describe('readSpec — runtime čtení dokumentu', () => {
    test('přečte tělo + hlavičku + vodoznak z editoru', () => {
        document.body.innerHTML = '<div id="header-area">HDR</div><div id="footer-area">FTR</div>';
        const wm = document.createElement('div'); wm.id = 'watermark-layer';
        wm.setAttribute('data-watermark-text', 'KONCEPT'); wm.setAttribute('data-watermark-color', '#ccc');
        document.body.appendChild(wm);
        const quill = { getContents: () => ({ ops: [{ insert: 'Ahoj' }, { insert: '\n' }] }) };
        const spec = A.readSpec({ quill, document });
        expect(spec.blocks[0]).toEqual({ type: 'paragraph', text: 'Ahoj' });
        expect(spec.letterheadHtml).toEqual({ headerHtml: 'HDR', footerHtml: 'FTR' });
        expect(spec.watermark).toEqual({ text: 'KONCEPT', color: '#ccc' });
    });
    test('bez quill.getContents → chyba', () => {
        expect(() => A.readSpec({ quill: {}, document })).toThrow();
    });
});

describe('tableOps — programová editace tabulek', () => {
    const T = () => ({ type: 'table', cells: [['A', 'B'], ['C', 'D']] });
    test('setCell nastaví buňku', () => {
        const t = A.tableOps.setCell(T(), 1, 0, 'X');
        expect(t.cells).toEqual([['A', 'B'], ['X', 'D']]);
    });
    test('setCell rozšíří tabulku a doplní prázdné buňky', () => {
        const t = A.tableOps.setCell({ type: 'table', cells: [['A']] }, 2, 2, 'Z');
        expect(A.tableOps.dimensions(t)).toEqual({ rows: 3, cols: 3 });
        expect(t.cells[2][2]).toBe('Z');
        expect(t.cells[0][1]).toBe('');
    });
    test('addRow na konec i na index', () => {
        expect(A.tableOps.addRow(T(), null, ['E', 'F']).cells).toEqual([['A', 'B'], ['C', 'D'], ['E', 'F']]);
        expect(A.tableOps.addRow(T(), 0, ['E', 'F']).cells).toEqual([['E', 'F'], ['A', 'B'], ['C', 'D']]);
    });
    test('addRow bez hodnot doplní prázdný řádek správné šířky', () => {
        const t = A.tableOps.addRow(T());
        expect(t.cells[2]).toEqual(['', '']);
    });
    test('removeRow odebere řádek', () => {
        expect(A.tableOps.removeRow(T(), 0).cells).toEqual([['C', 'D']]);
    });
    test('addColumn vloží sloupec', () => {
        expect(A.tableOps.addColumn(T(), 1, ['x', 'y']).cells).toEqual([['A', 'x', 'B'], ['C', 'y', 'D']]);
    });
    test('removeColumn odebere sloupec', () => {
        expect(A.tableOps.removeColumn(T(), 0).cells).toEqual([['B'], ['D']]);
    });
    test('dimensions vrací rozměry', () => {
        expect(A.tableOps.dimensions(T())).toEqual({ rows: 2, cols: 2 });
    });
    test('nad neexistující tabulkou vyhodí chybu', () => {
        expect(() => A.tableOps.setCell({ type: 'paragraph' }, 0, 0, 'x')).toThrow();
    });
    test('celý workflow: číst → upravit tabulku → zapsat (round-trip)', () => {
        const spec = A.deltaToSpec(A.buildDelta({ blocks: [{ type: 'table', cells: [['Faktura', 'Částka']] }] }).ops);
        A.tableOps.addRow(spec.blocks[0], null, ['2025/001', '50 000 Kč']);
        const ops = A.buildDelta(spec).ops;
        const t = ops.find(o => o.insert && o.insert.table);
        expect(t.insert.table.rows).toEqual([['Faktura', 'Částka'], ['2025/001', '50 000 Kč']]);
    });
});

describe('křížové odkazy a číslování nadpisů', () => {
    const findText = (ops, s) => ops.find(o => o.insert === s);
    test('numberHeadings: 1. úroveň římsky, hlubší arabsky', () => {
        const ops = A.buildDelta({ numberHeadings: true, blocks: [
            { type: 'heading', level: 1, text: 'Úvod' },
            { type: 'heading', level: 2, text: 'Detail' },
            { type: 'heading', level: 1, text: 'Závěr' }
        ] }).ops;
        expect(findText(ops, 'I. Úvod')).toBeDefined();
        expect(findText(ops, 'I.1 Detail')).toBeDefined();
        expect(findText(ops, 'II. Závěr')).toBeDefined();
    });
    test('bez numberHeadings se nadpisy nečíslují', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'heading', level: 1, text: 'Úvod', id: 'u' }] }).ops;
        expect(findText(ops, 'Úvod')).toBeDefined();
        expect(findText(ops, 'I. Úvod')).toBeUndefined();
    });
    test('ref → číslo cílového nadpisu', () => {
        const ops = A.buildDelta({ blocks: [
            { type: 'heading', level: 1, text: 'Skutkový stav', id: 'skutek' },
            { type: 'heading', level: 1, text: 'Právní posouzení' },
            { type: 'paragraph', runs: [{ text: 'Jak plyne z čl. ' }, { ref: 'skutek' }, { text: ' výše.' }] }
        ] }).ops;
        // cíl je 1. nadpis → "I"
        expect(findText(ops, 'I')).toBeDefined();
        expect(findText(ops, 'Jak plyne z čl. ')).toBeDefined();
    });
    test('ref as:title → text nadpisu', () => {
        const ops = A.buildDelta({ blocks: [
            { type: 'heading', level: 1, text: 'Skutkový stav', id: 'skutek' },
            { type: 'paragraph', runs: [{ ref: 'skutek', as: 'title' }] }
        ] }).ops;
        expect(findText(ops, 'Skutkový stav')).toBeDefined();
    });
    test('neznámý ref → ?', () => {
        const ops = A.buildDelta({ blocks: [{ type: 'paragraph', runs: [{ ref: 'neexistuje' }] }] }).ops;
        expect(findText(ops, '?')).toBeDefined();
    });
});
