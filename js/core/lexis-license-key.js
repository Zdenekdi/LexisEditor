'use strict';
/**
 * lexis-license-key.js — VEŘEJNÝ klíč pro ověření licencí (Ed25519, PEM/SPKI).
 *
 * PRÁZDNÉ = licencování NEAKTIVNÍ (app běží ve výchozí edici, viz main.js).
 * Aktivace: vygeneruj pár `node tools/license/generate-keypair.js`, sem vlož
 * VEŘEJNÝ klíč a v main.js přepni LICENSING_ENABLED = true.
 *
 * PRIVÁTNÍ klíč NIKDY necommituj (podepisuje licence, drž ho u sebe / v trezoru).
 */
const LICENSE_PUBLIC_KEY_PEM = '';

module.exports = { LICENSE_PUBLIC_KEY_PEM };
