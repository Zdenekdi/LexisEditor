/**
 * Testy parsování ZFO (js/core/lexis-zfo.js) — datové zprávy ISDS.
 * Testuje heuristickou i korektní DER (CMS) cestu; DER se vyrobí přes node-forge.
 */

const forge = require('node-forge');
const { extractZfoXml, zfoTagValue, collectAsn1Strings } = require('../../js/core/lexis-zfo');

const SAMPLE_XML = '<?xml version="1.0"?><q:dmMessage xmlns:q="urn:isds"><q:dmDm><q:dmSender>Okresní soud v Brně</q:dmSender><q:dbIDSender>abc12de</q:dbIDSender><q:dmAnnotation>Předvolání</q:dmAnnotation></q:dmDm></q:dmMessage>';

// Sestaví minimální DER, kde je XML zapouzdřené jako řetězcový list ASN.1.
function makeDer(xml) {
    const asn1 = forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SEQUENCE,
        true,
        [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, xml)]
    );
    const der = forge.asn1.toDer(asn1).getBytes();
    return Buffer.from(der, 'binary');
}

describe('extractZfoXml — heuristika (nepodepsaný/netypický)', () => {
    test('vytáhne <dmMessage> blok (namespace-tolerantně)', () => {
        // Pozn.: heuristická cesta čte bajty jako binární (toString('binary')),
        // takže diakritika se v tomto fallbacku může zkomolit — ověřujeme proto
        // ASCII strukturu (tagy), ne přízvučný obsah. Reálné ZFO jde přes DER cestu.
        const out = extractZfoXml(Buffer.from('SMET junk' + SAMPLE_XML + 'trailing', 'utf-8'));
        expect(out).toMatch(/^<q:dmMessage/);           // ořízlo junk před i za blokem
        expect(out).toContain('dmSender');
        expect(out.endsWith('</q:dmMessage>')).toBe(true);
    });

    test('bez dmMessage spadne na <?xml', () => {
        const out = extractZfoXml(Buffer.from('binární smetí<?xml version="1.0"?><foo/>', 'utf-8'));
        expect(out.startsWith('<?xml')).toBe(true);
    });

    test('nic k nalezení → prázdný řetězec', () => {
        expect(extractZfoXml(Buffer.from('žádné xml tady', 'utf-8'))).toBe('');
    });
});

describe('extractZfoXml — korektní CMS/DER cesta', () => {
    test('najde XML zapouzdřené v ASN.1/DER kontejneru', () => {
        const der = makeDer(SAMPLE_XML);
        const out = extractZfoXml(der);
        expect(out).toContain('dmMessage');
        expect(out).toContain('dmAnnotation'); // XML nalezeno v DER kontejneru
        expect(zfoTagValue(out, 'dbIDSender')).toBe('abc12de');
    });
});

describe('zfoTagValue — namespace-tolerantní extrakce elementu', () => {
    test('vytáhne hodnotu i s prefixem a atributy', () => {
        expect(zfoTagValue(SAMPLE_XML, 'dmSender')).toBe('Okresní soud v Brně');
        expect(zfoTagValue(SAMPLE_XML, 'dbIDSender')).toBe('abc12de');
        expect(zfoTagValue('<dmFileDescr lang="cs">priloha.pdf</dmFileDescr>', 'dmFileDescr')).toBe('priloha.pdf');
    });

    test('chybějící element → prázdný řetězec', () => {
        expect(zfoTagValue(SAMPLE_XML, 'neexistuje')).toBe('');
    });
});

describe('collectAsn1Strings', () => {
    test('posbírá řetězcové listy rekurzivně', () => {
        const tree = { value: [{ value: 'a' }, { value: [{ value: 'b' }] }, { value: 123 }] };
        const out = [];
        collectAsn1Strings(tree, out);
        expect(out).toEqual(['a', 'b']);
    });

    test('respektuje strop hloubky/počtu (nezacyklí)', () => {
        const out = new Array(5001).fill('x');
        collectAsn1Strings({ value: [{ value: 'nový' }] }, out);
        expect(out.length).toBe(5001); // nic nepřidal přes strop
    });
});
