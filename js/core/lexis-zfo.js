// --- lexis-zfo — parsování ZFO (datové zprávy ISDS) ---
// Vytaženo z main.js kvůli testovatelnosti. Logika je zachována beze změny.
//
// ZFO je PKCS#7 / CMS (DER) kontejner se zapouzdřeným XML datové zprávy.
// Parsujeme korektně přes node-forge (ASN.1 → obsah); když soubor není platný
// DER (netypický/nepodepsaný export), spadneme na tolerantní heuristiku.
// Vše je tolerantní k namespace prefixům (např. <p:dmMessage>).

'use strict';

const forge = require('node-forge');

// Rekurzivně posbírá řetězcové hodnoty listů z ASN.1 stromu (pro nalezení XML v CMS).
function collectAsn1Strings(node, out) {
    if (!node || typeof node !== 'object' || out.length > 5000) return;
    if (typeof node.value === 'string') {
        out.push(node.value);
    } else if (Array.isArray(node.value)) {
        for (const child of node.value) collectAsn1Strings(child, out);
    }
}

// Vytáhne XML datové zprávy ze ZFO bufferu.
function extractZfoXml(zfoBuffer) {
    const hasMsg = (s) => /<(?:[\w-]+:)?dmMessage[\s>]/.test(s) || /<\?xml/.test(s);
    // 1) Korektní CMS/DER cesta.
    try {
        const der = forge.util.createBuffer(zfoBuffer.toString('binary'));
        const asn1 = forge.asn1.fromDer(der);
        const leaves = [];
        collectAsn1Strings(asn1, leaves);
        for (const raw of leaves) {
            if (!raw || raw.length < 20) continue;
            let utf8 = raw;
            try { utf8 = forge.util.decodeUtf8(raw); } catch (e) {}
            if (hasMsg(utf8)) return utf8;
            if (hasMsg(raw)) return raw;
        }
    } catch (e) { /* není platný DER → heuristika níže */ }

    // 2) Heuristika pro netypické/nepodepsané soubory.
    const bin = zfoBuffer.toString('binary');
    const m = bin.match(/<(?:[\w-]+:)?dmMessage[\s>][\s\S]*?<\/(?:[\w-]+:)?dmMessage>/);
    if (m) return m[0];
    const x = bin.indexOf('<?xml');
    if (x !== -1) return bin.slice(x);
    return '';
}

// Namespace-tolerantní hodnota elementu.
function zfoTagValue(xml, tag) {
    const m = xml.match(new RegExp('<(?:[\\w-]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + tag + '>'));
    return m ? m[1].trim() : '';
}

module.exports = { collectAsn1Strings, extractZfoXml, zfoTagValue };
