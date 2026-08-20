/**
 * Testy ISDS outboxu (js/core/isds-outbox.js) — odesílací fronta datových zpráv.
 * Síť (sendFn), fs i now se injektují → deterministické, bez Electronu i sítě.
 */

const { IsdsOutbox } = require('../../js/core/isds-outbox');

function fakeFs() {
    const mem = {};
    return {
        _mem: mem,
        existsSync: (p) => Object.prototype.hasOwnProperty.call(mem, p),
        readFileSync: (p) => mem[p],
        writeFileSync: (p, d) => { mem[p] = d; }
    };
}

function makeOutbox(opts = {}) {
    return new IsdsOutbox({ filePath: '/outbox.json', fs: opts.fs || fakeFs(), now: () => '2026-01-01T00:00:00.000Z', maxAttempts: opts.maxAttempts || 3 });
}

describe('IsdsOutbox.enqueueBatch', () => {
    test('založí položky "pending"; přeskočí příjemce bez dbID', () => {
        const box = makeOutbox();
        const list = box.enqueueBatch(
            [{ dbID: 'aaa', name: 'Soud' }, { name: 'bez schránky' }, { dbID: 'bbb' }],
            { subject: 'Výzva', files: [{ name: 'a.pdf' }] }
        );
        expect(list).toHaveLength(2); // jen ti s dbID
        expect(box.getByStatus('pending')).toHaveLength(2);
        expect(list[0].subject).toBe('Výzva');
        expect(list[1].recipient.name).toBe('bbb'); // fallback name = dbID
    });

    test('výchozí předmět když chybí', () => {
        const box = makeOutbox();
        const [it] = box.enqueueBatch([{ dbID: 'x' }], {});
        expect(it.subject).toBe('Bez předmětu');
    });
});

describe('IsdsOutbox.process', () => {
    test('úspěšné odeslání → sent + dmID + sentAt', async () => {
        const box = makeOutbox();
        box.enqueueBatch([{ dbID: 'a' }, { dbID: 'b' }], { subject: 'S' });
        const r = await box.process(async () => ({ success: true, dmID: 'DM' + Math.random() }));
        expect(r.sent).toBe(2);
        expect(box.getByStatus('sent')).toHaveLength(2);
        expect(box.getAll().every(i => i.dmID && i.sentAt)).toBe(true);
    });

    test('chyba nechá položku "pending" a zastaví běh (backoff volajícímu)', async () => {
        const box = makeOutbox({ maxAttempts: 3 });
        box.enqueueBatch([{ dbID: 'a' }], {});
        const r = await box.process(async () => ({ success: false, retriable: true, error: 'ISDS timeout' }));
        expect(r.sent).toBe(0);
        expect(r.failed).toBe(0);
        const it = box.getAll()[0];
        expect(it.status).toBe('pending'); // retriable, 1 pokus < maxAttempts
        expect(it.attempts).toBe(1);
        expect(it.lastError).toBe('ISDS timeout');
    });

    test('po vyčerpání pokusů → review (ruční ověření, ne tiché selhání)', async () => {
        const box = makeOutbox({ maxAttempts: 3 });
        box.enqueueBatch([{ dbID: 'a' }], {});
        await box.process(async () => ({ success: false, retriable: true }));
        await box.process(async () => ({ success: false, retriable: true }));
        const r3 = await box.process(async () => ({ success: false, retriable: true }));
        expect(r3.failed).toBe(1);
        expect(box.getAll()[0].status).toBe('review');
        expect(box.getAll()[0].attempts).toBe(3);
    });

    test('výjimka v sendFn se zachytí jako neúspěch', async () => {
        const box = makeOutbox();
        box.enqueueBatch([{ dbID: 'a' }], {});
        await box.process(async () => { throw new Error('spadlo spojení'); });
        expect(box.getAll()[0].lastError).toBe('spadlo spojení');
    });

    test('idempotence: položka s dmID se znovu neodesílá', async () => {
        const box = makeOutbox();
        const [it] = box.enqueueBatch([{ dbID: 'a' }], {});
        it.dmID = 'ALREADY'; // simulace: už má dmID, ale zůstala pending
        let called = 0;
        const r = await box.process(async () => { called++; return { success: true, dmID: 'NEW' }; });
        expect(called).toBe(0);          // sendFn se nevolala
        expect(r.sent).toBe(1);
        expect(box.getAll()[0].status).toBe('sent');
        expect(box.getAll()[0].dmID).toBe('ALREADY');
    });
});

describe('IsdsOutbox.retry a applyStateChanges', () => {
    test('retry vrátí failed/review zpět na pending', async () => {
        const box = makeOutbox({ maxAttempts: 1 });
        box.enqueueBatch([{ dbID: 'a' }], {});
        await box.process(async () => ({ success: false, error: 'x' })); // maxAttempts 1, neretriable → review
        const it = box.getAll()[0];
        expect(it.status).toBe('review');
        box.retry(it.id);
        expect(box.getById(it.id).status).toBe('pending');
        expect(box.getById(it.id).lastError).toBeNull();
    });

    test('applyStateChanges: doručeno → status delivered', async () => {
        const box = makeOutbox();
        const [it] = box.enqueueBatch([{ dbID: 'a' }], {});
        await box.process(async () => ({ success: true, dmID: 'DM1' }));
        const updated = box.applyStateChanges([{ dmID: 'DM1', status: 5, statusLabel: 'doručeno', delivered: true }]);
        expect(updated).toBe(1);
        expect(box.getById(it.id).status).toBe('delivered');
        expect(box.getById(it.id).dmMessageStatus).toBe(5);
    });
});

describe('IsdsOutbox — obnova po pádu (load)', () => {
    test('uvíznuté "sending" s dmID → sent, bez dmID → review', () => {
        const fs = fakeFs();
        fs._mem['/outbox.json'] = JSON.stringify({ items: [
            { id: 'm1', status: 'sending', dmID: 'DM9' },
            { id: 'm2', status: 'sending', dmID: null }
        ] });
        const box = new IsdsOutbox({ filePath: '/outbox.json', fs, now: () => 'T' });
        expect(box.getById('m1').status).toBe('sent');
        expect(box.getById('m2').status).toBe('review');
        expect(box.getById('m2').lastError).toMatch(/Přerušeno/);
    });
});
