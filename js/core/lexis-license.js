'use strict';
/**
 * lexis-license.js — offline ověření licence (Ed25519), bez síťové závislosti.
 *
 * Princip: licence = { payload, signature }. payload nese tier (free|pro|firm),
 * platnost (expires, volitelně = perpetual), seats, jméno a ID zákazníka.
 * Podpis je Ed25519 nad KANONICKÝM payloadem (klíče seřazené) a ověřuje se
 * veřejným klíčem zabudovaným v aplikaci (js/core/lexis-license-key.js).
 *
 * DŮLEŽITÉ: samotné licencování je ZATÍM NEAKTIVNÍ — viz LICENSING_ENABLED v main.js.
 * Tento modul je čistá, testovatelná logika (žádný electron / window).
 */
const crypto = require('crypto');

const VALID_TIERS = ['free', 'pro', 'firm'];
const DEFAULT_GRACE_DAYS = 21; // offline tolerance po expiraci (než se stihne online refresh)

// Kanonizace payloadu → deterministické bajty. MUSÍ být shodné při podpisu i ověření.
function canonicalPayload(payload) {
    const keys = Object.keys(payload).sort();
    const obj = {};
    for (const k of keys) obj[k] = payload[k];
    return Buffer.from(JSON.stringify(obj), 'utf8');
}

// tier → id edice v lexis-edition.js
function tierToEditionId(tier) {
    return ({ free: 'core', pro: 'legal', firm: 'full' })[tier] || null;
}

/**
 * @returns {{valid:boolean, tier:(string|null), reason:string, expires?:(string|null), name?:string, seats?:number, customerId?:string}}
 * reason: 'ok' | 'grace' | 'no-public-key' | 'no-license' | 'malformed' | 'bad-signature' | 'bad-tier' | 'expired' | 'error:...'
 */
function verifyLicense(license, publicKeyPem, opts = {}) {
    const now = opts.now ? new Date(opts.now) : new Date();
    const graceDays = (opts.graceDays != null) ? opts.graceDays : DEFAULT_GRACE_DAYS;
    try {
        if (!publicKeyPem) return { valid: false, tier: null, reason: 'no-public-key' };
        if (!license || typeof license !== 'object') return { valid: false, tier: null, reason: 'no-license' };
        const payload = license.payload;
        const signature = license.signature;
        if (!payload || typeof payload !== 'object' || !signature) return { valid: false, tier: null, reason: 'malformed' };

        const pubKey = crypto.createPublicKey(publicKeyPem);
        const sig = Buffer.from(String(signature), 'base64');
        const ok = crypto.verify(null, canonicalPayload(payload), pubKey, sig);
        if (!ok) return { valid: false, tier: null, reason: 'bad-signature' };

        const tier = payload.tier;
        if (!VALID_TIERS.includes(tier)) return { valid: false, tier: null, reason: 'bad-tier' };

        const base = {
            tier: tier,
            name: payload.name || '',
            seats: payload.seats || 1,
            customerId: payload.customerId || '',
            expires: payload.expires || null
        };

        if (payload.expires) {
            const exp = new Date(payload.expires);
            const graceMs = graceDays * 24 * 60 * 60 * 1000;
            if (now.getTime() > exp.getTime() + graceMs) {
                return Object.assign({ valid: false, reason: 'expired' }, base);
            }
            const inGrace = now.getTime() > exp.getTime();
            return Object.assign({ valid: true, reason: inGrace ? 'grace' : 'ok' }, base);
        }
        return Object.assign({ valid: true, reason: 'ok' }, base); // perpetual
    } catch (e) {
        return { valid: false, tier: null, reason: 'error:' + e.message };
    }
}

module.exports = { verifyLicense, canonicalPayload, tierToEditionId, VALID_TIERS, DEFAULT_GRACE_DAYS };
