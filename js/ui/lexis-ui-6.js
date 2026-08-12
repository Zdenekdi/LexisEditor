// lexis-ui-6.js — část UI vytažená z lexis-ui.js (prototype-mixin, beze změny chování).
// Načítá se v index.html PO lexis-ui.js. Obsahuje: _renderContactGroupFilter, _toggleContactGroup, openContactForm, closeContactForm, saveContactForm, deleteContact, insertContactToDoc, onContactsCsvPicked, _esc, startMailMerge, renderCampaignStep, _renderCampaignStep1, _renderCampaignStep2, _setCampaignMode, _renderCourtsSelector, _onCourtSearch, _filterCourtType, _toggleCourt, _toggleAllCourts, _renderContactsSelector, _onContactsCampaignSearch, _onContactsCampaignType, _onContactsCampaignGroup, _toggleContact, _toggleAllContacts, _renderCsvSelector, _buildRecordsFromMode, _renderCampaignStep3, _renderCampaignStep4, campaignNext, campaignBack, runCampaignBatch, _openContactsShortcut
Object.assign(LexisUI.prototype, {

    async _renderContactGroupFilter() {
        const container = document.getElementById('contacts-group-filter');
        if (!container) return;
        const groups = await this._getContacts().getGroups();
        container.innerHTML = eIco(groups.map(g => `
            <div class="court-type-chip ${this._contactsActiveGroup === g ? 'active' : ''}"
                onclick="lexisUI._toggleContactGroup('${g}')">
                ${this._esc(g)}
            </div>
        `).join(''));
    },

    _toggleContactGroup(group) {
        this._contactsActiveGroup = this._contactsActiveGroup === group ? '' : group;
        this._renderContactGroupFilter();
        this.renderContactsList();
    },

    async openContactForm(id) {
        const overlay = document.getElementById('contact-form-overlay');
        const titleEl = document.getElementById('contact-form-title');
        if (!overlay) return;

        // Reset form
        ['cf-id','cf-jmeno','cf-typ','cf-ic','cf-adresa','cf-mesto','cf-psc','cf-isds','cf-email','cf-tel','cf-skupiny','cf-poznamka'].forEach(fid => {
            const el = document.getElementById(fid);
            if (el) el.value = '';
        });
        const typEl = document.getElementById('cf-typ');
        if (typEl) typEl.value = 'fyzicka';

        if (id) {
            const all = await this._getContacts().getAll();
            const contact = all.find(c => c.id === id);
            if (contact) {
                if (titleEl) titleEl.textContent = 'Upravit kontakt';
                document.getElementById('cf-id').value = contact.id;
                document.getElementById('cf-jmeno').value = contact.jmeno || '';
                document.getElementById('cf-typ').value = contact.typ || 'fyzicka';
                document.getElementById('cf-ic').value = contact.ic || '';
                document.getElementById('cf-adresa').value = contact.adresa || '';
                document.getElementById('cf-mesto').value = contact.mesto || '';
                document.getElementById('cf-psc').value = contact.psc || '';
                document.getElementById('cf-isds').value = contact.isds || '';
                document.getElementById('cf-email').value = contact.email || '';
                document.getElementById('cf-tel').value = contact.tel || '';
                document.getElementById('cf-skupiny').value = (contact.skupiny || []).join(', ');
                document.getElementById('cf-poznamka').value = contact.poznamka || '';
            }
        } else {
            if (titleEl) titleEl.textContent = 'Nový kontakt';
        }

        overlay.style.display = 'flex';
    },

    closeContactForm() {
        const overlay = document.getElementById('contact-form-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    async saveContactForm() {
        const jmeno = document.getElementById('cf-jmeno')?.value?.trim();
        if (!jmeno) {
            this.customAlert('⚠️ Vyplňte prosím alespoň jméno/název kontaktu.');
            return;
        }

        const skupinyRaw = document.getElementById('cf-skupiny')?.value || '';
        const skupiny = skupinyRaw.split(',').map(s => s.trim()).filter(Boolean);

        const contact = {
            id: document.getElementById('cf-id')?.value || undefined,
            jmeno,
            typ: document.getElementById('cf-typ')?.value || 'fyzicka',
            ic: document.getElementById('cf-ic')?.value?.trim() || '',
            adresa: document.getElementById('cf-adresa')?.value?.trim() || '',
            mesto: document.getElementById('cf-mesto')?.value?.trim() || '',
            psc: document.getElementById('cf-psc')?.value?.trim() || '',
            isds: document.getElementById('cf-isds')?.value?.trim() || '',
            email: document.getElementById('cf-email')?.value?.trim() || '',
            tel: document.getElementById('cf-tel')?.value?.trim() || '',
            skupiny,
            poznamka: document.getElementById('cf-poznamka')?.value?.trim() || ''
        };

        await this._getContacts().save(contact);
        this.closeContactForm();
        await this.renderContactsList();
        await this._renderContactGroupFilter();
        this.customAlert(`✅ <b>Kontakt uložen!</b><br><br><b>${this._esc(jmeno)}</b> byl úspěšně uložen do adresáře.`);
    },

    async deleteContact(id) {
        const all = await this._getContacts().getAll();
        const contact = all.find(c => c.id === id);
        if (!contact) return;

        if (!confirm(`Opravdu smazat kontakt "${contact.jmeno}"?`)) return;
        await this._getContacts().delete(id);
        await this.renderContactsList();
        await this._renderContactGroupFilter();
    },

    async insertContactToDoc(id) {
        // Jeden zdroj pravdy: formátování i vkládání řeší LexisParties (stejný
        // výstup jako tlačítko „Vložit stranu" — vč. IČO a datové schránky).
        if (window.LexisParties && window.LexisParties.insertContactById) {
            const ok = await window.LexisParties.insertContactById(id);
            this.closeContacts();
            this.customAlert(ok
                ? '✅ <b>Údaje vloženy!</b><br><br>Identifikace kontaktu byla vložena do dokumentu.'
                : 'Kontakt se nepodařilo vložit.');
            return;
        }
        this.customAlert('Vkládání stran není dostupné (modul LexisParties není načten).');
    },

    async onContactsCsvPicked(input) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = await this._getContacts().importFromCsv(e.target.result);
            this._getContacts().invalidateCache();
            await this.renderContactsList();
            await this._renderContactGroupFilter();
            const errHtml = result.errors.length > 0
                ? `<br><br>⚠️ Přeskočeno ${result.errors.length} řádků: ${result.errors.slice(0,3).join(', ')}${result.errors.length > 3 ? '...' : ''}`
                : '';
            this.customAlert(`✅ <b>Import dokončen!</b><br><br>Přidáno <b>${result.added}</b> kontaktů.${errHtml}`);
        };
        reader.readAsText(file, 'utf-8');
        input.value = '';
    },

    _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    startMailMerge() {
        this._campaignStep = 1;
        this._campaignRecords = [];
        this._campaignPreviewIdx = 0;
        this._campaignAction = 'download';
        this._campaignRecipientMode = 'courts';
        this._selectedCourts = new Set();
        this._selectedContacts = new Set();
        const overlay = document.getElementById('campaign-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.renderCampaignStep(1);
        }
    },

    renderCampaignStep(step) {
        this._campaignStep = step;
        const body = document.getElementById('campaign-body');
        const footerInfo = document.getElementById('campaign-footer-info');
        const btnBack = document.getElementById('campaign-btn-back');
        const btnNext = document.getElementById('campaign-btn-next');
        if (!body) return;

        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`cstep-${i}`);
            const lineEl = document.getElementById(`cline-${i}`);
            if (stepEl) {
                stepEl.classList.toggle('active', i === step);
                stepEl.classList.toggle('done', i < step);
                const numEl = stepEl.querySelector('.campaign-step-num');
                if (numEl && i < step) numEl.textContent = '✓';
                else if (numEl) numEl.textContent = String(i);
            }
            if (lineEl) lineEl.classList.toggle('done', i < step);
        }

        if (footerInfo) footerInfo.textContent = `Krok ${step} ze 4`;
        if (btnBack) btnBack.style.display = step > 1 ? 'inline-flex' : 'none';
        if (btnNext) {
            if (step < 4) {
                btnNext.textContent = 'Další →';
                btnNext.className = 'campaign-btn campaign-btn-next';
                btnNext.onclick = () => this.campaignNext();
                btnNext.disabled = false;
            } else {
                btnNext.textContent = '🚀 Spustit kampaň';
                btnNext.className = 'campaign-btn campaign-btn-run';
                btnNext.onclick = () => this.runCampaignBatch();
                btnNext.disabled = false;
            }
        }

        if (step === 1) this._renderCampaignStep1(body);
        else if (step === 2) this._renderCampaignStep2(body);
        else if (step === 3) this._renderCampaignStep3(body);
        else if (step === 4) this._renderCampaignStep4(body);
    },

    _renderCampaignStep1(body) {
        const text = this.core.getText();
        const varMatches = [...new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]))];
        const hasVars = varMatches.length > 0;
        body.innerHTML = eIco(`
            <div class="${hasVars ? 'campaign-info-box' : 'campaign-warn-box'}">
                ${hasVars
                    ? `✅ <b>Nalezeno ${varMatches.length} proměnných</b> v dokumentu.`
                    : `⚠️ <b>Žádné proměnné nenalezeny.</b> Přidejte <code>{{JménoProměnné}}</code>, nebo kampaň pošle stejný dokument všem.`
                }
            </div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:14px;">
                Proměnné se zapisují jako <code style="background:var(--bg-workspace);padding:2px 6px;border-radius:4px;">{{NazevPromenné}}</code>.<br>
                Pro soudy jsou automaticky dostupné: <code style="background:var(--bg-workspace);padding:2px 6px;border-radius:4px;">{{NazevSoudu}}</code>, 
                <code style="background:var(--bg-workspace);padding:2px 6px;border-radius:4px;">{{AdresaSoudu}}</code>, 
                <code style="background:var(--bg-workspace);padding:2px 6px;border-radius:4px;">{{MestoPSC}}</code>.
            </p>
            <div class="campaign-vars-grid">
                ${varMatches.map(v => `<div class="campaign-var-chip">{{${this._esc(v)}}}</div>`).join('')}
                ${varMatches.length === 0 ? '<div style="font-size:12px;color:var(--text-faint);">Žádné proměnné.</div>' : ''}
            </div>
        `);
    },

    async _renderCampaignStep2(body) {
        const mode = this._campaignRecipientMode;

        body.innerHTML = eIco(`
            <div class="campaign-mode-switcher">
                <button class="campaign-mode-btn ${mode === 'courts' ? 'active' : ''}" onclick="lexisUI._setCampaignMode('courts')">🏛️ Soudy</button>
                <button class="campaign-mode-btn ${mode === 'contacts' ? 'active' : ''}" onclick="lexisUI._setCampaignMode('contacts')">👥 Adresář</button>
                <button class="campaign-mode-btn ${mode === 'csv' ? 'active' : ''}" onclick="lexisUI._setCampaignMode('csv')">📋 CSV / Ručně</button>
            </div>
            <div id="campaign-recipient-body"></div>
        `);

        if (mode === 'courts') await this._renderCourtsSelector();
        else if (mode === 'contacts') await this._renderContactsSelector();
        else this._renderCsvSelector();
    },

    _setCampaignMode(mode) {
        this._campaignRecipientMode = mode;
        const body = document.getElementById('campaign-body');
        if (body) this._renderCampaignStep2(body);
    },

    async _renderCourtsSelector() {
        const container = document.getElementById('campaign-recipient-body');
        if (!container) return;

        const courts = (window.COURT_REGISTRY || []);
        const types = window.COURT_TYPES || {};
        const search = this._courtSearchQuery || '';
        const typeFilter = this._courtTypeFilter || '';

        const filtered = courts.filter(c => {
            const matchSearch = !search ||
                c.nazev.toLowerCase().includes(search.toLowerCase()) ||
                c.mesto.toLowerCase().includes(search.toLowerCase());
            const matchType = !typeFilter || c.typ === typeFilter;
            return matchSearch && matchType;
        });

        const grouped = {};
        filtered.forEach(c => {
            const label = types[c.typ] || c.typ;
            if (!grouped[label]) grouped[label] = [];
            grouped[label].push(c);
        });

        const selCount = this._selectedCourts.size;

        container.innerHTML = eIco(`
            <div class="sp-zn-hint">
                💡 Vyberte soudy, na které chcete podat. Dokument bude pro každý soud vygenerován zvlášť s vyplněnými proměnnými soudu.
            </div>
            <div class="court-search-box">
                <input type="text" class="court-search-input" id="court-search" placeholder="🔍 Hledat soud..." value="${this._esc(search)}" oninput="lexisUI._onCourtSearch(this.value)">
                <span class="court-search-icon">⌕</span>
            </div>
            <div class="court-type-filter">
                <div class="court-type-chip ${!typeFilter ? 'active' : ''}" onclick="lexisUI._filterCourtType('')">Všechny</div>
                ${Object.entries(types).map(([k,v]) => `
                    <div class="court-type-chip ${typeFilter === k ? 'active' : ''}" onclick="lexisUI._filterCourtType('${k}')">${v}</div>
                `).join('')}
            </div>
            <div class="court-list-scroll">
                <div class="court-select-all-row">
                    <input type="checkbox" id="court-select-all" ${selCount === filtered.length && filtered.length > 0 ? 'checked' : ''} onchange="lexisUI._toggleAllCourts(this.checked, ${JSON.stringify(filtered.map(c => c.nazev))})">
                    <label for="court-select-all" class="court-select-all-label">Vybrat vše (${filtered.length})</label>
                    ${selCount > 0 ? `<div class="court-count-badge">${selCount} vybráno</div>` : ''}
                </div>
                ${Object.entries(grouped).map(([group, courts_in_group]) => `
                    <div class="court-list-group-header">${group}</div>
                    ${courts_in_group.map(c => `
                        <div class="court-list-item ${this._selectedCourts.has(c.nazev) ? 'selected' : ''}" onclick="lexisUI._toggleCourt('${this._esc(c.nazev)}')">
                            <input type="checkbox" ${this._selectedCourts.has(c.nazev) ? 'checked' : ''} onclick="event.stopPropagation();lexisUI._toggleCourt('${this._esc(c.nazev)}')">
                            <span class="court-list-item-name">${this._esc(c.nazev)}</span>
                            <span class="court-list-item-meta">${this._esc(c.mesto)}</span>
                            <span class="court-isds-badge">${this._esc(c.isds)}</span>
                        </div>
                    `).join('')}
                `).join('')}
                ${filtered.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text-faint);">Žádné soudy nenalezeny.</div>' : ''}
            </div>
            <div class="court-selected-tags" id="court-selected-tags">
                ${[...this._selectedCourts].map(name => `
                    <div class="court-selected-tag">
                        ${this._esc(name)}
                        <span class="court-selected-tag-remove" onclick="lexisUI._toggleCourt('${this._esc(name)}')">✕</span>
                    </div>
                `).join('')}
            </div>
        `);
    },

    _onCourtSearch(val) {
        this._courtSearchQuery = val;
        this._renderCourtsSelector();
    },

    _filterCourtType(type) {
        this._courtTypeFilter = type;
        this._renderCourtsSelector();
    },

    _toggleCourt(name) {
        if (this._selectedCourts.has(name)) this._selectedCourts.delete(name);
        else this._selectedCourts.add(name);
        this._renderCourtsSelector();
    },

    _toggleAllCourts(checked, names) {
        if (checked) names.forEach(n => this._selectedCourts.add(n));
        else names.forEach(n => this._selectedCourts.delete(n));
        this._renderCourtsSelector();
    },

    async _renderContactsSelector() {
        const container = document.getElementById('campaign-recipient-body');
        if (!container) return;

        const all = await this._getContacts().getAll();
        const groups = await this._getContacts().getGroups();
        const search = this._contactsCampaignSearch || '';
        const typeFilter = this._contactsCampaignType || '';
        const groupFilter = this._contactsCampaignGroup || '';

        const filtered = all.filter(c => {
            const matchSearch = !search ||
                (c.jmeno || '').toLowerCase().includes(search.toLowerCase()) ||
                (c.adresa || '').toLowerCase().includes(search.toLowerCase()) ||
                (c.isds || '').toLowerCase().includes(search.toLowerCase());
            const matchType = !typeFilter || c.typ === typeFilter;
            const matchGroup = !groupFilter || (c.skupiny || []).includes(groupFilter);
            return matchSearch && matchType && matchGroup;
        });

        const selCount = this._selectedContacts.size;

        container.innerHTML = eIco(`
            <div class="sp-zn-hint">
                💡 Vyberte kontakty z adresáře. Proměnné <code>{{Jmeno}}</code>, <code>{{Adresa}}</code>, <code>{{ISDS}}</code>, <code>{{Email}}</code> budou automaticky doplněny.
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <div class="court-search-box" style="flex:1;min-width:180px;margin-bottom:0;">
                    <input type="text" class="court-search-input" placeholder="🔍 Hledat..." value="${this._esc(search)}" oninput="lexisUI._onContactsCampaignSearch(this.value)">
                </div>
                <select onchange="lexisUI._onContactsCampaignType(this.value)" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);">
                    <option value="">Všechny typy</option>
                    <option value="fyzicka">Fyzické osoby</option>
                    <option value="pravnicka">Právnické osoby</option>
                    <option value="organ">Orgány</option>
                    <option value="soud">Soudy</option>
                </select>
                ${groups.length > 0 ? `
                <select onchange="lexisUI._onContactsCampaignGroup(this.value)" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);">
                    <option value="">Všechny skupiny</option>
                    ${groups.map(g => `<option value="${this._esc(g)}" ${groupFilter === g ? 'selected' : ''}>${this._esc(g)}</option>`).join('')}
                </select>` : ''}
            </div>
            <div class="court-list-scroll">
                <div class="court-select-all-row">
                    <input type="checkbox" id="contacts-select-all" ${selCount === filtered.length && filtered.length > 0 ? 'checked' : ''}
                        onchange="lexisUI._toggleAllContacts(this.checked, ${JSON.stringify(filtered.map(c => c.id))})">
                    <label for="contacts-select-all" class="court-select-all-label">Vybrat vše (${filtered.length})</label>
                    ${selCount > 0 ? `<div class="court-count-badge">${selCount} vybráno</div>` : ''}
                </div>
                ${filtered.length === 0
                    ? `<div style="padding:30px;text-align:center;color:var(--text-faint);">
                        📭 Žádné kontakty. <span onclick="lexisUI.openContacts()" style="color:var(--accent-text);cursor:pointer;font-weight:700;">Přidat kontakty do adresáře →</span>
                       </div>`
                    : filtered.map(c => `
                        <div class="court-list-item ${this._selectedContacts.has(c.id) ? 'selected' : ''}" onclick="lexisUI._toggleContact('${c.id}')">
                            <input type="checkbox" ${this._selectedContacts.has(c.id) ? 'checked' : ''} onclick="event.stopPropagation();lexisUI._toggleContact('${c.id}')">
                            <span class="court-list-item-name">
                                <b>${this._esc(c.jmeno)}</b>
                                ${c.adresa ? `<span style="font-size:11px;color:var(--text-faint);margin-left:8px;">${this._esc(c.adresa)}, ${this._esc(c.mesto || '')}</span>` : ''}
                            </span>
                            ${c.isds ? `<span class="court-isds-badge">${this._esc(c.isds)}</span>` : '<span style="font-size:11px;color:var(--border-strong);">bez DS</span>'}
                        </div>
                    `).join('')
                }
            </div>
            ${selCount > 0 ? `
            <div class="court-selected-tags">
                ${[...this._selectedContacts].slice(0,8).map(id => {
                    const c = all.find(x => x.id === id);
                    return c ? `<div class="court-selected-tag">${this._esc(c.jmeno)}<span class="court-selected-tag-remove" onclick="lexisUI._toggleContact('${c.id}')">✕</span></div>` : '';
                }).join('')}
                ${selCount > 8 ? `<div class="court-selected-tag" style="background:var(--bg-workspace);color:var(--text-muted);">+${selCount - 8} dalších</div>` : ''}
            </div>` : ''}
        `);
    },

    _onContactsCampaignSearch(val) { this._contactsCampaignSearch = val; this._renderContactsSelector(); },

    _onContactsCampaignType(val) { this._contactsCampaignType = val; this._renderContactsSelector(); },

    _onContactsCampaignGroup(val) { this._contactsCampaignGroup = val; this._renderContactsSelector(); },

    _toggleContact(id) {
        if (this._selectedContacts.has(id)) this._selectedContacts.delete(id);
        else this._selectedContacts.add(id);
        this._renderContactsSelector();
    },

    _toggleAllContacts(checked, ids) {
        if (checked) ids.forEach(id => this._selectedContacts.add(id));
        else ids.forEach(id => this._selectedContacts.delete(id));
        this._renderContactsSelector();
    },

    _renderCsvSelector() {
        const container = document.getElementById('campaign-recipient-body');
        if (!container) return;
        const text = this.core.getText();
        const varMatches = [...new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]))];
        const exampleHeaders = varMatches.length > 0 ? varMatches.join(',') : 'Jmeno,Adresa,ISDS';
        const csvVal = this._campaignCsvText || `${exampleHeaders}\nJan Novák,Václavské nám. 1 Praha 1,abc123x\nMarie Svobodová,náměstí Míru 7 Praha 2,xyz987k`;

        container.innerHTML = eIco(`
            <div class="sp-zn-hint">
                💡 Vložte CSV nebo napište adresáty ručně. První řádek = záhlaví sloupců (odpovídá proměnným v dokumentu).
            </div>
            <div style="display:flex;gap:10px;margin-bottom:10px;">
                <button onclick="document.getElementById('campaign-csv-input').click()" style="padding:7px 14px;border-radius:8px;background:var(--bg-workspace);border:1px solid var(--border);font-size:12px;font-weight:700;cursor:pointer;">📂 Načíst soubor (.csv)</button>
                <span style="font-size:11px;color:var(--text-faint);align-self:center;">nebo napiš ručně:</span>
            </div>
            <textarea class="campaign-csv-area" id="campaign-csv-ta" oninput="lexisUI._updateCampaignRecordsPreview()">${this._esc(csvVal)}</textarea>
            <div id="campaign-table-preview" style="margin-top:8px;"></div>
        `);
        this._updateCampaignRecordsPreview();
    },

    async _buildRecordsFromMode() {
        const mode = this._campaignRecipientMode;
        if (mode === 'courts') {
            const courts = window.COURT_REGISTRY || [];
            return [...this._selectedCourts].map(name => {
                const c = courts.find(x => x.nazev === name);
                if (!c) return null;
                return {
                    NazevSoudu: c.nazev,
                    AdresaSoudu: c.adresa,
                    MestoPSC: `${c.psc} ${c.mesto}`,
                    Mesto: c.mesto,
                    PSC: c.psc,
                    ISDS: c.isds,
                    _isds: c.isds,
                    _nazev: c.nazev
                };
            }).filter(Boolean);
        } else if (mode === 'contacts') {
            const all = await this._getContacts().getAll();
            return [...this._selectedContacts].map(id => {
                const c = all.find(x => x.id === id);
                if (!c) return null;
                return {
                    Jmeno: c.jmeno,
                    Adresa: c.adresa,
                    Mesto: c.mesto,
                    PSC: c.psc,
                    MestoPSC: `${c.psc || ''} ${c.mesto || ''}`.trim(),
                    ISDS: c.isds,
                    Email: c.email,
                    Tel: c.tel,
                    IC: c.ic,
                    _isds: c.isds,
                    _nazev: c.jmeno
                };
            }).filter(Boolean);
        } else {
            const ta = document.getElementById('campaign-csv-ta');
            if (ta) this._campaignCsvText = ta.value;
            return this.parseCsvToRecords(this._campaignCsvText || '');
        }
    },

    _renderCampaignStep3(body) {
        const records = this._campaignRecords;
        if (records.length === 0) {
            body.innerHTML = eIco('<div class="campaign-warn-box">⚠️ Žádní příjemci. Vraťte se zpět.</div>');
            return;
        }
        const idx = Math.min(this._campaignPreviewIdx, records.length - 1);
        const docHtml = this.core.getContent();
        const filled = this.exportCampaignRecord(records[idx], docHtml);
        const recipientName = records[idx]._nazev || records[idx][Object.keys(records[idx])[0]] || '';
        body.innerHTML = eIco(`
            <div class="campaign-preview-nav">
                <button class="campaign-preview-btn" onclick="lexisUI._campaignPreviewNav(-1)">←</button>
                <div class="campaign-preview-counter">Příjemce ${idx + 1} z ${records.length}: <b>${this._esc(recipientName)}</b></div>
                <button class="campaign-preview-btn" onclick="lexisUI._campaignPreviewNav(1)">→</button>
            </div>
            <div class="campaign-preview-doc">${filled}</div>
        `);
    },

    _renderCampaignStep4(body) {
        const count = this._campaignRecords.length;
        const hasISDS = this._campaignRecords.some(r => r._isds);
        body.innerHTML = eIco(`
            <p style="font-size:13px;color:var(--text-2);margin-bottom:16px;">Připraveno <b>${count} dokumentů</b> k odeslání:</p>
            <div class="campaign-action-grid">
                <div class="campaign-action-card ${this._campaignAction === 'download' ? 'selected' : ''}" onclick="lexisUI._setCampaignAction('download')">
                    <div class="campaign-action-icon">📦</div>
                    <div class="campaign-action-title">Stáhnout dokumenty</div>
                    <div class="campaign-action-desc">Stáhne ${count} HTML souborů do počítače</div>
                </div>
                <div class="campaign-action-card ${this._campaignAction === 'isds' ? 'selected' : ''} ${!hasISDS ? 'disabled' : ''}" 
                     onclick="${hasISDS ? "lexisUI._setCampaignAction('isds')" : "lexisUI.customAlert('Žádní příjemci nemají datovou schránku.')"}">
                    <div class="campaign-action-icon">📮</div>
                    <div class="campaign-action-title">Odeslat přes ISDS</div>
                    <div class="campaign-action-desc">${hasISDS ? `Odešle přes datové schránky (${this._campaignRecords.filter(r=>r._isds).length} příjemců má DS)` : '⚠️ Žádný příjemce nemá datovou schránku'}</div>
                </div>
            </div>
            <div class="campaign-progress-bar" id="campaign-prog-bar" style="display:none;">
                <div class="campaign-progress-fill" id="campaign-prog-fill" style="width:0%"></div>
            </div>
            <div id="campaign-run-status" style="font-size:12px;color:var(--text-muted);margin-top:8px;"></div>
            <div id="campaign-batch-results" style="margin-top:12px;max-height:200px;overflow-y:auto;"></div>
        `);
    },

    async campaignNext() {
        const step = this._campaignStep;

        if (step === 2) {
            // Build records from selected mode
            const records = await this._buildRecordsFromMode();
            if (records.length === 0) {
                this.customAlert('⚠️ Nevybráni žádní příjemci. Prosím vyberte alespoň jednoho.');
                return;
            }
            this._campaignRecords = records;
            this._campaignPreviewIdx = 0;
        }

        if (step < 4) this.renderCampaignStep(step + 1);
    },

    campaignBack() {
        if (this._campaignStep > 1) this.renderCampaignStep(this._campaignStep - 1);
    },

    async runCampaignBatch() {
        const records = this._campaignRecords;
        if (records.length === 0) { this.customAlert('Nejsou žádní příjemci.'); return; }

        const progBar = document.getElementById('campaign-prog-bar');
        const progFill = document.getElementById('campaign-prog-fill');
        const statusEl = document.getElementById('campaign-run-status');
        const resultsEl = document.getElementById('campaign-batch-results');
        const btnNext = document.getElementById('campaign-btn-next');

        if (progBar) progBar.style.display = 'block';
        if (btnNext) btnNext.disabled = true;

        const templateHtml = this.core.getContent();
        const results = [];

        // Table header
        if (resultsEl) resultsEl.innerHTML = eIco(`
            <table class="campaign-batch-table">
                <thead><tr>
                    <th>#</th><th>Příjemce</th><th>ISDS</th><th>Stav</th>
                </tr></thead>
                <tbody id="campaign-batch-tbody"></tbody>
            </table>`);

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const name = record._nazev || record[Object.keys(record)[0]] || `Příjemce_${i+1}`;
            const isds = record._isds || '';

            // Update table row
            const tbody = document.getElementById('campaign-batch-tbody');
            if (tbody) {
                const tr = document.createElement('tr');
                tr.id = `batch-row-${i}`;
                tr.innerHTML = eIco(`
                    <td>${i+1}</td>
                    <td><b>${this._esc(name)}</b></td>
                    <td>${isds ? `<span class="court-isds-badge">${this._esc(isds)}</span>` : '<span style="color:var(--border-strong);font-size:11px;">—</span>'}</td>
                    <td><span id="batch-status-${i}" class="batch-status-badge batch-status-sending">⏳ Generuji...</span></td>
                `);
                tbody.appendChild(tr);
                tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            let status = 'ok';
            try {
                const filled = this.exportCampaignRecord(record, templateHtml)
                    .replace(/<span class="filled-var">/g, '').replace(/<\/span>/g, '');

                // Vždy vygenerujeme hmatatelný dokument (stažení HTML). U ISDS
                // režimu ho NEODESÍLÁME automaticky: identifikátory schránek soudů
                // nejsou ověřené (ISDS_DATA_VERIFIED=false) a automatické odeslání by
                // mohlo doručit do cizí/neplatné schránky. Reálné (ověřené) hromadné
                // odeslání dělá modul Datové schránky přes ověřenou frontu (outbox).
                // Nikdy nehlásíme „odesláno", když jsme nic neodeslali.
                const fullHtml = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"><title>${this._esc(name)}</title><style>body{font-family:'Segoe UI',sans-serif;max-width:210mm;margin:20mm auto;font-size:12pt;line-height:1.6;color:var(--ink);}h1,h2,h3{color:var(--ink);}</style></head><body>${filled}</body></html>`;
                const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `dokument_${name.replace(/[^a-z0-9_]/gi,'_')}.html`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                await new Promise(r => setTimeout(r, 200));
                status = (this._campaignAction === 'isds' && isds) ? 'prepared' : 'ok';
            } catch (e) {
                status = 'err';
                console.error(`Chyba pro ${name}:`, e);
            }

            results.push({ name, status });

            const statusBadge = document.getElementById(`batch-status-${i}`);
            if (statusBadge) {
                const badge = status === 'prepared' ? 'sending' : status;
                statusBadge.className = `batch-status-badge batch-status-${badge}`;
                statusBadge.textContent =
                    status === 'err' ? '❌ Chyba' :
                    status === 'prepared' ? '📤 Připraveno' :
                    '✅ Staženo';
            }

            const pct = Math.round(((i + 1) / records.length) * 100);
            if (progFill) progFill.style.width = `${pct}%`;
            if (statusEl) statusEl.textContent = `Zpracovávám ${i + 1} / ${records.length}...`;
        }

        const ok = results.filter(r => r.status === 'ok').length;
        const prepared = results.filter(r => r.status === 'prepared').length;
        const err = results.filter(r => r.status === 'err').length;
        if (statusEl) {
            if (prepared > 0) {
                // Honest ISDS message: nic se neodeslalo, jen připravily dokumenty.
                statusEl.innerHTML = eIco(`📤 <b>Připraveno ${prepared} dokumentů</b>${err > 0 ? `, ${err} chyb` : ''} (staženy). `
                    + `Datové zprávy se <b>zatím neodeslaly</b> — hromadné odeslání s ověřením příjemce udělej v modulu `
                    + `<b>Datové schránky → Odeslat</b> (tam se každá schránka ověří proti registru).`);
            } else {
                statusEl.innerHTML = eIco(`✅ <b>Kampaň dokončena!</b> ${ok} staženo${err > 0 ? `, ${err} chyb` : ''}.`);
            }
        }
        if (btnNext) btnNext.disabled = false;
    },

    _openContactsShortcut() { this.openContacts(); }

});
