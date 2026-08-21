/**
 * pades-sign.js — REÁLNÝ elektronický podpis PDF ve formátu PAdES (běží v Node/
 * Electron main procesu, NE v rendereru). Vloží do PDF podpisové pole (placeholder)
 * a podepíše ho certifikátem .p12/.pfx přes PKCS#7 (CMS). Výsledek se v Adobe Acrobatu
 * ověří jako platný podpis, pokud se certifikát řetězí k důvěryhodnému kořeni.
 *
 * ⚠️ Úroveň podpisu: AdES (zaručený) s měkkým certifikátem. Pro KVALIFIKOVANÝ podpis
 * (QES) musí soukromý klíč ležet na kvalifikovaném prostředku (token/čipová karta)
 * nebo se podpis musí provést kvalifikovanou vzdálenou službou — to tento modul neřeší.
 */
'use strict';

const { PDFDocument } = require('pdf-lib');
const signpdf = require('@signpdf/signpdf').default;
const { P12Signer } = require('@signpdf/signer-p12');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');

/**
 * Podepíše PDF buffer certifikátem .p12/.pfx.
 * @param {Buffer} pdfBuffer  vstupní PDF
 * @param {Buffer} p12Buffer  certifikát (.p12/.pfx)
 * @param {string} passphrase heslo k certifikátu
 * @param {object} [meta] { reason, name, location, contactInfo }
 * @returns {Promise<Buffer>} podepsané PDF
 */
async function signPdfBuffer(pdfBuffer, p12Buffer, passphrase, meta = {}) {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) throw new Error('Neplatné vstupní PDF.');
    if (!Buffer.isBuffer(p12Buffer) || p12Buffer.length === 0) throw new Error('Neplatný certifikát (.p12/.pfx).');

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdflibAddPlaceholder({
        pdfDoc,
        reason: meta.reason || 'Podpis dokumentu',
        contactInfo: meta.contactInfo || '',
        name: meta.name || '',
        location: meta.location || '',
    });
    const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

    const signer = new P12Signer(p12Buffer, { passphrase: passphrase || '' });
    const signed = await signpdf.sign(withPlaceholder, signer);
    return signed;
}

/** Rychlá kontrola, že PDF obsahuje podpisovou strukturu (ByteRange + Contents). */
function looksSigned(pdfBuffer) {
    const s = pdfBuffer.toString('latin1');
    return s.includes('/ByteRange') && s.includes('/Contents') && /\/Type\s*\/Sig/.test(s);
}

module.exports = { signPdfBuffer, looksSigned };
