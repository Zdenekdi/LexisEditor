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
});
