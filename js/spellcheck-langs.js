/**
 * spellcheck-langs.js — čistá pomůcka pro výběr jazyků Chromium spellcheckeru.
 *
 * Vybere z podporovaných jazyků (`available`, tj. session.availableSpellCheckerLanguages)
 * ty preferované (výchozí: čeština + angličtina) a zachová jejich pořadí. Bez závislosti
 * na Electronu → testovatelné v Node/jest.
 */
'use strict';

function pickSpellLanguages(available, preferred) {
    const avail = Array.isArray(available) ? available : [];
    const pref = (Array.isArray(preferred) && preferred.length) ? preferred : ['cs', 'en-US', 'en-GB'];
    const out = [];
    pref.forEach(l => {
        if (avail.indexOf(l) !== -1 && out.indexOf(l) === -1) out.push(l);
    });
    return out;
}

module.exports = { pickSpellLanguages };
