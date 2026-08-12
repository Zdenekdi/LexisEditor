#!/usr/bin/env node
'use strict';
/**
 * issue-license.js — vydá (podepíše) licenční soubor privátním klíčem.
 * V produkci tohle volá webhook merchant-of-record po platbě; tady ruční CLI.
 *
 * Použití:
 *   node tools/license/issue-license.js --tier pro --name "Jan Novak" \
 *        --customer CUST-123 --seats 1 --expires 2027-08-11 \
 *        --key .license-keys/license_private.pem --out lexis_license.json
 *
 * --expires vynech pro perpetual (trvalou) licenci.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalPayload, VALID_TIERS } = require(path.join(__dirname, '..', '..', 'js', 'core', 'lexis-license'));

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const tier = arg('tier');
if (!VALID_TIERS.includes(tier)) { console.error('Chybný --tier (free|pro|firm):', tier); process.exit(1); }
const keyPath = arg('key', path.join('.license-keys', 'license_private.pem'));
if (!fs.existsSync(keyPath)) { console.error('Privátní klíč nenalezen:', keyPath); process.exit(1); }

const payload = {
    tier: tier,
    name: arg('name', ''),
    customerId: arg('customer', ''),
    seats: parseInt(arg('seats', '1'), 10),
    issued: arg('issued', new Date().toISOString().slice(0, 10))
};
const expires = arg('expires');
if (expires) payload.expires = expires; // vynech = perpetual

const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
const signature = crypto.sign(null, canonicalPayload(payload), privateKey).toString('base64');

const license = { payload, signature };
const outPath = arg('out', 'lexis_license.json');
fs.writeFileSync(outPath, JSON.stringify(license, null, 2));
console.log('Licence vydána:', outPath);
console.log(JSON.stringify(license, null, 2));
