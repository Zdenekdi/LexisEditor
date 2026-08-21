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
                    grid.innerHTML = eIco('');
                    staticCards.forEach(c => grid.appendChild(c));

                    if (templates) {
                        for (const [key, tpl] of Object.entries(templates)) {
                            const card = document.createElement('div');
                            card.className = 'start-card';
                            card.onclick = () => window.openStartDocument(key);
                            card.innerHTML = eIco(`
                                <div class="card-icon">${tpl.icon || '📝'}</div>
                                <div class="card-title">${tpl.title}</div>
                                <div class="card-desc">${tpl.desc || 'Vlastní vzor'}</div>
                            `);
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
                reader.onload = async (re) => {
                    const arrayBuffer = re.target.result;
                    // .docx s vnořeným LexisEditor spec (uložené naším exportem) obnovíme
                    // BEZ ZTRÁTY struktury (nadpisy, tabulky, hlavička/patička, vodoznak)
                    // přes applyDocumentSpec. Cizí .docx z Wordu spec nemají → fallback níže.
                    try {
                        if (file.path && window.electronAPI && window.electronAPI.readDocxSpec && window.applyDocumentSpec) {
                            const sp = await window.electronAPI.readDocxSpec(file.path);
                            if (sp && sp.success && sp.hasSpec && sp.spec) {
                                window.applyDocumentSpec(sp.spec);
                                if (sp.spec.title) { this.currentDocumentTitle = sp.spec.title; this.updateDocTitleDOM(); }
                                this.setDocumentStatus(null, true);
                                await this.saveActiveDocumentState();
                                if (typeof this.updateDocumentOutline === 'function') this.updateDocumentOutline();
                                return;
                            }
                        }
                    } catch (e) { /* fallback na nativní/mammoth import níže */ }
                    // Word-parita: má-li dokument sledované změny / poznámky pod čarou,
                    // použij nativní OOXML import (mammoth by je zahodil). Ostatní
                    // dokumenty (tabulky, obrázky, seznamy) jdou přes mammoth.
                    if (window.electronAPI && window.electronAPI.importDocxNative) {
                        try {
                            const nat = await window.electronAPI.importDocxNative(arrayBuffer);
                            if (nat && nat.success && nat.hasTracked && nat.html) {
                                this.core.setContent(nat.html);
                                this.setDocumentStatus(null, true);
                                this.saveActiveDocumentState();
                                return;
                            }
                        } catch (e) { /* fallback na mammoth níže */ }
                    }
                    // styleMap zvyšší věrnost importu z Wordu: zachová nadpisy
                    // (české i anglické názvy stylů), podtržení a přeškrtnutí, které
                    // mammoth ve výchozím stavu zahazuje. Tučné/kurzíva/seznamy/tabulky
                    // řeší výchozí mapa (includeDefaultStyleMap).
                    mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, {
                        includeDefaultStyleMap: true,
                        styleMap: [
                            "u => u",
                            "strike => s",
                            "p[style-name='Nadpis 1'] => h1:fresh",
                            "p[style-name='Nadpis 2'] => h2:fresh",
                            "p[style-name='Nadpis 3'] => h3:fresh",
                            "p[style-name='Nadpis 4'] => h4:fresh",
                            "p[style-name='Nadpis'] => h1:fresh",
                            "p[style-name='Heading 1'] => h1:fresh",
                            "p[style-name='Heading 2'] => h2:fresh",
                            "p[style-name='Heading 3'] => h3:fresh",
                            "p[style-name='Heading 4'] => h4:fresh",
                            "p[style-name='Title'] => h1:fresh"
                        ]
                    })
                        .then(result => {
                            this.core.setContent(result.value);
                            this.setDocumentStatus(null, true);
                            this.saveActiveDocumentState();
                        })
                        .catch(err => console.error(err));
                };
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = (re) => {
                    this.core.setContent(re.target.result);
                    this.setDocumentStatus(null, true);
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
                    // res.error může nést text z nedůvěryhodné datové zprávy → escapovat.
                    const safe = window.escapeHTML ? window.escapeHTML(res.error) : String(res.error);
                    this.customAlert(`❌ <b>Chyba importu</b><br><br>${safe}`);
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
                <div style="background: #faf9f7; border: 1px solid #ddd6cb; border-radius: 8px; padding: 20px; margin-bottom: 25px; font-family: 'Inter', sans-serif;">
                    <div style="font-size: 14px; font-weight: 700; color: #8a5320; border-bottom: 2px solid #ddd6cb; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        📮 DATOVÁ ZPRÁVA (ISDS IMPORT)
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #5c574f; width: 120px;">Odesílatel:</td>
                            <td style="padding: 6px 0; color: #2b2926;"><b>${res.sender}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #5c574f;">ID schránky:</td>
                            <td style="padding: 6px 0; color: #2b2926; font-family: monospace;">${res.senderId}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #5c574f;">Předmět:</td>
                            <td style="padding: 6px 0; color: #2b2926;">${res.subject}</td>
                        </tr>
                    </table>
                </div>
                <h1 style="font-family: 'Times New Roman', serif; font-size: 18pt; text-align: center; margin-top: 20px; font-weight: bold;">${res.subject}</h1>
                <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
            `;

            if (res.attachments && res.attachments.length > 0) {
                html += `
                    <div style="margin-top: 30px; border-top: 1px dashed #ddd6cb; padding-top: 20px; font-family: 'Inter', sans-serif;">
                        <h4 style="font-size: 13px; font-weight: 700; color: #5c574f; margin-bottom: 10px;">📎 Extrahované přílohy ze zprávy:</h4>
                        <ul style="padding-left: 20px; font-size: 12px; color: #9a5b22;">
                `;
                res.attachments.forEach(att => {
                    html += `<li style="margin-bottom: 5px;"><b>${att.name}</b></li>`;
                });
                html += `
                        </ul>
                        <p style="font-size: 11px; color: #77716a; margin-top: 10px; font-style: italic;">💡 Textový obsah a přílohy PDF byly úspěšně naimportovány do paměti aplikace.</p>
                    </div>
                `;
            }

            this.core.setContent(html);
            this.setDocumentStatus(null, true);
            this.saveActiveDocumentState();

            this.customAlert("<b>Import úspěšný</b><br><br>Datová zpráva .zfo byla úspěšně načtena a její název byl nastaven jako název dokumentu.");

        } catch (err) {
            console.error("ZFO Import error in frontend:", err);
            const safe = window.escapeHTML ? window.escapeHTML(err.message) : String(err.message);
            this.customAlert(`❌ <b>Chyba importu</b><br><br>${safe}`);
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
            const color = colorInput ? colorInput.value : '#e0dbd3';
            
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
            
            // data-atributy umožní exportu (PDF/DOCX) přečíst a vykreslit vodoznak.
            wmLayer.setAttribute('data-watermark-type', 'text');
            wmLayer.setAttribute('data-watermark-text', text);
            wmLayer.setAttribute('data-watermark-color', color);
            wmLayer.innerHTML = eIco(`<div style="transform: rotate(-45deg); font-size: 150px; font-weight: 800; color: ${color}; opacity: 0.3; white-space: nowrap; user-select: none;">${window.escapeHTML(text)}</div>`);
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
        if (headerArea) headerArea.innerHTML = eIco(window.LexisLetterhead.buildHeaderHtml(p));
        if (footerArea) footerArea.innerHTML = eIco(window.LexisLetterhead.buildFooterHtml(p));
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
            headerArea.innerHTML = eIco(useLetterhead
                ? window.LexisLetterhead.buildHeaderHtml(p)
                : `<div style="color:#a09a92;">${brand}</div><div></div>`);
        }
        if (footerArea) {
            footerArea.innerHTML = eIco(useLetterhead
                ? window.LexisLetterhead.buildFooterHtml(p)
                : `<div></div><div style="text-align: right;">Strana 1 z 1</div>`);
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
            this.setDocumentStatus(null, true);
            this.saveActiveDocumentState();
        } else if (type === 'file') {
            this.importDocument();
            // Title and status will be updated inside importDocument after file is selected
        } else {
            this.showLoader("Načítání šablony...", async () => {
                document.getElementById('start-screen').style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                
                if (window.electronAPI && window.electronAPI.getTemplateContent) {
                    const tpl = await window.electronAPI.getTemplateContent(type);
                    const content = (tpl && typeof tpl === 'object') ? (tpl.content || '') : (tpl || '');
                    this.currentDocumentTitle = (tpl && tpl.title) ? tpl.title : "Šablona";
                    this.updateDocTitleDOM();
                    if (content) this.core.setContent(content);
                } else {
                    this.currentDocumentTitle = "Šablona";
                    this.updateDocTitleDOM();
                }
                this.setDocumentStatus(null, true);
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
        // Autor sledovaných změn = jméno z profilu advokáta (pro w:author v .docx).
        try {
            const prof = (typeof this.readLawyerProfile === 'function') ? this.readLawyerProfile() : null;
            if (prof && (prof.jmeno || prof.name)) this.core.trackAuthor = prof.jmeno || prof.name;
        } catch (e) { /* volitelné */ }
        this.updateTrackChangesUI(this.core.isTrackChangesActive);
    },

    // Přijmout/odmítnout sledované změny (redlining). Bez výběru „vše", jinak pod kurzorem.
    acceptChange() {
        if (this.core.acceptChangeAtCursor) this.core.acceptChangeAtCursor();
    },
    rejectChange() {
        if (this.core.rejectChangeAtCursor) this.core.rejectChangeAtCursor();
    },
    acceptAllChanges() {
        if (this.core.acceptAllChanges) this.core.acceptAllChanges();
    },
    rejectAllChanges() {
        if (this.core.rejectAllChanges) this.core.rejectAllChanges();
    },

    // Komentář k výběru (Word-parita: exportuje se do word/comments.xml).
    insertComment() {
        const range = this.core.quill.getSelection();
        if (!range || range.length === 0) {
            this.customAlert('Nejdřív označ text, ke kterému chceš přidat komentář.');
            return;
        }
        const text = prompt('Komentář:');
        if (text === null) return;
        this.core.insertComment(text);
    },

    // Recenzní panel: seznam změn a komentářů s autorem/časem, barvami dle autora
    // a tlačítky přijmout/odmítnout (obdoba podokna revizí ve Wordu).
    openReviewPanel() { this.renderReviewPanel(); },
    renderReviewPanel() {
        let panel = document.getElementById('lexis-review-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'lexis-review-panel';
            panel.style.cssText = 'position:fixed;top:70px;right:16px;width:320px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #d9d3c8;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.15);z-index:9999;font-family:Inter,sans-serif;font-size:13px;color:#2b2926;';
            document.body.appendChild(panel);
        }
        const items = this.core.listReviewItems ? this.core.listReviewItems() : [];
        const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const kindLabel = { ins: 'Vloženo', del: 'Smazáno', comment: 'Komentář' };
        let html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;">Revize a komentáře (' + items.length + ')<span style="cursor:pointer;opacity:.6;" onclick="document.getElementById(\'lexis-review-panel\').remove()">✕</span></div>';
        if (!items.length) html += '<div style="padding:16px;opacity:.6;">Žádné změny ani komentáře.</div>';
        items.forEach((it, i) => {
            const col = this.core.authorColor ? this.core.authorColor(it.author) : '#666';
            const snippet = esc((it.kind === 'comment' ? it.commentText : it.text) || '').slice(0, 140);
            const ctx = it.kind === 'comment' ? ('„' + esc(it.text).slice(0, 60) + '“') : '';
            html += '<div style="padding:10px 12px;border-bottom:1px solid #f0ede7;">'
                + '<div style="display:flex;gap:6px;align-items:center;"><span style="width:9px;height:9px;border-radius:50%;background:' + col + ';display:inline-block;"></span>'
                + '<b>' + esc(it.author) + '</b> <span style="opacity:.5;">' + esc((it.date || '').split('T')[0]) + '</span>'
                + '<span style="margin-left:auto;font-size:11px;opacity:.6;">' + kindLabel[it.kind] + '</span></div>'
                + '<div style="margin:6px 0;color:#333;">' + snippet + (ctx ? ' <span style="opacity:.55;">' + ctx + '</span>' : '') + '</div>'
                + '<div style="display:flex;gap:6px;">'
                + '<button data-i="' + i + '" class="lexis-rev-accept" style="font-size:11px;padding:3px 8px;border:1px solid #cbe3cb;background:#eefaee;border-radius:6px;cursor:pointer;">' + (it.kind === 'comment' ? 'Vyřešit' : 'Přijmout') + '</button>'
                + (it.kind === 'comment' ? '' : '<button data-i="' + i + '" class="lexis-rev-reject" style="font-size:11px;padding:3px 8px;border:1px solid #f0cccc;background:#fdeeee;border-radius:6px;cursor:pointer;">Odmítnout</button>')
                + '</div></div>';
        });
        panel.innerHTML = html;
        const self = this;
        panel.querySelectorAll('.lexis-rev-accept').forEach(b => b.onclick = () => { self.core.resolveReviewItem(items[+b.getAttribute('data-i')], 'accept'); self.renderReviewPanel(); });
        panel.querySelectorAll('.lexis-rev-reject').forEach(b => b.onclick = () => { self.core.resolveReviewItem(items[+b.getAttribute('data-i')], 'reject'); self.renderReviewPanel(); });
    },

    // Porovnat dokumenty (Word-parita „Compare"): vybraný soubor = STARŠÍ verze,
    // aktuální dokument = MOJE (novější). Rozdíly se zobrazí jako sledované změny.
    compareWithFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx,.txt';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            if (file.name.endsWith('.docx') && window.electronAPI && window.electronAPI.docxExtractText) {
                reader.onload = async (re) => {
                    const res = await window.electronAPI.docxExtractText(re.target.result);
                    if (!res || !res.success) {
                        this.customAlert('Nepodařilo se načíst dokument k porovnání: ' + (res && res.error || '')); return;
                    }
                    this._runCompare(res.text, file.name);
                };
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = (re) => this._runCompare(String(re.target.result || ''), file.name);
                reader.readAsText(file);
            }
        };
        input.click();
    },
    _runCompare(originalText, fileName) {
        if (typeof window.LexisCompare === 'undefined' || !window.LexisCompare.compareTexts) {
            this.customAlert('Modul porovnání (compare.js) není načten.'); return;
        }
        const revisedText = this.core.getText();
        const author = (this.core && this.core.trackAuthor) || 'Advokát';
        const html = window.LexisCompare.compareTexts(originalText, revisedText, { author: author, date: new Date().toISOString() });
        this.core.setContent(html);
        if (this.setDocumentStatus) this.setDocumentStatus(null, true);
        if (this.saveActiveDocumentState) this.saveActiveDocumentState();
        this.customAlert('📝 Porovnáno se souborem „' + fileName + '".<br><br>Rozdíly (vybraný soubor → aktuální dokument) jsou zobrazené jako <b>sledované změny</b>. Projdi je v recenzním panelu a přijmi/odmítni.');
    },

    // AI redline (Word-parita „Rewrite" + revize): AI přepíše OZNAČENÝ text a rozdíl
    // se vloží jako SLEDOVANÉ ZMĚNY (původní přeškrtnuté, návrh podtržený). Advokát je
    // přijme/odmítne v recenzním panelu; export je uloží jako w:ins/w:del. Volitelný
    // `instruction` upřesní záměr (zkrátit, formálněji, doplnit…).
    async reviseSelectionAsRedline(instruction) {
        const range = this.core.quill.getSelection();
        if (!range || range.length === 0) {
            this.customAlert('ℹ️ <b>Žádný výběr</b><br><br>Nejdřív označ text, který má AI přepsat jako <b>sledovanou změnu</b>.');
            return;
        }
        if (typeof window.LexisCompare === 'undefined' || !window.LexisCompare.compareTexts) {
            this.customAlert('Modul porovnání (compare.js) není načten — AI revizi nelze vytvořit.');
            return;
        }
        const original = this.core.quill.getText(range.index, range.length);
        if (!original || !original.trim()) {
            this.customAlert('Vybraný text je prázdný.');
            return;
        }
        const savedRange = { index: range.index, length: range.length };
        const instr = (instruction && String(instruction).trim())
            || 'Vylepši stylistiku, srozumitelnost a právní přesnost. Význam a odstavce zachovej.';
        const systemPrompt = 'Jsi špičkový český právní redaktor. Dostaneš úsek textu a pokyn k úpravě. '
            + 'Vrať POUZE upravené znění téhož úseku — bez uvozovek, bez úvodu, bez komentářů a bez vysvětlení. '
            + 'Zachovej členění na odstavce i smysl; měň jen to, co je pro splnění pokynu nutné.';
        const userPrompt = `Pokyn: ${instr}\n\nText k úpravě:\n${original}`;

        const busy = this._showRedlineBusy();
        let revised;
        try {
            revised = await this.core.callAI(userPrompt, systemPrompt);
        } catch (e) {
            this._hideRedlineBusy(busy);
            this.customAlert('AI se nepodařilo oslovit: ' + (e && e.message || e));
            return;
        }
        this._hideRedlineBusy(busy);

        revised = String(revised || '').trim()
            .replace(/^["„»“]+/, '').replace(/["“«»]+$/, '').trim(); // občas model obalí odpověď uvozovkami
        if (!revised) {
            this.customAlert('AI vrátila prázdnou odpověď — revize se nevkládá.');
            return;
        }

        const author = (this.core && this.core.trackAuthor) || 'Advokát';
        const ok = this.core.insertRedlineFromRevision(revised, { range: savedRange, author: 'AI · ' + author });
        if (!ok) {
            this.customAlert('Beze změny — AI navrhla prakticky stejné znění, revize se nevkládá.');
            return;
        }
        if (this.setDocumentStatus) this.setDocumentStatus(null, true);
        if (this.saveActiveDocumentState) this.saveActiveDocumentState();
        this.openReviewPanel();
        this.customAlert('📝 <b>AI revize vložena jako sledované změny.</b><br><br>Původní znění je přeškrtnuté, návrh AI podtržený. Projdi je v recenzním panelu a <b>přijmi/odmítni</b>. Export do Wordu je uloží jako <code>w:ins</code>/<code>w:del</code>.');
    },

    // AI anotace výběru: nechá agenta vygenerovat POZNÁMKU POD ČAROU (mode='footnote')
    // s právním pramenem, nebo REDAKČNÍ KOMENTÁŘ (mode='comment') k označené pasáži.
    // Staví na existující infrastruktuře (core.insertFootnote / core.insertComment →
    // export do footnotes.xml / comments.xml). Word-parita: „Vložit poznámku / komentář".
    async aiAnnotateSelection(mode) {
        mode = (mode === 'comment') ? 'comment' : 'footnote';
        const range = this.core.quill.getSelection();
        if (!range || range.length === 0) {
            this.customAlert('ℹ️ <b>Žádný výběr</b><br><br>Nejdřív označ tvrzení / pasáž, ke které má AI '
                + (mode === 'footnote' ? 'doplnit <b>poznámku pod čarou</b>.' : 'napsat <b>komentář</b>.'));
            return;
        }
        const selText = this.core.quill.getText(range.index, range.length);
        if (!selText || !selText.trim()) { this.customAlert('Vybraný text je prázdný.'); return; }
        const savedRange = { index: range.index, length: range.length };

        const systemPrompt = (mode === 'footnote')
            ? 'Jsi český právní expert. K zadanému tvrzení navrhni stručnou POZNÁMKU POD ČAROU s relevantním právním '
              + 'pramenem (např. § a zákon, případně judikatura NS/ÚS). Vrať POUZE text poznámky — bez uvozovek, '
              + 'bez úvodu, jedna až dvě věty. Pokud si pramenem nejsi jistý, napiš obecné „Srov." a oblast úpravy, nevymýšlej si čísla.'
            : 'Jsi zkušený český advokát-kontrolor. K zadané pasáži napiš stručný REDAKČNÍ KOMENTÁŘ (co ověřit, '
              + 'zpřesnit nebo jaké je riziko). Vrať POUZE text komentáře — bez uvozovek a bez úvodu, jedna až dvě věty.';
        const userPrompt = (mode === 'footnote' ? 'Tvrzení:\n' : 'Pasáž:\n') + selText;

        const busy = this._showRedlineBusy(mode === 'footnote' ? 'AI hledá pramen k poznámce…' : 'AI píše komentář…');
        let out;
        try {
            out = await this.core.callAI(userPrompt, systemPrompt);
        } catch (e) {
            this._hideRedlineBusy(busy);
            this.customAlert('AI se nepodařilo oslovit: ' + (e && e.message || e));
            return;
        }
        this._hideRedlineBusy(busy);

        out = String(out || '').trim().replace(/^["„»“]+/, '').replace(/["“«»]+$/, '').trim();
        if (!out) { this.customAlert('AI vrátila prázdnou odpověď.'); return; }

        if (mode === 'footnote') {
            // Referenci umísti ZA výběr (za dané tvrzení).
            this.core.quill.setSelection(savedRange.index + savedRange.length, 0, 'silent');
            if (typeof this.core.insertFootnote === 'function') this.core.insertFootnote(out);
        } else {
            this.core.quill.setSelection(savedRange.index, savedRange.length, 'silent');
            const ok = this.core.insertComment(out);
            if (!ok) { this.customAlert('Komentář se nepodařilo vložit (ztracený výběr).'); return; }
            this.openReviewPanel();
        }
        if (this.setDocumentStatus) this.setDocumentStatus(null, true);
        if (this.saveActiveDocumentState) this.saveActiveDocumentState();
        this.customAlert(mode === 'footnote'
            ? '📎 <b>AI poznámka pod čarou vložena.</b><br><br>Návrh zkontroluj — <b>ověř právní pramen</b> u zdroje. Export ji uloží do <code>footnotes.xml</code>.'
            : '💬 <b>AI komentář vložen.</b><br><br>Najdeš ho v recenzním panelu; export ho uloží do <code>comments.xml</code>.');
    },

    // Nemodální „AI přemýšlí" indikátor pro redline (aby uživatel věděl, že se něco děje).
    _showRedlineBusy(label) {
        let el = document.getElementById('lexis-redline-busy');
        if (!el) {
            el = document.createElement('div');
            el.id = 'lexis-redline-busy';
            el.style.cssText = 'position:fixed;top:70px;right:16px;z-index:10000;background:#fff;border:1px solid #d9d3c8;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.15);padding:10px 14px;font-family:Inter,sans-serif;font-size:13px;color:#2b2926;display:flex;align-items:center;gap:8px;';
            el.innerHTML = '<span style="width:12px;height:12px;border:2px solid #ddd6cb;border-top:2px solid var(--accent,#9a5b22);border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span><span class="lexis-redline-busy-label">AI připravuje revizi…</span>';
            document.body.appendChild(el);
        }
        const lbl = el.querySelector('.lexis-redline-busy-label');
        if (lbl) lbl.textContent = label || 'AI připravuje revizi…';
        el.style.display = 'flex';
        return el;
    },
    _hideRedlineBusy(el) {
        const node = el || document.getElementById('lexis-redline-busy');
        if (node && node.parentNode) node.parentNode.removeChild(node);
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
            `<div style="background:#edeae4; padding:15px; border-radius:8px; margin-bottom:20px;">
                <div style="font-weight:700; color:var(--word-blue); font-size:12px; margin-bottom:8px; text-transform:uppercase;">Nalezeno vzorcem:</div>
                <div style="font-size:13px; color:#5c574f;">${results.join(", ")}</div>
            </div>` : 
            `<div style="text-align:center; padding:20px; color:#a09a92; font-size:13px; border:1px dashed #e0dbd3; border-radius:8px; margin-bottom:20px;">
                Vzorce nenašly žádná data. Doporučujeme AI skenování pro detekci jmen.
            </div>`;

        modal.innerHTML = eIco(`
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
                <div style="font-size:32px;">🛡️</div>
                <div>
                    <div style="font-weight:800; font-size:18px; color:var(--word-blue);">Právní Anonymizátor</div>
                    <div style="font-size:12px; color:#77716a;">Zabezpečení dokumentu před sdílením</div>
                </div>
            </div>
            ${statsHtml}
            <div id="ai-anon-status" style="display:none; margin-bottom:20px; padding:15px; background:rgba(124,58,237,0.1); border-radius:8px; border:1px solid rgba(124,58,237,0.2);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="spinner-small"></div>
                    <div style="font-size:13px; color:var(--accent); font-weight:600;">AI analyzuje jména a firmy...</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                <button id="anon-standard" style="padding:12px; background:var(--word-blue); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:13px;">Standardní (Regex)</button>
                <button id="anon-ai" style="padding:12px; background:linear-gradient(135deg, var(--accent), var(--accent)); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:13px;">AI Skenování Jmen</button>
            </div>
            <div style="display:flex; justify-content:center;">
                <button id="anon-cancel" style="color:#77716a; background:none; border:none; cursor:pointer; font-size:13px; font-weight:500;">Zavřít bez změn</button>
            </div>
        `);
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
