// tests/unit/outbox.test.js
const { IsdsOutbox } = require('../../js/core/isds-outbox.js');

function mkOutbox() {
  let seq = 0;
  return new IsdsOutbox({ now: () => '2026-08-13T00:00:0' + (seq++ % 10) + '.000Z' });
}

describe('ISDS Outbox — bezpečnost odesílání', () => {
  test('D2: nejistá chyba (bez retriable) → review, NE auto-resend', async () => {
    const ob = mkOutbox();
    ob.enqueueBatch([{ dbID: 'abc1234', name: 'Soud' }], { subject: 'Podání', files: [] });
    // sendFn selže (timeout) — bez příznaku retriable
    let calls = 0;
    const r = await ob.process(async () => { calls++; return { success: false, error: 'timeout' }; });
    expect(calls).toBe(1);                 // NESMÍ zkoušet vícekrát
    expect(r.sent).toBe(0);
    expect(ob.getByStatus('review').length).toBe(1);
    expect(ob.getByStatus('pending').length).toBe(0);
  });

  test('retriable chyba (spojení nevzniklo) → pending (bezpečné opakování)', async () => {
    const ob = mkOutbox();
    ob.enqueueBatch([{ dbID: 'abc1234' }], { subject: 'X', files: [] });
    await ob.process(async () => ({ success: false, error: 'ECONNREFUSED', retriable: true }));
    expect(ob.getByStatus('pending').length).toBe(1);
    expect(ob.getByStatus('review').length).toBe(0);
  });

  test('úspěch → sent s dmID', async () => {
    const ob = mkOutbox();
    ob.enqueueBatch([{ dbID: 'abc1234' }], { subject: 'X', files: [] });
    await ob.process(async () => ({ success: true, dmID: '999' }));
    const it = ob.getByStatus('sent')[0];
    expect(it.dmID).toBe('999');
  });

  test('D3: nedoručitelná (stav 7) → failed, ne "sent"', async () => {
    const ob = mkOutbox();
    ob.enqueueBatch([{ dbID: 'abc1234' }], { subject: 'X', files: [] });
    await ob.process(async () => ({ success: true, dmID: '777' }));
    const upd = ob.applyStateChanges([{ dmID: '777', status: 7, statusLabel: 'Nedoručitelná', delivered: false }]);
    expect(upd).toBe(1);
    expect(ob.getByStatus('failed').length).toBe(1);
    expect(ob.getByStatus('sent').length).toBe(0);
  });

  test('doručení (stav 5) → delivered', async () => {
    const ob = mkOutbox();
    ob.enqueueBatch([{ dbID: 'abc1234' }], { subject: 'X', files: [] });
    await ob.process(async () => ({ success: true, dmID: '555' }));
    ob.applyStateChanges([{ dmID: '555', status: 5, statusLabel: 'Doručena', delivered: true }]);
    expect(ob.getByStatus('delivered').length).toBe(1);
  });
});
