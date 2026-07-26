/**
 * Testy ISDS inboxu (js/core/isds-inbox.js) — příchozí datové zprávy.
 * Modul je bezstavový vůči síti; fs + now se injektují, takže je deterministický.
 */

const { IsdsInbox } = require('../../js/core/isds-inbox');

function fakeFs() {
    const mem = {};
    return {
        _mem: mem,
        existsSync: (p) => Object.prototype.hasOwnProperty.call(mem, p),
        readFileSync: (p) => mem[p],
        writeFileSync: (p, d) => { mem[p] = d; }
    };
}

function makeInbox(fs) {
    return new IsdsInbox({ filePath: '/inbox.json', fs, now: () => '2026-01-01T00:00:00.000Z' });
}

describe('IsdsInbox.upsertEnvelopes', () => {
    test('přidá novou obálku se stavem localStatus "new"', () => {
        const box = makeInbox(fakeFs());
        const added = box.upsertEnvelopes([{ dmID: '111', sender: 'Okresní soud', delivered: false }]);
        expect(added).toBe(1);
        const all = box.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].localStatus).toBe('new');
        expect(all[0].firstSeenAt).toBe('2026-01-01T00:00:00.000Z');
        expect(all[0].deadlineCreated).toBe(false);
    });

    test('stejné dmID podruhé nepřidá duplicitu, jen aktualizuje stav doručení', () => {
        const box = makeInbox(fakeFs());
        box.upsertEnvelopes([{ dmID: '111', status: 1, delivered: false }]);
        const added2 = box.upsertEnvelopes([{ dmID: '111', status: 5, statusLabel: 'doručeno fikcí', delivered: true }]);
        expect(added2).toBe(0);
        const it = box.getById('111');
        expect(box.getAll()).toHaveLength(1);
        expect(it.status).toBe(5);
        expect(it.delivered).toBe(true);
    });

    test('ignoruje položky bez dmID', () => {
        const box = makeInbox(fakeFs());
        expect(box.upsertEnvelopes([{ sender: 'x' }, null, undefined])).toBe(0);
        expect(box.getAll()).toHaveLength(0);
    });

    test('upsert NEpřepíše již stažený obsah (jen aktualizuje stav)', () => {
        const box = makeInbox(fakeFs());
        box.upsertEnvelopes([{ dmID: '222', sender: 'Soud' }]);
        box.markDownloaded('222', null, [{ name: 'usneseni.pdf', mimeType: 'application/pdf' }]);
        box.upsertEnvelopes([{ dmID: '222', status: 5, delivered: true }]);
        const it = box.getById('222');
        expect(it.localStatus).toBe('downloaded');   // zůstává stažené
        expect(it.files).toHaveLength(1);              // obsah zachován
        expect(it.delivered).toBe(true);               // stav aktualizován
    });
});

describe('IsdsInbox — stažení a lhůty', () => {
    test('markDownloaded nastaví stav, čas a soubory', () => {
        const box = makeInbox(fakeFs());
        box.upsertEnvelopes([{ dmID: '333' }]);
        const it = box.markDownloaded('333', { annotation: 'Výzva', sender: 'KS Brno' }, [
            { name: 'a.pdf', mimeType: 'application/pdf', path: '/tmp/a.pdf' }
        ]);
        expect(it.localStatus).toBe('downloaded');
        expect(it.downloadedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(it.annotation).toBe('Výzva');
        expect(it.files).toEqual([{ name: 'a.pdf', mimeType: 'application/pdf', path: '/tmp/a.pdf' }]);
    });

    test('markDownloaded na neznámé dmID vrátí null', () => {
        const box = makeInbox(fakeFs());
        expect(box.markDownloaded('nope', null, [])).toBeNull();
    });

    test('markDeadlineCreated nastaví příznak', () => {
        const box = makeInbox(fakeFs());
        box.upsertEnvelopes([{ dmID: '444' }]);
        box.markDeadlineCreated('444');
        expect(box.getById('444').deadlineCreated).toBe(true);
    });

    test('getNew vrací jen nestažené', () => {
        const box = makeInbox(fakeFs());
        box.upsertEnvelopes([{ dmID: '1' }, { dmID: '2' }]);
        box.markDownloaded('1', null, []);
        const news = box.getNew();
        expect(news).toHaveLength(1);
        expect(news[0].dmID).toBe('2');
    });
});

describe('IsdsInbox — perzistence a getById', () => {
    test('getById normalizuje dmID na string', () => {
        const box = makeInbox(fakeFs());
        box.upsertEnvelopes([{ dmID: 555 }]);
        expect(box.getById('555')).not.toBeNull();
        expect(box.getById(555)).not.toBeNull();
    });

    test('data přežijí reload ze stejného úložiště', () => {
        const fs = fakeFs();
        const box1 = makeInbox(fs);
        box1.upsertEnvelopes([{ dmID: '999', sender: 'Soud' }]);
        const box2 = makeInbox(fs); // nová instance čte ze stejného „disku"
        expect(box2.getById('999')).not.toBeNull();
        expect(box2.getAll()).toHaveLength(1);
    });
});
