// tests/unit/isds-transport.test.js
const t = require('../../js/core/isds-transport.js');

describe('ISDS transport — SSRF ochrana endpointu', () => {
  test('oficiální ISDS hosty jsou povolené', () => {
    expect(t.isAllowedIsdsHost('ws1.mojedatovaschranka.cz')).toBe(true);
    expect(t.isAllowedIsdsHost('www.mojedatovaschranka.cz')).toBe(true);
    expect(t.isAllowedIsdsHost('ws1.czebox.cz')).toBe(true);
    expect(t.isAllowedIsdsHost('')).toBe(true);       // prázdné = výchozí endpoint
  });

  test('cizí host je zakázaný', () => {
    expect(t.isAllowedIsdsHost('evil.example.com')).toBe(false);
    expect(t.isAllowedIsdsHost('mojedatovaschranka.cz.evil.com')).toBe(false);
    expect(t.isAllowedIsdsHost('attacker.cz')).toBe(false);
  });

  test('endpointOverride ignoruje cizí host, respektuje oficiální', () => {
    expect(t.endpointOverride({ host: 'evil.example.com' })).toBeNull();
    expect(t.endpointOverride({ host: 'ws1.mojedatovaschranka.cz', basePath: '/x' }))
      .toEqual({ host: 'ws1.mojedatovaschranka.cz', basePath: '/x' });
    expect(t.endpointOverride({})).toBeNull();
  });
});
