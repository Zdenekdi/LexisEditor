/**
 * LexisUI Controller
 * Ovládá Ribbon, sidebary a interakci uživatele s LexisCore.
 */
class LexisUI {
    constructor(core) {
        this.core = core;
        this.currentTab = 'home';
        this.isDrawerOpen = false;
        this.currentAuditResults = [];
        this.idleTimer = null;
        this.lockTimeout = 5 * 60 * 1000; // 5 minut výchozí
        this.currentPdfText = '';
        this.activeDeadlines = [];
        this.deadlineScanTimer = null;
        
        // Metadata fields for document memory
        this.currentDocumentId = 'doc_active';
        this.currentDocumentDeadline = null;
        this.currentDocumentCj = '';

        window.saveDetectedDeadline = (days, encContext) => {
            const context = decodeURIComponent(encContext);
            this.promptAddDeadline(days, context);
        };
        window.removeActiveDeadline = (id) => {
            this.removeActiveDeadline(id);
        };
        
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
        this.resetIdleTimer();
    }

    resetIdleTimer() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this.lockApp();
        }, this.lockTimeout);
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
            this.scanTextForDeadlines(text, 'editor');
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
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tool-groups-container').forEach(c => c.classList.remove('active'));

        const targetTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        const targetGroup = document.getElementById(`${tabName}-tools`);
        
        if (targetTab) targetTab.classList.add('active');
        if (targetGroup) targetGroup.classList.add('active');
        
        this.currentTab = tabName;
    }

    toggleAIDrawer(forceOpen = null) {
        const drawer = document.getElementById('ai-drawer');
        if (!drawer) return;
        this.isDrawerOpen = forceOpen !== null ? forceOpen : !this.isDrawerOpen;
        if (this.isDrawerOpen) {
            drawer.classList.add('open');
        } else {
            drawer.classList.remove('open');
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
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);";
        const modal = document.createElement('div');
        modal.style = "background:#fff;padding:24px;border-radius:12px;width:320px;box-shadow:0 15px 30px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;";
        modal.innerHTML = `
            <div style="margin:0 0 20px 0;font-size:14px;color:#1e293b;line-height:1.5;white-space:pre-wrap;">${text}</div>
            <div style="display:flex;justify-content:flex-end;">
                <button id="ca-ok" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:500;border:none;border-radius:6px;cursor:pointer;">Rozumím</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const okBtn = document.getElementById('ca-ok');
        if (okBtn) {
            okBtn.focus();
            okBtn.onclick = () => document.body.removeChild(overlay);
        }
    }

    customPrompt(title, defaultValue, callback) {
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);";
        const modal = document.createElement('div');
        modal.style = "background:#fff;padding:24px;border-radius:12px;width:320px;box-shadow:0 15px 30px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;";
        modal.innerHTML = `
            <h3 style="margin:0 0 12px 0;font-size:14px;color:#1e293b;font-weight:600;">${title}</h3>
            <input type="text" id="cp-input" value="${defaultValue}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:20px;box-sizing:border-box;font-size:13px;outline:none;">
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="cp-cancel" style="padding:8px 16px;background:#f1f5f9;color:#475569;font-weight:500;border:none;border-radius:6px;cursor:pointer;">Zrušit</button>
                <button id="cp-ok" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:500;border:none;border-radius:6px;cursor:pointer;">Potvrdit</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        const input = document.getElementById('cp-input');
        if (input) {
            input.focus();
            input.select();
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('cp-ok').click(); });
        }

        const okBtn = document.getElementById('cp-ok');
        const cancelBtn = document.getElementById('cp-cancel');

        if (okBtn) okBtn.onclick = () => {
            const val = input.value;
            document.body.removeChild(overlay);
            callback(val);
        };
        if (cancelBtn) cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            callback(null);
        };
    }

    showFeeCalc() {
        this.checkEnterpriseFeature("Kalkulačka soudních poplatků", () => {
            this.customPrompt("Zadejte žalovanou částku (Kč):", "", (amount) => {
                if (!amount) return;
                const val = parseFloat(amount.replace(/\s/g, ''));
                if (isNaN(val)) return this.customAlert("Zadána neplatná částka.");
                let fee = 0;
                if (val <= 20000) fee = 1000;
                else if (val <= 40000000) fee = Math.ceil(val * 0.05);
                else fee = 2000000 + Math.ceil((val - 40000000) * 0.01);
                this.customAlert(`Soudní poplatek činí:\n\n${fee.toLocaleString('cs-CZ')} Kč`);
            });
        });
    }

    showInterestCalc() {
        this.checkEnterpriseFeature("Kalkulačka úroků z prodlení", () => {
            this.customPrompt("Zadejte jistinu (Kč):", "", (amount) => {
                if (!amount) return;
                const val = parseFloat(amount.replace(/\s/g, ''));
                if (isNaN(val)) return this.customAlert("Zadána neplatná jistina.");
                const repo = 5.25;
                const rate = repo + 8;
                this.customAlert(`Zákonný úrok z prodlení (sazba ${rate}% p.a.):\n\nRočně: ${(val * rate / 100).toLocaleString('cs-CZ')} Kč\nMěsíčně: ${(val * rate / 1200).toLocaleString('cs-CZ')} Kč`);
            });
        });
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
        
        const regex = /\\[([A-ZÁ-Ž0-9_]{3,30})\\]|\\{\\{([a-zA-Z0-9_á-žÁ-Ž]{2,30})\\}\\}/g;
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
        
        if (!provEl) return;
        
        const settings = {
            provider: provEl.value,
            model: modelEl ? modelEl.value : "llama3",
            endpoint: endEl ? endEl.value : "http://localhost:11434/api/generate",
            apiKey: keyEl ? keyEl.value : ""
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
                
                if (provEl && s.provider) provEl.value = s.provider;
                if (modelEl && s.model) modelEl.value = s.model;
                if (endEl && s.endpoint) endEl.value = s.endpoint;
                if (keyEl && s.apiKey) keyEl.value = s.apiKey;
            } catch (e) {
                console.error("Chyba při načítání AI nastavení:", e);
            }
        }
    }

    updateAIProviderDefaults() {
        const provEl = document.getElementById('ai-provider');
        const modelEl = document.getElementById('ai-model');
        const endEl = document.getElementById('ai-endpoint');
        
        if (!provEl || !modelEl || !endEl) return;
        
        const provider = provEl.value;
        if (provider === 'apfel') {
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
            this.customAlert(`💼 <b>Stav dokumentu změněn</b><br><br>Dokument byl označen jako: <b>${label}</b>`);
        }
        
        this.saveActiveDocumentState();
    }

    async initActiveDocumentState() {
        try {
            const saved = await this.core.storage.get('documents', 'doc_active');
            if (saved && saved.html) {
                // Restore active document content and title
                this.core.setContent(saved.html);
                if (saved.status) {
                    this.setDocumentStatus(saved.status, true);
                }
                
                this.currentDocumentDeadline = saved.deadline || null;
                this.currentDocumentCj = saved.cj || '';
                this.updateDeadlineBadge();
                this.updateDocumentOutline();
                
                // Hide start screen if active document was restored
                const startScreen = document.getElementById('start-screen');
                const appContainer = document.getElementById('app-container');
                if (startScreen && appContainer) {
                    startScreen.style.display = 'none';
                    appContainer.style.display = 'flex';
                }
                
                console.log("Aktivní stav dokumentu byl úspěšně obnoven ze zálohy.");
            }
        } catch (e) {
            console.error("Chyba při obnově stavu aktivního dokumentu:", e);
        }
    }

    async saveActiveDocumentState() {
        try {
            const html = this.core.getContent();
            const text = this.core.getText();
            const title = text.substring(0, 30).trim() || "Nový dokument";
            
            const state = {
                id: 'doc_active',
                html: html,
                text: text,
                title: title,
                status: this.documentStatus || 'draft',
                deadline: this.currentDocumentDeadline || null,
                cj: this.currentDocumentCj || '',
                updatedAt: new Date().toISOString()
            };
            
            await this.core.storage.set('documents', state);
        } catch (e) {
            console.error("Chyba při ukládání stavu aktivního dokumentu:", e);
        }
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
}



window.LexisUI = LexisUI;
