const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('LexisEditor Smoke Tests', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    // Spustit aplikaci
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')],
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('should launch the application and load the main window', async () => {
    // Zkontrolovat, že se aplikace načetla
    expect(window).toBeTruthy();

    // Zkontrolovat titulek okna
    const title = await window.title();
    expect(title).toBe('LexisEditor');
  });

  test('should display key UI components', async () => {
    // Ověřit, že kritické části UI existují
    const appContainer = await window.locator('#app-container');
    await expect(appContainer).toBeAttached();

    const startScreen = await window.locator('#start-screen');
    await expect(startScreen).toBeAttached();

    const sidebar = await window.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('should display legal tab calculators', async () => {
    const tabLegal = await window.locator('#tab-legal');
    await expect(tabLegal).toBeAttached();
    
    const feeBtn = await window.locator('text=Poplatek');
    await expect(feeBtn).toBeAttached();

    const tariffBtn = await window.locator('text=Odměna');
    await expect(tariffBtn).toBeAttached();
  });

  test('should display lexisai tab buttons', async () => {
    const tabLexisAi = await window.locator('#tab-lexisai');
    await expect(tabLexisAi).toBeAttached();
    
    const aiBridgeBtn = await window.locator('text=AI Bridge');
    await expect(aiBridgeBtn).toBeAttached();

    const rewriteBtn = await window.locator('text=Přepsat');
    await expect(rewriteBtn).toBeAttached();

    const risksBtn = await window.locator('text=Hledat rizika');
    await expect(risksBtn).toBeAttached();

    const translateBtn = await window.locator('text=Přeložit');
    await expect(translateBtn).toBeAttached();

    const generateBtn = await window.locator('text=Nová doložka');
    await expect(generateBtn).toBeAttached();

    const autocompleteBtn = await window.locator('text=Dopsat AI');
    await expect(autocompleteBtn).toBeAttached();
  });
});
