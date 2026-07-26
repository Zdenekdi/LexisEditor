/**
 * Testy adresáře kontaktů (js/core/lexis-contacts.js).
 * Storage se injektuje (in-memory), takže testy nesahají na IndexedDB.
 */

const { LexisContacts } = require('../../js/core/lexis-contacts');

// Mock úložiště kompatibilní s lexis-storage: get(store, key) → value; set(store, {key, value}).
function memStorage() {
    const data = {};
    return {
        _data: data,
        async get(store, key) { return data[`${store}/${key}`]; },
        async set(store, obj) { data[`${store}/${obj.key}`] = obj.value; }
    };
}

describe('LexisContacts — CRUD', () => {
    test('nový kontakt dostane id a created; načte se v getAll', async () => {
        const c = new LexisContacts(memStorage());
        const saved = await c.save({ jmeno: 'Jan Novák', typ: 'fyzicka' });
        expect(saved.id).toMatch(/^c_/);
        expect(typeof saved.created).toBe('string');
        const all = await c.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].jmeno).toBe('Jan Novák');
    });

    test('uložení existujícího (s id) sloučí a nastaví updated', async () => {
        const c = new LexisContacts(memStorage());
        const saved = await c.save({ jmeno: 'Firma s.r.o.', mesto: 'Brno' });
        const upd = await c.save({ id: saved.id, mesto: 'Praha' });
        expect(upd.mesto).toBe('Praha');
        const all = await c.getAll();
        expect(all).toHaveLength(1); // nepřidal duplicitu
        expect(all[0].jmeno).toBe('Firma s.r.o.'); // původní pole zachováno
        expect(all[0].updated).toBeDefined();
    });

    test('delete odebere kontakt', async () => {
        const c = new LexisContacts(memStorage());
        const a = await c.save({ jmeno: 'A' });
        await c.save({ jmeno: 'B' });
        await c.delete(a.id);
        const all = await c.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].jmeno).toBe('B');
    });

    test('cache se dá invalidovat', async () => {
        const store = memStorage();
        const c = new LexisContacts(store);
        await c.save({ jmeno: 'X' });
        // podstrčíme jiná data přímo do úložiště a invalidujeme cache
        store._data['settings/contacts-db'] = [{ id: 'z', jmeno: 'Z' }];
        c.invalidateCache();
        const all = await c.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].jmeno).toBe('Z');
    });
});

describe('LexisContacts — import z CSV', () => {
    test('naimportuje řádky, normalizuje hlavičky (Jméno→jmeno, Datová schránka→isds)', async () => {
        const c = new LexisContacts(memStorage());
        const csv = 'Jméno,Datová schránka,Město\nJan Novák,abc123,Brno\nFirma a.s.,xyz789,Praha';
        const res = await c.importFromCsv(csv);
        expect(res.added).toBe(2);
        expect(res.errors).toHaveLength(0);
        const all = await c.getAll();
        expect(all[0].isds).toBe('abc123');
        expect(all[0].mesto).toBe('Brno');
    });

    test('řádek bez jména → chyba, ostatní projdou', async () => {
        const c = new LexisContacts(memStorage());
        const csv = 'jmeno,mesto\n,Brno\nPetr Svoboda,Ostrava';
        const res = await c.importFromCsv(csv);
        expect(res.added).toBe(1);
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0]).toMatch(/chybí jméno/);
    });

    test('skupiny se rozdělí podle středníku; chybějící typ = fyzicka', async () => {
        const c = new LexisContacts(memStorage());
        const csv = 'jmeno,skupiny\nKlient A,vip;insolvence';
        const res = await c.importFromCsv(csv);
        expect(res.added).toBe(1);
        const all = await c.getAll();
        expect(all[0].skupiny).toEqual(['vip', 'insolvence']);
        expect(all[0].typ).toBe('fyzicka');
    });

    test('prázdný / jednořádkový CSV → nic', async () => {
        const c = new LexisContacts(memStorage());
        expect(await c.importFromCsv('')).toEqual({ added: 0, errors: [] });
        expect(await c.importFromCsv('jen hlavička')).toEqual({ added: 0, errors: [] });
    });

    test('getGroups vrací unikátní seřazené skupiny', async () => {
        const c = new LexisContacts(memStorage());
        await c.save({ jmeno: 'A', skupiny: ['insolvence', 'vip'] });
        await c.save({ jmeno: 'B', skupiny: ['vip', 'firmy'] });
        expect(await c.getGroups()).toEqual(['firmy', 'insolvence', 'vip']);
    });
});
