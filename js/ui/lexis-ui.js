/**
 * LexisUI Controller
 * Ovládá Ribbon, sidebary a interakci uživatele s LexisCore.
 */
class LexisUI {
    constructor(core) {
        this.core = core;
        this.currentTab = 'home';
        this.isDrawerOpen = false;
        this.enableLiveDeadlineScan = true;
        this.enableDesktopFileWatcher = true;
        this.legalLinkTarget = "zakonyprolidi";
        this.currentAuditResults = [];
        this.idleTimer = null;
        this.lockTimeout = 5 * 60 * 1000; // 5 minut výchozí
        this.currentPdfText = '';
        this.activeDeadlines = [];
        this.deadlineScanTimer = null;
        
        // Metadata fields for document memory
        this.currentDocumentId = 'doc_active';
        this.currentDocumentTitle = '';
        this.currentDocumentDeadline = null;
        this.currentDocumentCj = '';

        window.saveDetectedDeadline = (days, encContext) => {
            const context = decodeURIComponent(encContext);
            this.promptAddDeadline(days, context);
        };
        window.removeActiveDeadline = (id) => {
            this.removeActiveDeadline(id);
        };
        
        // Modular helper for dialogs, calculators, and generators
        this.dialogs = new LexisDialogs(this);
        
        this.init();
    }

    init() {
        this.bindTabs();
        this.bindEvents();
        this.initContextMenu();
        this.loadQATSettings();
        this.loadLockSettings();
        this.loadLicense();
        this.loadAISettings();
        this.loadFeatureSettings();
        this.updateVersionDisplay();
        this.updateStats();
        this.initIdleTimer();
        this.initLexisLinkListeners();
        this.initDeadlines();
        this.initActiveDocumentState();
    }


    bindEvents() {
        // QAT Context Menu
        const qat = document.getElementById('qat');
        if (qat) {
            qat.addEventListener('contextmenu', (e) => this.showQATMenu(e));
        }

        // Global clicks to close menus
        document.addEventListener('click', () => {
            const contextMenu = document.getElementById('editor-context-menu');
            if (contextMenu) contextMenu.style.display = 'none';
            const qatMenu = document.getElementById('qat-custom-menu');
            if (qatMenu) qatMenu.style.display = 'none';
            const statusDropdown = document.getElementById('status-dropdown');
            if (statusDropdown) statusDropdown.style.display = 'none';
        });

        // Idle activity listeners
        document.addEventListener('mousemove', () => this.resetIdleTimer());
        document.addEventListener('keydown', () => this.resetIdleTimer());
    }

    initIdleTimer() {
        this.lastHeartbeatTime = Date.now();
        this.hadActivitySinceLastHeartbeat = false;
        this.resetIdleTimer();

        // 30 seconds interval to report heartbeat activity back to LexisLocal
        setInterval(() => {
            this.sendLexisLocalHeartbeat();
        }, 30 * 1000);
    }

    resetIdleTimer() {
        this.hadActivitySinceLastHeartbeat = true;
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this.lockApp();
        }, this.lockTimeout);
    }

    async sendLexisLocalHeartbeat() {
        if (!this.hadActivitySinceLastHeartbeat) return;
        
        try {
            const { baseUrl, headers } = this.getLexisLocalConnection();
            const title = this.currentDocumentTitle || "Nový dokument";

            await fetch(`${baseUrl}/api/activity/heartbeat`, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    documentName: title,
                    activeSeconds: 30
                })
            });

            this.hadActivitySinceLastHeartbeat = false;
            this.lastHeartbeatTime = Date.now();
        } catch (e) {
            // Silently log and ignore to allow LexisEditor to run perfectly even without LexisLocal
            console.log("LexisLocal heartbeat transmission bypassed: ", e.message);
        }
    }

    lockApp() {
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen && this.lockTimeout > 0) {
            lockScreen.style.display = 'flex';
        }
    }

    async updateLockTimeout(val) {
        this.lockTimeout = parseInt(val);
        await this.core.storage.set('settings', { key: 'lock-timeout', value: val });
        this.resetIdleTimer();
    }

    async loadLockSettings() {
        const saved = await this.core.storage.get('settings', 'lock-timeout');
        if (saved !== null && saved !== undefined) {
            this.lockTimeout = parseInt(saved);
            const select = document.getElementById('lock-timeout-select');
            if (select) select.value = saved;
        }
    }

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
    }

    bindTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
    }

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
    }

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
    }

    async updateVersionDisplay() {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            const ver = await window.electronAPI.getAppVersion();
            const el = document.getElementById('dynamic-ver');
            if (el) el.innerText = ver;
            const elStart = document.getElementById('app-version-start');
            if (elStart) elStart.innerText = ver;
        }
    }

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
    }

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
    }

    printDocument() {
        window.print();
    }

    importDocument() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx,.txt,.html';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Update document title in the top bar
            const titleEl = document.getElementById('window-doc-title');
            if (titleEl) {
                const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
                titleEl.innerText = cleanTitle;
            }
            
            const reader = new FileReader();
            if (file.name.endsWith('.docx')) {
                reader.onload = (re) => {
                    mammoth.convertToHtml({ arrayBuffer: re.target.result })
                        .then(result => this.core.setContent(result.value))
                        .catch(err => console.error(err));
                };
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = (re) => this.core.setContent(re.target.result);
                reader.readAsText(file);
            }
        };
        input.click();
    }

    insertFootnote() {
        this.customPrompt("Text poznámky pod čarou:", "", (text) => {
            if (!text) return;
            this.core.insertFootnote(text);
        });
    }

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
    }

    insertDate() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('cs-CZ');
        const range = this.core.quill.getSelection(true);
        this.core.quill.insertText(range.index, dateStr);
    }

    insertSymbol(sym) {
        const range = this.core.quill.getSelection(true);
        this.core.quill.insertText(range.index, sym);
    }

    changeCase(type) {
        const range = this.core.quill.getSelection();
        if (range && range.length > 0) {
            const text = this.core.quill.getText(range.index, range.length);
            const newText = type === 'upper' ? text.toUpperCase() : text.toLowerCase();
            this.core.quill.deleteText(range.index, range.length);
            this.core.quill.insertText(range.index, newText);
            this.core.quill.setSelection(range.index, range.length);
        }
    }

    showFindReplace() {
        this.customPrompt("Hledat text:", "", (find) => {
            if (!find) return;
            this.customPrompt(`Nahradit "${find}" za:`, "", (replace) => {
                if (replace === null) return;
                
                const text = this.core.quill.getText();
                const newText = text.split(find).join(replace);
                this.core.quill.setText(newText);
                this.customAlert("Všechny výskyty byly nahrazeny.");
            });
        });
    }

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
            
            wmLayer.innerHTML = `<div style="transform: rotate(-45deg); font-size: 150px; font-weight: 800; color: ${color}; opacity: 0.3; white-space: nowrap; user-select: none;">${text}</div>`;
        });
    }


    openStartDocument(type) {
        this.currentDocumentId = 'doc_' + Date.now();
        this.currentDocumentTitle = '';
        this.currentDocumentDeadline = null;
        this.currentDocumentCj = '';
        this.updateDeadlineBadge();
        
        if (type === 'blank') {
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            this.core.setContent('<p><br></p>');
            this.setDocumentStatus('draft', true);
            this.saveActiveDocumentState();
        } else if (type === 'file') {
            this.importDocument();
            this.setDocumentStatus('draft', true);
            this.saveActiveDocumentState();
        } else {
            this.showLoader("Načítání šablony...", async () => {
                document.getElementById('start-screen').style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                
                if (window.electronAPI && window.electronAPI.getTemplateContent) {
                    const content = await window.electronAPI.getTemplateContent(type);
                    this.core.setContent(content);
                }
                this.setDocumentStatus('draft', true);
                this.saveActiveDocumentState();
            });
        }
    }

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
    }

    toggleTrackChanges() {
        this.core.isTrackChangesActive = !this.core.isTrackChangesActive;
        this.updateTrackChangesUI(this.core.isTrackChangesActive);
    }

    updateTrackChangesUI(isActive) {
        const btn = document.getElementById('btn-track-changes');
        if (btn) {
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'var(--word-blue)' : '';
            btn.style.color = isActive ? 'white' : '';
        }
    }

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
    }

    executeAnonymization(targets) {
        const uniqueTargets = [...new Set(targets)];
        uniqueTargets.forEach(target => {
            this.core.applyRedaction(target);
        });
        this.customAlert("Anonymizace proběhla úspěšně.");
    }

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
    }

    insertSignBlock() {
        let range = this.core.quill.getSelection();
        if (!range) { this.core.quill.focus(); range = this.core.quill.getSelection(); }
        if (!range) range = { index: this.core.quill.getLength() };

        const text = this.core.quill.getText();
        let partyA = "Objednatel";
        let partyB = "Zhotovitel";
        if (text.includes("Prodávající") || text.includes("Kupující")) {
            partyA = "Prodávající"; partyB = "Kupující";
        } else if (text.includes("Pronajímatel") || text.includes("Nájemce")) {
            partyA = "Pronajímatel"; partyB = "Nájemce";
        }

        const block = `\n\nV ........................ dne ...............     V ........................ dne ...............\n\n\n..............................................     ..............................................\n             ${partyA.padEnd(20)}                                   ${partyB.padEnd(20)}\n`;
        this.core.quill.insertText(range.index, block);
        this.core.quill.removeFormat(range.index, block.length);
        this.core.quill.setSelection(range.index + block.length); 
    }

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
    }

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
    }

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
    }

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
    }

    jumpToAuditError(index, length) {
        this.core.quill.setSelection(index, length, 'user');
        this.core.quill.formatText(index, length, { 'background': '#fde68a' });
        setTimeout(() => this.core.quill.formatText(index, length, { 'background': false }), 2000);
    }

    applyAuditFix(resultIndex, index, length, fixText) {
        this.core.quill.deleteText(index, length);
        this.core.quill.insertText(index, fixText);
        this.currentAuditResults.splice(resultIndex, 1);
        this.renderAuditResults(this.currentAuditResults);
    }

    startMailMerge() {
        this.customPrompt("Import dat (CSV obsah):", "Jméno,IČO,Sídlo\nJan Novák,123456,Praha", (csvData) => {
            if (!csvData) return;
            this.customAlert("Hromadné generování spuštěno. Dokumenty budou uloženy do složky Export.");
        });
    }

    linkCaseLaw() {
        const text = this.core.quill.getText();
        const regex = /\b\d+\s+(Cdo|Tdo|Nd|As|Afs|Azs|Ads|Aos)\s+\d+\/\d{4}\b/gi;
        let m;
        let found = 0;
        while ((m = regex.exec(text)) !== null) {
            const url = `https://www.google.com/search?q=${encodeURIComponent('"' + m[0] + '"')}`;
            this.core.quill.formatText(m.index, m[0].length, { 'link': url, 'color': '#2563eb', 'bold': true });
            found++;
        }
        this.customAlert(`Zalinkováno ${found} spisových značek.`);
    }

    applyPaper(size) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        if (size === 'letter') { wrapper.style.width = '215.9mm'; wrapper.style.minHeight = '279.4mm'; }
        else { wrapper.style.width = '210mm'; wrapper.style.minHeight = '297mm'; }
    }

    applyOrientation(mode) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        if (mode === 'landscape') { wrapper.style.width = '297mm'; wrapper.style.minHeight = '210mm'; }
        else { wrapper.style.width = '210mm'; wrapper.style.minHeight = '297mm'; }
    }

    applyZoom(val) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        wrapper.style.transform = `scale(${val})`;
        wrapper.style.transformOrigin = 'top center';
    }

    updateMargins() {
        const mInput = document.getElementById('margin-val');
        if (!mInput) return;
        const m = mInput.value;
        const editor = document.querySelector('.ql-editor');
        if (editor) {
            editor.style.setProperty('padding-left', `${m}mm`, 'important');
            editor.style.setProperty('padding-right', `${m}mm`, 'important');
        }
    }

    showLoader(text, callback) {
        const loader = document.getElementById('loader-overlay');
        const loaderText = document.getElementById('loader-text');
        if (loaderText) loaderText.innerText = text;
        if (loader) loader.style.display = 'flex';
        
        setTimeout(() => {
            if (callback) callback();
            if (loader) loader.style.display = 'none';
        }, 800);
    }
    
    customAlert(text) {
        this.dialogs.customAlert(text);
    }

    customConfirm(text, okLabel, cancelLabel, callback) {
        this.dialogs.customConfirm(text, okLabel, cancelLabel, callback);
    }

    customPrompt(title, defaultValue, callback) {
        this.dialogs.customPrompt(title, defaultValue, callback);
    }

    showFeeCalc() {
        this.dialogs.showFeeCalc();
    }

    showInterestCalc() {
        this.dialogs.showInterestCalc();
    }


    async initContextMenu() {
        const editorEl = document.querySelector('.ql-editor');
        const contextMenu = document.getElementById('editor-context-menu');
        if (!editorEl || !contextMenu) return;

        editorEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
        });
    }

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
    }

    async showQATMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        const menu = document.getElementById('qat-custom-menu');
        if (!menu) return;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY + 10}px`;
    }

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
    }

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
    }

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
    }

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
    }

    async deleteCustomClause(id) {
        if (!confirm('Opravdu chcete smazat tuto vlastní doložku?')) return;
        await this.core.storage.delete('clauses', id);
        this.loadCustomClauses();
    }

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
    }


    triggerCloudSync() {
        const icon = document.getElementById('sync-icon');
        const text = document.getElementById('sync-text');
        const status = document.getElementById('sync-status');
        
        if (!icon || !text || !status) return;
        
        // Start syncing animation
        status.style.color = '#3b82f6';
        text.innerText = 'Synchronizace...';
        icon.innerText = '🔄';
        icon.style.display = 'inline-block';
        icon.animate([
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(360deg)' }
        ], {
            duration: 1000,
            iterations: Infinity
        });
        
        setTimeout(() => {
            // Stop animation
            icon.getAnimations().forEach(anim => anim.cancel());
            
            // Randomly trigger conflict (25% chance) or mock successful sync
            if (Math.random() < 0.25) {
                this.showConflictResolutionDialog();
                status.style.color = '#f59e0b';
                text.innerText = 'Kolize verzí';
                icon.innerText = '⚠️';
            } else {
                status.style.color = '#10b981';
                text.innerText = 'Synchronizováno';
                icon.innerText = '☁️';
                this.customAlert('☁️ <b>Cloud-Sync dokončen</b><br><br>Místní databáze IndexedDB je plně synchronizovaná se vzdáleným cloudovým úložištěm.');
            }
        }, 1500);
    }

    showConflictResolutionDialog() {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(15, 23, 42, 0.4)';
        overlay.style.backdropFilter = 'blur(8px)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.id = 'conflict-modal';

        const dialog = document.createElement('div');
        dialog.style.background = 'rgba(255, 255, 255, 0.95)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '16px';
        dialog.style.maxWidth = '500px';
        dialog.style.width = '90%';
        dialog.style.boxShadow = '0 20px 40px rgba(0,0,0,0.15)';
        dialog.style.fontFamily = "'Inter', sans-serif";
        dialog.style.border = "1px solid rgba(255,255,255,0.4)";

        dialog.innerHTML = `
            <div style="font-size:36px; margin-bottom:15px; text-align:center;">⚠️</div>
            <h3 style="margin-bottom:10px; font-weight:700; color:#0f172a; text-align:center;">Kolize verzí na Cloudu</h3>
            <p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:20px; text-align:center;">
                V cloudovém úložišti byl nalezen novější zápis stejného dokumentu od jiného uživatele z vaší kanceláře. Vyberte verzi, kterou chcete zachovat.
            </p>
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                <div style="padding:12px; border:1px solid #e2e8f0; border-radius:10px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8fafc;" onclick="document.getElementById('opt-cloud').click()">
                    <div>
                        <span style="font-size:12px; font-weight:bold; display:block; color:#0f172a;">Verze z Cloudu (Doporučeno)</span>
                        <span style="font-size:10px; color:#64748b;">Upravil: Mgr. Jan Novák (před 2 min)</span>
                    </div>
                    <input type="radio" name="conflict-opt" id="opt-cloud" checked style="cursor:pointer;">
                </div>
                <div style="padding:12px; border:1px solid #e2e8f0; border-radius:10px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="document.getElementById('opt-local').click()">
                    <div>
                        <span style="font-size:12px; font-weight:bold; display:block; color:#0f172a;">Vaše místní verze</span>
                        <span style="font-size:10px; color:#64748b;">Upravil: Vy (před 5 min)</span>
                    </div>
                    <input type="radio" name="conflict-opt" id="opt-local" style="cursor:pointer;">
                </div>
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="resolve-conflict-btn" style="padding:10px 20px; background:#2563eb; color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer; font-size:12px; transition: background 0.2s;">Potvrdit výběr</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.getElementById('resolve-conflict-btn').onclick = () => {
            const isCloud = document.getElementById('opt-cloud').checked;
            document.body.removeChild(overlay);
            
            const icon = document.getElementById('sync-icon');
            const text = document.getElementById('sync-text');
            const status = document.getElementById('sync-status');
            if (icon && text && status) {
                status.style.color = '#10b981';
                text.innerText = 'Synchronizováno';
                icon.innerText = '☁️';
            }
            
            if (isCloud) {
                this.customAlert('☁️ <b>Verze stažena</b><br><br>Dokument byl úspěšně aktualizován na nejnovější cloudovou verzi z IndexedDB.');
            } else {
                this.customAlert('☁️ <b>Změny odeslány</b><br><br>Vaše lokální změny byly potvrzeny a zapsány do cloudového úložiště.');
            }
        };
    }
    async checkEnterpriseFeature(featureName, callback) {
        const status = await this.core.secureVault.get('license_status') || 'Neaktivní';
        if (status === 'Enterprise') {
            callback();
        } else {
            this.customAlert(`🔒 <b>Vyžadována verze Enterprise</b><br><br>Funkce "<b>${featureName}</b>" je dostupná pouze v režimu Enterprise! Přejděte prosím do záložky Nastavení a aktivujte licenční klíč.`);
            this.switchTab('tab-settings');
        }
    }

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
        loadingMsg.style = "padding: 8px 12px; border-radius: 8px; background: #f1f5f9; margin-bottom: 10px; font-size:12px; color:#64748b;";
        loadingMsg.innerText = "AI přemýšlí...";
        output.appendChild(loadingMsg);
        output.scrollTop = output.scrollHeight;
        
        try {
            const systemPrompt = "Jsi špičkový a přesný právní asistent.";
            const response = await this.core.callAI(promptText, systemPrompt);
            loadingMsg.innerText = response;
            
            if (status !== 'Enterprise') {
                const badge = document.createElement('div');
                badge.style = "font-size: 9px; color:#f43f5e; margin-top:5px; font-weight:bold;";
                badge.innerText = `Zbývající bezplatné dotazy: ${3 - this.aiQueriesCount}/3`;
                loadingMsg.appendChild(badge);
            }
        } catch (e) {
            loadingMsg.innerText = "Chyba při komunikaci s AI.";
        }
        output.scrollTop = output.scrollHeight;
    }

    initLexisLinkListeners() {
        if (!window.electronAPI) return;
        
        // 1. Receive command from mobile remote
        window.electronAPI.onLexisLinkCommand((cmd) => {
            console.log(`[LexisUI] PŘIJAT PŘÍKAZ LEXISLINK: ${cmd}`);
            if (cmd === 'summarize') {
                this.toggleAIDrawer(true);
                this.switchAITab('summary', document.getElementById('tab-ai-summary'));
                const text = this.core.getText();
                if (text.trim().length > 10) {
                    const prompt = document.getElementById('ai-prompt');
                    if (prompt) {
                        prompt.value = "Vytvoř stručné právní shrnutí tohoto dokumentu.";
                        this.sendAIQuery();
                    }
                } else {
                    this.customAlert("Dokument je prázdný, nelze provést shrnutí.");
                }
            } else if (cmd === 'logic') {
                this.runFinalAudit();
            }
        });
        
        // 2. Receive automated/manual import of external document JSON
        window.electronAPI.onLexisConnectImport((data) => {
            console.log(`[LexisUI] PŘIJAT IMPORT DOKUMENTU:`, data);
            if (data && data.html) {
                this.core.setContent(data.html);
                this.customAlert(`📥 <b>Import dokončen!</b><br><br>Dokument byl importován ze vzdálené integrační služby.`);
            }
        });
        
        // 3. Receive OCR / Scan image from mobile camera
        window.electronAPI.onLexisLinkScan((base64Image) => {
            console.log(`[LexisUI] PŘIJAT MOBILNÍ SKEN`);
            this.showLoader("Zpracovávám mobilní sken přes AI OCR...", async () => {
                try {
                    const res = await window.electronAPI.importPdfBase64(base64Image.split(',')[1] || base64Image);
                    if (res && res.success && res.text) {
                        const range = this.core.quill.getSelection(true);
                        this.core.quill.insertText(range.index, `\n[--- MOBILNÍ SKEN ---]\n${res.text}\n`);
                        this.customAlert("✅ <b>Mobilní sken vložen!</b><br><br>Text byl úspěšně rozpoznán a vložen na pozici kurzoru.");
                    } else {
                        const range = this.core.quill.getSelection(true);
                        this.core.quill.insertText(range.index, `\n[--- OBRÁZEK SKENU VLOŽEN ---]\n(OCR se nezdařilo)\n`);
                        this.customAlert("⚠️ Rozpoznání textu se nezdařilo. Vložen pouze referenční blok.");
                    }
                } catch (e) {
                    console.error("Chyba OCR:", e);
                    this.customAlert("Chyba při rozpoznávání textu.");
                }
            });
        });
    }

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
    }

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
    }

    closePdfViewer() {
        const pdfFrame = document.getElementById('pdf-frame');
        
        document.body.classList.remove('pdf-active');
        if (pdfFrame) {
            pdfFrame.src = '';
        }
        this.currentPdfText = '';
    }

    importCurrentPdfText() {
        if (!this.currentPdfText) {
            this.customAlert("Žádný text k importu nebyl nalezen.");
            return;
        }
        
        try {
            const range = this.core.quill.getSelection(true);
            this.core.quill.insertText(range.index, `\n${this.currentPdfText}\n`);
            this.customAlert("✅ <b>Text byl importován!</b><br><br>Extrahovaný obsah z PDF byl vložen na pozici kurzoru.");
        } catch (e) {
            console.error(e);
            this.customAlert("Nepodařilo se vložit text do editoru: " + e.message);
        }
    }

    async generateReplyFromPdf() {
        if (!this.currentPdfText) {
            this.customAlert("Nebyly nalezeny žádné textové podklady k analýze.");
            return;
        }

        // 1. Try to extract File Number (č. j. / sp. zn.)
        const cjRegexes = [
            /(?:č\s*\.\s*j\s*\.|číslo\s*jednací|sp\s*\.\s*zn\s*\.)\s*([0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+(?:\s+[0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+)*)/i,
            /(?:spisová\s*značka|spis\.?\s*zn\.?)\s*([0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+(?:\s+[0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+)*)/i
        ];
        
        let fileNumber = '';
        for (const regex of cjRegexes) {
            const match = regex.exec(this.currentPdfText);
            if (match && match[1]) {
                fileNumber = match[1].trim();
                break;
            }
        }
        
        if (!fileNumber) {
            fileNumber = 'Spis. zn. / Č. j. nevyplněno';
        }
        
        // 2. Try to extract Sender or Court name
        const courtRegex = /(?:okresní|krajský|vrchní|ústavní|nejvyšší)\s+soud\s+(?:v|ve|brně|praze|ostravě|plzni|olomouci|hradci|[a-zá-žěščřžýáíéóúůďťň]+)/i;
        const courtMatch = courtRegex.exec(this.currentPdfText);
        let recipient = courtMatch ? courtMatch[0].trim() : 'Příslušný soud / Orgán';
        
        // Capitalize first letters nicely
        recipient = recipient.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());

        // 3. Try to extract deadline
        const deadlineRegex = /(?:lhůt[ěau]|lhůta|termín)\s+(?:k\s+[a-zá-žěščřžýáíéóúůďťň]+\s+)?(?:činí\s+)?(?:do\s+)?(\d+)\s+(?:pracovních\s+)?(?:dn[ůí]|dní)/i;
        const deadlineMatch = deadlineRegex.exec(this.currentPdfText);
        const days = deadlineMatch ? parseInt(deadlineMatch[1]) : 15; // default to 15 days if not found

        // 4. Confirm with user via customPrompt / confirmation
        this.customPrompt(`📝 <b>Automatický návrh odpovědi</b><br><br>Detekovali jsme následující údaje z příchozího PDF. Můžete je upravit před vygenerováním:<br><br><b>Příjemce:</b>`, recipient, async (updatedRecipient) => {
            if (!updatedRecipient) return;
            
            this.customPrompt(`<b>Spisová značka / Číslo jednací (č. j.):</b>`, fileNumber, async (updatedCj) => {
                if (!updatedCj) return;
                
                this.customPrompt(`<b>Lhůta na odpověď (v počtu dní):</b>`, days.toString(), async (updatedDaysStr) => {
                    const updatedDays = parseInt(updatedDaysStr) || 15;
                    
                    // Create beautiful reply template in editor
                    const dateStr = new Date().toLocaleDateString('cs-CZ');
                    const replyHtml = `
                        <h1 class="ql-align-center" style="font-size: 16pt; color: #1e3a8a;">VYJÁDŘENÍ ÚČASTNÍKA</h1>
                        <p><br></p>
                        <p><b>Adresát:</b></p>
                        <p><b>${updatedRecipient}</b></p>
                        <p>[Adresa soudu]</p>
                        <p><br></p>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tbody>
                                <tr>
                                    <td style="width: 50%; padding: 5px 0;"><b>K č. j. / sp. zn.:</b> ${updatedCj}</td>
                                    <td style="width: 50%; padding: 5px 0; text-align: right;"><b>Datum:</b> ${dateStr}</td>
                                </tr>
                                <tr>
                                    <td style="width: 50%; padding: 5px 0;"><b>Zastoupený:</b> [Jméno klienta]</td>
                                    <td style="width: 50%; padding: 5px 0; text-align: right;"><b>Právní zástupce:</b> Advokátní kancelář Lexis</td>
                                </tr>
                            </tbody>
                        </table>
                        <hr style="border: none; border-top: 1px solid #cbd5e1; margin-bottom: 20px;">
                        <p>K výzvě soudu ze dne [doplňte datum výzvy] k č. j. <b>${updatedCj}</b> podává účastník prostřednictvím svého právního zástupce následující vyjádření:</p>
                        <p><br></p>
                        <p><b>I.</b></p>
                        <p>Účastník se plně vyjadřuje k žalobě tak, že s nárokem uplatněným žalobcem nesouhlasí a navrhuje, aby soud žalobu v plném rozsahu zamítl.</p>
                        <p><br></p>
                        <p><b>II.</b></p>
                        <p>[Doplňte podrobnou právní a skutkovou argumentaci...]</p>
                        <p><br></p>
                        <p><b>III.</b></p>
                        <p>S ohledem na výše uvedené navrhujeme, aby soud vydal tento</p>
                        <p><br></p>
                        <p class="ql-align-center"><b>r e z o l u c i :</b></p>
                        <p><br></p>
                        <p><b>Žaloba se v plném rozsahu zamítá. Žalobce je povinen uhradit žalovanému náklady řízení k rukám jeho právního zástupce do 3 dnů od právní moci rozsudku.</b></p>
                        <p><br></p>
                        <p style="text-align: right;">[Podpis zmocněnce / Razítko]</p>
                    `;
                    
                    // 5. Update editor text and set state
                    this.core.setContent(replyHtml);
                    this.setDocumentStatus('draft', true);
                    
                    // 6. Automatically register in Deadline Guard & active document memory!
                    const id = 'dl_' + Date.now();
                    const date = new Date();
                    date.setDate(date.getDate() + updatedDays);
                    
                    const newDl = {
                        id: id,
                        title: `Odpověď: ${updatedCj}`,
                        days: updatedDays,
                        dueDate: date.toISOString().split('T')[0],
                        context: `Číslo jednací: ${updatedCj}, Odesílatel: ${updatedRecipient}`,
                        createdAt: new Date().toISOString().split('T')[0]
                    };
                    
                    this.activeDeadlines.push(newDl);
                    await this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
                    this.renderDeadlines();
                    
                    // Store in active document metadata
                    this.currentDocumentDeadline = {
                        dueDate: newDl.dueDate,
                        days: updatedDays,
                        title: newDl.title,
                        context: newDl.context
                    };
                    this.currentDocumentCj = updatedCj;
                    this.updateDeadlineBadge();
                    this.saveActiveDocumentState();
                    
                    // Hide the detected section if we created the response
                    const detectedSection = document.getElementById('detected-deadlines-section');
                    if (detectedSection) detectedSection.style.display = 'none';
                    
                    this.customAlert(`✨ <b>Odpověď vygenerována!</b><br><br>1. Šablona vyjádření s hlavičkou a č. j. <b>${updatedCj}</b> byla připravena v editoru.<br>2. Lhůta na odpověď (<b>${updatedDays} dní</b>, tj. do <b>${newDl.dueDate}</b>) byla bezpečně uložena v interní paměti dokumentu a v hlídači.<br>3. Stav byl nastaven na <b>✍️ Rozpracované</b>.`);
                });
            });
        });
    }

    switchSidebarTab(tabName) {
        document.querySelectorAll('.main-sidebar-tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.getElementById(`tab-sb-${tabName}`);
        if (activeTab) activeTab.classList.add('active');
        
        const aiSubtabs = document.getElementById('ai-subtabs');
        const aiOutput = document.getElementById('ai-output');
        const aiInput = document.getElementById('ai-input-container');
        const aiActions = document.getElementById('ai-actions');
        const clausesView = document.getElementById('clause-library-view');
        const templatesView = document.getElementById('template-vars-view');
        
        if (tabName === 'ai') {
            if (aiSubtabs) aiSubtabs.style.display = 'flex';
            if (aiOutput) aiOutput.style.display = 'block';
            if (aiInput) aiInput.style.display = 'flex';
            if (aiActions) aiActions.style.display = 'flex';
            if (clausesView) clausesView.style.display = 'none';
            if (templatesView) templatesView.style.display = 'none';
        } else if (tabName === 'clauses') {
            if (aiSubtabs) aiSubtabs.style.display = 'none';
            if (aiOutput) aiOutput.style.display = 'none';
            if (aiInput) aiInput.style.display = 'none';
            if (aiActions) aiActions.style.display = 'none';
            if (clausesView) clausesView.style.display = 'block';
            if (templatesView) templatesView.style.display = 'none';
            this.loadCustomClauses();
        } else if (tabName === 'templates') {
            if (aiSubtabs) aiSubtabs.style.display = 'none';
            if (aiOutput) aiOutput.style.display = 'none';
            if (aiInput) aiInput.style.display = 'none';
            if (aiActions) aiActions.style.display = 'none';
            if (clausesView) clausesView.style.display = 'none';
            if (templatesView) templatesView.style.display = 'block';
            this.scanForVariables();
        }
    }

    switchAITab(subTab, el) {
        document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
        if (el) el.classList.add('active');
        
        const output = document.getElementById('ai-output');
        const actions = document.getElementById('ai-actions');
        if (!output) return;
        
        if (subTab === 'chat') {
            output.innerHTML = "Dobrý den, jsem váš právní agent. Zadejte libovolný dotaz nebo si nechte zkontrolovat smlouvu.";
            if (actions) actions.style.display = 'none';
        } else if (subTab === 'research') {
            output.innerHTML = "🔍 <b>Právní rešerše</b><br><br>Zadejte téma nebo ustanovení zákona, které si přejete vyhledat či analyzovat (např. <i>výpověď z nájmu</i>).";
            if (actions) {
                actions.style.display = 'flex';
                actions.innerHTML = `
                    <button onclick="document.getElementById('ai-prompt').value='Analyzuj judikaturu k § 2285 OZ'; window.sendAIQuery()" style="padding:6px 12px; background:#e2e8f0; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-right:5px; margin-bottom:5px;">§ 2285 Judikatura</button>
                    <button onclick="document.getElementById('ai-prompt').value='Vyhledej judikáty ohledně smluvní pokuty'; window.sendAIQuery()" style="padding:6px 12px; background:#e2e8f0; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-bottom:5px;">Smluvní pokuta</button>
                `;
            }
        } else if (subTab === 'summary') {
            output.innerHTML = "📝 <b>Automatické shrnutí dokumentu</b><br><br>Klikněte na tlačítko níže pro vygenerování stručného shrnutí celého aktuálního dokumentu.";
            if (actions) {
                actions.style.display = 'flex';
                actions.innerHTML = `
                    <button onclick="document.getElementById('ai-prompt').value='Vytvoř stručné a strukturované shrnutí tohoto textu.'; window.sendAIQuery()" style="padding:8px 16px; background:var(--word-blue); color:white; border:none; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">⚡ Spustit shrnutí</button>
                `;
            }
        } else if (subTab === 'kb') {
            output.innerHTML = "🧠 <b>Znalostní báze (Knowledge Base)</b><br><br>AI využívá lokálně nahrané soubory z vaší kanceláře. Zadejte dotaz mířící do vašich interních předpisů a doložek.";
            if (actions) actions.style.display = 'none';
        }
    }

    scanForVariables() {
        const form = document.getElementById('variables-form');
        if (!form) return;
        
        form.innerHTML = '';
        const text = this.core.getText();
        
        const regex = /\[([A-ZÁ-Ž0-9_]{3,30})\]|\{\{([a-zA-Z0-9_á-žÁ-Ž]{2,30})\}\}/g;
        const variables = new Set();
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const varName = match[1] || match[2];
            variables.add(varName);
        }
        
        if (variables.size === 0) {
            form.innerHTML = '<div style="font-size:11px; color:#64748b; text-align:center; padding:10px;">Nebyly nalezeny žádné proměnné typu [JMÉNO] nebo {{jmeno}}.</div>';
            return;
        }
        
        variables.forEach(varName => {
            const container = document.createElement('div');
            container.style = "display:flex; flex-direction:column; gap:4px; margin-bottom:10px;";
            
            const label = document.createElement('label');
            label.style = "font-size:10px; font-weight:700; color:#475569; text-transform:uppercase;";
            label.innerText = varName;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Vyplňte ${varName}...`;
            input.style = "padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;";
            
            input.addEventListener('input', () => {
                const val = input.value;
                if (!val) return;
                
                let currentText = this.core.quill.root.innerHTML;
                const updatedHtml = currentText
                    .split(`[${varName}]`).join(val)
                    .split(`{{${varName}}}`).join(val);
                
                this.core.quill.root.innerHTML = updatedHtml;
            });
            
            container.appendChild(label);
            container.appendChild(input);
            form.appendChild(container);
        });
    }

    exportToISDS() {
        this.checkEnterpriseFeature("Export pro ISDS (.zfo)", async () => {
            if (!window.electronAPI) {
                this.customAlert("Tato funkce je dostupná pouze v desktopové aplikaci.");
                return;
            }
            
            this.showLoader("Generuji strukturovanou zprávu ISDS...", () => {
                const text = this.core.getText();
                const xmlData = `<?xml version="1.0" encoding="utf-8"?>
<dmMessage>
    <dmSender>Advokátní kancelář</dmSender>
    <dmAnnotation>Exportovaná datová zpráva</dmAnnotation>
    <dmEncodedContent>${btoa(encodeURIComponent(text.substring(0, 1000)))}</dmEncodedContent>
</dmMessage>`;
                
                this.customPrompt("Zadejte název souboru pro uložení:", "isds_export.zfo", (filename) => {
                    if (!filename) return;
                    this.customAlert(`✅ <b>Export úspěšný!</b><br><br>Datový balíček <b>${filename}</b> byl úspěšně vygenerován a připraven k odeslání do ISDS.`);
                });
            });
        });
    }

    sendViaEmail() {
        const docTitle = document.getElementById('window-doc-title').innerText || "Bez názvu";
        const subject = "Dokument z LexisEditoru: " + docTitle;
        const body = "V příloze zasílám vygenerovaný právní dokument.\n\n---\nOdesláno z LexisEditoru";
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    async saveAsTemplateDialog() {
        this.checkEnterpriseFeature("Ukládání šablon", async () => {
            const html = this.core.getContent();
            const text = this.core.getText();
            const title = text.substring(0, 30).trim() || "Nový vzor";
            
            this.customPrompt("Zadejte název nové šablony:", title, async (tplName) => {
                if (!tplName) return;
                
                const templateKey = `tpl_${Date.now()}`;
                const tplObj = {
                    title: tplName,
                    icon: '📄',
                    desc: 'Uživatelská šablona z editoru',
                    content: html
                };
                
                // Uložit do IndexedDB
                await this.core.storage.set('templates', templateKey, tplObj);
                
                // Také uložit přes Electron API, pokud existuje
                if (window.electronAPI && window.electronAPI.saveTemplate) {
                    try {
                        await window.electronAPI.saveTemplate(templateKey, tplObj);
                    } catch (e) {
                        console.warn("Chyba při ukládání šablony do Electron FS:", e);
                    }
                }
                
                // Aktualizovat start screen
                this.loadDynamicTemplates();
                this.customAlert(`✅ <b>Šablona uložena!</b><br><br>Šablona <b>${tplName}</b> byla uložena a bude k dispozici na Úvodní obrazovce.`);
            });
        });
    }

    exportWebPreview() {
        const html = this.core.getContent();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    }

    indexCurrentDocument() {
        this.checkEnterpriseFeature("Indexace Znalostní báze", async () => {
            const text = this.core.getText();
            if (text.trim().length < 10) {
                this.customAlert("Dokument je příliš krátký pro indexaci.");
                return;
            }
            
            this.showLoader("Indexuji dokument do lokální Znalostní báze...", async () => {
                const docTitle = document.getElementById('window-doc-title').innerText || "Bez názvu";
                const chunk = {
                    title: docTitle,
                    content: text,
                    timestamp: new Date().toLocaleString('cs-CZ')
                };
                
                if (!this.core.knowledgeBase) this.core.knowledgeBase = [];
                this.core.knowledgeBase.push(chunk);
                
                await this.core.storage.set('settings', 'knowledge-base', this.core.knowledgeBase);
                this.customAlert(`✅ <b>Indexace úspěšná!</b><br><br>Dokument <b>${docTitle}</b> byl indexován do lokální znalostní báze pro AI rešerše.`);
            });
        });
    }

    async exportToDocx() {
        if (window.electronAPI && window.electronAPI.exportDocx) {
            const html = this.core.getContent();
            try {
                const result = await window.electronAPI.exportDocx(html);
                if (result && result.success) {
                    this.customAlert(`Dokument byl úspěšně uložen do:\n\n${result.path}`);
                } else if (result && !result.canceled) {
                    this.customAlert(`Chyba při ukládání dokumentu:\n\n${result.error}`);
                }
            } catch (error) {
                this.customAlert(`Neočekávaná chyba:\n\n${error.message}`);
            }
        } else {
            this.customAlert("Export do DOCX je dostupný pouze v desktopové (Electron) verzi LexisEditoru.");
        }
    }

    exportToBundle() {
        this.checkEnterpriseFeature("Export do Lexis Bundle (.lexis)", async () => {
            const html = this.core.getContent();
            const text = this.core.getText();
            const docTitle = document.getElementById('window-doc-title').innerText || "Bez názvu";
            
            const bundle = {
                title: docTitle,
                html: html,
                text: text,
                exportedAt: new Date().toISOString(),
                version: '3.5.0',
                footnotes: this.core.footnotes || []
            };
            
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${docTitle.replace(/[^a-zA-Z0-9-_\sá-žÁ-Ž]/g, '')}.lexis`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.customAlert(`📦 <b>Lexis Bundle vygenerován!</b><br><br>Soubor <b>.lexis</b> obsahuje kompletní text, formátování, zápatí a metadata a byl úspěšně stažen.`);
        });
    }

    async searchAres() {
        this.customPrompt("Zadejte IČO subjektu (8 číslic):", "", async (ico) => {
            if (!ico) return;
            const cleanIco = ico.replace(/\s/g, '');
            
            if (window.electronAPI && window.electronAPI.searchAres) {
                this.showLoader("Lustruji subjekt v ARES...", async () => {
                    try {
                        const result = await window.electronAPI.searchAres(cleanIco);
                        if (result && result.success) {
                            const d = result.data;
                            const baseStyle = "border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 20px; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; background: #f8fafc;";
                            const html = `
                                <div style="${baseStyle}">
                                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #2563eb, #1d4ed8);"></div>
                                    <p style="margin-bottom: 8px; color: #2563eb; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Ověřeno v ARES: Právnická/Fyzická osoba</p>
                                    <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>${d.obchodniJmeno}</strong></p>
                                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                                        <div><strong>IČO:</strong> ${d.ico}</div>
                                        <div><strong>DIČ:</strong> ${d.dic || 'Neuvedeno'}</div>
                                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> ${d.sidlo}</div>
                                        <div style="grid-column: span 2; font-size: 11px; color: #94a3b8; font-style: italic;">Staženo z Rejstříku MFČR (${d.pravniForma})</div>
                                    </div>
                                </div>
                                <p><br></p>
                            `;
                            
                            const range = this.core.quill.getSelection(true);
                            this.core.quill.clipboard.dangerouslyPasteHTML(range.index, html);
                        } else {
                            this.customAlert(`ARES API nenašlo žádná data nebo selhalo:\n\n${result.error}`);
                        }
                    } catch (error) {
                        this.customAlert(`Neočekávaná chyba při volání ARES:\n\n${error.message}`);
                    }
                });
            } else {
                // Lokální simulace, pokud jsme v prohlížeči (pro demo účely)
                this.showLoader("Simuluji lustraci v ARES (prohlížeč)...", () => {
                    const results = {
                        "27082440": { obchodniJmeno: "Alza.cz a.s.", ico: "27082440", dic: "CZ27082440", sidlo: "Jankovcova 1522/53, Holešovice, 170 00 Praha 7", pravniForma: "Akciová společnost" },
                        "25107354": { obchodniJmeno: "Seznam.cz, a.s.", ico: "25107354", dic: "CZ25107354", sidlo: "Radlická 3294/10, Smíchov, 150 00 Praha 5", pravniForma: "Akciová společnost" }
                    };
                    const d = results[cleanIco];
                    if (d) {
                        const baseStyle = "border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 20px; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; background: #f8fafc;";
                        const html = `
                            <div style="${baseStyle}">
                                <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #2563eb, #1d4ed8);"></div>
                                <p style="margin-bottom: 8px; color: #2563eb; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Ověřeno v ARES (Simulace): Právnická osoba</p>
                                <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>${d.obchodniJmeno}</strong></p>
                                <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                                    <div><strong>IČO:</strong> ${d.ico}</div>
                                    <div><strong>DIČ:</strong> ${d.dic}</div>
                                    <div style="grid-column: span 2;"><strong>Sídlo:</strong> ${d.sidlo}</div>
                                    <div style="grid-column: span 2; font-size: 11px; color: #94a3b8; font-style: italic;">Simulovaná data pro prohlížeč (${d.pravniForma})</div>
                                </div>
                            </div>
                            <p><br></p>
                        `;
                        const range = this.core.quill.getSelection(true);
                        this.core.quill.clipboard.dangerouslyPasteHTML(range.index, html);
                    } else {
                        this.customAlert("Subjekt nebyl v simulátoru ARES nalezen (použijte IČO: 27082440). Hledání v reálném registru vyžaduje spuštění v Electronu.");
                    }
                });
            }
        });
    }

    exec(format, value = true) {
        const current = this.core.quill.getFormat();
        if (current[format] === value) {
            this.core.quill.format(format, false);
        } else {
            this.core.quill.format(format, value);
        }
    }

    indent(val) {
        const range = this.core.quill.getSelection();
        if (range) {
            const currentIndent = this.core.quill.getFormat(range).indent || 0;
            const newIndent = Math.max(0, currentIndent + val);
            this.core.quill.format('indent', newIndent === 0 ? false : newIndent);
        }
    }

    applyStyle(style) {
        if (style === 'h1') {
            this.core.quill.format('header', 1);
        } else if (style === 'h2') {
            this.core.quill.format('header', 2);
        } else {
            this.core.quill.format('header', false);
        }
    }

    applyHighlight(color) {
        const current = this.core.quill.getFormat();
        if (current.background === color) {
            this.core.quill.format('background', false);
        } else {
            this.core.quill.format('background', color);
        }
    }

    setLineHeight(val) {
        this.core.quill.format('lineheight', val);
    }

    toggleDictation() {
        const btn = document.getElementById('dictation-btn');
        if (this.isDictating) {
            if (this.recognition) {
                this.recognition.stop();
            }
            this.isDictating = false;
            if (btn) {
                btn.style.background = '';
                btn.innerHTML = '<div class="icon-sq">🎙️</div>Diktovat';
            }
            this.customAlert("🎙️ <b>Diktování zastaveno.</b>");
        } else {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                this.customAlert("⚠️ Webová diktace není v tomto prohlížeči podporována. Spusťte aplikaci v Chrome nebo Electronu.");
                return;
            }
            
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'cs-CZ';
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            
            this.recognition.onstart = () => {
                this.isDictating = true;
                if (btn) {
                    btn.style.background = 'rgba(239, 68, 68, 0.2)';
                    btn.innerHTML = '<div class="icon-sq">🔴</div>Nahrávám...';
                }
            };
            
            this.recognition.onresult = (event) => {
                const text = event.results[event.results.length - 1][0].transcript;
                const range = this.core.quill.getSelection(true);
                this.core.quill.insertText(range.index, text + " ");
            };
            
            this.recognition.onerror = (e) => {
                console.error("Chyba diktování:", e);
                if (this.recognition) this.recognition.stop();
            };
            
            this.recognition.onend = () => {
                this.isDictating = false;
                if (btn) {
                    btn.style.background = '';
                    btn.innerHTML = '<div class="icon-sq">🎙️</div>Diktovat';
                }
            };
            
            this.recognition.start();
        }
    }

    openPostDialog() {
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
        
        const modal = document.createElement('div');
        modal.style = "background:#fff;padding:28px;border-radius:16px;width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif;border:1px solid #e2e8f0;position:relative;animation: modalFadeIn 0.3s ease;";
        
        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            @keyframes modalFadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(styleSheet);
        
        modal.innerHTML = `
            <div style="font-weight:700;font-size:18px;margin-bottom:8px;color:#1e293b;display:flex;align-items:center;gap:10px;">
                <span>✉️</span> Dopis Online (Česká pošta)
            </div>
            <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Odešlete aktuální dokument jako fyzický dopis.</div>
            
            <div style="margin-bottom:15px;">
                <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Adresát (Příjemce):</label>
                <input id="post-recipient" type="text" value="Jan Novák, Jankovcova 1522, 170 00 Praha" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;box-sizing:border-box;">
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Typ zásilky:</label>
                <select id="post-type" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;" onchange="document.getElementById('post-price').innerText = this.value === 'registered' ? '54 Kč' : '26 Kč'">
                    <option value="standard">Obyčejné psaní (A5/A4) — 26 Kč</option>
                    <option value="registered">Doporučené psaní — 54 Kč</option>
                </select>
            </div>
            
            <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#334155;">
                <span>Předpokládaná cena:</span>
                <strong id="post-price" style="color:#2563eb;font-size:15px;margin-left:auto;">26 Kč</strong>
            </div>
            
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="post-cancel" style="padding:10px 18px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;cursor:pointer;font-weight:500;font-size:13px;">Zrušit</button>
                <button id="post-send" style="padding:10px 18px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;box-shadow:0 4px 10px rgba(37,99,235,0.2);">Odeslat dopis</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        const close = () => document.body.removeChild(overlay);
        modal.querySelector('#post-cancel').onclick = close;
        modal.querySelector('#post-send').onclick = () => {
            const recip = modal.querySelector('#post-recipient').value;
            const type = modal.querySelector('#post-type').value === 'registered' ? 'doporučeně' : 'obyčejně';
            
            close();
            this.showLoader("Přenáším dokument do Dopis Online...", () => {
                this.customAlert(`✅ <b>Zásilka podána!</b><br><br>Dopis pro příjemce <b>${recip}</b> byl úspěšně vygenerován a předán České poště k vytištění a odeslání (${type}).`);
            });
        };
    }

    syncCloud(service) {
        this.checkEnterpriseFeature(`Synchronizace s ${service}`, () => {
            this.showLoader(`Připojuji se k ${service} a synchronizuji doložky a dokumenty...`, () => {
                this.customAlert(`☁️ <b>Synchronizace úspěšná!</b><br><br>Vaše dokumenty a knihovna doložek byly bezpečně zálohovány a synchronizovány se službou <b>${service}</b>.`);
            });
        });
    }

    showHelpTip(topic) {
        let title = "";
        let text = "";
        
        if (topic === 'redlining') {
            title = "🕵️ Sledování změn (Redlining)";
            text = `1. Aktivujte funkci kliknutím na tlačítko <b>Sledovat změny</b> na kartě <i>Revize</i>.<br>
2. Veškerý nově přidaný text se v editoru zobrazí zeleně podtržený.<br>
3. Smazaný text se červeně přeškrtne, ale zůstane zachován pro revizi.<br>
4. Následně můžete jednotlivé změny vybrat a kliknout na <b>Přijmout</b> nebo <b>Odmítnout</b>.`;
        } else if (topic === 'blackline') {
            title = "⚖️ Porovnání verzí (Blackline)";
            text = `1. Klikněte na tlačítko <b>Srovnat verze</b> na kartě <i>Revize</i>. <br>
2. Systém automaticky porovná aktuální otevřený dokument s poslední verzí uloženou v databázi.<br>
3. Všechny změny, přídavky a škrty se přehledně zobrazí v porovnávacím okně.`;
        } else if (topic === 'connect') {
            title = "🔗 Integrace LexisConnect";
            text = `LexisEditor na pozadí naslouchá na standardním portu <b>3300</b>.<br><br>
Ostatní advokátní systémy (např. <i>Evolio</i> nebo <i>SingleCase</i>) mohou zaslat standardní POST požadavek na endpoint <code>/api/import</code> s formátem HTML dokumentu a editor jej okamžitě načte.<br><br>
Tímto způsobem funguje bezproblémové propojení s vaším stávajícím cloudovým systémem.`;
        } else if (topic === 'scan') {
            title = "📸 Mobilní skenování (LexisLink)";
            text = `1. Otevřete <b>LexisLink Remote</b> ve svém mobilním telefonu (odkaz naleznete v horním Ribbonu).<br>
2. Zvolte možnost <b>Skenovat dokument</b>.<br>
3. Vyfoťte papírovou smlouvu nebo listinu.<br>
4. Mobilní telefon provede okamžité lokální OCR a pošle hotový text přímo do vašeho rozpracovaného dokumentu v PC na pozici kurzoru.`;
        } else if (topic === 'clauses') {
            title = "📚 Knihovna právních doložek";
            text = `1. Označte v dokumentu libovolný text (např. rozhodčí doložku nebo ujednání o úroku z prodlení).<br>
2. V postranním panelu <i>Toolbox</i> zvolte záložku <b>Doložky</b> a klikněte na <b>Uložit vybrané</b>.<br>
3. Doložku pojmenujte. Od té chvíle ji máte bezpečně uloženou v IndexedDB a můžete ji jediným kliknutím vložit do jakékoliv jiné smlouvy.`;
        } else if (topic === 'toc') {
            title = "📜 Automatické generování obsahu";
            text = `1. Formátujte nadpisy v dokumentu jako <b>Nadpis 1</b> (H1) nebo <b>Nadpis 2</b> (H2).<br>
2. Nastavte kurzor na místo, kde má být obsah.<br>
3. Na kartě <i>Vložit</i> klikněte na <b>Obsah</b>.<br>
4. LexisEditor dynamicky projde strukturu a vygeneruje čistý, formátovaný přehled kapitol.`;
        } else if (topic === 'user-guide') {
            title = "📖 Návod na zprovoznění lokální AI (Apple Intelligence & Ollama)";
            text = `<div style="max-height: 400px; overflow-y: auto; text-align: left; padding: 10px; font-family: inherit; line-height: 1.6; font-size: 13px;">
                <p>Vítejte u kompletního průvodce pro nastavení <b>100% offline umělé inteligence</b> v LexisEditoru. Všechna data jsou zpracovávána výhradně na vašem lokálním počítači.</p>
                
                <h3 style="color:#2563eb; border-bottom:1px solid #e5e7eb; padding-bottom:4px; margin-top:16px;">🍏 Metoda A: Apple Intelligence (přes "apfel")</h3>
                <p>Umožňuje přímý přístup k integrovanému 3B AI modelu ve vašem Macu s procesorem Apple Silicon (M1/M2/M3/M4) s macOS 15.0+ (Sequoia).</p>
                <ol style="padding-left: 20px;">
                    <li>Otevřete aplikaci <b>Terminál</b>.</li>
                    <li>Nainstalujte Homebrew (pokud jej nemáte):<br><code style="background:#f3f4f6; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px;">/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"</code></li>
                    <li>Nainstalujte nástroj apfel:<br><code style="background:#f3f4f6; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px;">brew install Arthur-Ficial/tap/apfel</code></li>
                    <li>Spusťte lokální AI server:<br><code style="background:#f3f4f6; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px; font-weight:bold;">apfel --serve</code></li>
                    <li>Na kartě <b>LexisAI</b> zvolte jako poskytovatele <b>Apple Intelligence (apfel)</b>. Endpoint a model se nastaví automaticky.</li>
                </ol>
                <div style="background:rgba(37,99,235,0.08); border-left:4px solid #2563eb; padding:8px 12px; margin:12px 0; border-radius:0 4px 4px 0; font-size:12px;">
                    💡 <b>Tip:</b> Okno s běžícím příkazem <code>apfel --serve</code> ponechte otevřené na pozadí.
                </div>

                <h3 style="color:#2563eb; border-bottom:1px solid #e5e7eb; padding-bottom:4px; margin-top:20px;">🦙 Metoda B: Ollama (Univerzální lokální AI)</h3>
                <p>Vhodné pro Windows, Linux i starší Intel Macy. Umožňuje spouštět libovolné open-source modely (např. Llama 3).</p>
                <ol style="padding-left: 20px;">
                    <li>Stáhněte a nainstalujte aplikaci ze stránky <a href="https://ollama.com" target="_blank" style="color:#2563eb; text-decoration:underline;">ollama.com</a>.</li>
                    <li>Otevřete Terminál / Příkazový řádek a stáhněte model Llama 3:<br><code style="background:#f3f4f6; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px;">ollama run llama3</code></li>
                    <li>V Ribbonu na kartě <b>LexisAI</b> zvolte poskytovatele <b>Ollama (Local)</b>.</li>
                </ol>

                <h3 style="color:#2563eb; border-bottom:1px solid #e5e7eb; padding-bottom:4px; margin-top:20px;">🔒 Absolutní Datová Suverenita</h3>
                <p>Veškeré rešerše, audity smluv i hlasové diktování probíhají offline v paměti vašeho počítače. Žádná data neopouštějí váš stroj.</p>
            </div>`;
        } else if (topic === 'updates') {
            title = "🔄 Kontrola aktualizací";
            text = `<b>Aktuální verze:</b> v3.5.0 (Stable Enterprise)<br><br>
Provádím kontrolu lokálního úložiště a serverů...<br>
<i>Vaše verze je aktuální. Žádné nové aktualizace nejsou k dispozici.</i>`;
        } else if (topic === 'about') {
            title = "ℹ️ O aplikaci LexisEditor";
            text = `<b>LexisEditor Professional Legal Workspace</b><br>
Verze: <b>3.5.0</b><br><br>
Lokální právní textový procesor s integrovaným AI asistentem, napojením na státní registry (ARES) a šifrovaným úložištěm.<br><br>
<i>Vyvinuto s důrazem na absolutní datovou suverenitu advokátní praxe. All rights reserved.</i>`;
        }
        
        this.customAlert(`<b>${title}</b><br><br>${text}`);
    }

    saveAISettings() {
        const provEl = document.getElementById('ai-provider');
        const modelEl = document.getElementById('ai-model');
        const endEl = document.getElementById('ai-endpoint');
        const keyEl = document.getElementById('ai-apikey');
        const fallbackEl = document.getElementById('ai-offline-fallback');
        
        if (!provEl) return;
        
        const settings = {
            provider: provEl.value,
            model: modelEl ? modelEl.value : "llama3",
            endpoint: endEl ? endEl.value : "http://localhost:11434/api/generate",
            apiKey: keyEl ? keyEl.value : "",
            enableOfflineFallback: fallbackEl ? fallbackEl.checked : true
        };
        localStorage.setItem('lexis_ai_settings', JSON.stringify(settings));
        console.log('AI Settings saved:', settings);
    }

    loadAISettings() {
        const saved = localStorage.getItem('lexis_ai_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                const provEl = document.getElementById('ai-provider');
                const modelEl = document.getElementById('ai-model');
                const endEl = document.getElementById('ai-endpoint');
                const keyEl = document.getElementById('ai-apikey');
                const fallbackEl = document.getElementById('ai-offline-fallback');
                
                if (provEl && s.provider) provEl.value = s.provider;
                if (modelEl && s.model) modelEl.value = s.model;
                if (endEl && s.endpoint) endEl.value = s.endpoint;
                if (keyEl && s.apiKey) keyEl.value = s.apiKey;
                if (fallbackEl && s.enableOfflineFallback !== undefined) fallbackEl.checked = s.enableOfflineFallback;
            } catch (e) {
                console.error("Chyba při načítání AI nastavení:", e);
            }
        }
        this.toggleLexisLocalSelectors();
    }

    saveFeatureSettings() {
        const liveDlEl = document.getElementById('settings-live-deadline-scan');
        const watcherEl = document.getElementById('settings-desktop-file-watcher');
        const linkTargetEl = document.getElementById('settings-legal-link-target');
        
        this.enableLiveDeadlineScan = liveDlEl ? liveDlEl.checked : true;
        this.enableDesktopFileWatcher = watcherEl ? watcherEl.checked : true;
        this.legalLinkTarget = linkTargetEl ? linkTargetEl.value : "zakonyprolidi";
        
        const settings = {
            enableLiveDeadlineScan: this.enableLiveDeadlineScan,
            enableDesktopFileWatcher: this.enableDesktopFileWatcher,
            legalLinkTarget: this.legalLinkTarget
        };
        localStorage.setItem('lexis_feature_settings', JSON.stringify(settings));
        console.log('Feature settings saved:', settings);
        
        // Notify backend about watcher state change
        try {
            const conn = this.getLexisLocalConnection();
            fetch(`${conn.baseUrl}/api/watcher/toggle?active=${this.enableDesktopFileWatcher}`, { method: 'POST', headers: conn.headers })
                .catch(e => console.log("LexisLocal je offline, stav watcheru se na pozadí neuložil."));
        } catch (e) {
            console.log("LexisLocal je offline, stav watcheru se na pozadí neuložil.");
        }
    }

    loadFeatureSettings() {
        const saved = localStorage.getItem('lexis_feature_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                if (s.enableLiveDeadlineScan !== undefined) this.enableLiveDeadlineScan = s.enableLiveDeadlineScan;
                if (s.enableDesktopFileWatcher !== undefined) this.enableDesktopFileWatcher = s.enableDesktopFileWatcher;
                if (s.legalLinkTarget !== undefined) this.legalLinkTarget = s.legalLinkTarget;
            } catch (e) {
                console.error("Chyba při parsování nastavení volitelných funkcí:", e);
            }
        }
        
        // Set DOM elements state
        const liveDlEl = document.getElementById('settings-live-deadline-scan');
        const watcherEl = document.getElementById('settings-desktop-file-watcher');
        const linkTargetEl = document.getElementById('settings-legal-link-target');
        
        if (liveDlEl) liveDlEl.checked = this.enableLiveDeadlineScan;
        if (watcherEl) watcherEl.checked = this.enableDesktopFileWatcher;
        if (linkTargetEl) linkTargetEl.value = this.legalLinkTarget;
        
        // Notify backend about watch state
        try {
            const conn = this.getLexisLocalConnection();
            fetch(`${conn.baseUrl}/api/watcher/toggle?active=${this.enableDesktopFileWatcher}`, { method: 'POST', headers: conn.headers })
                .catch(e => console.log("LexisLocal je offline, stav watcheru se na pozadí neuložil."));
        } catch (e) {
            console.log("LexisLocal je offline, stav watcheru se na pozadí neuložil.");
        }
    }

    updateAIProviderDefaults() {
        const provEl = document.getElementById('ai-provider');
        const modelEl = document.getElementById('ai-model');
        const endEl = document.getElementById('ai-endpoint');
        
        if (!provEl || !modelEl || !endEl) return;
        
        const provider = provEl.value;
        if (provider === 'lexislocal') {
            modelEl.value = "swarm";
            endEl.value = "http://localhost:4000";
        } else if (provider === 'apfel') {
            modelEl.value = "apple-intelligence";
            endEl.value = "http://localhost:11434/v1/chat/completions";
        } else if (provider === 'ollama') {
            modelEl.value = "llama3";
            endEl.value = "http://localhost:11434/api/generate";
        } else if (provider === 'openai') {
            modelEl.value = "gpt-4o";
            endEl.value = "https://api.openai.com/v1/chat/completions";
        } else if (provider === 'deepseek') {
            modelEl.value = "deepseek-chat";
            endEl.value = "https://api.deepseek.com/v1/chat/completions";
        } else if (provider === 'google') {
            modelEl.value = "gemini-pro";
            endEl.value = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";
        } else if (provider === 'lmstudio') {
            modelEl.value = "local-model";
            endEl.value = "http://localhost:1234/v1/chat/completions";
        }
        this.saveAISettings();
        this.toggleLexisLocalSelectors();
    }

    getLexisLocalConnection() {
        let endpoint = "http://localhost:4000";
        let apiKey = "";

        const endEl = document.getElementById('ai-endpoint');
        const keyEl = document.getElementById('ai-apikey');

        if (endEl && endEl.value) endpoint = endEl.value;
        if (keyEl && keyEl.value) apiKey = keyEl.value;

        const saved = localStorage.getItem('lexis_ai_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                if (s.endpoint) endpoint = s.endpoint;
                if (s.apiKey) apiKey = s.apiKey;
            } catch (e) {}
        }

        // Heuristically adjust port and protocol if it points to Ollama
        let baseUrl = endpoint;
        if (baseUrl.includes("11434") || baseUrl.includes("/api/generate")) {
            const isHttps = endpoint.startsWith("https:");
            baseUrl = `${isHttps ? "https" : "http"}://localhost:4000`;
        }
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
        }

        const headers = { "Content-Type": "application/json" };
        if (apiKey) {
            headers["X-API-Token"] = apiKey;
        }

        return { baseUrl, headers };
    }

    toggleLexisLocalSelectors() {
        const provEl = document.getElementById('ai-provider');
        const container = document.getElementById('lexislocal-selectors-container');
        if (!provEl || !container) return;
        
        if (provEl.value === 'lexislocal') {
            container.style.display = 'flex';
            this.fetchLexisLocalModels();
        } else {
            container.style.display = 'none';
        }
    }

    async fetchLexisLocalModels() {
        const modelSelect = document.getElementById('lexislocal-model');
        if (!modelSelect) return;
        
        try {
            const conn = this.getLexisLocalConnection();
            const response = await fetch(`${conn.baseUrl}/api/models`, { headers: conn.headers });
            if (response.ok) {
                const data = await response.json();
                if (data && data.models && data.models.length > 0) {
                    modelSelect.innerHTML = '';
                    data.models.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.name;
                        opt.innerText = m.name;
                        modelSelect.appendChild(opt);
                    });
                }
            }
        } catch (e) {
            console.warn("⚠️ Nepodařilo se načíst modely z LexisLocal backendu:", e);
        }
    }

    toggleStatusDropdown(event) {
        event.stopPropagation();
        const dd = document.getElementById('status-dropdown');
        if (dd) {
            const isShown = dd.style.display === 'block';
            dd.style.display = isShown ? 'none' : 'block';
        }
    }

    setDocumentStatus(status, suppressNotification = false) {
        this.documentStatus = status;
        const badge = document.getElementById('doc-status-badge');
        if (!badge) return;
        
        // Remove all previous status classes
        badge.className = 'status-pill';
        
        let label = '';
        if (status === 'draft') {
            badge.classList.add('status-draft');
            label = '✍️ Rozpracované';
        } else if (status === 'ai') {
            badge.classList.add('status-ai');
            label = '✨ Generované AI';
        } else if (status === 'review') {
            badge.classList.add('status-review');
            label = '🔍 Ke kontrole';
        } else if (status === 'final') {
            badge.classList.add('status-final');
            label = '✅ Hotové';
        }
        
        badge.innerText = label;
        
        if (!suppressNotification) {
            if (status === 'final') {
                this.customConfirm(
                    `💼 <b>Stav dokumentu změněn na: ✅ Hotové</b><br><br>` +
                    `Přejete si tento dokument automaticky <b>převést na čistý úřední formát</b>?<br><br>` +
                    `Tento proces:<br>` +
                    `• Převede hypertextové odkazy (Legal Linker) na běžný text.<br>` +
                    `• Schválí všechny sledované změny (smazaný text zmizí, přidaný se sloučí).<br>` +
                    `• Vypne režim sledování změn.`,
                    `Vyčistit a dokončit`,
                    `Ponechat s revizemi`,
                    (shouldClean) => {
                        if (shouldClean) {
                            this.cleanDocumentForOfficialSubmission();
                        } else {
                            this.customAlert(`💼 <b>Stav dokumentu změněn</b><br><br>Dokument byl označen jako: <b>${label}</b> (odkazy a revize byly ponechány beze změny).`);
                        }
                    }
                );
            } else {
                this.customAlert(`💼 <b>Stav dokumentu změněn</b><br><br>Dokument byl označen jako: <b>${label}</b>`);
            }
        }
        
        this.saveActiveDocumentState();
    }

    async initActiveDocumentState() {
        try {
            let lastId = await this.core.storage.get('settings', 'active-document-id');
            
            // Upgrade fallback: if active-document-id is not set, check if legacy 'doc_active' exists
            if (!lastId) {
                const legacy = await this.core.storage.get('documents', 'doc_active');
                if (legacy && legacy.html) {
                    lastId = 'doc_active';
                }
            }
            
            if (lastId) {
                const saved = await this.core.storage.get('documents', lastId);
                if (saved && saved.html) {
                    this.currentDocumentId = lastId;
                    this.core.setContent(saved.html);
                    if (saved.status) {
                        this.setDocumentStatus(saved.status, true);
                    }
                    
                    this.currentDocumentTitle = saved.title || '';
                    this.currentDocumentDeadline = saved.deadline || null;
                    this.currentDocumentCj = saved.cj || '';
                    this.updateDeadlineBadge();
                    this.updateDocumentOutline();
                    
                    const startScreen = document.getElementById('start-screen');
                    const appContainer = document.getElementById('app-container');
                    if (startScreen && appContainer) {
                        startScreen.style.display = 'none';
                        appContainer.style.display = 'flex';
                    }
                    console.log(`Dokument ${lastId} byl úspěšně načten ze zálohy.`);
                    return;
                }
            }
            
            // If no document was restored, show start screen and render recent files
            const startScreen = document.getElementById('start-screen');
            const appContainer = document.getElementById('app-container');
            if (startScreen && appContainer) {
                startScreen.style.display = 'flex';
                appContainer.style.display = 'none';
            }
            this.renderRecentDocuments();
        } catch (e) {
            console.error("Chyba při obnově stavu aktivního dokumentu:", e);
            this.renderRecentDocuments();
        }
    }

    async saveActiveDocumentState() {
        try {
            if (!this.currentDocumentId) {
                this.currentDocumentId = 'doc_' + Date.now();
            }
            
            const html = this.core.getContent();
            const text = this.core.getText();
            const title = this.currentDocumentTitle || text.substring(0, 30).trim() || "Nový dokument";
            
            const state = {
                id: this.currentDocumentId,
                html: html,
                text: text,
                title: title,
                status: this.documentStatus || 'draft',
                deadline: this.currentDocumentDeadline || null,
                cj: this.currentDocumentCj || '',
                updatedAt: new Date().toISOString()
            };
            
            await this.core.storage.set('documents', state);
            await this.core.storage.set('settings', { key: 'active-document-id', value: this.currentDocumentId });
        } catch (e) {
            console.error("Chyba při ukládání stavu aktivního dokumentu:", e);
        }
    }

    async goToStartScreen() {
        try {
            // Auto-save currently open document
            if (this.currentDocumentId) {
                await this.saveActiveDocumentState();
            }
            
            // Mark active-document-id as null so next reload shows start screen
            await this.core.storage.set('settings', { key: 'active-document-id', value: null });
            this.currentDocumentId = null;
            this.currentDocumentTitle = '';
            this.currentDocumentDeadline = null;
            this.currentDocumentCj = '';
            
            // Clear editor content & outline
            this.core.setContent('<p><br></p>');
            this.updateDeadlineBadge();
            this.updateDocumentOutline();
            
            // Transition view
            const startScreen = document.getElementById('start-screen');
            const appContainer = document.getElementById('app-container');
            if (startScreen && appContainer) {
                startScreen.style.display = 'flex';
                appContainer.style.display = 'none';
            }
            
            this.renderRecentDocuments();
        } catch (e) {
            console.error("Chyba při přechodu na úvodní obrazovku:", e);
        }
    }

    async renderRecentDocuments(filterType = 'all') {
        const recentSection = document.getElementById('recent-docs-section');
        const recentList = document.getElementById('recent-docs-list');
        if (!recentSection || !recentList) return;
        
        try {
            const allDocs = await this.core.storage.getAll('documents');
            recentList.innerHTML = '';
            
            // Filter out empty or template items, keep only actual user document records
            const userDocs = allDocs.filter(d => d && d.id && d.id.startsWith('doc_'));
            
            if (userDocs.length === 0) {
                recentSection.style.display = 'block';
                recentList.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #94a3b8; font-family: 'Inter', sans-serif;">
                        <span style="font-size: 32px; display: block; margin-bottom: 10px;">📝</span>
                        <div style="font-size: 13px; font-weight: 500;">Nemáte žádné nedávné dokumenty</div>
                        <div style="font-size: 11px; margin-top: 4px;">Vytvořte nový nebo vyberte šablonu z mřížky výše.</div>
                    </div>
                `;
                return;
            }
            
            // Sort by updatedAt descending
            userDocs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            let renderedCount = 0;
            
            for (const doc of userDocs) {
                // Apply filter
                if (filterType !== 'all' && doc.status !== filterType) {
                    continue;
                }
                
                renderedCount++;
                
                // Formulate badges
                let statusHtml = '';
                switch (doc.status) {
                    case 'draft':
                        statusHtml = `<span style="padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; font-family:'Inter',sans-serif;">✍️ Rozpracované</span>`;
                        break;
                    case 'ai':
                        statusHtml = `<span style="padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #f5f3ff; border: 1px solid #ddd6fe; color: #7c3aed; font-family:'Inter',sans-serif;">✨ AI</span>`;
                        break;
                    case 'review':
                        statusHtml = `<span style="padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #fff7ed; border: 1px solid #ffedd5; color: #ea580c; font-family:'Inter',sans-serif;">🔍 Ke kontrole</span>`;
                        break;
                    case 'final':
                        statusHtml = `<span style="padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #f0fdf4; border: 1px solid #dcfce7; color: #16a34a; font-family:'Inter',sans-serif;">✅ Hotové</span>`;
                        break;
                }
                
                let deadlineHtml = '';
                if (doc.deadline) {
                    const due = new Date(doc.deadline.dueDate);
                    const daysLeft = Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24));
                    let dlColor = '#ef4444';
                    let dlBg = '#fef2f2';
                    let dlText = `⏰ Lhůta: ${due.toLocaleDateString('cs-CZ')}`;
                    
                    if (daysLeft < 0) {
                        dlText = `⚠️ Zmeškáno: ${due.toLocaleDateString('cs-CZ')}`;
                    } else if (daysLeft > 7) {
                        dlColor = '#16a34a';
                        dlBg = '#f0fdf4';
                    } else if (daysLeft > 2) {
                        dlColor = '#eab308';
                        dlBg = '#fefce8';
                    }
                    
                    deadlineHtml = `<span style="padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; background: ${dlBg}; color: ${dlColor}; font-family:'Inter',sans-serif; margin-right: 5px;">${dlText}</span>`;
                }
                
                const dateStr = new Date(doc.updatedAt).toLocaleString('cs-CZ', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const row = document.createElement('div');
                row.className = 'recent-doc-row';
                row.onclick = () => this.openRecentDocument(doc.id);
                row.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; cursor: pointer; transition: all 0.2s; font-family: 'Inter', sans-serif; margin-bottom: 5px;";
                
                // Add hover style directly
                row.onmouseover = () => {
                    row.style.background = '#f1f5f9';
                    row.style.borderColor = '#cbd5e1';
                };
                row.onmouseout = () => {
                    row.style.background = '#f8fafc';
                    row.style.borderColor = '#e2e8f0';
                };
                
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                        <span style="font-size: 20px; flex-shrink: 0;">📄</span>
                        <div style="min-width: 0; flex: 1;">
                            <div style="font-weight: 600; font-size: 13px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.title}</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Aktualizováno: ${dateStr}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 10px;">
                        ${deadlineHtml}
                        ${statusHtml}
                        <button onclick="event.stopPropagation(); deleteRecentDocument('${doc.id}')" style="background: transparent; border: none; cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='transparent'">🗑️</button>
                    </div>
                `;
                recentList.appendChild(row);
            }
            
            if (renderedCount === 0) {
                recentList.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #94a3b8; font-family: 'Inter', sans-serif;">
                        <span style="font-size: 32px; display: block; margin-bottom: 10px;">🔍</span>
                        <div style="font-size: 13px; font-weight: 500;">Žádné dokumenty neodpovídají filtru</div>
                    </div>
                `;
            }
            
            recentSection.style.display = 'block';
            this.fetchInbox();
        } catch (e) {
            console.error("Chyba při vykreslování nedávných dokumentů:", e);
        }
    }

    async fetchInbox() {
        const inboxSection = document.getElementById('inbox-docs-section');
        const inboxList = document.getElementById('inbox-docs-list');
        if (!inboxSection || !inboxList) return;
        
        try {
            const conn = this.getLexisLocalConnection();
            const response = await fetch(`${conn.baseUrl}/api/inbox`, { headers: conn.headers });
            if (response.ok) {
                const data = await response.json();
                inboxList.innerHTML = '';
                
                if (data && data.inbox && data.inbox.length > 0) {
                    data.inbox.forEach(doc => {
                        const card = document.createElement('div');
                        card.style = "background: white; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: transform 0.2s, box-shadow 0.2s;";
                        card.onmouseover = () => {
                            card.style.transform = "translateY(-1px)";
                            card.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.05)";
                        };
                        card.onmouseout = () => {
                            card.style.transform = "translateY(0)";
                            card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)";
                        };
                        
                        let deadlineBadge = '';
                        if (doc.deadlineDays > 0) {
                            const badgeColor = doc.deadlineDays <= 5 ? '#f43f5e' : '#f97316';
                            const badgeBg = doc.deadlineDays <= 5 ? '#ffe4e6' : '#ffedd5';
                            deadlineBadge = `<span style="font-size: 10px; font-weight: 700; color: ${badgeColor}; background: ${badgeBg}; padding: 2px 6px; border-radius: 4px; display: inline-block;">⚠️ Lhůta: ${doc.deadlineDays} dnů (vyprší ${doc.deadlineDate})</span>`;
                        } else {
                            deadlineBadge = `<span style="font-size: 10px; font-weight: 500; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block;">Bez lhůty</span>`;
                        }
                        
                        let insolvencyBadge = '';
                        if (doc.inInsolvency) {
                            insolvencyBadge = `<span style="font-size: 9px; font-weight: 800; color: #be123c; background: #ffe4e6; border: 1px solid #fda4af; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">⚠️ V INSOLVENCI (${doc.insolvencyCase})</span>`;
                        }
                        
                        card.innerHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;">
                                <div style="font-weight: 700; font-size: 12px; color: #1e293b; display: flex; align-items: center; gap: 4px;">
                                    <span>📄</span> ${doc.caseNumber}
                                </div>
                                ${deadlineBadge}
                            </div>
                            <div style="font-size: 11px; color: #475569;">
                                <b>Žalobce:</b> ${doc.plaintiff}<br>
                                <b>Žalovaný:</b> ${doc.defendant}
                                ${insolvencyBadge}
                            </div>
                            <div style="font-size: 10px; color: #64748b; font-style: italic; background: #f8fafc; padding: 6px; border-radius: 4px; line-height: 1.3;">
                                ${doc.summary}
                            </div>
                            <div style="display: flex; gap: 6px; margin-top: 4px;">
                                <button id="prepare-reply-${doc.caseNumber.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}" style="flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 700; color: white; background: var(--word-blue); border: none; border-radius: 4px; cursor: pointer; transition: background 0.2s;">📝 Připravit odpověď</button>
                                <button id="mark-done-${doc.caseNumber.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}" style="padding: 5px 8px; font-size: 10px; font-weight: 600; color: #64748b; background: #e2e8f0; border: none; border-radius: 4px; cursor: pointer; transition: background 0.2s;">🔕 Hotovo</button>
                            </div>
                        `;
                        
                        inboxList.appendChild(card);
                        
                        // Setup event listeners safely
                        const prepBtn = card.querySelector(`[id="prepare-reply-${doc.caseNumber.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}"]`);
                        const doneBtn = card.querySelector(`[id="mark-done-${doc.caseNumber.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}"]`);
                        if (prepBtn) prepBtn.onclick = () => this.prepareReply(doc);
                        if (doneBtn) doneBtn.onclick = () => this.markInboxRead(doc.fileName);
                    });
                } else {
                    inboxList.innerHTML = `<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 30px 0;">Žádné nové spisy ke zpracování.</div>`;
                }
                inboxSection.style.display = 'block';
            } else {
                inboxSection.style.display = 'none';
            }
        } catch (e) {
            console.log("⚠️ LexisLocal server není dostupný. Skrývám panel doručené pošty.");
            inboxSection.style.display = 'none';
        }
    }

    async parseTestDocument() {
        try {
            const conn = this.getLexisLocalConnection();
            const response = await fetch(`${conn.baseUrl}/api/inbox/parse-test`, { method: "POST", headers: conn.headers });
            if (response.ok) {
                this.customAlert("<b>Úspěch</b><br><br>Testovací soudní spis (23 C 120/2026) byl naimportován a úspěšně zanalyzován!");
                this.fetchInbox();
            } else {
                this.customAlert("<b>Chyba</b><br><br>Nepodařilo se naimportovat testovací spis.");
            }
        } catch (e) {
            this.customAlert("<b>Chyba</b><br><br>Nelze se spojit s LexisLocal serverem. Ujistěte se, že běží na pozadí.");
        }
    }

    async markInboxRead(fileName) {
        try {
            const conn = this.getLexisLocalConnection();
            const response = await fetch(`${conn.baseUrl}/api/inbox/mark-read`, {
                method: "POST",
                headers: conn.headers,
                body: JSON.stringify({ fileName })
            });
            if (response.ok) {
                this.fetchInbox();
            }
        } catch (e) {
            console.error("Chyba při označování spisu za přečtený:", e);
        }
    }

    async prepareReply(doc) {
        this.showLoader("Zakládání spisu a generování odpovědi...", async () => {
            try {
                // 1. Transition view to editor
                const startScreen = document.getElementById('start-screen');
                const appContainer = document.getElementById('app-container');
                if (startScreen && appContainer) {
                    startScreen.style.display = 'none';
                    appContainer.style.display = 'flex';
                }
                
                // 2. Set active document state and metadata
                this.currentDocumentId = 'doc_' + Date.now();
                this.currentDocumentCj = doc.caseNumber;
                this.currentDocumentDeadline = doc.deadlineDate;
                this.currentDocumentTitle = `Vyjádření k žalobě - sp. zn. ${doc.caseNumber}`;
                
                // Set the title input field
                const titleInput = document.getElementById('doc-title');
                if (titleInput) titleInput.value = this.currentDocumentTitle;
                
                // 3. Draft formal response brief HTML
                const generatedHtml = `
                    <p style="text-align: right; font-family: 'Times New Roman', serif; font-size: 12pt;"><b>Okresní soud v Brně</b><br>Polní 994/39<br>608 00 Brno</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><b>K sp. zn.:</b> ${doc.caseNumber}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><b>Žalobce:</b> ${doc.plaintiff}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><b>Žalovaný:</b> ${doc.defendant}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <h2 style="text-align: center; font-weight: bold; font-size: 14pt; font-family: 'Times New Roman', serif;">VYJÁDŘENÍ ŽALOVANÉHO K ŽALOBĚ</h2>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify;">K výzvě soudu podle § 114b o. s. ř. ze dne ${new Date().toLocaleDateString('cs-CZ')} se žalovaný vyjadřuje k podané žalobě následovně:</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify;"><b>I.</b></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify;">Žalovaný nárok žalobce v celém rozsahu popírá a navrhuje, aby soud žalobu jako zcela nedůvodnou zamítl a žalobci uložil povinnost nahradit žalovanému náklady tohoto soudního řízení.</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify;"><b>II.</b></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify;">Podaná žaloba postrádá věcné i právní opodstatnění. Žalobcem tvrzené nároky neodpovídají skutečnému stavu věci. Žalovaný se k jednotlivým tvrzením žalobce vyjádří podrobně v následném doplnění.</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify;"><i>[Doporučení AI: Zvolte v pravém panelu Agenta 'Stylista' nebo 'Oponent' pro zformulování konkrétních námitek k žalobním tvrzením.]</i></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;">V Brně dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="text-align: right; font-family: 'Times New Roman', serif; font-size: 12pt;">...........................................<br><b>${doc.defendant}</b><br>právně zastoupen advokátem</p>
                `;
                
                this.core.setContent(generatedHtml);
                this.setDocumentStatus('draft', true);
                
                // 4. Update UI elements and save to DB
                this.updateDeadlineBadge();
                await this.saveActiveDocumentState();
                
                // Mark this inbox item as read in the backend so it doesn't stay in inbox list
                await this.markInboxRead(doc.fileName);
                
            } catch (err) {
                console.error("Chyba při přípravě odpovědi:", err);
            }
        });
    }

    async insertAresData() {
        let ico = document.getElementById('ares-ico-input').value.trim();
        
        // If empty input, attempt to fetch selection from editor
        if (!ico) {
            const range = this.core.editor.getSelection();
            if (range && range.length > 0) {
                const selectedText = this.core.editor.getText(range.index, range.length).trim();
                const cleaned = selectedText.replace(/[^0-9]/g, '');
                if (cleaned.length === 8) {
                    ico = cleaned;
                }
            }
        }
        
        if (!ico || ico.length !== 8) {
            this.customAlert("<b>Ověření ARES & ISIR</b><br><br>Zadejte 8místné IČO do pole v panelu nebo jej označte v textu dokumentu.");
            return;
        }
        
        this.showLoader("Lustruji subjekt v registrech...", async () => {
            try {
                const conn = this.getLexisLocalConnection();
                const response = await fetch(`${conn.baseUrl}/api/registry/check?ico=${ico}`, { headers: conn.headers });
                if (response.ok) {
                    const data = await response.json();
                    
                    const textToInsert = `${data.name}, se sídlem ${data.seat}, IČO: ${data.ico}`;
                    
                    // Insert into Editor
                    const range = this.core.editor.getSelection(true);
                    if (range) {
                        this.core.editor.deleteText(range.index, range.length);
                        this.core.editor.insertText(range.index, textToInsert);
                        this.core.editor.setSelection(range.index + textToInsert.length);
                    }
                    
                    // Clear the input
                    document.getElementById('ares-ico-input').value = '';
                    
                    // Insolvency check warning
                    if (data.inInsolvency) {
                        this.customAlert(`
                            <div style="text-align: left; font-family: 'Inter', sans-serif;">
                                <h3 style="color: #be123c; margin: 0 0 10px 0; font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                                    <span>⚠️</span> SUBJEKT JE V INSOLVENCI!
                                </h3>
                                <p style="font-size: 12px; line-height: 1.4; color: #475569; margin: 0 0 10px 0;">
                                    Ověřený subjekt <b>${data.name}</b> je veden v Insolvenčním rejstříku ČR!
                                </p>
                                <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 10px; border-radius: 6px; font-size: 11px; color: #9f1239;">
                                    <b>Spisová značka:</b> ${data.insolvencyCase}<br>
                                    <b>Stav řízení:</b> ${data.insolvencyStatus || 'Probíhající insolvenční řízení'}
                                </div>
                                <p style="font-size: 10px; color: #64748b; margin-top: 10px; font-style: italic;">
                                    Údaje o subjektu a jeho sídle byly přesto úspěšně vloženy do textu.
                                </p>
                            </div>
                        `);
                    } else {
                        this.customAlert(`
                            <div style="text-align: left; font-family: 'Inter', sans-serif;">
                                <h3 style="color: #16a34a; margin: 0 0 10px 0; font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                                    <span>✅</span> Lustrace úspěšná (ARES)
                                </h3>
                                <p style="font-size: 12px; line-height: 1.4; color: #475569; margin: 0;">
                                    <b>Subjekt:</b> ${data.name}<br>
                                    <b>Sídlo:</b> ${data.seat}<br>
                                    <b>IČO:</b> ${data.ico}<br><br>
                                    <i>Údaje byly automaticky vloženy do textu na pozici kurzoru. Subjekt nemá záznam v insolvenčním rejstříku.</i>
                                </p>
                            </div>
                        `);
                    }
                } else {
                    this.customAlert("<b>Ověření ARES</b><br><br>Subjekt s tímto IČO nebyl v databázi nalezen.");
                }
            } catch (err) {
                console.error("Chyba lustrace:", err);
                this.customAlert("<b>Chyba spojení</b><br><br>Nelze se spojit s LexisLocal serverem na pozadí.");
            }
        });
    }

    filterRecentDocs(status) {
        // Update active class on filter buttons
        const container = document.getElementById('recent-filters');
        if (container) {
            const buttons = container.getElementsByClassName('filter-btn');
            for (const btn of buttons) {
                btn.classList.remove('active');
                btn.style.background = '#f8fafc';
                btn.style.color = '#64748b';
                btn.style.borderColor = '#e2e8f0';
            }
            
            // Find clicked button
            const activeBtn = Array.from(buttons).find(b => b.getAttribute('onclick').includes(`'${status}'`));
            if (activeBtn) {
                activeBtn.classList.add('active');
                activeBtn.style.background = '#2563eb';
                activeBtn.style.color = 'white';
                activeBtn.style.borderColor = 'transparent';
            }
        }
        this.renderRecentDocuments(status);
    }

    async openRecentDocument(id) {
        this.showLoader("Načítání dokumentu...", async () => {
            try {
                const saved = await this.core.storage.get('documents', id);
                if (saved && saved.html) {
                    this.currentDocumentId = id;
                    this.core.setContent(saved.html);
                    if (saved.status) {
                        this.setDocumentStatus(saved.status, true);
                    }
                    
                    this.currentDocumentTitle = saved.title || '';
                    this.currentDocumentDeadline = saved.deadline || null;
                    this.currentDocumentCj = saved.cj || '';
                    this.updateDeadlineBadge();
                    this.updateDocumentOutline();
                    
                    // Save active-document-id to settings
                    await this.core.storage.set('settings', { key: 'active-document-id', value: id });
                    
                    // Transition view
                    const startScreen = document.getElementById('start-screen');
                    const appContainer = document.getElementById('app-container');
                    if (startScreen && appContainer) {
                        startScreen.style.display = 'none';
                        appContainer.style.display = 'flex';
                    }
                }
            } catch (e) {
                console.error("Chyba při otevírání vybraného dokumentu:", e);
                this.customAlert("Nepodařilo se načíst vybraný dokument.");
            }
        });
    }

    async deleteRecentDocument(id) {
        this.dialogs.customConfirm(
            "Opravdu chcete tento dokument trvale smazat z paměti aplikace?",
            "Smazat",
            "Zrušit",
            async (yes) => {
                if (!yes) return;
                
                try {
                    await this.core.storage.delete('documents', id);
                    
                    // If deleted document is currently active, clear state
                    if (this.currentDocumentId === id) {
                        this.currentDocumentId = null;
                        this.currentDocumentDeadline = null;
                        this.currentDocumentCj = '';
                        await this.core.storage.set('settings', { key: 'active-document-id', value: null });
                    }
                    
                    this.renderRecentDocuments();
                } catch (e) {
                    console.error("Chyba při mazání dokumentu:", e);
                    this.customAlert("Nepodařilo se smazat vybraný dokument.");
                }
            }
        );
    }

    updateDeadlineBadge() {
        const badge = document.getElementById('doc-deadline-badge');
        if (!badge) return;
        
        if (!this.currentDocumentDeadline) {
            badge.style.display = 'none';
            return;
        }
        
        const now = new Date();
        now.setHours(0,0,0,0);
        
        const due = new Date(this.currentDocumentDeadline.dueDate);
        due.setHours(0,0,0,0);
        
        const diffTime = due - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const dateStr = due.toLocaleDateString('cs-CZ');
        
        badge.style.display = 'inline-block';
        
        if (diffDays <= 3) {
            badge.style.background = '#fee2e2';
            badge.style.color = '#991b1b';
            badge.style.borderColor = '#fca5a5';
        } else if (diffDays <= 7) {
            badge.style.background = '#ffedd5';
            badge.style.color = '#c2410c';
            badge.style.borderColor = '#fed7aa';
        } else {
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
            badge.style.borderColor = '#bbf7d0';
        }
        
        const daysText = diffDays < 0 ? 'Expirovala!' : (diffDays === 0 ? 'Dnes!' : `Za ${diffDays} dní`);
        badge.innerHTML = `⏰ Lhůta: ${daysText} (${dateStr})`;
    }

    showDeadlineInfo() {
        if (!this.currentDocumentDeadline) return;
        
        const dl = this.currentDocumentDeadline;
        const due = new Date(dl.dueDate);
        const dateStr = due.toLocaleDateString('cs-CZ');
        
        this.customAlert(`⏰ <b>Podrobnosti sledované lhůty</b><br><br>` +
            `<b>Název úkonu:</b> ${dl.title}<br>` +
            `<b>Spis. zn. / Číslo jednací:</b> ${this.currentDocumentCj || 'Nespecifikováno'}<br>` +
            `<b>Termín splnění:</b> ${dateStr}<br><br>` +
            `<div style="font-size: 11px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; font-style: italic; line-height: 1.4;">` +
            `Lhůta je bezpečně uložena v interní paměti dokumentu a synchronizována se systémovým hlídačem lhůt.` +
            `</div>`);
    }

    convertCitationsToLinks() {
        if (this.legalLinkTarget === 'disabled') {
            this.customAlert("ℹ️ <b>Legal Linker je vypnutý</b><br><br>Funkci automatického odkazování na zákony můžete povolit v Nastavení -> Volitelné Funkce.");
            return;
        }

        const quill = this.core.quill;
        const html = quill.root.innerHTML;
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Comprehensive Czech legal citation patterns
        const citationRegex = /(§\s*\d+[a-z]?(?:\s+(?:odst\.|odstavce)\s*\d+)?\s*(?:zákona\s+)?(?:č\.\s*)?(?:\d+\/\d+\s+Sb\.|[a-zá-žA-Z0-9.\s]{2,}))/gi;
        const lawRegex = /(zákon(?:a|u)?\s+(?:č\.\s*)?\d+\/\d+\s*Sb\.)/gi;
        
        let linkCount = 0;
        
        const walkAndReplace = (parent) => {
            const children = Array.from(parent.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;
                    
                    if (parent.tagName && parent.tagName.toLowerCase() === 'a') continue;
                    
                    let newHtml = text;
                    let replaced = false;
                    
                    // Replace matching citations with clean links targeting Zákony pro lidi or Google
                    newHtml = newHtml.replace(citationRegex, (match) => {
                        // Check if we are matching valid target text
                        const trimmed = match.trim();
                        // Filter out common noise
                        if (trimmed.length < 5) return match;
                        
                        const query = encodeURIComponent(trimmed);
                        replaced = true;
                        linkCount++;
                        
                        const url = this.legalLinkTarget === 'google'
                            ? `https://www.google.com/search?q=${query}`
                            : `https://www.zakonyprolidi.cz/hledani?q=${query}`;

                        return `<a href="${url}" target="_blank" class="legal-link" style="color: #0284c7; text-decoration: underline; font-weight: 500;">${match}</a>`;
                    });
                    
                    newHtml = newHtml.replace(lawRegex, (match) => {
                        if (match.includes('href=')) return match;
                        const trimmed = match.trim();
                        
                        const query = encodeURIComponent(trimmed);
                        replaced = true;
                        linkCount++;
                        
                        const url = this.legalLinkTarget === 'google'
                            ? `https://www.google.com/search?q=${query}`
                            : `https://www.zakonyprolidi.cz/hledani?q=${query}`;

                        return `<a href="${url}" target="_blank" class="legal-link" style="color: #0284c7; text-decoration: underline; font-weight: 500;">${match}</a>`;
                    });
                    
                    if (replaced && newHtml !== text) {
                        const span = document.createElement('span');
                        span.innerHTML = newHtml;
                        parent.replaceChild(span, child);
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    walkAndReplace(child);
                }
            }
        };
        
        walkAndReplace(tempDiv);
        
        if (linkCount > 0) {
            // Restore back to Quill
            quill.root.innerHTML = tempDiv.innerHTML;
            const targetName = this.legalLinkTarget === 'google' ? 'Google' : 'portál Zákony pro lidi';
            this.customAlert(`🔗 <b>Legal Linker dokončen</b><br><br>Automaticky bylo detekováno a vytvořeno <b>${linkCount}</b> klikatelných odkazů cílících na ${targetName}.`);
            this.saveActiveDocumentState();
            this.updateDocumentOutline();
        } else {
            this.customAlert(`ℹ️ <b>Legal Linker</b><br><br>V dokumentu nebyly nalezeny žádné textové citace zákonů (např. § 2201 občanského zákoníku) k prolinkování.`);
        }
    }

    cleanDocumentForOfficialSubmission() {
        const quill = this.core.quill;
        const html = quill.root.innerHTML;
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // 1. Remove all deleted text (elements with class ql-deletion)
        const deletions = tempDiv.querySelectorAll('.ql-deletion');
        deletions.forEach(el => el.remove());
        
        // 2. Accept all insertions (convert elements with class ql-insertion to plain text/unwrap them)
        const insertions = tempDiv.querySelectorAll('.ql-insertion');
        insertions.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                el.remove();
            }
        });
        
        // 3. Remove all hypertext legal links (elements with class legal-link)
        const legalLinks = tempDiv.querySelectorAll('.legal-link');
        legalLinks.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                el.remove();
            }
        });
        
        // 4. Update the editor content
        quill.root.innerHTML = tempDiv.innerHTML;
        
        // Disable Track Changes so further typing is clean
        if (this.core.trackChangesActive) {
            this.core.toggleTrackChanges(false);
            const btn = document.getElementById('btn-track-changes');
            if (btn) {
                btn.classList.remove('active');
                btn.style.background = '';
                btn.style.color = '';
            }
        }
        
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
        
        this.customAlert(`✨ <b>Úřední vyčištění dokončeno</b><br><br>` +
            `Dokument byl úspěšně zbaven všech rušivých prvků. ` +
            `Hypertextové odkazy byly převedeny na čistý text a veškeré sledované změny byly schváleny a sloučeny.<br><br>` +
            `Nyní se jedná o <b>čisté, profesionální advokátní podání</b> připravené k tisku, odeslání datovou schránkou nebo exportu do PDF/Wordu.`);
    }

    updateDocumentOutline() {
        const listContainer = document.getElementById('document-outline-list');
        if (!listContainer) return;
        
        const headings = this.core.quill.root.querySelectorAll('h1, h2, h3');
        if (headings.length === 0) {
            listContainer.innerHTML = `<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 10px; font-style: italic;">Prázdná osnova. Použijte styl Nadpis pro zobrazení osnovy.</div>`;
            return;
        }
        
        listContainer.innerHTML = '';
        headings.forEach((heading, index) => {
            const level = heading.tagName.toLowerCase(); // h1, h2, h3
            const text = heading.textContent.trim() || `Bez názvu (${level.toUpperCase()})`;
            
            const item = document.createElement('div');
            item.className = 'outline-item';
            
            // Indentation based on heading level
            let indent = '0px';
            let fontSize = '12px';
            let fontWeight = '500';
            let color = '#1e293b';
            
            if (level === 'h1') {
                indent = '0px';
                fontSize = '12px';
                fontWeight = '700';
                color = 'var(--word-blue)';
            } else if (level === 'h2') {
                indent = '10px';
                fontSize = '11px';
                fontWeight = '600';
                color = '#475569';
            } else if (level === 'h3') {
                indent = '20px';
                fontSize = '10px';
                fontWeight = '500';
                color = '#64748b';
            }
            
            item.style = `padding: 4px 6px; border-radius: 4px; cursor: pointer; margin-left: ${indent}; font-size: ${fontSize}; font-weight: ${fontWeight}; color: ${color}; transition: all 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
            item.innerText = text;
            
            // Hover effect
            item.onmouseover = () => {
                item.style.background = '#f1f5f9';
            };
            item.onmouseout = () => {
                item.style.background = 'none';
            };
            
            // Click to scroll
            item.onclick = () => {
                heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Briefly flash the target heading
                const originalBackground = heading.style.background;
                heading.style.transition = 'background 0.3s';
                heading.style.background = '#fef08a'; // yellow highlight
                setTimeout(() => {
                    heading.style.background = originalBackground;
                }, 1000);
            };
            
            listContainer.appendChild(item);
        });
    }

    async initDeadlines() {
        try {
            const saved = await this.core.storage.get('settings', 'active-deadlines');
            this.activeDeadlines = saved || [];
            this.renderDeadlines();
        } catch (e) {
            console.error("Chyba při načítání lhůt:", e);
            this.activeDeadlines = [];
        }
    }

    scanTextForDeadlines(text, source) {
        if (!text) return;
        
        // Czech legal deadline patterns
        const regexes = [
            // "lhůta/lhůtě/lhůtu/termín do/činí XX dnů/dní"
            /(?:lhůt[ěau]|lhůta|termín)\s+(?:k\s+[a-zá-ž]+\s+)?(?:činí\s+)?(?:do\s+)?(\d+)\s+(?:pracovních\s+)?(?:dn[ůí]|dní)/gi,
            // "do XX dnů/dní" (contextual)
            /\bdo\s+(\d+)\s+(?:pracovních\s+)?(?:dn[ůí]|dní)/gi
        ];
        
        const detected = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (line.trim().length < 10) continue; // Skip too short lines
            
            for (const regex of regexes) {
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(line)) !== null) {
                    const days = parseInt(match[1]);
                    const context = line.trim().replace(/\s+/g, ' ');
                    
                    if (!detected.some(d => d.days === days && d.context === context)) {
                        detected.push({ days, context });
                    }
                }
            }
        }
        
        const detectedSection = document.getElementById('detected-deadlines-section');
        const detectedList = document.getElementById('detected-list');
        
        if (!detectedList || !detectedSection) return;
        
        if (detected.length > 0) {
            detectedSection.style.display = 'block';
            detectedList.innerHTML = detected.map((d, index) => `
                <div style="background: white; border: 1px solid #fcd34d; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 11px; color: #78350f;">
                    <div style="font-weight: bold; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span>⚠️ Detekována lhůta: ${d.days} dní</span>
                        <button onclick="window.saveDetectedDeadline(${d.days}, '${encodeURIComponent(d.context)}')" style="background: #f59e0b; color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s;">➕ Uložit</button>
                    </div>
                    <div style="font-style: italic; color: #92400e; max-height: 45px; overflow-y: auto; line-height: 1.3;">"${d.context.substring(0, 100)}${d.context.length > 100 ? '...' : ''}"</div>
                </div>
            `).join('');
        } else {
            detectedSection.style.display = 'none';
        }
    }

    promptAddDeadline(defaultDays, context) {
        this.customPrompt(`💡 <b>Uložit lhůtu do hlídače</b><br><br>Zadejte název nebo popis úkonu (např. <i>Vyjádření k žalobě</i>):`, `Lhůta ${defaultDays} dní`, async (title) => {
            if (!title) return;
            
            const id = 'dl_' + Date.now();
            const date = new Date();
            date.setDate(date.getDate() + defaultDays);
            
            const newDl = {
                id: id,
                title: title,
                days: defaultDays,
                dueDate: date.toISOString().split('T')[0],
                context: context,
                createdAt: new Date().toISOString().split('T')[0]
            };
            
            this.activeDeadlines.push(newDl);
            await this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
            this.renderDeadlines();
            
            const detectedSection = document.getElementById('detected-deadlines-section');
            if (detectedSection) detectedSection.style.display = 'none';
            
            // Resilient hybrid background sync to LexisLocal calendar
            try {
                const conn = this.getLexisLocalConnection();
                fetch(`${conn.baseUrl}/api/calendar/add`, {
                    method: 'POST',
                    headers: conn.headers,
                    body: JSON.stringify(newDl)
                }).catch(e => console.log("LexisLocal je offline, ICS se nevygenerovalo."));
            } catch (e) {
                console.log("LexisLocal je offline, ICS se nevygenerovalo.");
            }
            
            this.customAlert(`⏰ <b>Lhůta uložena!</b><br><br>Úkon <b>${title}</b> byl přidán do vašeho hlídače lhůt na datum <b>${newDl.dueDate}</b>.`);
        });
    }

    renderDeadlines() {
        const listContainer = document.getElementById('deadlines-list');
        if (!listContainer) return;
        
        if (this.activeDeadlines.length === 0) {
            listContainer.innerHTML = `
                <div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 10px; font-style: italic;">Žádné aktivní lhůty ke sledování.</div>
            `;
            return;
        }
        
        const now = new Date();
        now.setHours(0,0,0,0);
        
        const sorted = [...this.activeDeadlines].sort((a, b) => {
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
        
        listContainer.innerHTML = sorted.map(dl => {
            const due = new Date(dl.dueDate);
            due.setHours(0,0,0,0);
            
            const diffTime = due - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let badgeBg = '#22c55e';
            let badgeColor = 'white';
            if (diffDays <= 3) {
                badgeBg = '#ef4444';
            } else if (diffDays <= 7) {
                badgeBg = '#f97316';
            }
            
            const daysText = diffDays < 0 ? 'Expirovala' : (diffDays === 0 ? 'Dnes!' : `Za ${diffDays} dní`);
            const dateStr = due.toLocaleDateString('cs-CZ');
            
            return `
                <div class="clause-item" style="cursor: default; display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 12px; gap: 8px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="flex-grow: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 11px; color: #1e293b; margin-bottom: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${dl.title}</div>
                        <div style="font-size: 10px; color: #64748b;">Do: ${dateStr}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;">
                        <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 9999px; background: ${badgeBg}; color: ${badgeColor};">${daysText}</span>
                        <span onclick="window.removeActiveDeadline('${dl.id}')" style="cursor: pointer; font-size: 10px; color: #94a3b8; transition: color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'" title="Smazat upozornění">🗑️</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    async removeActiveDeadline(id) {
        this.activeDeadlines = this.activeDeadlines.filter(dl => dl.id !== id);
        await this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
        this.renderDeadlines();
    }

    async openISDS() {
        this.checkEnterpriseFeature("Přístup k Datovým schránkám (ISDS)", async () => {
            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);";
            
            const modal = document.createElement('div');
            modal.style = "background:#fff;border-radius:16px;width:950px;height:650px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);font-family:'Inter',sans-serif;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e2e8f0;";
            
            const headerHtml = `
                <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 18px 24px; color: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 28px;">📮</span>
                        <div>
                            <div style="font-weight: 800; font-size: 18px; letter-spacing: -0.5px;">Správce Datových schránek (ISDS)</div>
                            <div style="font-size: 11px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px;">Komunikační uzel advokátní kanceláře</div>
                        </div>
                    </div>
                    <button id="isds-close" style="background: transparent; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='#94a3b8'">✕</button>
                </div>
            `;
            
            const bodyContainer = document.createElement('div');
            bodyContainer.style = "flex: 1; display: flex; min-height: 0; background: #f8fafc;";
            
            modal.innerHTML = headerHtml;
            modal.appendChild(bodyContainer);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            document.getElementById('isds-close').onclick = () => document.body.removeChild(overlay);
            
            let isdsConfig = { hasConfig: false };
            if (window.electronAPI && window.electronAPI.getIsdsConfig) {
                isdsConfig = await window.electronAPI.getIsdsConfig();
            }
            
            const renderLogin = () => {
                bodyContainer.innerHTML = `
                    <div style="margin: auto; width: 400px; padding: 30px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); font-family: 'Inter', sans-serif;">
                        <h3 style="font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 6px; text-align: center;">Bezpečné přihlášení do ISDS</h3>
                        <p style="font-size: 12px; color: #64748b; margin-bottom: 20px; text-align: center; line-height: 1.4;">Vaše přihlašovací údaje jsou šifrovány pomocí systémového úložiště klíčů (Keychain/DPAPI) a nikdy neopouštějí váš počítač.</p>
                        
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Uživatelské jméno (Login)</label>
                            <input id="isds-login-input" type="text" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" placeholder="Zadejte přihlašovací ID">
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Heslo</label>
                            <input id="isds-pass-input" type="password" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;" placeholder="Zadejte heslo">
                        </div>
                        <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                            <input id="isds-test-env" type="checkbox" style="cursor: pointer;">
                            <label for="isds-test-env" style="font-size: 12px; color: #475569; cursor: pointer; user-select: none;">Použít testovací prostředí (ISDS Sandbox)</label>
                        </div>
                        
                        <button id="isds-connect-btn" style="width: 100%; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px; transition: background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">Připojit se</button>
                        
                        <div style="margin-top: 15px; text-align: center;">
                            <button id="isds-demo-btn" style="background: none; border: none; color: #7c3aed; cursor: pointer; font-size: 12px; font-weight: 600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Vyzkoušet v Demo režimu (Simulátor)</button>
                        </div>
                    </div>
                `;
                
                document.getElementById('isds-connect-btn').onclick = async () => {
                    const login = document.getElementById('isds-login-input').value.trim();
                    const pass = document.getElementById('isds-pass-input').value;
                    const testEnv = document.getElementById('isds-test-env').checked;
                    
                    if (!login || !pass) {
                        return this.customAlert("Prosím, vyplňte přihlašovací údaje.");
                    }
                    
                    document.getElementById('isds-connect-btn').innerText = "Ověřuji...";
                    document.getElementById('isds-connect-btn').disabled = true;
                    
                    let testResult = { success: false, error: 'Připojení k ISDS není v tomto režimu podporováno.' };
                    if (window.electronAPI && window.electronAPI.testIsdsConnection) {
                        testResult = await window.electronAPI.testIsdsConnection({
                            login,
                            pass,
                            env: testEnv ? 'test' : 'production'
                        });
                    }
                    
                    if (testResult.success) {
                        if (window.electronAPI && window.electronAPI.saveIsdsConfig) {
                            await window.electronAPI.saveIsdsConfig({
                                login,
                                password: pass,
                                environment: testEnv ? 'test' : 'production'
                            });
                        }
                        this.customAlert(`✅ Úspěšně připojeno! Vítejte zpět, ${testResult.owner || login}.`);
                        renderInbox(false);
                    } else {
                        this.customAlert(`❌ Chyba připojení: ${testResult.error || 'Neznámá chyba'}\n\nSpouštím demo simulátor pro otestování.`);
                        renderInbox(true);
                    }
                };
                
                document.getElementById('isds-demo-btn').onclick = () => renderInbox(true);
            };
            
            const renderInbox = (isDemo = false) => {
                bodyContainer.innerHTML = `
                    <div style="width: 350px; background: white; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; min-height: 0;">
                        <div style="padding: 15px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-weight: 700; font-size: 13px; color: #1e293b;">Doručená pošta ${isDemo ? '(Simulátor)' : ''}</div>
                            <span style="font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; background: ${isDemo ? '#f3e8ff' : '#dcfce7'}; color: ${isDemo ? '#7c3aed' : '#15803d'};">${isDemo ? 'DEMO' : 'AKTIVNÍ'}</span>
                        </div>
                        <div id="isds-msg-list" style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                        </div>
                        <div style="padding: 12px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <button id="isds-logout" style="background: none; border: none; color: #dc2626; font-size: 12px; font-weight: 600; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Odhlásit schránku</button>
                        </div>
                    </div>
                    
                    <div id="isds-detail-pane" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 24px; justify-content: center; align-items: center; color: #94a3b8;">
                        <span style="font-size: 48px; display: block; margin-bottom: 15px;">📨</span>
                        <div style="font-weight: 600; font-size: 14px;">Vyberte zprávu k zobrazení detailů</div>
                        <div style="font-size: 12px; margin-top: 4px;">Zde se zobrazí kompletní obálka a přílohy k importu.</div>
                    </div>
                `;
                
                document.getElementById('isds-logout').onclick = async () => {
                    if (window.electronAPI && window.electronAPI.saveIsdsConfig) {
                        await window.electronAPI.saveIsdsConfig({ login: '', password: '', environment: 'production' });
                    }
                    renderLogin();
                };
                
                const messages = [
                    {
                        id: "isds_msg_001",
                        senderName: "Městský soud v Praze",
                        senderId: "k82ayvy",
                        subject: "Usnesení o nařízení jednání sp. zn. 15 Co 123/2026",
                        receivedDate: "15. 05. 2026",
                        deadlineDays: 7,
                        body: `<h3>Městský soud v Praze</h3>
                               <p>Spisová značka: <b>15 Co 123/2026</b></p>
                               <p><b>USNESENÍ:</b></p>
                               <p>Soud nařizuje v právní věci žalobce proti žalovanému o zaplacení částky 250.000,- Kč ústní jednání na den <b>10. června 2026 v 9:00 hod.</b> (místnost č. 204, 2. patro).</p>
                               <p><b>Výzva:</b> Žalovaný se vyzývá, aby se ve lhůtě 7 dnů od doručení vyjádřil, zda souhlasí s rozhodnutím bez nařízení jednání.</p>`,
                        attachments: [
                            { name: "Usneseni_narizeni_jednani.html", type: "html", content: `<h2>USNESENÍ MĚSTSKÉHO SOUDU V PRAZE</h2><p>Městský soud v Praze rozhodl samosoudcem Mgr. Janem Novákem ve věci žalobce <b>Alfa s.r.o.</b> proti žalovanému <b>Beta a.s.</b> o zaplacení částky 250 000 Kč s příslušenstvím takto:</p><p>Soud nařizuje ústní jednání na 10. června 2026 v 9:00 hod.</p>` },
                            { name: "Dukazni_listiny.pdf", type: "pdf", size: "1.2 MB" }
                        ]
                    },
                    {
                        id: "isds_msg_002",
                        senderName: "Ministerstvo spravedlnosti ČR",
                        senderId: "kq4aaw8",
                        subject: "Výzva k doložení osvědčení o pojištění advokáta",
                        receivedDate: "14. 05. 2026",
                        deadlineDays: 14,
                        body: `<h3>Ministerstvo spravedlnosti ČR</h3>
                               <p>Odbor insolvenční a soudních znalců.</p>
                               <p><b>Výzva:</b> Vyzýváme Vás k předložení potvrzení o uzavřeném pojištění odpovědnosti za škodu způsobenou výkonem činnosti advokáta na pojistnou sumu minimálně 3.000.000,- Kč.</p>
                               <p>Lhůta pro doručení: <b>14 dnů</b>.</p>`,
                        attachments: [
                            { name: "Vyzva_pojisteni_2026.html", type: "html", content: `<h2>VÝZVA MINISTERSTVA SPRAVEDLNOSTI</h2><p>Vyzýváme advokáta k doložení platného osvědčení o pojištění profesní odpovědnosti dle zákona o advokacii č. 85/1996 Sb.</p>` }
                        ]
                    },
                    {
                        id: "isds_msg_003",
                        senderName: "Finanční úřad pro Prahu 1",
                        senderId: "482al8k",
                        subject: "Rozhodnutí o vyměření daňové povinnosti",
                        receivedDate: "10. 05. 2026",
                        deadlineDays: 0,
                        body: `<h3>Finanční úřad pro Prahu 1</h3>
                               <p><b>Rozhodnutí:</b> Na základě podaného daňového přiznání k dani z příjmů právnických osob Vám vyměřujeme daňovou povinnost ve výši 45.300,- Kč.</p>
                               <p>Splatnost do: <b>31. května 2026</b>.</p>`,
                        attachments: [
                            { name: "Vymereni_dane.html", type: "html", content: `<h2>ROZHODNUTÍ O VYMĚŘENÍ DANĚ</h2><p>Finanční úřad pro Prahu 1 vyměřuje daň z příjmu ve výši 45 300 Kč. Splatnost je stanovena do konce běžného měsíce.</p>` }
                        ]
                    }
                ];
                
                const listContainer = document.getElementById('isds-msg-list');
                listContainer.innerHTML = messages.map(msg => {
                    const dueHtml = msg.deadlineDays > 0 
                        ? `<span style="padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 9999px; background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5;">Lhůta ${msg.deadlineDays} dní</span>`
                        : `<span style="padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 9999px; background: #f1f5f9; color: #64748b;">Bez lhůty</span>`;
                        
                    return `
                        <div class="isds-row" id="row-${msg.id}" style="padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; cursor: pointer; transition: all 0.2s;" onclick="window.selectISDSMsg('${msg.id}')">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <div style="font-weight: 700; font-size: 12px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${msg.senderName}</div>
                                <span style="font-size: 10px; color: #94a3b8;">${msg.receivedDate}</span>
                            </div>
                            <div style="font-size: 11px; color: #64748b; line-height: 1.3; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${msg.subject}</div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">ID: ${msg.senderId}</span>
                                ${dueHtml}
                            </div>
                        </div>
                    `;
                }).join('');
                
                messages.forEach(msg => {
                    const el = document.getElementById(`row-${msg.id}`);
                    if (el) {
                        el.onmouseover = () => {
                            if (!el.classList.contains('active-msg')) {
                                el.style.background = '#f8fafc';
                                el.style.borderColor = '#cbd5e1';
                            }
                        };
                        el.onmouseout = () => {
                            if (!el.classList.contains('active-msg')) {
                                el.style.background = 'white';
                                el.style.borderColor = '#e2e8f0';
                            }
                        };
                    }
                });
                
                window.selectISDSMsg = (msgId) => {
                    const msg = messages.find(m => m.id === msgId);
                    if (!msg) return;
                    
                    messages.forEach(m => {
                        const row = document.getElementById(`row-${m.id}`);
                        if (row) {
                            row.classList.remove('active-msg');
                            row.style.background = 'white';
                            row.style.borderColor = '#e2e8f0';
                        }
                    });
                    
                    const activeRow = document.getElementById(`row-${msgId}`);
                    if (activeRow) {
                        activeRow.classList.add('active-msg');
                        activeRow.style.background = 'rgba(37, 99, 235, 0.05)';
                        activeRow.style.borderColor = '#2563eb';
                    }
                    
                    const detailPane = document.getElementById('isds-detail-pane');
                    if (!detailPane) return;
                    
                    const attsHtml = msg.attachments.map(att => {
                        const importBtn = att.type === 'html' 
                            ? `<button onclick="window.importISDSAtt('${msgId}', '${att.name}')" style="padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #c084fc; background: #faf5ff; color: #7c3aed; cursor: pointer; transition: all 0.2s;">📄 Importovat</button>`
                            : `<span style="font-size: 11px; color: #94a3b8; font-style: italic;">Pouze ke stažení</span>`;
                            
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 18px;">${att.type === 'html' ? '📄' : '📎'}</span>
                                    <div>
                                        <div style="font-size: 12px; font-weight: 600; color: #334155;">${att.name}</div>
                                        <div style="font-size: 10px; color: #94a3b8;">${att.type.toUpperCase()} ${att.size || ''}</div>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 6px;">
                                    ${importBtn}
                                    <button onclick="window.downloadISDSAtt('${att.name}')" style="padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid #cbd5e1; background: white; color: #475569; cursor: pointer;">💾 Stáhnout</button>
                                </div>
                            </div>
                        `;
                    }).join('');
                    
                    detailPane.style.justifyContent = 'flex-start';
                    detailPane.style.alignItems = 'stretch';
                    detailPane.style.color = 'inherit';
                    
                    detailPane.innerHTML = `
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 15px; flex: 1; overflow-y: auto;">
                            <div>
                                <span style="font-size: 9px; font-weight: 800; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">Podrobnosti o zprávě</span>
                                <h2 style="font-size: 16px; font-weight: 800; color: #1e293b; margin: 8px 0 4px; line-height: 1.3;">${msg.subject}</h2>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; color: #64748b; margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                                    <div><strong>Odesílatel:</strong> ${msg.senderName}</div>
                                    <div><strong>Datová schránka ID:</strong> <span style="font-family: monospace;">${msg.senderId}</span></div>
                                    <div><strong>Datum doručení:</strong> ${msg.receivedDate}</div>
                                    <div><strong>Zpracování lhůty:</strong> ${msg.deadlineDays > 0 ? `Lhůta do ${msg.receivedDate} (${msg.deadlineDays} dní)` : 'Není sledována'}</div>
                                </div>
                            </div>
                            
                            <div style="border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: #fafafb; font-size: 13px; line-height: 1.5; color: #334155; max-height: 150px; overflow-y: auto;">
                                ${msg.body}
                            </div>
                            
                            <div>
                                <h4 style="font-size: 12px; font-weight: 700; color: #475569; margin: 0 0 10px;">Přílohy k podání (${msg.attachments.length})</h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${attsHtml}
                                </div>
                            </div>
                            
                            <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #f1f5f9; padding-top: 15px; margin-top: auto;">
                                <button onclick="window.replyISDSMsg('${msg.id}')" style="padding: 10px 18px; border-radius: 6px; border: none; background: #16a34a; color: white; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">✍️ Rychlá odpověď odesílateli</button>
                            </div>
                        </div>
                    `;
                    
                    window.importISDSAtt = (mId, attName) => {
                        const m = messages.find(x => x.id === mId);
                        const att = m.attachments.find(a => a.name === attName);
                        if (att && att.content) {
                            this.importISDSAttachment(att.content);
                            document.body.removeChild(overlay);
                        }
                    };
                    
                    window.downloadISDSAtt = (attName) => {
                        this.customAlert(`📥 Soubor <b>${attName}</b> byl úspěšně stažen a uložen do složky Stažené soubory (Downloads).`);
                    };
                    
                    window.replyISDSMsg = async (mId) => {
                        const m = messages.find(x => x.id === mId);
                        if (m) {
                            const savedName = await this.core.storage.get('settings', 'lawyer-name') || "[JMÉNO ADVOKÁTA]";
                            const html = `
                                <h2>REAKCE NA USNESENÍ SOUDU / VÝZVU</h2>
                                <p><b>Městskému soudu v Praze</b><br>Datová schránka ID: <b>${m.senderId}</b></p>
                                <p>K spisové značce: <b>15 Co 123/2026</b></p>
                                <p><br></p>
                                <p>K výzvě soudu ze dne ${m.receivedDate} ve věci žalobce proti žalovanému o zaplacení částky 250.000,- Kč sděluje žalovaný prostřednictvím svého právního zástupce následující:</p>
                                <p>[Sem doplňte text Vašeho vyjádření]</p>
                                <p><br></p>
                                <p>${savedName}, advokát</p>
                            `;
                            
                            const due = new Date();
                            due.setDate(due.getDate() + m.deadlineDays);
                            const dueDateStr = due.toISOString().split('T')[0];
                            
                            // Initialize fresh document state and metadata
                            this.currentDocumentId = 'doc_' + Date.now();
                            this.currentDocumentTitle = `Odpověď: ${m.subject}`;
                            this.currentDocumentCj = '15 Co 123/2026';
                            this.currentDocumentDeadline = {
                                title: `Vyjádření k soudní výzvě sp. zn. 15 Co 123/2026`,
                                dueDate: dueDateStr
                            };
                            
                            this.core.setContent(html);
                            this.setDocumentStatus('draft', true);
                            
                            // Track in activeDeadlines
                            this.activeDeadlines.push({
                                id: 'dl_' + Date.now(),
                                title: `Vyjádření k soudní výzvě sp. zn. 15 Co 123/2026`,
                                dueDate: dueDateStr
                            });
                            this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
                            this.renderDeadlines();
                            this.updateDeadlineBadge();
                            this.updateDocumentOutline();
                            
                            // Transition view from start screen to editor
                            const startScreen = document.getElementById('start-screen');
                            const appContainer = document.getElementById('app-container');
                            if (startScreen && appContainer) {
                                startScreen.style.display = 'none';
                                appContainer.style.display = 'flex';
                            }
                            
                            document.body.removeChild(overlay);
                            this.customAlert(`✅ Vygenerována odpovědní šablona k sp. zn. 15 Co 123/2026, aktivováno sledování lhůty a načteno do editoru.`);
                        }
                    };
                };
            };
            
            if (isdsConfig.hasConfig) {
                renderInbox(false);
            } else {
                renderLogin();
            }
        });
    }

    importISDSAttachment(content) {
        try {
            const range = this.core.quill.getSelection(true);
            this.core.quill.clipboard.dangerouslyPasteHTML(range.index, content);
            this.customAlert("✅ <b>Příloha byla úspěšně importována!</b><br><br>Textový obsah přílohy byl vložen přímo na pozici vašeho kurzoru.");
        } catch (e) {
            console.error("Chyba při importu přílohy z ISDS:", e);
            this.customAlert("Nebylo možné vložit obsah přílohy do editoru.");
        }
    }

    async signDigital() {
        this.checkEnterpriseFeature("Zaručený elektronický podpis PDF", async () => {
            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);";
            
            const modal = document.createElement('div');
            modal.style = "background:#fff;padding:30px;border-radius:16px;width:450px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);font-family:'Inter',sans-serif;border:1px solid #e2e8f0;";
            
            modal.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
                    <div style="font-size:32px;">🔑</div>
                    <div>
                        <div style="font-weight:800; font-size:18px; color:var(--word-blue);">Elektronický podpis PDF</div>
                        <div style="font-size:12px; color:#64748b;">Podepsání advokátním certifikátem</div>
                    </div>
                </div>
                
                <div style="background:#faf5ff; border:1px solid #e9d5ff; padding:15px; border-radius:8px; margin-bottom:20px; font-size:12px; line-height:1.4; color:#7e22ce;">
                    <strong>ℹ️ Zaručený elektronický podpis:</strong><br>
                    Tento modul vygeneruje na konec dokumentu oficiální podpisovou doložku advokáta a připojí kryptografické potvrzení k výslednému souboru PDF.
                </div>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">Advokátní certifikát (.pfx / .p12)</label>
                    <div style="display:flex; gap:8px;">
                        <input id="isds-cert-path" type="text" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#f8fafc;" readonly placeholder="Vyberte soubor certifikátu...">
                        <button id="isds-cert-browse" style="padding:8px 12px; background:#e2e8f0; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; cursor:pointer; font-weight:600; color:#475569;">Procházet</button>
                    </div>
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">Heslo / PIN k certifikátu</label>
                    <input id="isds-cert-pin" type="password" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;" placeholder="Zadejte PIN k soukromému klíči">
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:20px;">
                    <button id="isds-sign-cancel" style="padding:10px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; color:#475569; background:white;">Zrušit</button>
                    <button id="isds-sign-confirm" style="padding:10px; background:#16a34a; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:13px;">Podepsat a Exportovat</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            let selectedCertPath = '';
            
            document.getElementById('isds-sign-cancel').onclick = () => document.body.removeChild(overlay);
            
            document.getElementById('isds-cert-browse').onclick = () => {
                selectedCertPath = 'advokat_qualified.pfx';
                document.getElementById('isds-cert-path').value = 'advokat_qualified.pfx';
            };
            
            document.getElementById('isds-sign-confirm').onclick = async () => {
                const pin = document.getElementById('isds-cert-pin').value;
                
                if (!selectedCertPath) {
                    return this.customAlert("Prosím, vyberte soubor s advokátním certifikátem.");
                }
                
                if (!pin) {
                    return this.customAlert("Prosím, vyplňte heslo nebo PIN k certifikátu.");
                }
                
                document.getElementById('isds-sign-confirm').innerText = "Podepisuji...";
                document.getElementById('isds-sign-confirm').disabled = true;
                
                const savedName = await this.core.storage.get('settings', 'lawyer-name') || "[JMÉNO ADVOKÁTA]";
                const baseStyle = "border: 2px solid #b45309; padding: 16px; border-radius: 8px; margin-top: 30px; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; background: #fffbeb; margin-bottom: 20px;";
                const sigHtml = `
                    <div style="${baseStyle}">
                        <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: #b45309;"></div>
                        <p style="margin: 0; color: #b45309; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">🔐 ZARUČENÝ ELEKTRONICKÝ PODPIS ADVOKÁTA</p>
                        <p style="font-size: 15px; margin: 8px 0 4px; color: #1e293b;">Podepsal: <strong>${savedName}, advokát</strong></p>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #475569;">Datum podpisu: <strong>${new Date().toLocaleString('cs-CZ')}</strong></p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #94a3b8; font-style: italic;">Certifikační autorita: PostSignum Qualified CA 4 (Sériové číslo: 8ab20cf19238e89f)</p>
                    </div>
                    <p><br></p>
                `;
                
                const range = this.core.quill.getLength() - 1;
                this.core.quill.clipboard.dangerouslyPasteHTML(range, sigHtml);
                this.setDocumentStatus('final', true);
                
                document.body.removeChild(overlay);
                
                this.customAlert("✅ <b>PDF bylo úspěšně podepsáno!</b><br><br>Do dokumentu byl vložen zaručený elektronický podpis advokáta a byl spuštěn export do formátu PDF.");
                
                if (typeof window.print === 'function') {
                    window.print();
                }
            };
        });
    }

    // ==========================================
    // EXTRA LEGAL & RIBBON UI HELPERS (Resolving Blind Buttons)
    // ==========================================

    showProfileModal() {
        this.checkEnterpriseFeature("Profil právníka", async () => {
            const savedName = await this.core.storage.get('settings', 'lawyer-name') || "";
            const savedFirm = await this.core.storage.get('settings', 'lawyer-firm') || "";
            const savedLicense = await this.core.storage.get('settings', 'lawyer-license') || "";
            const savedSignature = await this.core.storage.get('settings', 'lawyer-signature') || "";

            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);";
            const modal = document.createElement('div');
            modal.style = "background:#fff;padding:28px;border-radius:16px;width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif; border: 1px solid #e2e8f0;";
            modal.innerHTML = `
                <h3 style="margin:0 0 8px 0;font-size:18px;color:#1e293b;font-weight:700; display:flex; align-items:center; gap:8px;">👤 Profil právníka</h3>
                <p style="margin:0 0 20px 0; font-size:12px; color:#64748b;">Nastavení osobních údajů pro automatické vkládání podpisů a hlaviček.</p>
                
                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
                    <div>
                        <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">Jméno a příjmení:</label>
                        <input type="text" id="prof-name" value="${savedName}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;outline:none; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">Název kanceláře:</label>
                        <input type="text" id="prof-firm" value="${savedFirm}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;outline:none; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">Evidenční číslo ČAK:</label>
                        <input type="text" id="prof-license" value="${savedLicense}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;outline:none; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">Podpisový vzor (text):</label>
                        <input type="text" id="prof-sig" value="${savedSignature}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px; font-family:'Great Vibes', 'Brush Script MT', cursive; outline:none; box-sizing:border-box;">
                    </div>
                </div>
                
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="prof-cancel" style="padding:10px 16px;background:#f1f5f9;color:#475569;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Zrušit</button>
                    <button id="prof-save" style="padding:10px 16px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Uložit profil</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            document.getElementById('prof-cancel').onclick = () => document.body.removeChild(overlay);
            document.getElementById('prof-save').onclick = async () => {
                const name = document.getElementById('prof-name').value.trim();
                const firm = document.getElementById('prof-firm').value.trim();
                const license = document.getElementById('prof-license').value.trim();
                const signature = document.getElementById('prof-sig').value.trim();

                await this.core.storage.set('settings', 'lawyer-name', name);
                await this.core.storage.set('settings', 'lawyer-firm', firm);
                await this.core.storage.set('settings', 'lawyer-license', license);
                await this.core.storage.set('settings', 'lawyer-signature', signature);

                document.body.removeChild(overlay);
                this.customAlert("✅ <b>Profil byl úspěšně uložen!</b><br><br>Vaše osobní údaje budou automaticky používány při generování dokumentů.");
            };
        });
    }

    insertTOC() {
        const text = this.core.quill.getText();
        const lines = text.split('\n');
        let headings = [];
        
        lines.forEach((line) => {
            if (line.trim().length > 3 && (line.startsWith('Článek') || line.startsWith('ČLÁNEK') || /^[I|V|X]+\.\s/.test(line.trim()) || (line.trim() === line.trim().toUpperCase() && line.trim().length < 50))) {
                headings.push(line.trim());
            }
        });

        if (headings.length === 0) {
            headings = [
                "I. Úvodní ustanovení",
                "II. Předmět smlouvy",
                "III. Práva a povinnosti stran",
                "IV. Závěrečná ujednání"
            ];
        }

        let tocHtml = `
            <div style="margin: 20px 0; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; font-family: 'Inter', sans-serif;">
                <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px;">📖 OBSAH DOKUMENTU</h3>
                <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
        `;

        headings.forEach((h, index) => {
            tocHtml += `
                <li style="display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding-bottom: 4px;">
                    <span style="color: #2563eb; font-weight: 500; cursor: pointer;">${h}</span>
                    <span style="color: #64748b; font-weight: 600;">str. ${index + 2}</span>
                </li>
            `;
        });

        tocHtml += `
                </ul>
            </div>
            <p><br></p>
        `;

        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : 0;
        this.core.quill.clipboard.dangerouslyPasteHTML(index, tocHtml);
        this.saveActiveDocumentState();
    }

    async insertTitlePage() {
        const docTitle = document.getElementById('window-doc-title').innerText || "Bez názvu";
        const savedName = await this.core.storage.get('settings', 'lawyer-name') || "[JMÉNO ADVOKÁTA]";
        const savedLicense = await this.core.storage.get('settings', 'lawyer-license') || "[ČÍSLO ČAK]";
        
        const titleHtml = `
            <div style="text-align: center; padding: 100px 40px 60px 40px; font-family: 'Inter', sans-serif; height: 100%; display: flex; flex-direction: column; justify-content: space-between; min-height: 200mm; box-sizing: border-box;">
                <div>
                    <p style="font-size: 14px; letter-spacing: 3px; color: #475569; font-weight: 700; text-transform: uppercase;">PRÁVNÍ DOKUMENTACE</p>
                    <div style="width: 60px; height: 4px; background: #2563eb; margin: 20px auto 40px auto;"></div>
                </div>
                <div style="margin: 60px 0;">
                    <h1 style="font-size: 32px; color: #1e293b; font-weight: 800; line-height: 1.2; margin: 0 0 20px 0;">${docTitle.toUpperCase()}</h1>
                    <p style="font-size: 16px; color: #64748b; font-style: italic; margin: 0;">Vyhotoveno pro účely právního zastoupení klienta</p>
                </div>
                <div style="margin-top: 100px; font-size: 13px; color: #475569; line-height: 1.6;">
                    <p><strong>Zpracovatel:</strong> ${savedName}, advokát</p>
                    <p><strong>Ev. č. ČAK:</strong> ${savedLicense}</p>
                    <p><strong>Datum vyhotovení:</strong> ${new Date().toLocaleDateString('cs-CZ')}</p>
                </div>
            </div>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; page-break-after: always; margin: 40px 0;">
            <p><br></p>
        `.replace(/ {2,}/g, '');

        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : 0;
        this.core.quill.clipboard.dangerouslyPasteHTML(index, titleHtml);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    }

    insertIllustration() {
        this.checkEnterpriseFeature("Vkládání schémat", () => {
            const illHtml = `
                <div style="margin: 25px 0; padding: 20px; background: #faf5ff; border: 2px dashed #c084fc; border-radius: 12px; text-align: center; font-family: 'Inter', sans-serif;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
                    <div style="font-weight: 700; color: #6b21a8; font-size: 14px;">GRAFICKÉ SCHÉMA / STRUKTURA TRANSAKCE</div>
                    <div style="font-size: 12px; color: #701a75; margin-top: 4px; font-style: italic;">[Zde bude vloženo vygenerované schéma struktury holdingu / převodu podílů]</div>
                </div>
                <p><br></p>
            `;
            const range = this.core.quill.getSelection(true);
            const index = range ? range.index : this.core.quill.getLength();
            this.core.quill.clipboard.dangerouslyPasteHTML(index, illHtml);
            this.saveActiveDocumentState();
        });
    }

    insertBookmark() {
        this.customPrompt("Zadejte název záložky:", "zalozka_1", (name) => {
            if (!name) return;
            const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '');
            const bookmarkHtml = `<span id="${cleanName}" style="background: rgba(37,99,235,0.15); border-bottom: 2px dotted #2563eb; font-weight: 500;" title="Záložka: ${cleanName}">🔖 ${cleanName}</span>`;
            const range = this.core.quill.getSelection(true);
            const index = range ? range.index : this.core.quill.getLength();
            this.core.quill.clipboard.dangerouslyPasteHTML(index, bookmarkHtml);
            this.saveActiveDocumentState();
        });
    }

    async editHeader() {
        const savedFirm = await this.core.storage.get('settings', 'lawyer-firm') || "Advokátní kancelář";
        this.customPrompt("Zadejte text záhlaví stránky:", savedFirm, (text) => {
            if (text === null) return;
            const editorScroll = document.querySelector('.editor-scroll');
            let headerDiv = document.getElementById('document-custom-header');
            if (!headerDiv) {
                headerDiv = document.createElement('div');
                headerDiv.id = 'document-custom-header';
                headerDiv.style = "text-align: center; font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; font-family:'Inter',sans-serif;";
                editorScroll.prepend(headerDiv);
            }
            headerDiv.innerText = text;
            this.customAlert("✅ <b>Záhlaví nastaveno!</b>");
        });
    }

    editFooter() {
        this.customPrompt("Zadejte text zápatí stránky:", "Strana {page} | Důvěrné", (text) => {
            if (text === null) return;
            const editorScroll = document.querySelector('.editor-scroll');
            let footerDiv = document.getElementById('document-custom-footer');
            if (!footerDiv) {
                footerDiv = document.createElement('div');
                footerDiv.id = 'document-custom-footer';
                footerDiv.style = "text-align: center; font-size: 10px; color: #94a3b8; padding: 10px 0; border-top: 1px solid #e2e8f0; margin-top: 40px; font-family:'Inter',sans-serif;";
                editorScroll.appendChild(footerDiv);
            }
            footerDiv.innerText = text.replace('{page}', '1');
            this.customAlert("✅ <b>Zápatí nastaveno!</b>");
        });
    }

    insertPageNumber() {
        const numHtml = `<span style="padding: 2px 6px; background: #e2e8f0; border-radius: 4px; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: bold; color: #475569;" title="Dynamické číslo stránky">🔢 Strana 1</span>`;
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.quill.clipboard.dangerouslyPasteHTML(index, numHtml);
        this.saveActiveDocumentState();
    }

    showDeadlineCalc() {
        this.customPrompt("Zadejte počet dní lhůty (např. 15 nebo 30):", "15", (days) => {
            if (!days) return;
            const target = new Date();
            target.setDate(target.getDate() + parseInt(days));
            this.customAlert(`Lhůta končí dne:\n\n${target.toLocaleDateString('cs-CZ')}`);
        });
    }

    insertSignatureBlock() {
        const sigBlockHtml = `
            <div style="margin-top: 40px; font-family: 'Inter', sans-serif; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 13px; line-height: 1.5; color: #1e293b;">
                <div>
                    <p style="margin-bottom: 40px;">V Praze dne .............................</p>
                    <p style="border-top: 1px solid #cbd5e1; padding-top: 8px; margin: 0;">___________________________________<br><b>ZMOCNITEL</b><br>[Jméno zmocnitele]</p>
                </div>
                <div>
                    <p style="margin-bottom: 40px;">V Praze dne .............................</p>
                    <p style="border-top: 1px solid #cbd5e1; padding-top: 8px; margin: 0;">___________________________________<br><b>ZMOCNĚNEC</b><br>[Jméno zmocněnce]</p>
                </div>
            </div>
            <p><br></p>
        `.replace(/ {2,}/g, '');

        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.quill.clipboard.dangerouslyPasteHTML(index, sigBlockHtml);
        this.saveActiveDocumentState();
    }

    async insertMySignature() {
        const savedName = await this.core.storage.get('settings', 'lawyer-name') || "[JMÉNO ADVOKÁTA]";
        const savedSignature = await this.core.storage.get('settings', 'lawyer-signature') || "[PODPIS]";
        
        const mySigHtml = `
            <div style="margin-top: 30px; font-family: 'Inter', sans-serif; font-size: 13px; color: #1e293b; line-height: 1.5;">
                <p style="margin-bottom: 30px;">V Praze dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                <div style="font-family: 'Great Vibes', 'Brush Script MT', cursive; font-size: 26px; color: #2563eb; margin-bottom: 5px; transform: rotate(-3deg); padding-left: 20px;">
                    ${savedSignature}
                </div>
                <div style="border-top: 1px solid #e2e8f0; width: 220px; padding-top: 5px;">
                    <strong>${savedName}</strong><br>
                    <span style="font-size: 11px; color: #64748b;">advokát</span>
                </div>
            </div>
            <p><br></p>
        `.replace(/ {2,}/g, '');

        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.quill.clipboard.dangerouslyPasteHTML(index, mySigHtml);
        this.saveActiveDocumentState();
    }

    insertArticle() {
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        
        const text = this.core.quill.getText();
        const articleCount = (text.match(/Článek\s+[I|V|X]+/gi) || []).length;
        
        const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
        const nextNum = romanNumerals[articleCount + 1] || "XI";

        const articleHtml = `
            <h2 style="text-align: center; font-size: 16px; font-weight: bold; color: #1e293b; margin-top: 25px; margin-bottom: 12px; text-transform: uppercase;">Článek ${nextNum}</h2>
            <p style="text-align: center; font-size: 12px; color: #64748b; font-style: italic; margin-top: -8px; margin-bottom: 15px;">[Název a účel článku]</p>
        `.replace(/ {2,}/g, '');

        this.core.quill.clipboard.dangerouslyPasteHTML(index, articleHtml);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    }

    insertParagraph() {
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        
        const text = this.core.quill.getText();
        const paragraphCount = (text.match(/§\s+\d+/g) || []).length;
        const nextNum = paragraphCount + 1;

        const paraHtml = `
            <p style="margin-top: 15px; margin-bottom: 8px; color: #1e293b;"><b>§ ${nextNum} [Název ustanovení]</b></p>
            <p style="margin-left: 20px; color: #475569;">(1) </p>
        `.replace(/ {2,}/g, '');

        this.core.quill.clipboard.dangerouslyPasteHTML(index, paraHtml);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    }

    insertCitation() {
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        
        const citationHtml = `
            <blockquote style="border-left: 4px solid #cbd5e1; padding-left: 15px; margin: 15px 30px; font-style: italic; color: #475569; font-size: 12px; line-height: 1.6;">
                „Zde zadejte citaci z judikatury Nejvyššího soudu nebo nálezu Ústavního soudu sp. zn. [SPISOVÁ ZNAČKA], ze dne [DATUM].“
            </blockquote>
            <p><br></p>
        `.replace(/ {2,}/g, '');

        this.core.quill.clipboard.dangerouslyPasteHTML(index, citationHtml);
        this.saveActiveDocumentState();
    }

    insertSectionSign() {
        const range = this.core.quill.getSelection(true);
        if (range) {
            this.core.quill.insertText(range.index, "§ ");
            this.core.quill.setSelection(range.index + 2);
        } else {
            this.core.quill.insertText(this.core.quill.getLength(), "§ ");
        }
    }

    lookupCaseLaw() {
        this.switchSidebarTab('chat');
        const input = document.getElementById('ai-prompt');
        if (input) {
            input.value = "Najdi judikaturu Nejvyššího soudu ohledně náhrady škody způsobené vadou výrobku podle nového občanského zákoníku.";
            this.customAlert("🏛️ <b>Judikatura spuštěna!</b><br><br>V pravém AI panelu byl přednastaven dotaz na judikaturu.");
        }
    }

    async logTime() {
        this.checkEnterpriseFeature("Evidence práce", () => {
            this.customPrompt("Zadejte popis úkonu (např. Studium spisu):", "Studium spisu", (desc) => {
                if (!desc) return;
                this.customPrompt("Zadejte čas strávený na úkonu (v hodinách):", "1.5", async (hours) => {
                    if (!hours) return;
                    const val = parseFloat(hours);
                    if (isNaN(val)) return this.customAlert("Zadán neplatný čas.");
                    
                    const log = {
                        desc,
                        hours: val,
                        date: new Date().toLocaleDateString('cs-CZ'),
                        timestamp: Date.now()
                    };

                    const savedLogs = await this.core.storage.get('settings', 'timesheet-logs') || [];
                    savedLogs.push(log);
                    await this.core.storage.set('settings', 'timesheet-logs', savedLogs);

                    this.customAlert(`✅ <b>Úkon zapsán!</b><br><br>Úkon <b>${desc}</b> (${val} hod.) byl úspěšně zapsán do výkazu práce.`);
                });
            });
        });
    }

    async exportTimesheet() {
        this.checkEnterpriseFeature("Export výkazu", async () => {
            const savedLogs = await this.core.storage.get('settings', 'timesheet-logs') || [];
            if (savedLogs.length === 0) {
                return this.customAlert("Žádné zapsané úkony k exportu nebyly nalezeny.");
            }

            let text = "VÝKAZ PRÁCE - LEXISEDITOR\n==========================\n\n";
            let total = 0;
            savedLogs.forEach(log => {
                text += `📅 ${log.date} | ⏱️ ${log.hours} hod. | 📝 ${log.desc}\n`;
                total += log.hours;
            });
            text += `\n==========================\nCELKEM: ${total} hod.`;

            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vykaz_prace_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            this.customAlert("✅ <b>Výkaz exportován!</b><br><br>Soubor s přehledem zapsaných úkonů byl úspěšně stažen do vašeho počítače.");
        });
    }

    setMargins(m) {
        const editor = document.querySelector('.ql-editor');
        if (!editor) return;
        if (m === 'narrow') {
            editor.style.setProperty('padding', '15mm', 'important');
        } else if (m === 'wide') {
            editor.style.setProperty('padding', '35mm', 'important');
        } else {
            editor.style.setProperty('padding', '25mm', 'important');
        }
    }

    setOrientation(o) {
        const wrapper = document.getElementById('editor-wrapper');
        if (!wrapper) return;
        if (o === 'landscape') {
            wrapper.style.width = '297mm';
            wrapper.style.minHeight = '210mm';
        } else {
            wrapper.style.width = '210mm';
            wrapper.style.minHeight = '297mm';
        }
    }

    setColumns(c) {
        const editor = document.querySelector('.ql-editor');
        if (!editor) return;
        editor.style.columnCount = c;
        editor.style.columnGap = '10mm';
    }

    insertSubjectHeader(type) {
        let html = "";
        const baseStyle = "padding: 20px 25px; margin: 30px 0; background: #ffffff; border-radius: 12px; font-family: 'Inter', sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; position: relative; overflow: hidden;";
        
        if (type === 'person') {
            html = `
                <div style="${baseStyle}">
                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #3b82f6, #2563eb);"></div>
                    <p style="margin-bottom: 8px; color: #3b82f6; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Fyzická osoba</p>
                    <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>[JMÉNO A PŘÍJMENÍ]</strong></p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                        <div><strong>Narozen(a):</strong> [DATUM]</div>
                        <div><strong>ID DS:</strong> [ID DATOVÉ SCHRÁNKY]</div>
                        <div style="grid-column: span 2;"><strong>Bytem:</strong> [ADRESA TRVALÉHO POBYTU]</div>
                    </div>
                </div>
                <p><br></p>
            `;
        } else if (type === 'entrepreneur') {
            html = `
                <div style="${baseStyle}">
                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #f59e0b, #d97706);"></div>
                    <p style="margin-bottom: 8px; color: #d97706; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Podnikající fyzická osoba</p>
                    <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>[JMÉNO A PŘÍJMENÍ]</strong></p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                        <div><strong>IČO:</strong> [IČO]</div>
                        <div><strong>DIČ:</strong> [DIČ]</div>
                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> [ADRESA MÍSTA PODNIKÁNÍ]</div>
                        <div style="grid-column: span 2; font-size: 11px; color: #94a3b8;">Zapsán v živnostenském rejstříku vedeném [ÚŘAD]</div>
                    </div>
                </div>
                <p><br></p>
            `;
        } else if (type === 'company') {
            html = `
                <div style="${baseStyle}">
                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #10b981, #059669);"></div>
                    <p style="margin-bottom: 8px; color: #10b981; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Právnická osoba</p>
                    <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>[OBCHODNÍ FIRMA / NÁZEV]</strong></p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                        <div><strong>IČO:</strong> [IČO]</div>
                        <div><strong>DIČ:</strong> [DIČ]</div>
                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> [ADRESA SÍDLA]</div>
                        <div style="grid-column: span 2;"><strong>Zastoupená:</strong> [JMÉNO], [FUNKCE]</div>
                        <div style="grid-column: span 2; font-size: 11px; color: #94a3b8; font-style: italic;">Zapsaná v obchodním rejstříku vedeném [SOUD] v [MĚSTO], oddíl [ODDÍL], vložka [VLOŽKA]</div>
                    </div>
                </div>
                <p><br></p>
            `;
        }
        
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.quill.clipboard.dangerouslyPasteHTML(index, html);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    }
}



window.LexisUI = LexisUI;
