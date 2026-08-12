/**
 * license.test.js — offline validátor licencí (js/core/lexis-license.js).
 * Vygeneruje efemerní Ed25519 pár, vydá + ověří licence, testuje tamper/expiraci/grace.
 */
const crypto = require('crypto');
const { verifyLicense, canonicalPayload, tierToEditionId, VALID_TIERS } = require('../../js/core/lexis-license');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' });

function issue(payload) {
    const signature = crypto.sign(null, canonicalPayload(payload), privateKey).toString('base64');
    return { payload, signature };
}

describe('lexis-license verifyLicense', () => {
    test('platná pro licence s expirací', () => {
        const lic = issue({ tier: 'pro', name: 'Jan Novak', seats: 1, issued: '2026-01-01', expires: '2099-01-01' });
        const r = verifyLicense(lic, PUB);
        expect(r.valid).toBe(true);
        expect(r.tier).toBe('pro');
        expect(r.reason).toBe('ok');
        expect(tierToEditionId(r.tier)).toBe('legal');
    });

    test('platná perpetual licence (bez expires)', () => {
        const lic = issue({ tier: 'firm', name: 'AK', seats: 5, issued: '2026-01-01' });
        const r = verifyLicense(lic, PUB);
        expect(r.valid).toBe(true);
        expect(r.tier).toBe('firm');
        expect(tierToEditionId(r.tier)).toBe('full');
    });

    test('manipulace s tier → bad-signature', () => {
        const lic = issue({ tier: 'pro', expires: '2099-01-01' });
        lic.payload.tier = 'firm'; // podvrh po podpisu
        expect(verifyLicense(lic, PUB).reason).toBe('bad-signature');
    });

    test('cizí veřejný klíč → bad-signature', () => {
        const lic = issue({ tier: 'pro', expires: '2099-01-01' });
        const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
        expect(verifyLicense(lic, other).reason).toBe('bad-signature');
    });

    test('expirovaná licence (za hranicí grace) → expired', () => {
        const lic = issue({ tier: 'pro', expires: '2026-01-01' });
        const r = verifyLicense(lic, PUB, { now: '2030-01-01' });
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('expired');
    });

    test('v grace okně (těsně po expiraci) → valid/grace', () => {
        const lic = issue({ tier: 'pro', expires: '2026-01-10' });
        const r = verifyLicense(lic, PUB, { now: '2026-01-20', graceDays: 21 });
        expect(r.valid).toBe(true);
        expect(r.reason).toBe('grace');
    });

    test('neznámý tier → bad-tier', () => {
        const lic = issue({ tier: 'enterprise', expires: '2099-01-01' });
        expect(verifyLicense(lic, PUB).reason).toBe('bad-tier');
    });

    test('prázdný veřejný klíč (licencování neaktivní) → no-public-key', () => {
        const lic = issue({ tier: 'pro', expires: '2099-01-01' });
        expect(verifyLicense(lic, '').reason).toBe('no-public-key');
    });

    test('chybějící licence / malformed', () => {
        expect(verifyLicense(null, PUB).reason).toBe('no-license');
        expect(verifyLicense({ payload: { tier: 'pro' } }, PUB).reason).toBe('malformed');
    });

    test('tierToEditionId mapuje všechny vrstvy', () => {
        expect(VALID_TIERS).toEqual(['free', 'pro', 'firm']);
        expect(tierToEditionId('free')).toBe('core');
        expect(tierToEditionId('pro')).toBe('legal');
        expect(tierToEditionId('firm')).toBe('full');
        expect(tierToEditionId('x')).toBe(null);
    });
});
