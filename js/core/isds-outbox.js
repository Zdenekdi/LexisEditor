// --- ISDS Outbox (odesílací fronta datových zpráv) ---
// Perzistentní fronta pro (i hromadné) odesílání datových zpráv s retry,
// idempotencí a sledováním stavu doručení. Síťové volání je injektované
// (sendFn), takže modul je testovatelný bez Electronu i bez sítě.
//
// Stavy položky:
//   pending    – čeká na odeslání
//   sending    – právě se odesílá (mezistav; při pádu se řeší jako 'review')
//   sent        – odesláno (má dmID), čeká na doručení
//   delivered  – doručeno (dmMessageStatus 4/5)
//   failed     – odeslání selhalo (lze opakovat)
//   review     – nejasný stav po přerušení (NEodesílat automaticky znovu)

'use strict';

const nodeFs = require('fs');

class IsdsOutbox {
    constructor(opts = {}) {
        this.filePath = opts.filePath;
        this.fs = opts.fs || nodeFs;
        this.maxAttempts = opts.maxAttempts || 3;
        this.now = opts.now || (() => new Date().toISOString());
        this.items = [];
        this._processing = false;
        this.load();
    }

    load() {
        try {
            if (this.filePath && this.fs.existsSync(this.filePath)) {
                const raw = this.fs.readFileSync(this.filePath, 'utf-8');
                const data = JSON.parse(raw);
                this.items = Array.isArray(data.items) ? data.items : [];
            }
        } catch (e) {
            this.items = [];
        }
        // Bezpečnost po pádu: položky uvízlé v 'sending' NEodesíláme znovu
        // automaticky (mohly už odejít) — označíme k ručnímu ověření.
        let changed = false;
        for (const it of this.items) {
            if (it.status === 'sending') {
                it.status = it.dmID ? 'sent' : 'review';
                if (it.status === 'review') it.lastError = 'Přerušeno – ověřte v Odeslaných, zda zpráva neodešla.';
                changed = true;
            }
        }
        if (changed) this.save();
        return this.items;
    }

    save() {
        if (!this.filePath) return;
        try {
            this.fs.writeFileSync(this.filePath, JSON.stringify({ items: this.items }, null, 2), 'utf-8');
        } catch (e) { /* best-effort */ }
    }

    _id(prefix) {
        // Deterministicky unikátní bez Math.random (kombinace času a čítače).
        this._seq = (this._seq || 0) + 1;
        return `${prefix}_${this.now().replace(/[^0-9]/g, '')}_${this._seq}`;
    }

    // recipients: [{ dbID, name? }], payload: { subject, files:[{name,mimeType,base64}] }
    enqueueBatch(recipients, payload) {
        const batchId = this._id('batch');
        const created = this.now();
        const list = (recipients || []).filter(r => r && r.dbID).map(r => ({
            id: this._id('msg'),
            batchId,
            recipient: { dbID: r.dbID, name: r.name || r.dbID },
            subject: (payload && payload.subject) || 'Bez předmětu',
            files: (payload && payload.files) || [],
            status: 'pending',
            attempts: 0,
            dmID: null,
            dmMessageStatus: null,
            statusLabel: null,
            lastError: null,
            createdAt: created,
            sentAt: null
        }));
        this.items.push(...list);
        this.save();
        return list;
    }

    getAll() { return this.items.slice(); }
    getByStatus(status) { return this.items.filter(i => i.status === status); }
    getById(id) { return this.items.find(i => i.id === id) || null; }

    retry(id) {
        const it = this.getById(id);
        if (it && (it.status === 'failed' || it.status === 'review')) {
            it.status = 'pending';
            it.lastError = null;
            this.save();
        }
        return it;
    }

    // Zpracuje frontu SÉRIOVĚ. sendFn(item) → Promise<{success, dmID?, error?}>.
    // Idempotence: položka se před voláním označí 'sending' a uloží; když už má
    // dmID, znovu se neodesílá.
    async process(sendFn) {
        if (this._processing) return { processed: 0, sent: 0, failed: 0 };
        this._processing = true;
        let processed = 0, sent = 0, failed = 0;
        try {
            while (true) {
                const it = this.items.find(i => i.status === 'pending');
                if (!it) break;
                processed++;
                if (it.dmID) { it.status = 'sent'; this.save(); sent++; continue; }
                it.status = 'sending';
                it.attempts++;
                this.save();
                let res;
                try {
                    res = await sendFn(it);
                } catch (e) {
                    res = { success: false, error: e && e.message ? e.message : String(e) };
                }
                if (res && res.success && res.dmID) {
                    it.status = 'sent';
                    it.dmID = res.dmID;
                    it.sentAt = this.now();
                    it.lastError = null;
                    sent++;
                } else {
                    it.lastError = (res && res.error) || 'Neznámá chyba odeslání.';
                    it.status = it.attempts >= this.maxAttempts ? 'failed' : 'pending';
                    if (it.status === 'failed') failed++;
                    // Aby 'pending' po chybě nezacyklil okamžitě, dá se sem vložit
                    // backoff na úrovni volajícího; zde jen necháme na další běh.
                    if (it.status === 'pending') { this.save(); break; }
                }
                this.save();
            }
        } finally {
            this._processing = false;
        }
        return { processed, sent, failed };
    }

    // Aplikuje hromadné změny stavů (z GetMessageStateChanges).
    // changes: [{ dmID, status, statusLabel, delivered }]
    applyStateChanges(changes) {
        let updated = 0;
        const byId = {};
        (changes || []).forEach(c => { if (c.dmID) byId[String(c.dmID)] = c; });
        for (const it of this.items) {
            if (!it.dmID) continue;
            const c = byId[String(it.dmID)];
            if (!c) continue;
            it.dmMessageStatus = c.status;
            it.statusLabel = c.statusLabel;
            if (c.delivered && it.status !== 'delivered') { it.status = 'delivered'; updated++; }
            else if (!c.delivered && it.status === 'sent') { updated++; }
        }
        if (updated) this.save();
        return updated;
    }
}

module.exports = { IsdsOutbox };
