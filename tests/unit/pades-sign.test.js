/**
 * @jest-environment node
 */
/**
 * Test REÁLNÉHO PAdES podpisu (js/core/pades-sign.js). Vygeneruje self-signed
 * certifikát, podepíše PDF a ověří, že vznikla platná PKCS#7 signedData + ByteRange.
 * Vyžaduje devDeps: @signpdf/*, pdf-lib, node-forge (viz package.json).
 */
const forge = require('node-forge');
const { PDFDocument } = require('pdf-lib');
const { signPdfBuffer, looksSigned } = require('../../js/core/pades-sign');

function makeP12(pass) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = '01';
    cert.validity.notBefore = new Date(2020, 0, 1); cert.validity.notAfter = new Date(2035, 0, 1);
    const attrs = [{ name: 'commonName', value: 'Test Advokat' }, { name: 'countryName', value: 'CZ' }];
    cert.setSubject(attrs); cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], pass, { algorithm: '3des' });
    return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

jest.setTimeout(30000);

test('signPdfBuffer vytvoří platný PAdES podpis (ByteRange + PKCS#7 signedData)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]).drawText('Testovaci dokument.', { x: 50, y: 780, size: 14 });
    const pdf = Buffer.from(await doc.save());

    const p12 = makeP12('test123');
    const signed = await signPdfBuffer(pdf, p12, 'test123', { reason: 'Souhlas', name: 'Test Advokat', location: 'Praha' });

    expect(signed.length).toBeGreaterThan(pdf.length);
    expect(looksSigned(signed)).toBe(true);

    const s = signed.toString('latin1');
    expect(/\/ByteRange\s*\[[^\]]+\]/.test(s)).toBe(true);
    const cm = s.match(/\/Contents\s*<([0-9A-Fa-f]+)>/);
    expect(cm).toBeTruthy();
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(forge.util.hexToBytes(cm[1])), { parseAllBytes: false });
    const p7 = forge.pkcs7.messageFromAsn1(asn1);
    expect(p7.type).toBe(forge.pki.oids.signedData);
});

test('odmítne prázdný vstup', async () => {
    await expect(signPdfBuffer(Buffer.alloc(0), Buffer.from('x'), 'p')).rejects.toThrow();
});
