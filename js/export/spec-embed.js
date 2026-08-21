/**
 * spec-embed.js — vnoří LexisEditor „spec" (JSON) do .docx jako custom XML part.
 * Word tuto část IGNORUJE (dokument se otevře normálně), LexisEditor/agent si ji
 * přečte zpět a má plnou věrnost (bloky, ID, AI provenance). Běží v Node/Electron main.
 *
 * embedSpec(docxBuffer, spec) -> Buffer (nové .docx se vnořeným spec)
 * extractSpec(docxBuffer)     -> spec objekt | null
 */
'use strict';
const JSZip = require('jszip');

const NS = 'urn:lexiseditor:spec';
const ITEM = 'customXml/item1.xml';
const PROPS = 'customXml/itemProps1.xml';
const ITEM_RELS = 'customXml/_rels/item1.xml.rels';
const GUID = '{4C3E9A21-0F5B-4E8A-9D2C-1A2B3C4D5E6F}';

async function embedSpec(docxBuffer, spec) {
    const zip = await JSZip.loadAsync(docxBuffer);
    const b64 = Buffer.from(JSON.stringify(spec || {}), 'utf-8').toString('base64');

    zip.file(ITEM, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><lexisSpec xmlns="${NS}" enc="base64">${b64}</lexisSpec>`);
    zip.file(PROPS, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ds:datastoreItem ds:itemID="${GUID}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${NS}"/></ds:schemaRefs></ds:datastoreItem>`);
    zip.file(ITEM_RELS, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>`);

    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!ct.includes('customXmlProperties+xml')) {
        const override = '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>';
        ct = ct.replace('</Types>', override + '</Types>');
        zip.file('[Content_Types].xml', ct);
    }

    const relsPath = 'word/_rels/document.xml.rels';
    let rels = await zip.file(relsPath).async('string');
    if (!rels.includes('customXml/item1.xml')) {
        const rel = '<Relationship Id="rIdLexisSpec" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/>';
        rels = rels.replace('</Relationships>', rel + '</Relationships>');
        zip.file(relsPath, rels);
    }

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function extractSpec(docxBuffer) {
    const zip = await JSZip.loadAsync(docxBuffer);
    const names = Object.keys(zip.files).filter(n => /^customXml\/item\d+\.xml$/.test(n));
    for (const n of names) {
        const xml = await zip.file(n).async('string');
        if (xml.includes(NS)) {
            const m = xml.match(/<lexisSpec[^>]*>([\s\S]*?)<\/lexisSpec>/);
            if (m) {
                try { return JSON.parse(Buffer.from(m[1].trim(), 'base64').toString('utf-8')); }
                catch (e) { return null; }
            }
        }
    }
    return null;
}

module.exports = { embedSpec, extractSpec, NS };
