#!/usr/bin/env node
/**
 * scripts/validate-doc.js — CLI validátor dokumentu (spec JSON).
 * Agent si po zápisu ověří: „je dokument platný / kde je chyba".
 *   node scripts/validate-doc.js dokument.json      (nebo `cat x.json | node scripts/validate-doc.js`)
 * Exit 0 = platné (bez chyb), 1 = obsahuje chyby, 2 = nešlo načíst.
 */
'use strict';
const fs = require('fs');
const { validate } = require('../js/core/lexis-authoring');

function read() {
    const f = process.argv[2];
    if (f && f !== '-') return fs.readFileSync(f, 'utf-8');
    return fs.readFileSync(0, 'utf-8'); // stdin
}
let spec;
try { spec = JSON.parse(read()); }
catch (e) { console.error('❌ Nelze načíst/naparsovat JSON:', e.message); process.exit(2); }

const { valid, errors } = validate(spec);
if (!errors.length) { console.log('✅ Dokument je platný (bez nálezů).'); process.exit(0); }

const err = errors.filter(e => e.severity === 'error');
const warn = errors.filter(e => e.severity === 'warning');
for (const e of errors) {
    const tag = e.severity === 'error' ? '❌ CHYBA ' : '⚠️  VAROVÁNÍ';
    const loc = e.blockId ? `blok ${e.blockId}` : (e.index >= 0 ? `blok #${e.index}` : 'dokument');
    console.log(`  ${tag}  [${e.code}] ${loc}: ${e.message}`);
}
console.log(`\n  Souhrn: ${err.length} chyb, ${warn.length} varování → ${valid ? 'PLATNÉ (jen varování)' : 'NEPLATNÉ'}`);
process.exit(valid ? 0 : 1);
