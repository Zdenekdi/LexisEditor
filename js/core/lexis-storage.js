/**
 * LexisStorage
 * Robustní, asynchronní, lokální databázová vrstva postavená na IndexedDB.
 * Zajišťuje ukládání velkých dokumentů, doložek, šablon a systémových nastavení.
 */
class LexisStorage {
    constructor() {
        this.dbName = 'LexisDB';
        this.dbVersion = 1;
        this.db = null;
    }

    /**
     * Inicializuje IndexedDB a provede případný upgrade schématu.
     */
    async init() {
        // Dedup: opakovaná volání init() vrací tentýž slib (LexisCore i ready()).
        if (this._initPromise) return this._initPromise;
        this._initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("Chyba při otevírání IndexedDB:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = async (event) => {
                this.db = event.target.result;
                try {
                    await this.migrateLegacyData();
                    resolve();
                } catch (err) {
                    console.error("Chyba při migraci dat:", err);
                    resolve(); // Pokračujeme i v případě chyby migrace
                }
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Ukládání dokumentů a verzí
                if (!db.objectStoreNames.contains('documents')) {
                    db.createObjectStore('documents', { keyPath: 'id' });
                }
                
                // Ukládání vlastních doložek
                if (!db.objectStoreNames.contains('clauses')) {
                    db.createObjectStore('clauses', { keyPath: 'id' });
                }

                // Ukládání šablon
                if (!db.objectStoreNames.contains('templates')) {
                    db.createObjectStore('templates', { keyPath: 'id' });
                }

                // Systémová a uživatelská nastavení
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
        return this._initPromise;
    }

    /**
     * Zajistí, že je databáze inicializovaná (líná inicializace).
     * Díky tomu DB operace neselžou, i když init() ještě neproběhl.
     */
    async ready() {
        if (this.db) return;
        await this.init();
    }

    /**
     * Přesune stávající konfigurace a data z localStorage do IndexedDB.
     */
    async migrateLegacyData() {
        const keysToMigrate = [
            { oldKey: 'lexis-lock-timeout', store: 'settings', newKey: 'lock-timeout', isJson: false },
            { oldKey: 'lexis-qat-settings', store: 'settings', newKey: 'qat-settings', isJson: true },
            { oldKey: 'lexis_kb', store: 'settings', newKey: 'knowledge-base', isJson: true }
        ];

        for (const item of keysToMigrate) {
            const rawVal = localStorage.getItem(item.oldKey);
            if (rawVal !== null) {
                try {
                    let parsedVal = rawVal;
                    if (item.isJson) {
                        parsedVal = JSON.parse(rawVal);
                    }
                    
                    // Uložíme do IndexedDB
                    await this.set(item.store, {
                        key: item.newKey,
                        value: parsedVal,
                        migratedAt: new Date().toISOString()
                    });

                    // Odstraníme z localStorage po úspěšném zápisu
                    localStorage.removeItem(item.oldKey);
                    console.log(`[LexisStorage] Úspěšně migrován klíč: ${item.oldKey} -> IndexedDB`);
                } catch (e) {
                    console.error(`[LexisStorage] Chyba migrace klíče ${item.oldKey}:`, e);
                }
            }
        }
    }

    // --- DATABÁZOVÉ OPERACE (Promise wrapper) ---

    async get(storeName, key) {
        await this.ready();
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("Databáze není inicializována");
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);

            req.onsuccess = () => resolve(req.result ? req.result.value || req.result : null);
            req.onerror = () => reject(req.error);
        });
    }

    async set(storeName, data) {
        await this.ready();
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("Databáze není inicializována");
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(data);

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAll(storeName) {
        await this.ready();
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("Databáze není inicializována");
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async delete(storeName, key) {
        await this.ready();
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("Databáze není inicializována");
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);

            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}

window.LexisStorage = LexisStorage;
