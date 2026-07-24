// --- LexisLegalCalc — čisté právní výpočty (soudní poplatek, advokátní tarif, úrok) ---
// Vytaženo z lexis-dialogs.js: dřív byly formule přímo v UI (a tarif dokonce
// zdvojený — v živém výpočtu i ve „Vložit výpočet"). Tady jsou jako čisté funkce,
// jeden zdroj pravdy a pokryté testy (právně citlivá matematika).
// UI (dialogy) jen volá tyto funkce a formátuje výstup.

'use strict';

(function () {
    // Soudní poplatek z peněžitého plnění (zjednodušená procentní sazba dle
    // zák. č. 549/1991 Sb.): do 20 000 Kč pevně 1000; do 40 mil. 5 %; nad to
    // 2 000 000 + 1 % z části nad 40 mil. Vrací Kč (zaokrouhleno nahoru) nebo null.
    function soudniPoplatek(amount) {
        const val = Number(amount);
        if (!isFinite(val) || val < 0) return null;
        if (val <= 20000) return 1000;
        if (val <= 40000000) return Math.ceil(val * 0.05);
        return 2000000 + Math.ceil((val - 40000000) * 0.01);
    }

    // Sazba za JEDEN úkon právní služby dle § 7 advokátního tarifu (177/1996 Sb.).
    function advokatniTarifSazba(tarifniHodnota) {
        const val = Number(tarifniHodnota);
        if (!isFinite(val) || val < 0) return null;
        if (val <= 500) return 300;
        if (val <= 1000) return 500;
        if (val <= 5000) return 1000;
        if (val <= 10000) return 1500;
        if (val <= 200000) return 1500 + Math.ceil((val - 10000) / 1000) * 40;
        if (val <= 10000000) return 9100 + Math.ceil((val - 200000) / 10000) * 40;
        return 48300 + Math.ceil((val - 10000000) / 100000) * 40;
    }

    // Kompletní mimosmluvní odměna: sazba × počet úkonů (§ 11), volitelně režijní
    // paušál 300 Kč/úkon (§ 13) a DPH 21 %. Vrací rozpad nebo null při chybném vstupu.
    function advokatniTarif(opts) {
        const o = opts || {};
        const val = Number(o.value);
        if (!isFinite(val) || val < 0) return null;
        const acts = Math.max(1, parseInt(o.acts, 10) || 1);
        const singleRate = advokatniTarifSazba(val);
        const base = singleRate * acts;
        const flatrateTotal = o.flatrate ? 300 * acts : 0;
        const totalBeforeVat = base + flatrateTotal;
        const vat = o.vat ? Math.round(totalBeforeVat * 0.21) : 0;
        return { singleRate, acts, base, flatrateTotal, vat, total: totalBeforeVat + vat };
    }

    // Zákonný úrok z prodlení: repo sazba ČNB + 8 p.b. (nař. vlády č. 351/2013 Sb.).
    // POZOR: repoRate je VSTUP — mění se v čase a závisí na období prodlení, nesmí být
    // natvrdo. Výchozí hodnota je jen kvůli zpětné kompatibilitě dnešního UI; má se
    // nastavit na repo sazbu platnou k 1. dni pololetí, v němž prodlení nastalo.
    function urokZProdleni(jistina, opts) {
        const val = Number(jistina);
        if (!isFinite(val) || val < 0) return null;
        const repoRate = (opts && isFinite(Number(opts.repoRate))) ? Number(opts.repoRate) : 5.25;
        const rate = repoRate + 8;
        return { rate, repoRate, rocne: val * rate / 100, mesicne: val * rate / 1200 };
    }

    const api = { soudniPoplatek, advokatniTarifSazba, advokatniTarif, urokZProdleni };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LexisLegalCalc = api;
})();
