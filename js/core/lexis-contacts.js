/**
 * LexisEditor — Správce kontaktů (Adresář)
 * Ukládá kontakty do IndexedDB přes lexis-storage.js
 */
class LexisContacts {
    constructor(storage) {
        this.storage = storage;
        this._contacts = null;
    }

    async getAll() {
        if (this._contacts) return this._contacts;
        this._contacts = await this.storage.get('settings', 'contacts-db') || [];
        return this._contacts;
    }

    async save(contact) {
        // contact = { id?, jmeno, typ, adresa, mesto, psc, isds, email, tel, ic, poznamka, skupiny[] }
        const all = await this.getAll();
        if (!contact.id) {
            contact.id = `c_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
            contact.created = new Date().toISOString();
            all.push(contact);
        } else {
            const idx = all.findIndex(c => c.id === contact.id);
            if (idx >= 0) all[idx] = { ...all[idx], ...contact, updated: new Date().toISOString() };
            else all.push(contact);
        }
        this._contacts = all;
        // storage.set(storeName, data) bere 2 argumenty; settings má keyPath 'key'.
        await this.storage.set('settings', { key: 'contacts-db', value: all });
        return contact;
    }

    async delete(id) {
        let all = await this.getAll();
        all = all.filter(c => c.id !== id);
        this._contacts = all;
        await this.storage.set('settings', { key: 'contacts-db', value: all });
    }

    async importFromCsv(csvText) {
        const lines = csvText.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return { added: 0, errors: [] };
        const raw_headers = lines[0].split(',').map(h => h.trim().toLowerCase()
            .replace(/jméno|název|name/i, 'jmeno')
            .replace(/adresa|address/i, 'adresa')
            .replace(/město|city|obec/i, 'mesto')
            .replace(/psč|zip|postal/i, 'psc')
            .replace(/datová schránka|isds|ds/i, 'isds')
            .replace(/email|e-mail/i, 'email')
            .replace(/telefon|tel|phone/i, 'tel')
            .replace(/ičo|ic|ico/i, 'ic')
            .replace(/poznámka|note|poznamka/i, 'poznamka')
            .replace(/typ|type/i, 'typ')
            .replace(/skupiny|groups|tags/i, 'skupiny')
        );

        const added = [];
        const errors = [];
        for (let i = 1; i < lines.length; i++) {
            try {
                const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                const contact = { skupiny: [] };
                raw_headers.forEach((h, idx) => {
                    if (h === 'skupiny') contact.skupiny = (vals[idx] || '').split(';').filter(Boolean);
                    else contact[h] = vals[idx] || '';
                });
                if (!contact.jmeno) { errors.push(`Řádek ${i+1}: chybí jméno`); continue; }
                contact.typ = contact.typ || 'fyzicka';
                await this.save(contact);
                added.push(contact);
            } catch (e) {
                errors.push(`Řádek ${i+1}: ${e.message}`);
            }
        }
        return { added: added.length, errors };
    }

    async getGroups() {
        const all = await this.getAll();
        const groups = new Set();
        all.forEach(c => (c.skupiny || []).forEach(g => groups.add(g)));
        return [...groups].sort();
    }

    invalidateCache() {
        this._contacts = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LexisContacts };
} else {
    window.LexisContacts = LexisContacts;
}
