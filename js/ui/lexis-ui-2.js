// lexis-ui-2.js — část UI vytažená z lexis-ui.js (prototype-mixin, beze změny chování).
// Načítá se v index.html PO lexis-ui.js. Obsahuje: checkHierarchy, checkTerminology, renderAuditResults, jumpToAuditError, applyAuditFix, applyPaper, applyOrientation, applyZoom, updateMargins, showLoader, customAlert, customConfirm, customPrompt, showFeeCalc, showTariffCalc, showInterestCalc, loadQATSettings, loadCustomQATItems, renderCustomQATItems, executeQATPinAction, updateDocTitleDOM, showQATMenu, toggleQATItem, activateLicense, loadLicense, loadCustomClauses, deleteCustomClause, saveSelectedAsClause, triggerCloudSync, checkEnterpriseFeature, sendAIQuery, openLexisLink, openPdfViewer, closePdfViewer
Object.assign(LexisUI.prototype, {

    checkHierarchy() {
        const text = this.core.quill.getText();
        let results = [];
        const matches = [...text.matchAll(/§\s*(\d+)/g)];
        let lastNum = 0;
        matches.forEach(m => {
            const num = parseInt(m[1]);
            if (num <= lastNum) results.push({ type: 'error', msg: `Chyba v pořadí u § ${num}`, index: m.index, length: m[0].length });
            lastNum = num;
        });
        return results;
    },

    checkTerminology() {
        const text = this.core.quill.getText();
        let results = [];
        const definitionMatches = [...text.matchAll(/["„“]([A-Z][a-z-ěščřžýáíéůú]+)["„“]/g)];
        const definedTerms = [...new Set(definitionMatches.map(m => m[1]))];
        definedTerms.forEach(term => {
            const lowerTerm = term.charAt(0).toLowerCase() + term.slice(1);
            const regex = new RegExp(`\\b${lowerTerm}\\b`, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                results.push({ type: 'warning', msg: `Pojem "${term}" by měl začínat velkým písmenem.`, index: match.index, length: match[0].length, fix: term });
            }
        });
        return results;
    },

    renderAuditResults(results) {
        const list = document.getElementById('audit-list');
        const badge = document.getElementById('audit-count-badge');
        if (!list) return;

        if (results.length === 0) {
            list.innerHTML = '<p style="font-size: 11px; color: #64748b; font-style: italic; text-align: center;">Žádné chyby nenalezeny.</p>';
            if (badge) badge.style.display = 'none';
            return;
        }

        if (badge) {
            badge.innerText = results.length;
            badge.style.display = 'inline-block';
        }

        list.innerHTML = results.map((res, i) => `
            <div class="audit-item audit-item-${res.type}" onclick="lexisUI.jumpToAuditError(${res.index}, ${res.length})">
                <div style="font-weight:700; margin-bottom:2px;">${res.type === 'error' ? '❌' : (res.type === 'warning' ? '⚠️' : 'ℹ️')} ${res.type.toUpperCase()}</div>
                <div style="color:#1e293b;">${res.msg}</div>
                ${res.fix ? `<button class="audit-fix-btn" onclick="event.stopPropagation(); lexisUI.applyAuditFix(${i}, ${res.index}, ${res.length}, '${res.fix}')">Opravit na "${res.fix}"</button>` : ''}
            </div>
        `).join('');
        this.currentAuditResults = results;
    },

    jumpToAuditError(index, length) {
        this.core.quill.setSelection(index, length, 'user');
        this.core.quill.formatText(index, length, { 'background': '#fde68a' });
        setTimeout(() => this.core.quill.formatText(index, length, { 'background': false }), 2000);
    },

    applyAuditFix(resultIndex, index, length, fixText) {
        this.core.quill.deleteText(index, length);
        this.core.quill.insertText(index, fixText);
        this.currentAuditResults.splice(resultIndex, 1);
        this.renderAuditResults(this.currentAuditResults);
    },

    applyPaper(size) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        if (size === 'letter') { wrapper.style.width = '215.9mm'; wrapper.style.minHeight = '279.4mm'; }
        else { wrapper.style.width = '210mm'; wrapper.style.minHeight = '297mm'; }
    },

    applyOrientation(mode) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        if (mode === 'landscape') { wrapper.style.width = '297mm'; wrapper.style.minHeight = '210mm'; }
        else { wrapper.style.width = '210mm'; wrapper.style.minHeight = '297mm'; }
    },

    applyZoom(val) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        wrapper.style.transform = `scale(${val})`;
        wrapper.style.transformOrigin = 'top center';
    },

    updateMargins() {
        const mInput = document.getElementById('margin-val');
        if (!mInput) return;
        const m = mInput.value;
        const editor = document.querySelector('.ql-editor');
        if (editor) {
            editor.style.setProperty('padding-left', `${m}mm`, 'important');
            editor.style.setProperty('padding-right', `${m}mm`, 'important');
        }
    },

    showLoader(text, callback) {
        const loader = document.getElementById('loader-overlay');
        const loaderText = document.getElementById('loader-text');
        if (loaderText) loaderText.innerText = text;
        if (loader) loader.style.display = 'flex';
        
        setTimeout(() => {
            if (callback) callback();
            if (loader) loader.style.display = 'none';
        }, 800);
    },

    customAlert(text) {
        this.dialogs.customAlert(text);
    },

    customConfirm(text, okLabel, cancelLabel, callback) {
        this.dialogs.customConfirm(text, okLabel, cancelLabel, callback);
    },

    customPrompt(title, defaultValue, callback) {
        this.dialogs.customPrompt(title, defaultValue, callback);
    },

    showFeeCalc() {
        this.dialogs.showFeeCalc();
    },

    showTariffCalc() {
        this.dialogs.showTariffCalc();
    },

    showInterestCalc() {
        this.dialogs.showInterestCalc();
    },

    async loadQATSettings() {
        const settings = await this.core.storage.get('settings', 'qat-settings') || {};
        const defaults = { 'qat-save': true, 'qat-undo': true, 'qat-redo': true, 'qat-print': false, 'qat-new': false };
        const finalSettings = { ...defaults, ...settings };
        
        for (const [id, visible] of Object.entries(finalSettings)) {
            const btn = document.getElementById(id);
            const check = document.getElementById(`check-${id}`);
            if (btn) btn.style.display = visible ? 'flex' : 'none';
            if (check) check.innerText = visible ? '✓' : '';
        }
    },

    async loadCustomQATItems() {
        this.pinnedQATItems = await this.core.storage.get('settings', 'qat-custom-pinned') || [];
        this.renderCustomQATItems();
    },

    renderCustomQATItems() {
        const qatContainer = document.querySelector('.quick-access');
        if (!qatContainer) return;

        // Remove any previously rendered custom buttons
        const customBtns = qatContainer.querySelectorAll('.qa-btn-custom');
        customBtns.forEach(btn => btn.remove());

        // Find the 'Customize' dropdown button
        const customizeBtn = Array.from(qatContainer.querySelectorAll('.qa-btn')).find(btn => btn.innerText.includes('▾'));

        // Insert pinned items before the customize button
        this.pinnedQATItems.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'qa-btn qa-btn-custom';
            btn.setAttribute('onclick', item.action);
            btn.setAttribute('title', item.title);
            btn.innerText = item.icon;
            
            if (customizeBtn) {
                qatContainer.insertBefore(btn, customizeBtn);
            } else {
                qatContainer.appendChild(btn);
            }
        });
    },

    async executeQATPinAction() {
        if (!this.tempQATPinData) return;
        
        if (this.tempQATPinData.isHardcoded) {
            // It's a default/hardcoded button, toggle it
            await this.toggleQATItem(this.tempQATPinData.id);
        } else {
            // It's a custom button, add/remove it from pinned items
            const { action, icon, title, isPinned } = this.tempQATPinData;
            if (isPinned) {
                this.pinnedQATItems = this.pinnedQATItems.filter(item => item.action !== action);
            } else {
                this.pinnedQATItems.push({ action, icon, title });
            }
            await this.core.storage.set('settings', { key: 'qat-custom-pinned', value: this.pinnedQATItems });
            this.renderCustomQATItems();
        }

        // Hide pin menu
        const menu = document.getElementById('qat-pin-menu');
        if (menu) menu.style.display = 'none';
        this.tempQATPinData = null;
    },

    updateDocTitleDOM() {
        const titleEl = document.getElementById('window-doc-title');
        if (titleEl) {
            titleEl.innerText = this.currentDocumentTitle || "Nepojmenovaný dokument";
        }
    },

    async showQATMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        const menu = document.getElementById('qat-custom-menu');
        if (!menu) return;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY + 10}px`;
    },

    async toggleQATItem(id) {
        const btn = document.getElementById(id);
        const check = document.getElementById(`check-${id}`);
        if (!btn) return;
        
        const isHidden = btn.style.display === 'none';
        btn.style.display = isHidden ? 'flex' : 'none';
        if (check) check.innerText = isHidden ? '✓' : '';
        
        const settings = await this.core.storage.get('settings', 'qat-settings') || {};
        settings[id] = isHidden;
        await this.core.storage.set('settings', { key: 'qat-settings', value: settings });
    },

    async activateLicense(key) {
        if (!key) return;
        
        const trimmedKey = key.trim().toUpperCase();
        const isEnterprise = trimmedKey.startsWith("LEXIS-ENT-") || trimmedKey.includes("EVOLIO") || trimmedKey.includes("PRO");
        
        const badge = document.getElementById('license-status-badge');
        const input = document.getElementById('license-key');
        
        if (isEnterprise) {
            if (badge) {
                badge.innerText = 'Enterprise';
                badge.style.background = '#10b981';
            }
            if (input) input.value = trimmedKey;
            
            await this.core.secureVault.save('license_key', trimmedKey);
            await this.core.secureVault.save('license_status', 'Enterprise');
            
            const verEl = document.getElementById('dynamic-ver');
            if (verEl) {
                const currentText = verEl.innerText;
                if (!currentText.includes('Enterprise')) {
                    verEl.innerText = `${currentText} Enterprise`;
                }
            }
            this.customAlert('🔑 <b>Licence aktivována!</b><br><br>Licence byla úspěšně ověřena. Režim <b>Enterprise</b> je nyní plně aktivní a všechny pokročilé funkce jsou k dispozici.');
            this.loadCustomClauses();
        } else {
            if (badge) {
                badge.innerText = 'Neplatný';
                badge.style.background = '#ef4444';
            }
            await this.core.secureVault.save('license_key', '');
            await this.core.secureVault.save('license_status', 'Neaktivní');
            this.customAlert('❌ <b>Neplatný licenční klíč</b><br><br>Zadaný licenční klíč nebyl rozpoznán. Zkontrolujte prosím správnost zadání.');
            this.loadCustomClauses();
        }
    },

    async loadLicense() {
        const key = await this.core.secureVault.get('license_key');
        const status = await this.core.secureVault.get('license_status') || 'Neaktivní';
        
        const badge = document.getElementById('license-status-badge');
        const input = document.getElementById('license-key');
        
        if (key && input) {
            input.value = key;
        }
        
        if (badge) {
            badge.innerText = status;
            if (status === 'Enterprise') {
                badge.style.background = '#10b981';
                const verEl = document.getElementById('dynamic-ver');
                if (verEl) {
                    const currentText = verEl.innerText;
                    if (!currentText.includes('Enterprise')) {
                        verEl.innerText = `${currentText} Enterprise`;
                    }
                }
            } else {
                badge.style.background = '#ef4444';
            }
        }
        this.loadCustomClauses();
    },

    async loadCustomClauses() {
        const container = document.getElementById('custom-clauses-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        const status = await this.core.secureVault.get('license_status') || 'Neaktivní';
        if (status !== 'Enterprise') {
            container.innerHTML = `
                <div style="font-size: 10px; color: #94a3b8; padding: 6px; text-align: center; border: 1px dashed #cbd5e1; border-radius: 6px; background: #f8fafc; font-weight: 500;">
                    🔒 Pouze v režimu Enterprise
                </div>
            `;
            return;
        }
        
        try {
            const list = await this.core.storage.getAll('clauses');
            if (!list || list.length === 0) {
                container.innerHTML = `
                    <div style="font-size: 10px; color: #94a3b8; padding: 6px; text-align: center; font-style: italic;">
                        Zatím žádné vlastní doložky
                    </div>
                `;
                return;
            }
            
            list.forEach(item => {
                const row = document.createElement('div');
                row.className = 'clause-item';
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.fontSize = '11px';
                row.style.padding = '8px 10px';
                row.onclick = () => {
                    const range = this.core.quill.getSelection(true);
                    this.core.quill.insertText(range.index, `\n\n${item.text}\n`);
                };
                
                row.innerHTML = `
                    <span style="font-weight: 600; color: #1e293b;">📁 ${item.name}</span>
                    <span style="color: #ef4444; font-size: 12px; cursor: pointer; padding: 0 4px; font-weight: bold;" onclick="event.stopPropagation(); window.lexisUI.deleteCustomClause('${item.id}')">✕</span>
                `;
                container.appendChild(row);
            });
        } catch (e) {
            console.error("Chyba při načítání doložek z IndexedDB:", e);
        }
    },

    async deleteCustomClause(id) {
        if (!confirm('Opravdu chcete smazat tuto vlastní doložku?')) return;
        await this.core.storage.delete('clauses', id);
        this.loadCustomClauses();
    },

    async saveSelectedAsClause() {
        const status = await this.core.secureVault.get('license_status') || 'Neaktivní';
        if (status !== 'Enterprise') {
            this.customAlert('🔒 <b>Vyžadována verze Enterprise</b><br><br>Tato funkce vyžaduje aktivní verzi Enterprise! Zadejte prosím licenční klíč v Nastavení.');
            this.switchTab('tab-settings');
            return;
        }

        const range = this.core.quill.getSelection();
        if (!range || range.length === 0) {
            this.customAlert('📝 <b>Žádný výběr</b><br><br>Vyberte prosím v editoru text, který chcete uložit jako doložku.');
            return;
        }
        
        const selectedText = this.core.quill.getText(range.index, range.length).trim();
        if (!selectedText) {
            this.customAlert('⚠️ <b>Prázdný výběr</b><br><br>Vybraný text je prázdný.');
            return;
        }

        const clauseName = prompt('Zadejte název pro novou vlastní doložku:');
        if (!clauseName || !clauseName.trim()) return;

        try {
            await this.core.storage.set('clauses', {
                id: Date.now().toString(),
                name: clauseName.trim(),
                text: selectedText,
                createdAt: new Date().toISOString()
            });
            
            this.customAlert(`✅ <b>Doložka uložena</b><br><br>Doložka "<b>${clauseName}</b>" byla úspěšně uložena do lokální databáze IndexedDB.`);
            this.loadCustomClauses();
        } catch (e) {
            console.error("Chyba při ukládání doložky:", e);
            this.customAlert("❌ <b>Chyba ukládání</b><br><br>Nepodařilo se uložit doložku do databáze IndexedDB.");
        }
    },

    triggerCloudSync() {
        const icon = document.getElementById('sync-icon');
        const text = document.getElementById('sync-text');
        const status = document.getElementById('sync-status');
        if (icon) icon.innerText = '💾';
        if (text) text.innerText = 'Uloženo lokálně';
        if (status) status.style.color = '#10b981';
        this.customAlert(
            '💾 <b>Data jsou uložena lokálně</b><br><br>'
            + 'LexisEditor ukládá dokumenty a databázi <b>šifrovaně přímo na tomto počítači</b> '
            + '(datová suverenita — nic neodchází do cloudu). '
            + 'Vzdálená cloudová synchronizace <b>zatím není aktivní</b>; '
            + 'o zálohy se postarej lokálně (Time Machine / kopie složky) nebo přes zálohu klíče.'
        );
    },

    async checkEnterpriseFeature(featureName, callback) {
        const status = await this.core.secureVault.get('license_status') || 'Neaktivní';
        if (status === 'Enterprise') {
            callback();
        } else {
            this.customAlert(`🔒 <b>Vyžadována verze Enterprise</b><br><br>Funkce "<b>${featureName}</b>" je dostupná pouze v režimu Enterprise! Přejděte prosím do záložky Nastavení a aktivujte licenční klíč.`);
            this.switchTab('tab-settings');
        }
    },

    async sendAIQuery() {
        const promptInput = document.getElementById('ai-prompt');
        const output = document.getElementById('ai-output');
        if (!promptInput || !output) return;
        
        const promptText = promptInput.value.trim();
        if (!promptText) return;
        
        promptInput.value = '';
        
        const status = await this.core.secureVault.get('license_status') || 'Neaktivní';
        if (status !== 'Enterprise') {
            if (typeof this.aiQueriesCount === 'undefined') this.aiQueriesCount = 0;
            if (this.aiQueriesCount >= 3) {
                const upgradePrompt = document.createElement('div');
                upgradePrompt.style = "padding:15px; border-radius:10px; background:#fff1f2; border:1px solid #fecdd3; color:#9f1239; font-size:12px; line-height:1.5; margin-bottom:10px;";
                upgradePrompt.innerHTML = `
                    <span style="font-size:16px; display:block; margin-bottom:5px;">⚠️ <b>AI limit vyčerpán!</b></span>
                    Bezplatná verze umožňuje pouze 3 AI dotazy na relaci. Aktivujte si <b>Enterprise licenci</b> v Nastavení pro neomezenou právní rešerši, hloubkové audity a šifrované ukládání.
                `;
                output.appendChild(upgradePrompt);
                output.scrollTop = output.scrollHeight;
                return;
            }
            this.aiQueriesCount++;
        }
        
        const userMsg = document.createElement('div');
        userMsg.style = "padding: 8px 12px; border-radius: 8px; background: #e2e8f0; margin-bottom: 10px; align-self: flex-end; max-width: 80%; margin-left: auto; font-size:12px;";
        userMsg.innerText = promptText;
        output.appendChild(userMsg);
        output.scrollTop = output.scrollHeight;
        
        const loadingMsg = document.createElement('div');
        loadingMsg.style = "padding: 8px 12px; border-radius: 8px; background: #f1f5f9; margin-bottom: 10px; font-size:12px; color:#64748b; min-width: 150px;";
        output.appendChild(loadingMsg);
        output.scrollTop = output.scrollHeight;
        
        const startTime = Date.now();
        const timerId = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const dots = '.'.repeat((elapsed % 3) + 1);
            loadingMsg.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 12px; height: 12px; border: 2px solid #cbd5e1; border-top: 2px solid #7c3aed; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite; flex-shrink: 0;"></span>
                        <span style="font-weight: 500;">AI přemýšlí${dots}</span>
                    </div>
                    <span style="font-size: 10px; color: #94a3b8; font-weight: 600; white-space: nowrap;">${elapsed} s</span>
                </div>
            `;
        }, 500);
        
        try {
            const systemPrompt = "Jsi špičkový a přesný právní asistent.";
            const response = await this.core.callAI(promptText, systemPrompt);
            clearInterval(timerId);
            
            // Format response (support simple markdown-like bold/italic and newlines)
            const formattedResponse = response
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            loadingMsg.innerHTML = `<div>${formattedResponse}</div>`;
            
            // Check if agent is 'spisovatel'
            const agentSelect = document.getElementById('lexislocal-agent');
            const agentId = agentSelect ? agentSelect.value : 'resersnik';
            
            if (agentId === 'spisovatel') {
                // Insert directly into the editor
                const range = this.core.quill.getSelection(true);
                const index = range ? range.index : this.core.quill.getLength();
                
                let htmlToInsert = response
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');
                
                if (!htmlToInsert.startsWith('<p>')) {
                    htmlToInsert = `<p>${htmlToInsert}</p>`;
                }
                
                this.core.safePasteHTML(index, htmlToInsert);
                
                // Add a small success notice to the chat message
                const notice = document.createElement('div');
                notice.style = "font-size: 10px; color: #16a34a; margin-top: 8px; font-weight: bold; display: flex; align-items: center; gap: 4px;";
                notice.innerHTML = `<span>✅ Automaticky vloženo do dokumentu</span>`;
                loadingMsg.appendChild(notice);
            } else {
                // Add button to insert manually
                const insertBtn = document.createElement('button');
                insertBtn.style = "margin-top: 8px; padding: 4px 8px; font-size: 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background 0.2s;";
                insertBtn.innerText = "📥 Vložit do dokumentu";
                insertBtn.onclick = () => {
                    const range = this.core.quill.getSelection(true);
                    const index = range ? range.index : this.core.quill.getLength();
                    let htmlToInsert = response
                        .replace(/\n\n/g, '</p><p>')
                        .replace(/\n/g, '<br>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>');
                    
                    if (!htmlToInsert.startsWith('<p>')) {
                        htmlToInsert = `<p>${htmlToInsert}</p>`;
                    }
                    this.core.safePasteHTML(index, htmlToInsert);
                    insertBtn.innerText = "✅ Vloženo";
                    insertBtn.disabled = true;
                    insertBtn.style.background = "#10b981";
                };
                loadingMsg.appendChild(insertBtn);
            }
            
            // Check if agent got a command to send email
            const lowercasePrompt = promptText.toLowerCase();
            const hasMailKeyword = lowercasePrompt.includes('mail') || lowercasePrompt.includes('pošt');
            const hasSendKeyword = lowercasePrompt.includes('pošli') || 
                                   lowercasePrompt.includes('odešli') || 
                                   lowercasePrompt.includes('odeslat') || 
                                   lowercasePrompt.includes('poslat') || 
                                   lowercasePrompt.includes('zašli') || 
                                   lowercasePrompt.includes('zaslat') || 
                                   lowercasePrompt.includes('send') ||
                                   lowercasePrompt.includes('emailuj') ||
                                   lowercasePrompt.includes('e-mailuj');
            
            if (hasMailKeyword && hasSendKeyword) {
                setTimeout(() => {
                    this.sendViaEmail();
                }, 1000);
            }
            
            if (status !== 'Enterprise') {
                const badge = document.createElement('div');
                badge.style = "font-size: 9px; color:#f43f5e; margin-top:5px; font-weight:bold;";
                badge.innerText = `Zbývající bezplatné dotazy: ${3 - this.aiQueriesCount}/3`;
                loadingMsg.appendChild(badge);
            }
        } catch (e) {
            clearInterval(timerId);
            loadingMsg.innerText = "Chyba při komunikaci s AI.";
        }
        output.scrollTop = output.scrollHeight;
    },

    async openLexisLink() {
        this.checkEnterpriseFeature("LexisLink Mobilní Propojení", async () => {
            if (!window.electronAPI || !window.electronAPI.startLexisLink) {
                this.customAlert("Funkce LexisLink je dostupná pouze v desktopové verzi aplikace.");
                return;
            }
            
            try {
                const res = await window.electronAPI.startLexisLink();
                if (res && res.success) {
                    this.customAlert(`📱 <b>LexisLink Remote je aktivní!</b><br><br>Server byl spuštěn na lokální IP adrese:<br><a href="${res.url}" target="_blank" style="color:var(--word-blue); font-weight:bold;">${res.url}</a><br><br>1. Otevřete tuto adresu ve vašem smartphonu (oba přístroje musí být na stejné Wi-Fi síti).<br>2. Můžete vzdáleně provádět AI rešerše nebo přes fotoaparát telefonu přímo skenovat papírové dokumenty do editoru!`);
                } else {
                    this.customAlert("Nepodařilo se spustit server LexisLink.");
                }
            } catch (e) {
                console.error(e);
                this.customAlert("Chyba při spouštění LexisLink serveru: " + e.message);
            }
        });
    },

    async openPdfViewer() {
        if (!window.electronAPI || !window.electronAPI.importPdf) {
            this.customAlert("Integrovaný PDF Prohlížeč je dostupný pouze v desktopové verzi aplikace.");
            return;
        }

        try {
            const res = await window.electronAPI.importPdf();
            if (res && res.success) {
                // Save the extracted text for import
                this.currentPdfText = res.text || '';
                
                // Set the PDF in the iframe
                const pdfFrame = document.getElementById('pdf-frame');
                
                if (pdfFrame) {
                    pdfFrame.src = `data:application/pdf;base64,${res.base64}`;
                    document.body.classList.add('pdf-active');
                    
                    // Automatically scan the opened PDF text for deadlines
                    this.scanTextForDeadlines(this.currentPdfText, 'pdf');
                    
                    // Show a nice toast alert
                    this.customAlert(`📋 <b>PDF dokument otevřen!</b><br><br>Váš PDF soubor byl načten do integrovaného prohlížeče vedle editoru. Text z něj můžete kdykoli přenést kliknutím na tlačítko <b>✨ Importovat text</b>.`);
                }
            } else if (res && res.error) {
                this.customAlert("Nepodařilo se otevřít PDF dokument: " + res.error);
            }
        } catch (e) {
            console.error(e);
            this.customAlert("Chyba při otevírání PDF: " + e.message);
        }
    },

    closePdfViewer() {
        const pdfFrame = document.getElementById('pdf-frame');
        
        document.body.classList.remove('pdf-active');
        if (pdfFrame) {
            pdfFrame.src = '';
        }
        this.currentPdfText = '';
    }

});
