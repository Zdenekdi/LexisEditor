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
