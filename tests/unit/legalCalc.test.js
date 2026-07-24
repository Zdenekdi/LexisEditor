/**
 * Testy právních kalkulaček (js/core/lexis-legal-calc.js) — dřív byly formule
 * jen v UI (a tarif zdvojený), bez testů. Ověřují hranice sazeb a skladbu odměny.
 */

const C = require('../../js/core/lexis-legal-calc');

describe('soudní poplatek (549/1991 Sb., zjednodušeně)', () => {
    test('do 20 000 Kč pevně 1000', () => {
        expect(C.soudniPoplatek(0)).toBe(1000);
        expect(C.soudniPoplatek(20000)).toBe(1000);
    });
    test('nad 20 000 do 40 mil. = 5 % (zaokrouhleno nahoru)', () => {
        expect(C.soudniPoplatek(100000)).toBe(5000);
        expect(C.soudniPoplatek(20001)).toBe(Math.ceil(20001 * 0.05)); // 1001
    });
    test('nad 40 mil. = 2 000 000 + 1 % z přebytku', () => {
        expect(C.soudniPoplatek(40000000)).toBe(2000000);
        expect(C.soudniPoplatek(50000000)).toBe(2000000 + 100000);
    });
    test('neplatný vstup → null', () => {
        expect(C.soudniPoplatek('abc')).toBeNull();
        expect(C.soudniPoplatek(-5)).toBeNull();
    });
});

describe('advokátní tarif — sazba za úkon (§ 7)', () => {
    test('pevné spodní stupně', () => {
        expect(C.advokatniTarifSazba(500)).toBe(300);
        expect(C.advokatniTarifSazba(1000)).toBe(500);
        expect(C.advokatniTarifSazba(5000)).toBe(1000);
        expect(C.advokatniTarifSazba(10000)).toBe(1500);
    });
    test('klouzavé pásmo do 200 000 (za každých 1000 nad 10 000 +40)', () => {
        expect(C.advokatniTarifSazba(11000)).toBe(1500 + 40);
        expect(C.advokatniTarifSazba(150000)).toBe(1500 + Math.ceil((150000 - 10000) / 1000) * 40);
    });
    test('pásmo do 10 mil. a nad 10 mil.', () => {
        expect(C.advokatniTarifSazba(200000)).toBe(9100);
        expect(C.advokatniTarifSazba(10000000)).toBe(48300);
        expect(C.advokatniTarifSazba(10100000)).toBe(48300 + Math.ceil(100000 / 100000) * 40);
    });
});

describe('advokátní tarif — kompletní odměna', () => {
    test('sazba × úkony + paušál + DPH', () => {
        const r = C.advokatniTarif({ value: 150000, acts: 3, flatrate: true, vat: true });
        const rate = C.advokatniTarifSazba(150000);
        expect(r.singleRate).toBe(rate);
        expect(r.base).toBe(rate * 3);
        expect(r.flatrateTotal).toBe(300 * 3);
        expect(r.vat).toBe(Math.round((rate * 3 + 900) * 0.21));
        expect(r.total).toBe(rate * 3 + 900 + r.vat);
    });
    test('bez paušálu a bez DPH', () => {
        const r = C.advokatniTarif({ value: 5000, acts: 1, flatrate: false, vat: false });
        expect(r.flatrateTotal).toBe(0);
        expect(r.vat).toBe(0);
        expect(r.total).toBe(1000);
    });
    test('počet úkonů min. 1; chybný vstup → null', () => {
        expect(C.advokatniTarif({ value: 5000, acts: 0 }).acts).toBe(1);
        expect(C.advokatniTarif({ value: -1 })).toBeNull();
    });
});

describe('úrok z prodlení (351/2013 Sb.)', () => {
    test('sazba = repo + 8 p.b., roční a měsíční úrok', () => {
        const u = C.urokZProdleni(100000, { repoRate: 5.25 });
        expect(u.rate).toBe(13.25);
        expect(u.rocne).toBeCloseTo(13250, 2);
        expect(u.mesicne).toBeCloseTo(13250 / 12, 2);
    });
    test('repoRate je vstup (ne natvrdo) — jiná sazba, jiný výsledek', () => {
        expect(C.urokZProdleni(100000, { repoRate: 4 }).rate).toBe(12);
    });
    test('výchozí repo zachovává dnešní chování UI', () => {
        expect(C.urokZProdleni(100000).rate).toBe(13.25);
    });
    test('neplatná jistina → null', () => {
        expect(C.urokZProdleni('x')).toBeNull();
    });
});
