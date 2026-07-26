// lexis-ui-1.js — část UI vytažená z lexis-ui.js (prototype-mixin, beze změny chování).
// Načítá se v index.html PO lexis-ui.js. Obsahuje: resetIdleTimer, sendLexisLocalHeartbeat, lockApp, updateLockTimeout, loadLockSettings, updateStats, switchTab, toggleAIDrawer, updateVersionDisplay, loadDynamicTemplates, saveDocument, printDocument, importDocument, importZfo, insertFootnote, insertLink, insertDate, insertSymbol, changeCase, showFindReplace, applyWatermark, readLawyerProfile, loadLetterheadProfile, insertLetterhead, resetHeaderFooterDOM, openStartDocument, formatLegal, toggleTrackChanges, updateTrackChangesUI, anonymize, executeAnonymization, makePlaceholder, insertClause, runFinalAudit
Object.assign(LexisUI.prototype, {

    resetIdleTimer() {
        this.hadActivitySinceLastHeartbeat = true;
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this.lockApp();
        }, this.lockTimeout);
    },

    async sendLexisLocalHeartbeat() {
        if (!this.hadActivitySinceLastHeartbeat) return;
        
        // Track the active session time locally regardless of connection status
        this.activeSessionTimeMs = (this.activeSessionTimeMs || 0) + 30000;
        
        try {
            const { baseUrl, headers } = this.getLexisLocalConnection();
            const title = this.currentDocumentTitle || "Nový dokument";

            await fetch(`${baseUrl}/api/activity/log`, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    documentName: title,
                    activeSeconds: 30,
                    actionType: 'edit'
                })
            });

            this.hadActivitySinceLastHeartbeat = false;
            this.lastHeartbeatTime = Date.now();
        } catch (e) {
            // Silently log and ignore to allow LexisEditor to run perfectly even without LexisLocal
            console.log("LexisLocal heartbeat transmission bypassed: ", e.message);
            // Reset activity state even if offline, so we wait for next activity
            this.hadActivitySinceLastHeartbeat = false;
            this.lastHeartbeatTime = Date.now();
        }
    },

    lockApp() {
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen && this.lockTimeout > 0) {
            lockScreen.style.display = 'flex';
        }
    },

    async updateLockTimeout(val) {
        this.lockTimeout = parseInt(val);
        await this.core.storage.set('settings', { key: 'lock-timeout', value: val });
        this.resetIdleTimer();
    },

    async loadLockSettings() {
        const saved = await this.core.storage.get('settings', 'lock-timeout');
        if (saved !== null && saved !== undefined) {
            this.lockTimeout = parseInt(saved);
            const select = document.getElementById('lock-timeout-select');
            if (select) select.value = saved;
        }
    },

    updateStats() {
        const text = this.core.getText().trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        const wordEl = document.getElementById('word-count');
        const charEl = document.getElementById('char-count');
        if (wordEl) wordEl.innerText = `Slova: ${words}`;
        if (charEl) charEl.innerText = `Znaky: ${chars}`;

        // Throttled scan for deadlines in editor and auto-saving state
        clearTimeout(this.deadlineScanTimer);
        this.deadlineScanTimer = setTimeout(() => {
            if (this.enableLiveDeadlineScan) {
                this.scanTextForDeadlines(text, 'editor');
            }
            this.saveActiveDocumentState();
            this.updateDocumentOutline();
        }, 1500);
    },

    switchTab(tabName) {
        if (!tabName) return;
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
            if (t.getAttribute('data-tab') === tabName || 
                (t.getAttribute('onclick') && t.getAttribute('onclick').includes(tabName)) ||
                t.id === `${tabName}-btn` ||
                t.id === tabName) {
                t.classList.add('active');
            }
        });
        document.querySelectorAll('.tool-groups-container').forEach(c => c.classList.remove('active'));

        const targetGroup = document.getElementById(tabName) || document.getElementById(`${tabName}-tools`);
        if (targetGroup) targetGroup.classList.add('active');
        
        this.currentTab = tabName;
    },

    toggleAIDrawer(forceOpen = null) {
        const drawer = document.getElementById('ai-drawer');
        const overlay = document.getElementById('ai-overlay');
        if (!drawer) return;
        this.isDrawerOpen = forceOpen !== null ? forceOpen : !this.isDrawerOpen;
        if (this.isDrawerOpen) {
            drawer.classList.add('open');
            if (overlay) overlay.classList.add('active');
        } else {
            drawer.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
        }
    },

    async updateVersionDisplay() {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            const ver = await window.electronAPI.getAppVersion();
            // Jeden zdroj pravdy = package.json (přes IPC get-version). Uložíme i do
            // instance a na <body data-app-version>, aby verzi mohla synchronně použít
            // i další místa (export bundle, nápověda, hlášení chyby) — bez natvrdo čísla.
            this.appVersion = ver;
            try { document.body.setAttribute('data-app-version', ver); } catch (e) {}
            const el = document.getElementById('dynamic-ver');
            if (el) el.innerText = ver;
            const elStart = document.getElementById('app-version-start');
            if (elStart) elStart.innerText = 'v' + ver;
        }
    },

    loadDynamicTemplates() {
        if (!window.electronAPI || !window.electronAPI.getTemplates) return;
        const grid = document.getElementById('templates-grid');
        if (!grid) return;
        
        try {
            window.electronAPI.getTemplates()
                .then(templates => {
                    const staticCards = Array.from(grid.children).slice(0, 3);
                    grid.innerHTML = '';
                    staticCards.forEach(c => grid.appendChild(c));

                    if (templates) {
                        for (const [key, tpl] of Object.entries(templates)) {
                            const card = document.createElement('div');
                            card.className = 'start-card';
                            card.onclick = () => window.openStartDocument(key);
                            card.innerHTML = `
                                <div class="card-icon">${tpl.icon || '📝'}</div>
                                <div class="card-title">${tpl.title}</div>
                                <div class="card-desc">${tpl.desc || 'Vlastní vzor'}</div>
                            `;
                            grid.appendChild(card);
                        }
                    }
                })
                .catch(err => {
                    console.error("Chyba při zpracování šablon:", err);
                });
        } catch (error) {
            console.error("Nepodařilo se inicializovat načítání šablon:", error);
        }
    },

    saveDocument() {
        const html = this.core.getContent();
        const text = this.core.getText();
        const title = text.substring(0, 30).trim() || "Nový dokument";
        
        if (window.electronAPI && window.electronAPI.saveFile) {
            window.electronAPI.saveFile({ title, html, text });
        } else {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title}.html`;
            a.click();
            this.customAlert("Dokument byl stažen do počítače.");
        }

        // Auto time-tracking prompt on manual save
        if (this.activeSessionTimeMs && this.activeSessionTimeMs >= 30000) {
            setTimeout(() => {
                this.showTimeTrackingDialog();
            }, 1000);
        }
    },

    printDocument() {
        window.print();
    },

    importDocument() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx,.txt,.html,.zfo';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.name.endsWith('.zfo')) {
                this.importZfo(file.path);
                return;
            }
            
            const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
            this.currentDocumentTitle = cleanTitle;
            this.updateDocTitleDOM();
            this.resetHeaderFooterDOM();
            
            // Hide start screen and show app container
            const startScreen = document.getElementById('start-screen');
            const appContainer = document.getElementById('app-container');
            if (startScreen && appContainer) {
                startScreen.style.display = 'none';
                appContainer.style.display = 'flex';
            }
            
            const reader = new FileReader();
            if (file.name.endsWith('.docx')) {
                reader.onload = (re) => {
                    mammoth.convertToHtml({ arrayBuffer: re.target.result })
                        .then(result => {
                            this.core.setContent(result.value);
                            this.setDocumentStatus('draft', true);
                            this.saveActiveDocumentState();
                        })
                        .catch(err => console.error(err));
                };
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = (re) => {
                    this.core.setContent(re.target.result);
                    this.setDocumentStatus('draft', true);
                    this.saveActiveDocumentState();
                };
                reader.readAsText(file);
            }
        };
        input.click();
    },

    async importZfo(filePath) {
        if (!window.electronAPI || !window.electronAPI.importZfo) {
            this.customAlert("ℹ️ <b>Dostupné pouze v desktopové verzi</b><br><br>Import ZFO souborů vyžaduje běžící aplikaci LexisEditor.");
            return;
        }

        try {
            const res = await window.electronAPI.importZfo(filePath);
            if (!res || !res.success) {
                if (res && res.error) {
                    this.customAlert(`❌ <b>Chyba importu</b><br><br>${res.error}`);
                }
                return;
            }

            // Hide start screen and show app container
            const startScreen = document.getElementById('start-screen');
            const appContainer = document.getElementById('app-container');
            if (startScreen && appContainer) {
                startScreen.style.display = 'none';
                appContainer.style.display = 'flex';
            }

            // Set document title to the Subject of the datová zpráva
            const cleanTitle = res.subject || "Datová zpráva";
            this.currentDocumentTitle = cleanTitle;
            this.updateDocTitleDOM();
            this.resetHeaderFooterDOM();

            // Set document ID
            this.currentDocumentId = 'doc_' + Date.now();

            // Build content HTML
            let html = `
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 25px; font-family: 'Inter', sans-serif;">
                    <div style="font-size: 14px; font-weight: 700; color: #1e3a8a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        📮 DATOVÁ ZPRÁVA (ISDS IMPORT)
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #475569; width: 120px;">Odesílatel:</td>
                            <td style="padding: 6px 0; color: #1e293b;"><b>${res.sender}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #475569;">ID schránky:</td>
                            <td style="padding: 6px 0; color: #1e293b; font-family: monospace;">${res.senderId}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #475569;">Předmět:</td>
                            <td style="padding: 6px 0; color: #1e293b;">${res.subject}</td>
                        </tr>
                    </table>
                </div>
                <h1 style="font-family: 'Times New Roman', serif; font-size: 18pt; text-align: center; margin-top: 20px; font-weight: bold;">${res.subject}</h1>
                <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
            `;

            if (res.attachments && res.attachments.length > 0) {
                html += `
                    <div style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 20px; font-family: 'Inter', sans-serif;">
                        <h4 style="font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 10px;">📎 Extrahované přílohy ze zprávy:</h4>
                        <ul style="padding-left: 20px; font-size: 12px; color: #2563eb;">
                `;
                res.attachments.forEach(att => {
                    html += `<li style="margin-bottom: 5px;"><b>${att.name}</b></li>`;
                });
                html += `
                        </ul>
                        <p style="font-size: 11px; color: #64748b; margin-top: 10px; font-style: italic;">💡 Textový obsah a přílohy PDF byly úspěšně naimportovány do paměti aplikace.</p>
                    </div>
                `;
            }

            this.core.setContent(html);
            this.setDocumentStatus('draft', true);
            this.saveActiveDocumentState();

            this.customAlert("<b>Import úspěšný</b><br><br>Datová zpráva .zfo byla úspěšně načtena a její název byl nastaven jako název dokumentu.");

        } catch (err) {
            console.error("ZFO Import error in frontend:", err);
            this.customAlert(`❌ <b>Chyba importu</b><br><br>${err.message}`);
        }
    },

    insertFootnote() {
        this.customPrompt("Text poznámky pod čarou:", "", (text) => {
            if (!text) return;
            this.core.insertFootnote(text);
        });
    },

    insertLink() {
        const range = this.core.quill.getSelection();
        if (range && range.length > 0) {
            this.customPrompt("Zadejte URL adresu:", "https://", (url) => {
                if (url) this.core.quill.format('link', url);
            });
        } else {
            this.customPrompt("Zadejte text odkazu:", "", (text) => {
                if (!text) return;
                this.customPrompt("Zadejte URL adresu:", "https://", (url) => {
                    if (url) {
                        const r = this.core.quill.getSelection(true);
                        this.core.quill.insertText(r.index, text, 'link', url);
                    }
                });
            });
        }
    },

    insertDate() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('cs-CZ');
        const range = this.core.quill.getSelection(true);
        this.core.quill.insertText(range.index, dateStr);
    },

    insertSymbol(sym) {
        const range = this.core.quill.getSelection(true);
        this.core.quill.insertText(range.index, sym);
    },

    changeCase(type) {
        const range = this.core.quill.getSelection();
        if (range && range.length > 0) {
            const text = this.core.quill.getText(range.index, range.length);
            const newText = type === 'upper' ? text.toUpperCase() : text.toLowerCase();
            this.core.quill.deleteText(range.index, range.length);
            this.core.quill.insertText(range.index, newText);
            this.core.quill.setSelection(range.index, range.length);
        }
    },

    showFindReplace() {
        // Skutečné Najít/Nahradit (modul lexis-find-replace.js): zvýraznění nálezů,
        // skok na další/předchozí, nahradit jeden/vše, rozlišení velikosti písmen a
        // hlavně BEZ ztráty formátování (přes Quill API, ne přes setText).
        if (window.LexisFindReplace && window.LexisFindReplace.open) {
            window.LexisFindReplace.open(this.core.quill);
            return;
        }
        // Bezpečný fallback (kdyby modul chyběl): nahrazení přes Quill API po
        // úsecích, aby se NEZAHODILO formátování dokumentu jako dřív se setText().
        this.customPrompt('Hledat text:', '', (find) => {
            if (!find) return;
            this.customPrompt(`Nahradit "${find}" za:`, '', (replace) => {
                if (replace === null) return;
                const q = this.core.quill;
                let count = 0, from = 0;
                while (true) {
                    const i = q.getText().indexOf(find, from);
                    if (i === -1) break;
                    const fmt = q.getFormat(i, find.length);
                    q.deleteText(i, find.length, 'user');
                    if (replace) q.insertText(i, replace, fmt, 'user');
                    from = i + (replace ? replace.length : 0);
                    count++;
                    if (count > 100000) break; // pojistka
                }
                this.customAlert(count ? `Nahrazeno: ${count}×` : 'Řetězec nebyl nalezen.');
            });
        });
    },

    applyWatermark() {
        this.checkEnterpriseFeature("Vodoznak na pozadí", () => {
            const wrapper = document.getElementById('editor-wrapper');
            let wmLayer = document.getElementById('watermark-layer');
            const select = document.getElementById('watermark-select');
            const colorInput = document.getElementById('watermark-color');
            const text = select ? select.value : 'NONE';
            const color = colorInput ? colorInput.value : '#e2e8f0';
            
            if (text === 'NONE') {
                if (wmLayer) wmLayer.remove();
                return;
            }
            
            if (!wmLayer) {
                wmLayer = document.createElement('div');
                wmLayer.id = 'watermark-layer';
                wmLayer.style = "position:absolute; top:0; left:0; width:100%; height:100%; z-index:0; pointer-events:none; display:flex; align-items:center; justify-content:center; overflow:hidden;";
                wrapper.insertBefore(wmLayer, wrapper.firstChild);
            }
            
            // data-atributy umožní exportu (PDF) přečíst a vykreslit vodoznak.
            wmLayer.setAttribute('data-watermark-type', 'text');
            wmLayer.setAttribute('data-watermark-text', text);
            wmLayer.innerHTML = `<div style="transform: rotate(-45deg); font-size: 150px; font-weight: 800; color: ${color}; opacity: 0.3; white-space: nowrap; user-select: none;">${window.escapeHTML(text)}</div>`;
        });
    },

    async readLawyerProfile() {
        const g = async (k) => (await this.core.storage.get('settings', k)) || '';
        const auto = await this.core.storage.get('settings', 'lawyer-letterhead-auto');
        return {
            title: await g('lawyer-title'),
            name: await g('lawyer-name'),
            firm: await g('lawyer-firm'),
            role: await g('lawyer-role'),
            license: await g('lawyer-license'),
            address: await g('lawyer-address'),
            ico: await g('lawyer-ico'),
            dic: await g('lawyer-dic'),
            tel: await g('lawyer-tel'),
            email: await g('lawyer-email'),
            web: await g('lawyer-web'),
            city: await g('lawyer-city'),
            isds: await g('lawyer-isds'),
            logo: await g('lawyer-logo'),
            signature: await g('lawyer-signature'),
            auto: auto !== false // výchozí = automaticky vkládat
        };
    },

    async loadLetterheadProfile() {
        try { this.letterheadProfile = await this.readLawyerProfile(); }
        catch (e) { this.letterheadProfile = null; }
    },

    async insertLetterhead() {
        await this.loadLetterheadProfile();
        const p = this.letterheadProfile;
        if (!window.LexisLetterhead || !window.LexisLetterhead.hasContent(p)) {
            this.showProfileModal();
            return;
        }
        const headerArea = document.getElementById('header-area');
        const footerArea = document.getElementById('footer-area');
        if (headerArea) headerArea.innerHTML = window.LexisLetterhead.buildHeaderHtml(p);
        if (footerArea) footerArea.innerHTML = window.LexisLetterhead.buildFooterHtml(p);
        this.saveActiveDocumentState && this.saveActiveDocumentState();
        this.customAlert('✅ Hlavička byla vložena do záhlaví dokumentu.');
    },

    resetHeaderFooterDOM() {
        const headerArea = document.getElementById('header-area');
        const footerArea = document.getElementById('footer-area');
        const p = this.letterheadProfile;
        const useLetterhead = p && p.auto !== false && window.LexisLetterhead && window.LexisLetterhead.hasContent(p);
        // Neutrální výchozí hlavička/patička (bez advokátní/Lexis příchutě) — obecný
        // profil si uživatel nastaví sám. Značka se bere z edice.
        const brand = (window.Edition && window.Edition.brandName) || 'LexisEditor';
        if (headerArea) {
            headerArea.innerHTML = useLetterhead
                ? window.LexisLetterhead.buildHeaderHtml(p)
                : `<div style="color:#94a3b8;">${brand}</div><div></div>`;
        }
        if (footerArea) {
            footerArea.innerHTML = useLetterhead
                ? window.LexisLetterhead.buildFooterHtml(p)
                : `<div></div><div style="text-align: right;">Strana 1 z 1</div>`;
        }
    },

    openStartDocument(type) {
        this.currentDocumentId = 'doc_' + Date.now();
        this.currentDocumentTitle = '';
        this.currentDocumentDeadline = null;
        this.currentDocumentCj = '';
        this.updateDeadlineBadge();
        this.resetHeaderFooterDOM();
        
        if (type === 'blank') {
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            this.currentDocumentTitle = 'Nepojmenovaný dokument';
            this.updateDocTitleDOM();
            this.core.setContent('<p><br></p>');
            this.setDocumentStatus('draft', true);
            this.saveActiveDocumentState();
        } else if (type === 'file') {
            this.importDocument();
            // Title and status will be updated inside importDocument after file is selected
        } else {
            this.showLoader("Načítání šablony...", async () => {
                document.getElementById('start-screen').style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                
                let title = "Šablona";
                if (type === 'zaloba') title = "Žaloba";
                else if (type === 'smlouva') title = "Smlouva";
                else if (type === 'odvolani') title = "Odvolání";
                else if (type === 'posudek') title = "Právní posudek";
                
                this.currentDocumentTitle = title;
                this.updateDocTitleDOM();
                
                if (window.electronAPI && window.electronAPI.getTemplateContent) {
                    const content = await window.electronAPI.getTemplateContent(type);
                    this.core.setContent(content);
                }
                this.setDocumentStatus('draft', true);
                this.saveActiveDocumentState();
            });
        }
    },

    formatLegal(type) {
        const range = this.core.quill.getSelection();
        if (!range) return;
        const formatName = type === 'article' ? 'article' : 'legal-section';
        const currentFormat = this.core.quill.getFormat(range);
        if (currentFormat[formatName]) {
            this.core.quill.formatLine(range.index, range.length, formatName, false);
        } else {
            this.core.quill.formatLine(range.index, range.length, 'article', false);
            this.core.quill.formatLine(range.index, range.length, 'legal-section', false);
            this.core.quill.formatLine(range.index, range.length, formatName, true);
        }
    },

    toggleTrackChanges() {
        this.core.isTrackChangesActive = !this.core.isTrackChangesActive;
        this.updateTrackChangesUI(this.core.isTrackChangesActive);
    },

    updateTrackChangesUI(isActive) {
        const btn = document.getElementById('btn-track-changes');
        if (btn) {
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'var(--word-blue)' : '';
            btn.style.color = isActive ? 'white' : '';
        }
    },

    async anonymize() {
        const text = this.core.getText();
        const patterns = {
            "Rodná čísla": /\d{6}\/\d{3,4}/g,
            "Data narození": /\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/g,
            "E-maily": /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
            "Telefony": /(\+420)?\s*\d{3}\s*\d{3}\s*\d{3}/g
        };

        let foundCount = 0;
        let results = [];
        let allMatches = [];

        for (const [name, regex] of Object.entries(patterns)) {
            const matches = text.match(regex);
            if (matches) {
                foundCount += matches.length;
                results.push(`${name}: ${matches.length}x`);
                matches.forEach(m => allMatches.push({ text: m, type: name }));
            }
        }

        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
        
        const modal = document.createElement('div');
        modal.style = "background:#fff;padding:30px;border-radius:16px;width:450px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);font-family:'Outfit',sans-serif;";
        
        const statsHtml = foundCount > 0 ? 
            `<div style="background:#f1f5f9; padding:15px; border-radius:8px; margin-bottom:20px;">
                <div style="font-weight:700; color:var(--word-blue); font-size:12px; margin-bottom:8px; text-transform:uppercase;">Nalezeno vzorcem:</div>
                <div style="font-size:13px; color:#475569;">${results.join(", ")}</div>
            </div>` : 
            `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px; border:1px dashed #e2e8f0; border-radius:8px; margin-bottom:20px;">
                Vzorce nenašly žádná data. Doporučujeme AI skenování pro detekci jmen.
            </div>`;

        modal.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
                <div style="font-size:32px;">🛡️</div>
                <div>
                    <div style="font-weight:800; font-size:18px; color:var(--word-blue);">Právní Anonymizátor</div>
                    <div style="font-size:12px; color:#64748b;">Zabezpečení dokumentu před sdílením</div>
                </div>
            </div>
            ${statsHtml}
            <div id="ai-anon-status" style="display:none; margin-bottom:20px; padding:15px; background:rgba(124,58,237,0.1); border-radius:8px; border:1px solid rgba(124,58,237,0.2);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="spinner-small"></div>
                    <div style="font-size:13px; color:#7c3aed; font-weight:600;">AI analyzuje jména a firmy...</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                <button id="anon-standard" style="padding:12px; background:var(--word-blue); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:13px;">Standardní (Regex)</button>
                <button id="anon-ai" style="padding:12px; background:linear-gradient(135deg, #7c3aed, #4f46e5); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:13px;">AI Skenování Jmen</button>
            </div>
            <div style="display:flex; justify-content:center;">
                <button id="anon-cancel" style="color:#64748b; background:none; border:none; cursor:pointer; font-size:13px; font-weight:500;">Zavřít bez změn</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('anon-cancel').onclick = () => document.body.removeChild(overlay);
        
        document.getElementById('anon-standard').onclick = () => {
            if (allMatches.length === 0) return this.customAlert("Nebylo co anonymizovat.");
            this.executeAnonymization(allMatches.map(m => m.text));
            document.body.removeChild(overlay);
        };

        document.getElementById('anon-ai').onclick = async () => {
            const status = document.getElementById('ai-anon-status');
            if (status) status.style.display = "block";
            const count = await this.core.anonymize('smart');
            document.body.removeChild(overlay);
            this.customAlert(`AI anonymizace dokončena. Začerněno ${count} entit.`);
        };
    },

    executeAnonymization(targets) {
        const uniqueTargets = [...new Set(targets)];
        uniqueTargets.forEach(target => {
            this.core.applyRedaction(target);
        });
        this.customAlert("Anonymizace proběhla úspěšně.");
    },

    makePlaceholder() {
        const range = this.core.quill.getSelection();
        if (range && range.length > 0) {
            const selectedText = this.core.quill.getText(range.index, range.length);
            const cleanName = selectedText.replace(/[\[\]]/g, '');
            this.core.quill.deleteText(range.index, range.length);
            this.core.quill.insertEmbed(range.index, 'placeholder', { name: cleanName, value: cleanName });
            if (typeof window.refreshPlaceholders === 'function') window.refreshPlaceholders();
        } else {
            this.customAlert("Nejdříve označte text.");
        }
    },

    insertClause(type) {
        const clauses = {
            'arbitration': "\n\nSmluvní strany se dohodly, že veškeré spory budou rozhodovány v rozhodčím řízení před Rozhodčím soudem při HK ČR a AK ČR.\n",
            'gdpr': "\n\nSmluvní strany berou na vědomí, že dochází ke zpracování osobních údajů v souladu s Nařízením GDPR.\n",
            'prorogation': "\n\nPro veškeré spory je místně příslušným soudem obecný soud zhotovitele.\n",
            'interest': "\n\nV případě prodlení s úhradou je dlužník povinen uhradit smluvní pokutu ve výši 0,05 % z dlužné částky za každý den prodlení.\n",
            'confidentiality': "\n\nSmluvní strany se zavazují zachovávat mlčenlivost o všech skutečnostech, které se dozvědí v souvislosti s touto smlouvou.\n"
        };
        const range = this.core.quill.getSelection(true);
        this.core.quill.insertText(range.index, clauses[type]);
    },

    runFinalAudit() {
        this.showLoader("Provádím hloubkovou analýzu dokumentu...", () => {
            let allResults = [];
            allResults = allResults.concat(this.checkHierarchy());
            allResults = allResults.concat(this.checkTerminology());
            
            const text = this.core.quill.getText();
            const typoTerms = [
                { reg: /směnka/gi, msg: 'Obsahuje slovo "směnka". Ověřte náležitosti dle zákona.' },
                { reg: /rozhodčí doložka/gi, msg: 'Obsahuje rozhodčí doložku. Doporučujeme doložku Lexis.' }
            ];
            typoTerms.forEach(item => {
                let match;
                while ((match = item.reg.exec(text)) !== null) {
                    allResults.push({ type: 'info', msg: item.msg, index: match.index, length: match[0].length });
                }
            });

            this.renderAuditResults(allResults);
            
            if (allResults.length > 0) {
                this.customAlert(`🔍 Finální audit dokončen. Nalezeno ${allResults.length} upozornění. Podrobnosti v levém panelu.`);
            } else {
                this.customAlert("✅ Finální audit: Dokument je v perfektním stavu.");
            }
        });
    }

});
