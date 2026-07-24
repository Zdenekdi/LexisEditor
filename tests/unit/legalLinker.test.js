/**
 * Testy Legal Linkeru (js/core/lexis-legal-linker.js) — převod českých právních
 * citací na odkazy. Dřív jen v UI a bez testů; navíc dvouprůchodová verze mohla
 * dělat vnořené odkazy — tady jeden průchod.
 */

const L = require('../../js/core/lexis-legal-linker');

describe('linkifyLegalCitations', () => {
    test('§-citace se prolinkuje na Zákony pro lidi (default)', () => {
        const r = L.linkifyLegalCitations('Podle § 57 odst. 2 o.s.ř. platí…', 'zakonyprolidi');
        expect(r.count).toBe(1);
        expect(r.changed).toBe(true);
        expect(r.html).toContain('<a href="https://www.zakonyprolidi.cz/hledani?q=');
        expect(r.html).toContain('class="legal-link"');
    });

    test('cíl Google', () => {
        const r = L.linkifyLegalCitations('viz § 2201 občanského zákoníku', 'google');
        expect(r.html).toContain('https://www.google.com/search?q=');
    });

    test('samostatný odkaz na zákon (bez §)', () => {
        const r = L.linkifyLegalCitations('dle zákona č. 89/2012 Sb. se…', 'zakonyprolidi');
        expect(r.count).toBe(1);
        expect(r.html).toContain('zákona č. 89/2012 Sb.');
        expect(r.html).toContain('<a href');
    });

    test('§ s číslem zákona se odkazuje JEN JEDNOU (žádné vnořené odkazy)', () => {
        const r = L.linkifyLegalCitations('§ 57 zákona č. 99/1963 Sb.', 'zakonyprolidi');
        // právě jeden <a> (dřív dvouprůchodová verze mohla vytvořit vnořený)
        expect((r.html.match(/<a\s/g) || []).length).toBe(1);
    });

    test('text bez citací se nemění', () => {
        const r = L.linkifyLegalCitations('Obyčejná věta bez odkazů.', 'zakonyprolidi');
        expect(r.changed).toBe(false);
        expect(r.count).toBe(0);
        expect(r.html).toBe('Obyčejná věta bez odkazů.');
    });

    test('prázdný / nullový vstup', () => {
        expect(L.linkifyLegalCitations('', 'google')).toMatchObject({ count: 0, changed: false });
        expect(L.linkifyLegalCitations(null, 'google').html).toBe('');
    });

    test('URL query je zakódované (mezery/diakritika)', () => {
        const u = L.urlFor('§ 57 o.s.ř.', 'zakonyprolidi');
        expect(u).not.toMatch(/\s/);
        expect(u).toContain('%');
    });
});
