// tests/unit/research.test.js
// -----------------------------------------------------------------------------
// Testy modulu Externí rešerše (js/providers/lexis-research.js).
// Ověřuje: výchozí stav (VYPNUTO), registr poskytovatelů, sestavení URL pro
// LawGPT, defenzivní normalizaci odpovědi, gating DirectCase (OAuth zatím
// nepřipraven) a self-mount sekce nastavení. Běží v jsdom (viz jest.config).
// -----------------------------------------------------------------------------

// fetch v jsdom není — namockujeme před načtením modulu.
let lastUrl = null;
let nextJson = [];
beforeAll(() => {
  global.fetch = jest.fn((url) => {
    lastUrl = url;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(nextJson) });
  });
  require('../../js/providers/lexis-research.js');
});

beforeEach(() => {
  lastUrl = null;
  nextJson = [];
  global.fetch.mockClear();
  try { localStorage.clear(); } catch (e) { /* noop */ }
});

const R = () => window.LexisResearch;

describe('Externí rešerše — stav a registr', () => {
  test('modul se exportuje na window.LexisResearch', () => {
    expect(R()).toBeTruthy();
    expect(typeof R().verifyCitation).toBe('function');
    expect(typeof R().findCaseLaw).toBe('function');
    expect(typeof R().findLaw).toBe('function');
  });

  test('výchozí stav je VYPNUTO a poskytovatel LawGPT', () => {
    expect(R().isEnabled()).toBe(false);
    expect(R().activeId()).toBe('lawgpt');
  });

  test('registr obsahuje lawgpt (zdarma) i directcase (premium)', () => {
    expect(R().PROVIDER_ORDER).toEqual(['lawgpt', 'directcase']);
    expect(R().PROVIDERS.lawgpt.ready).toBe(true);
    expect(R().PROVIDERS.lawgpt.auth).toBe('none');
    expect(R().PROVIDERS.directcase.ready).toBe(false);
    expect(R().PROVIDERS.directcase.auth).toBe('oauth');
  });

  test('setEnabled a setActiveProvider se persistují', () => {
    R().setEnabled(true);
    expect(R().isEnabled()).toBe(true);
    R().setActiveProvider('directcase');
    expect(R().activeId()).toBe('directcase');
    // neexistujícího poskytovatele ignoruje
    R().setActiveProvider('nesmysl');
    expect(R().activeId()).toBe('directcase');
  });
});

describe('Externí rešerše — LawGPT dotazy', () => {
  test('findCaseLaw staví správnou URL judikatury', async () => {
    nextJson = [];
    await R().findCaseLaw('neplatnost smlouvy');
    expect(lastUrl).toContain('https://lawgpt.cz/api/judgments/search');
    expect(lastUrl).toContain('q=neplatnost%20smlouvy');
    expect(lastUrl).toContain('source=all');
    expect(lastUrl).toContain('limit=8');
  });

  test('findLaw staví správnou URL eSbírky', async () => {
    nextJson = [];
    await R().findLaw('nájemní smlouva');
    expect(lastUrl).toContain('https://lawgpt.cz/api/esbirka/search');
    expect(lastUrl).toContain('in=all');
  });

  test('verifyCitation používá vyhledávání judikatury', async () => {
    nextJson = [];
    const out = await R().verifyCitation('26 Cdo 1230/2021');
    expect(lastUrl).toContain('/api/judgments/search');
    expect(out.provider).toBe('lawgpt');
    expect(out.kind).toBe('citace');
  });

  test('neúspěšný status vyhodí chybu', async () => {
    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    await expect(R().findCaseLaw('cokoliv')).rejects.toThrow(/500/);
  });
});

describe('Externí rešerše — normalizace odpovědi (defenzivní)', () => {
  test('mapuje pole judikatury (soud, sp. zn., datum, url, výřez)', async () => {
    nextJson = [{
      court: 'Nejvyšší soud',
      spisova_znacka: '26 Cdo 1230/2021',
      date: '2021-05-04',
      url: 'https://example.cz/j/1',
      snippet: 'Právní věta…'
    }];
    const out = await R().findCaseLaw('x');
    expect(out.results).toHaveLength(1);
    const r = out.results[0];
    expect(r.meta).toContain('Nejvyšší soud');
    expect(r.meta).toContain('26 Cdo 1230/2021');
    expect(r.url).toBe('https://example.cz/j/1');
    expect(r.snippet).toBe('Právní věta…');
  });

  test('zvládne obálku {results:[...]} i holé řetězce', async () => {
    nextJson = { results: ['jen text výřezu'] };
    const out = await R().findCaseLaw('x');
    expect(out.results).toHaveLength(1);
    expect(out.results[0].snippet).toBe('jen text výřezu');
  });

  test('prázdná odpověď → prázdné výsledky, nikoli chyba', async () => {
    nextJson = {};
    const out = await R().findCaseLaw('x');
    expect(Array.isArray(out.results)).toBe(true);
    expect(out.results).toHaveLength(0);
  });
});

describe('Externí rešerše — DirectCase gating', () => {
  test('při aktivním DirectCase (nepřipraven) se dotaz odmítne s jasnou hláškou', async () => {
    R().setActiveProvider('directcase');
    await expect(R().findCaseLaw('x')).rejects.toThrow(/přihlášení/i);
    // fetch se vůbec nesmí zavolat
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Externí rešerše — self-mount nastavení', () => {
  test('mountSettings připojí sekci do #tab-settings a je idempotentní', () => {
    document.body.innerHTML = '<div id="tab-settings"></div>';
    R().mountSettings();
    expect(document.getElementById('research-settings-group')).toBeTruthy();
    expect(document.getElementById('research-enabled')).toBeTruthy();
    expect(document.getElementById('research-provider').value).toBe('lawgpt');
    R().mountSettings();
    expect(document.querySelectorAll('#research-settings-group')).toHaveLength(1);
  });
});
