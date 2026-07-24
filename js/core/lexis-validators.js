// --- LexisValidators — validace českých identifikátorů ---
// Čisté, testovatelné funkce. Zatím IČO (kontrolní součet modulo-11) — pomáhá
// chytit překlep dřív, než se zbytečně volá ARES.

'use strict';

(function () {
    // Platné IČO: 8 číslic, poslední je kontrolní součet (váhy 8..2, modulo-11).
    function isValidIco(ico) {
        const s = String(ico == null ? '' : ico).replace(/\s/g, '');
        if (!/^\d{8}$/.test(s)) return false;
        const d = s.split('').map(Number);
        let sum = 0;
        for (let i = 0; i < 7; i++) sum += d[i] * (8 - i);
        const r = sum % 11;
        const check = r === 0 ? 1 : (r === 1 ? 0 : 11 - r);
        return check === d[7];
    }

    const api = { isValidIco };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LexisValidators = api;
})();
