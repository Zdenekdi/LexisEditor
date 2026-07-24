// Mock environment variables and globals for JS tests
require('../../js/core/lexis-core.js');
require('../../js/core/lexis-storage.js');

describe('Helper Functions Unit Tests', () => {

  describe('escapeHTML (from lexis-core.js)', () => {
    test('should properly escape HTML entities', () => {
      const input = '<div class="test">&"\'</div>';
      const expected = '&lt;div class=&quot;test&quot;&gt;&amp;&quot;&#039;&lt;/div&gt;';
      expect(window.escapeHTML(input)).toBe(expected);
    });

    test('should return empty string for null or undefined', () => {
      expect(window.escapeHTML(null)).toBe('');
      expect(window.escapeHTML(undefined)).toBe('');
      expect(window.escapeHTML('')).toBe('');
    });
  });

  describe('LexisStorage.init (from lexis-storage.js)', () => {
    let mockIndexedDB;
    let storage;

    beforeEach(() => {
      mockIndexedDB = {
        open: jest.fn().mockImplementation((dbName, version) => {
          const request = {};
          setTimeout(() => {
            request.result = {
              objectStoreNames: {
                contains: jest.fn().mockReturnValue(true) // assume objectstores are created
              }
            };
            if (request.onsuccess) request.onsuccess({ target: request });
          }, 0);
          return request;
        })
      };

      // Mock global indexedDB
      global.indexedDB = mockIndexedDB;
      storage = new window.LexisStorage();

      // Mock migrateLegacyData to avoid localStorage interaction
      storage.migrateLegacyData = jest.fn().mockResolvedValue();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should initialize and resolve correctly', async () => {
      await storage.init();
      expect(mockIndexedDB.open).toHaveBeenCalledWith('LexisDB', 1);
      expect(storage.db).toBeDefined();
    });
  });

  describe('SecureVault.save (from lexis-core.js)', () => {
    let vault;

    beforeEach(() => {
      vault = new window.SecureVault(); // From lexis-core.js
    });

    afterEach(() => {
      jest.clearAllMocks();
      delete window.electronAPI;
      global.localStorage.clear();
    });

    test('should use window.electronAPI.saveAIConfig if available', async () => {
      window.electronAPI = {
        getAIConfig: jest.fn().mockResolvedValue({}),
        saveAIConfig: jest.fn().mockResolvedValue(true)
      };

      const result = await vault.save('apiKey', 'test-key');
      expect(result).toBe(true);
      expect(window.electronAPI.getAIConfig).toHaveBeenCalled();
      expect(window.electronAPI.saveAIConfig).toHaveBeenCalledWith({ apiKey: 'test-key' });
    });

    test('bez electronAPI NEukládá tajemství do localStorage (jen do paměti relace)', async () => {
      // Bezpečnostní zpevnění: base64 (btoa) není šifrování a bylo by čitelné z
      // konzole/XSS, proto se citlivý klíč do localStorage zásadně nezapisuje.
      // Trvale bezpečně ukládá jen desktopová verze (safeStorage). Dřív tento test
      // očekával starou nebezpečnou variantu setItem(secure_apiKey, btoa(...)).
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

      const result = await vault.save('apiKey', 'test-key');
      expect(result).toBe(true);
      // do localStorage se klíč NEZAPISUJE
      expect(setItemSpy).not.toHaveBeenCalledWith('secure_apiKey', expect.anything());
      // starý nešifrovaný záznam se uklidí
      expect(removeItemSpy).toHaveBeenCalledWith('secure_apiKey');
      // v rámci relace je hodnota dostupná z paměti
      expect(await vault.get('apiKey')).toBe('test-key');
    });
  });
});
