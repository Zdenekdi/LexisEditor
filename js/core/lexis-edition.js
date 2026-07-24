// --- LexisEdition — edice a balíčky (packs) z jednoho zdroje pravdy ---
// Umožní z jednoho kódu skládat edice: Core (jednotlivci) + Business (firmy) +
// Legal/Lexis (advokáti). Edice = seznam balíčků. UI se řídí deklarativně:
//   • prvek s atributem data-pack="legal" se skryje, když edice ten balíček nemá,
//   • prvek s data-brand-name dostane název edice.
// Výchozí edice je „full" (vše zapnuté) → dnešní chování se NEMĚNÍ; přibývá jen
// vypínač. Edici lze pro test přepnout přes ?edition=core, localStorage
// ('lexis_edition') nebo build override (window.LEXIS_EDITION).
//
// POZOR: tohle řídí jen ZOBRAZENÍ/skládání. Technické identifikátory (klíč,
// datové složky, ISDS PRODID, klíče v úložišti) se editicí NEMĚNÍ.

'use strict';

(function () {
    const EDITIONS = {
        full:     { id: 'full',     brandName: 'LexisEditor',  supportEmail: 'podpora@lexiseditor.cz',  packs: ['core', 'business', 'legal'] },
        legal:    { id: 'legal',    brandName: 'Lexis',        supportEmail: 'podpora@lexiseditor.cz',  packs: ['core', 'legal'] },
        business: { id: 'business', brandName: 'Nexus Editor', supportEmail: 'podpora@nexus-editor.cz', packs: ['core', 'business'] },
        core:     { id: 'core',     brandName: 'Nexus Editor', supportEmail: 'podpora@nexus-editor.cz', packs: ['core'] }
    };
    const DEFAULT_ID = 'full'; // dnešní chování = všechny balíčky

    function resolveEditionId() {
        try {
            if (typeof window !== 'undefined') {
                if (window.LEXIS_EDITION && EDITIONS[window.LEXIS_EDITION]) return window.LEXIS_EDITION;
                const search = (window.location && window.location.search) || '';
                const m = search.match(/[?&]edition=([a-z]+)/i);
                if (m && EDITIONS[m[1].toLowerCase()]) return m[1].toLowerCase();
                if (window.localStorage) {
                    const ls = window.localStorage.getItem('lexis_edition');
                    if (ls && EDITIONS[ls]) return ls;
                }
            }
        } catch (e) { /* ignore */ }
        return DEFAULT_ID;
    }

    // Prvek patří k jednomu nebo více balíčkům: data-pack="business legal" → zobrazí
    // se, když edice má ASPOŇ JEDEN z nich (OR — funkce je součástí business i legal
    // edice). Prázdný data-pack = vždy zobrazit.
    function elementAllowed(packs, attr) {
        const need = String(attr || '').split(/[\s,]+/).filter(Boolean);
        return need.length === 0 || need.some(p => packs.indexOf(p) !== -1);
    }

    function make(id) {
        const def = EDITIONS[id] || EDITIONS[DEFAULT_ID];
        const packs = def.packs.slice();
        return {
            id: def.id,
            brandName: def.brandName,
            supportEmail: def.supportEmail || '',
            packs: packs,
            has: function (pack) { return packs.indexOf(pack) !== -1; },
            allowed: function (attr) { return elementAllowed(packs, attr); },
            // Skryje prvky [data-pack], které edice nemá; vyplní [data-brand-name].
            apply: function (root) {
                const scope = root || (typeof document !== 'undefined' ? document : null);
                if (!scope || !scope.querySelectorAll) return;
                scope.querySelectorAll('[data-pack]').forEach(function (el) {
                    if (!elementAllowed(packs, el.getAttribute('data-pack'))) {
                        el.style.display = 'none';
                        el.setAttribute('data-pack-hidden', '1');
                    }
                });
                scope.querySelectorAll('[data-brand-name]').forEach(function (el) {
                    el.textContent = def.brandName;
                });
            }
        };
    }

    const edition = make(resolveEditionId());

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { EDITIONS, DEFAULT_ID, resolveEditionId, elementAllowed, make, edition };
    }
    if (typeof window !== 'undefined') {
        window.LexisEdition = edition;
        window.Edition = edition; // krátký alias pro guardy: Edition.has('legal')
        const run = function () { try { edition.apply(document); } catch (e) { /* ignore */ } };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
        else run();
    }
})();
