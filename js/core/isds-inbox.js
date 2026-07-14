// --- ISDS Inbox (příchozí datové zprávy) ---
// Perzistentní seznam přijatých zpráv. Rozlišuje:
//   localStatus 'new'        – známe jen obálku (doručení NEspuštěno)
//   localStatus 'downloaded' – obsah stažen (doručení přihlášením spuštěno)
//
// Modul je bezstavový vůči síti (síť dělá main.js) a testovatelný.

'use strict';

const nodeFs = require('fs');

class IsdsInbox {
    constructor(opts = {}) {
        this.filePath = opts.filePath;
        this.fs = opts.fs || nodeFs;
        this.now = opts.now || (() => new Date().toISOString());
        this.items = [];
        this.load();
    }

    load() {
        try {
            if (this.filePath && this.fs.existsSync(this.filePath)) {
                const data = JSON.parse(this.fs.readFileSync(this.filePath, 'utf-8'));
                this.items = Array.isArray(data.items) ? data.items : [];
            }
        } catch (e) { this.items = []; }
        return this.items;
    }

    save() {
        if (!this.filePath) return;
        try { this.fs.writeFileSync(this.filePath, JSON.stringify({ items: this.items }, null, 2), 'utf-8'); }
        catch (e) { /* best-effort */ }
    }

    getAll() { return this.items.slice(); }
    getById(dmID) { return this.items.find(i => String(i.dmID) === String(dmID)) || null; }

    // Sloučí nově vylistované obálky. Existující (zejména stažené) NEpřepisuje,
    // jen aktualizuje stav doručení z obálky.
    upsertEnvelopes(messages) {
        let added = 0;
        for (const m of (messages || [])) {
            if (!m || !m.dmID) continue;
            const existing = this.getById(m.dmID);
            if (existing) {
                existing.status = m.status;
                existing.statusLabel = m.statusLabel;
                existing.delivered = m.delivered;
                if (m.deliveryTime) existing.deliveryTime = m.deliveryTime;
                if (m.acceptanceTime) existing.acceptanceTime = m.acceptanceTime;
            } else {
                this.items.push({
                    dmID: m.dmID,
                    sender: m.sender || '',
                    senderId: m.senderId || '',
                    annotation: m.annotation || '',
                    deliveryTime: m.deliveryTime || null,
                    acceptanceTime: m.acceptanceTime || null,
                    status: m.status || null,
                    statusLabel: m.statusLabel || null,
                    delivered: !!m.delivered,
                    localStatus: 'new',
                    downloadedAt: null,
                    files: [],
                    deadlineCreated: false,
                    firstSeenAt: this.now()
                });
                added++;
            }
        }
        if (added || (messages && messages.length)) this.save();
        return added;
    }

    // Zaznamená stažení obsahu (doručení spuštěno). files = [{name, mimeType, path?}].
    markDownloaded(dmID, envelope, files) {
        const it = this.getById(dmID);
        if (!it) return null;
        it.localStatus = 'downloaded';
        it.downloadedAt = this.now();
        if (envelope) {
            if (envelope.annotation) it.annotation = envelope.annotation;
            if (envelope.sender) it.sender = envelope.sender;
            if (envelope.deliveryTime) it.deliveryTime = envelope.deliveryTime;
        }
        it.files = (files || []).map(f => ({ name: f.name, mimeType: f.mimeType, path: f.path || null }));
        this.save();
        return it;
    }

    markDeadlineCreated(dmID) {
        const it = this.getById(dmID);
        if (it) { it.deadlineCreated = true; this.save(); }
        return it;
    }

    getNew() { return this.items.filter(i => i.localStatus === 'new'); }
}

module.exports = { IsdsInbox };
