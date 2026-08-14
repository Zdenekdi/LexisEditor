// tests/unit/legal-calc.test.js
// Kontrola právních/finančních výpočtů (zák. 549/1991 Sb., 177/1996 Sb.).
const calc = require('../../js/core/lexis-legal-calc.js');

describe('Soudní poplatek (549/1991 Sb., pol. 1)', () => {
  test('pevné a procentní pásmo', () => {
    expect(calc.soudniPoplatek(20000)).toBe(1000);      // do 20 000 pevně
    expect(calc.soudniPoplatek(100000)).toBe(5000);     // 5 %
    expect(calc.soudniPoplatek(40000000)).toBe(2000000); // horní hrana 5 %
    expect(calc.soudniPoplatek(50000000)).toBe(2100000); // 2M + 1 % z 10M
  });

  test('STROP: k částce nad 250 mil. Kč se nepřihlíží (max 4 100 000)', () => {
    expect(calc.soudniPoplatek(250000000)).toBe(4100000);
    expect(calc.soudniPoplatek(300000000)).toBe(4100000); // dřív chybně 4 600 000
    expect(calc.soudniPoplatek(1000000000)).toBe(4100000);
  });

  test('neplatný vstup → null', () => {
    expect(calc.soudniPoplatek(-1)).toBeNull();
    expect(calc.soudniPoplatek('x')).toBeNull();
  });
});

describe('Advokátní tarif § 7 (177/1996 Sb.)', () => {
  test('sazba za jeden úkon na hranicích', () => {
    expect(calc.advokatniTarifSazba(500)).toBe(300);
    expect(calc.advokatniTarifSazba(10001)).toBe(1540);
    expect(calc.advokatniTarifSazba(200000)).toBe(9100);
    expect(calc.advokatniTarifSazba(10000000)).toBe(48300);
  });
});
