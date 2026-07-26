// --- lexis-lock — hašování a ověření hesla zámku aplikace (main proces) ---
// Vytaženo z main.js kvůli testovatelnosti. Logika i FORMÁT jsou zachovány
// beze změny, aby stávající uložená hesla (lexis_lock.json) dál ověřovala:
//   passwordScrypt = { salt: hex(16 B), hash: hex(scrypt(password, salt, keylen)), keylen: 64 }
// Ověření je v konstantním čase (crypto.timingSafeEqual). Heslo se ukládá
// jednosměrně (scrypt se solí) — NELZE ho zpětně dešifrovat.

'use strict';

const crypto = require('crypto');

const KEYLEN = 64;

// Vytvoří scrypt hash hesla se solí. Vrací serializovatelný objekt.
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(String(password == null ? '' : password), salt, KEYLEN);
    return { salt: salt.toString('hex'), hash: derived.toString('hex'), keylen: KEYLEN };
}

// Ověří heslo proti uloženému scrypt hashi v konstantním čase.
// passwordScrypt = { salt, hash, keylen? }. Vrací boolean.
function verifyPassword(passwordScrypt, inputPassword) {
    if (!passwordScrypt || !passwordScrypt.salt || !passwordScrypt.hash) return false;
    const salt = Buffer.from(passwordScrypt.salt, 'hex');
    const keylen = passwordScrypt.keylen || KEYLEN;
    const derived = crypto.scryptSync(inputPassword || '', salt, keylen);
    const stored = Buffer.from(passwordScrypt.hash, 'hex');
    return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
}

module.exports = { hashPassword, verifyPassword, KEYLEN };
