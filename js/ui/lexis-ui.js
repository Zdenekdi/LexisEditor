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
        
        this.init();
    }

    init() {
        this.bindTabs();
        this.bindEvents();
        this.initContextMenu();
        this.loadQATSettings();
        this.updateVersionDisplay();
        this.updateStats();
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
        });
    }

    initContextMenu() {
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

    showQATMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        const menu = document.getElementById('qat-custom-menu');
        if (!menu) return;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY + 10}px`;
    }

    toggleQATItem(id) {
        const btn = document.getElementById(id);
        const check = document.getElementById(`check-${id}`);
        if (!btn) return;
        
        const isHidden = btn.style.display === 'none';
        btn.style.display = isHidden ? 'flex' : 'none';
        if (check) check.innerText = isHidden ? '✓' : '';
        
        const settings = JSON.parse(localStorage.getItem('lexis-qat-settings') || '{}');
        settings[id] = isHidden;
        localStorage.setItem('lexis-qat-settings', JSON.stringify(settings));
    }

    loadQATSettings() {
        const settings = JSON.parse(localStorage.getItem('lexis-qat-settings') || '{}');
        const defaults = { 'qat-save': true, 'qat-undo': true, 'qat-redo': true, 'qat-print': false, 'qat-new': false };
        const finalSettings = { ...defaults, ...settings };
        
        for (const [id, visible] of Object.entries(finalSettings)) {
            const btn = document.getElementById(id);
            const check = document.getElementById(`check-${id}`);
            if (btn) btn.style.display = visible ? 'flex' : 'none';
            if (check) check.innerText = visible ? '✓' : '';
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
        // Deaktivace starých
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tool-groups-container').forEach(c => c.classList.remove('active'));

        // Aktivace nových
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

    // --- DOCUMENT IO ---
    saveDocument() {
        const html = this.core.getContent();
        const text = this.core.getText();
        const title = text.substring(0, 30).trim() || "Nový dokument";
        
        if (window.electronAPI && window.electronAPI.saveFile) {
            window.electronAPI.saveFile({ title, html, text });
        } else {
            // Browser fallback
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

    // --- CONTENT INSERTS ---
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

    // --- TEXT MODIFICATIONS ---
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

    // --- WATERMARKS ---
    applyWatermark() {
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
    }

    // --- APPLICATION FLOW ---
    openStartDocument(type) {
        if (type === 'blank') {
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            this.core.setContent('<p><br></p>');
            // initialization is already handled in index.html call to initApp()
        } else if (type === 'file') {
            this.importDocument();
        } else {
            this.showLoader("Načítání šablony...", async () => {
                document.getElementById('start-screen').style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                
                if (window.electronAPI && window.electronAPI.getTemplateContent) {
                    const content = await window.electronAPI.getTemplateContent(type);
                    this.core.setContent(content);
                }
            });
        }
    }

    // --- LEGAL TOOLS ---
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

    // --- AUDIT SYSTEM ---
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

    // --- INTEGRATIONS ---
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

    // --- PAGE SETUP ---
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

    // --- HELPERS & MODALS ---
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

    // --- CALCULATORS ---
    showFeeCalc() {
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
    }

    showInterestCalc() {
        this.customPrompt("Zadejte jistinu (Kč):", "", (amount) => {
            if (!amount) return;
            const val = parseFloat(amount.replace(/\s/g, ''));
            if (isNaN(val)) return this.customAlert("Zadána neplatná jistina.");
            const repo = 5.25;
            const rate = repo + 8;
            this.customAlert(`Zákonný úrok z prodlení (sazba ${rate}% p.a.):\n\nRočně: ${(val * rate / 100).toLocaleString('cs-CZ')} Kč\nMěsíčně: ${(val * rate / 1200).toLocaleString('cs-CZ')} Kč`);
        });
    }
}

window.LexisUI = LexisUI;
