/**
 * Regresní pojistka proti fikcím/atrapám v LexisEditoru. Hlídá, že se dříve
 * odstraněné výmysly (falešný certifikát, fabrikovaná ISDS odpověď, ARES simulace)
 * nevrátí do zdrojového kódu.
 */
const fs = require('fs');
const path = require('path');
const R = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf-8');

describe('Anti-fabrikace: podpis', () => {
    const ui4 = R('js/ui/lexis-ui-4.js');
    test('žádný fabrikovaný certifikát / CA / sériové číslo', () => {
        expect(ui4).not.toMatch(/advokat_qualified\.pfx/);
        expect(ui4).not.toMatch(/8ab20cf19238e89f/);
        expect(ui4).not.toMatch(/PostSignum Qualified CA 4/);
    });
    test('podpis volá reálné electronAPI.signPdf', () => {
        expect(ui4).toMatch(/electronAPI\.signPdf/);
    });
});

describe('Anti-fabrikace: ISDS odpověď', () => {
    const ui = R('js/ui/lexis-ui.js');
    test('reply nedosazuje natvrdo spisovou značku', () => {
        expect(ui).not.toMatch(/currentDocumentCj\s*=\s*'15 Co 123\/2026'/);
    });
    test('reálný inbox používá isdsInboxList', () => {
        expect(ui).toMatch(/isdsInboxList/);
    });
});

describe('Anti-fabrikace: ARES v prohlížeči', () => {
    const ui3 = R('js/ui/lexis-ui-3.js');
    test('žádná ARES simulace, používá reálné ares.gov.cz', () => {
        expect(ui3).not.toMatch(/Simuluji lustraci v ARES/);
        expect(ui3).not.toMatch(/Simulovaná data pro prohlížeč/);
        expect(ui3).toMatch(/ares\.gov\.cz/);
    });
});
