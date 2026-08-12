// tests/e2e/smoke.spec.js
// Smoke test: renderer se v prohlížeči (file://) nastartuje bez chyb.
// electronAPI je nahrazeno stubem, protože mimo Electron neexistuje.
// Spuštění:  npm run test:e2e   (nebo:  npx playwright test tests/e2e/smoke.spec.js)
const { test, expect } = require('@playwright/test');
const path = require('path');

// Stub electronAPI: každá metoda vrací Promise; on*-listenery vrací unsubscribe.
function installElectronStub() {
  const def = (name) => {
    if (/^on[A-Z]/.test(name)) return () => () => {};
    const map = {
      getAppVersion: '0.0.0-test',
      lockGetConfig: { enabled: false, touchIdEnabled: false, hasPassword: false, method: 'password' },
      lockTouchIdAvailable: { available: false, biometricName: 'Touch ID' },
      getTemplates: [], getTemplateContent: '',
      getAIConfig: { provider: 'lexislocal', models: [] },
      getIsdsConfig: {}, licenseEdition: 'Free', lexisLocalToken: null,
    };
    return () => Promise.resolve(name in map ? map[name] : {});
  };
  window.electronAPI = new Proxy({}, { get: (_t, prop) => (typeof prop === 'string' ? def(prop) : undefined) });
}

test('renderer nastartuje bez JS chyb a s klíčovými globály', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.addInitScript(installElectronStub);
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const checks = await page.evaluate(() => ({
    lexisUI: typeof window.lexisUI,
    eIco: typeof window.eIco,
    LexisIcons: typeof window.LexisIcons,
    LexisCalendar: typeof window.LexisCalendar,
    ribbonTabs: document.querySelectorAll('.ribbon-tabs .tab').length,
    iconsRendered: document.querySelectorAll('.icon-sq svg').length,
    statusBar: !!document.querySelector('.status-bar'),
    iconSelectBuilt: !!document.querySelector('.icon-select-btn'),
  }));

  // Žádná neodchycená chyba v rendereru (regrese by ji shodila).
  expect(pageErrors, 'neočekávané page errors: ' + pageErrors.join(' | ')).toEqual([]);

  // Jádro UI se postavilo.
  expect(checks.lexisUI).toBe('object');
  expect(checks.eIco).toBe('function');
  expect(checks.LexisIcons).toBe('object');
  expect(checks.LexisCalendar).toBe('object'); // regreseguard: dřív padalo na `module is not defined`
  expect(checks.statusBar).toBe(true);
  expect(checks.iconSelectBuilt).toBe(true);
  expect(checks.ribbonTabs).toBeGreaterThanOrEqual(6);
  expect(checks.iconsRendered).toBeGreaterThan(50);
});
