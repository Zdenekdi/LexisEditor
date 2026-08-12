#!/usr/bin/env node
'use strict';
/**
 * generate-keypair.js — vygeneruje Ed25519 pár klíčů pro licencování.
 * Privátní klíč = podepisuje licence (drž v tajnosti). Veřejný = do aplikace.
 *
 * Použití:  node tools/license/generate-keypair.js [výstupní-složka]
 * Výchozí složka: ./.license-keys  (je v .gitignore — NEcommituj privátní klíč!)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || path.join(process.cwd(), '.license-keys');
fs.mkdirSync(outDir, { recursive: true });

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const pubPath = path.join(outDir, 'license_public.pem');
const privPath = path.join(outDir, 'license_private.pem');
fs.writeFileSync(pubPath, pubPem);
fs.writeFileSync(privPath, privPem, { mode: 0o600 });

console.log('Vygenerováno:');
console.log('  veřejný klíč :', pubPath);
console.log('  privátní klíč:', privPath, '(0600 — NEcommituj!)');
console.log('\n--- Zkopíruj VEŘEJNÝ klíč do js/core/lexis-license-key.js ---\n');
console.log(pubPem);
console.log("Do lexis-license-key.js vlož jako:");
console.log("const LICENSE_PUBLIC_KEY_PEM = `" + pubPem.trim() + "`;");
