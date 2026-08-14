/* global Quill, DOMPurify, localStorage */
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
        this.pinnedQATItems = [];
        this.tempQATPinData = null;
        this.activeSessionTimeMs = 0;

        window.saveDetectedDeadline = (days, encContext) => {
            const context = decodeURIComponent(encContext);
            this.promptAddDeadline(days, context);
        };
        // Uložení lhůty s KONKRÉTNÍM datem (detekce data v textu, resp. lhůty
        // v týdnech/měsících už převedené na ISO datum). Dřív odkazováno z UI,
        // ale nebylo definováno → ReferenceError. Otevře dialog s daným datem.
        window.saveDetectedDeadlineDate = (iso, encContext) => {
            const context = decodeURIComponent(encContext || '');
            const title = context ? ('Lhůta: ' + context).slice(0, 70) : 'Lhůta';
            if (typeof window.showCalendarPicker === 'function') {
                window.showCalendarPicker({ title: title, date: iso, description: context, reminderDays: 3 });
            } else if (typeof window.openDeadlineDialog === 'function') {
                window.openDeadlineDialog({ title: title, deliveredAt: iso, days: 0, description: context });
            }
        };
        window.removeActiveDeadline = (id) => {
            this.removeActiveDeadline(id);
        };
        window.saveHearingToCalendar = (jsonStr) => {
            const data = JSON.parse(decodeURIComponent(jsonStr));
            this.promptAddHearingToCalendar(data);
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
        this.loadCustomQATItems();
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
        this.initRibbonTooltips();
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
            const pinMenu = document.getElementById('qat-pin-menu');
            if (pinMenu) pinMenu.style.display = 'none';
            const statusDropdown = document.getElementById('status-dropdown');
            if (statusDropdown) statusDropdown.style.display = 'none';
        });

        // Right click on ribbon buttons (.btn-icon or other ribbon action buttons)
        const ribbon = document.querySelector('.ribbon');
        if (ribbon) {
            ribbon.addEventListener('contextmenu', (e) => {
                const btn = e.target.closest('.btn-icon');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();

                const action = btn.getAttribute('onclick');
                if (!action) return;

                // Get icon emoji/char
                const iconSq = btn.querySelector('.icon-sq');
                const icon = iconSq ? iconSq.innerText : '⭐';
                const title = btn.innerText.replace(icon, '').trim();

                const menu = document.getElementById('qat-pin-menu');
                if (!menu) return;

                // Position and show menu
                menu.style.display = 'block';
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;

                // Check if already pinned
                const isPinned = this.pinnedQATItems.some(item => item.action === action);
                const actionBtn = document.getElementById('qat-pin-action-btn');
                if (actionBtn) {
                    actionBtn.innerHTML = eIco(isPinned 
                        ? `<span class="icon">❌</span> Odebrat z panelu Rychlý přístup` 
                        : `<span class="icon">📌</span> Přidat na panel Rychlý přístup`);
                    
                    this.tempQATPinData = { action, icon, title, isPinned };
                }
            });
        }

        // Right click on quick access toolbar to unpin custom or hardcoded items
        const quickAccess = document.querySelector('.quick-access');
        if (quickAccess) {
            quickAccess.addEventListener('contextmenu', (e) => {
                const btn = e.target.closest('.qa-btn');
                if (!btn || btn.innerText.includes('▾')) return; // ignore dropdown button
                e.preventDefault();
                e.stopPropagation();

                const menu = document.getElementById('qat-pin-menu');
                if (!menu) return;

                menu.style.display = 'block';
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;

                const actionBtn = document.getElementById('qat-pin-action-btn');
                if (actionBtn) {
                    if (btn.id) {
                        // Hardcoded item (qat-save, qat-undo, qat-redo, qat-print, qat-new)
                        actionBtn.innerHTML = eIco(`<span class="icon">❌</span> Skrýt z panelu Rychlý přístup`);
                        this.tempQATPinData = { id: btn.id, isHardcoded: true };
                    } else {
                        // Custom item
                        const action = btn.getAttribute('onclick');
                        actionBtn.innerHTML = eIco(`<span class="icon">❌</span> Odebrat z panelu Rychlý přístup`);
                        this.tempQATPinData = { action, isPinned: true };
                    }
                }
            });
        }

        // Auto-save changes in header and footer area
        const headerArea = document.getElementById('header-area');
        const footerArea = document.getElementById('footer-area');
        const throttleSave = () => {
            clearTimeout(this.headerFooterSaveTimer);
            this.headerFooterSaveTimer = setTimeout(() => {
                this.saveActiveDocumentState();
            }, 1000);
        };
        if (headerArea) {
            headerArea.addEventListener('input', throttleSave);
        }
        if (footerArea) {
            footerArea.addEventListener('input', throttleSave);
        }

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

    bindTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
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

        dialog.innerHTML = eIco(`
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
        `);

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
                icon.innerHTML = (eIco(window.LexisIcons ? window.LexisIcons.sizeSvg(window.LexisIcons.get('cloud-sync'), 14) : '☁️'));
            }
            
            if (isCloud) {
                this.customAlert('☁️ <b>Verze stažena</b><br><br>Dokument byl úspěšně aktualizován na nejnovější cloudovou verzi z IndexedDB.');
            } else {
                this.customAlert('☁️ <b>Změny odeslány</b><br><br>Vaše lokální změny byly potvrzeny a zapsány do cloudového úložiště.');
            }
        };
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
                    this.updateDocTitleDOM();
                    this.currentDocumentDeadline = saved.deadline || null;
                    this.currentDocumentCj = saved.cj || '';
                    this.updateDeadlineBadge();
                    this.updateDocumentOutline();
                    
                    // Obnovení záhlaví a zápatí
                    const headerArea = document.getElementById('header-area');
                    const footerArea = document.getElementById('footer-area');
                    if (headerArea) {
                        headerArea.innerHTML = eIco(saved.headerHtml !== undefined ? saved.headerHtml : `<div>Advokátní kancelář Lexis</div><div style="text-align: right;">Spis: 2024/005/ZD</div>`);
                    }
                    if (footerArea) {
                        footerArea.innerHTML = eIco(saved.footerHtml !== undefined ? saved.footerHtml : `<div>www.lexiseditor.cz</div><div style="text-align: right;">Strana 1 z 1</div>`);
                    }
                    
                    const startScreen = document.getElementById('start-screen');
                    const appContainer = document.getElementById('app-container');
                    if (startScreen && appContainer) {
                        startScreen.style.display = 'flex';
                        appContainer.style.display = 'none';
                    }
                    this.renderRecentDocuments();
                    console.log(`Dokument ${lastId} byl úspěšně načten ze zálohy v pozadí.`);
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
            
            modal.innerHTML = eIco(headerHtml);
            modal.appendChild(bodyContainer);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            document.getElementById('isds-close').onclick = () => document.body.removeChild(overlay);
            
            let isdsConfig = { hasConfig: false };
            if (window.electronAPI && window.electronAPI.getIsdsConfig) {
                isdsConfig = await window.electronAPI.getIsdsConfig();
            }
            
            const renderLogin = () => {
                bodyContainer.innerHTML = eIco(`
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
                `);
                
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
                bodyContainer.innerHTML = eIco(`
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
                `);
                
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
                listContainer.innerHTML = eIco(messages.map(msg => {
                    const dueHtml = msg.deadlineDays > 0 
                        ? `<span style="padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 9999px; background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5;">Lhůta ${msg.deadlineDays} dní</span>`
                        : `<span style="padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 9999px; background: #f1f5f9; color: #64748b;">Bez lhůty</span>`;
                        
                    return `
                        <div class="isds-row" id="row-${msg.id}" style="padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; cursor: pointer; transition: all 0.2s;" onclick="window.selectISDSMsg('${msg.id}')">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <div style="font-weight: 700; font-size: 12px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${window.escapeHTML(msg.senderName || '')}</div>
                                <span style="font-size: 10px; color: #94a3b8;">${window.escapeHTML(msg.receivedDate || '')}</span>
                            </div>
                            <div style="font-size: 11px; color: #64748b; line-height: 1.3; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${window.escapeHTML(msg.subject || '')}</div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">ID: ${window.escapeHTML(msg.senderId || '')}</span>
                                ${dueHtml}
                            </div>
                        </div>
                    `;
                }).join(''));
                
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
                                        <div style="font-size: 12px; font-weight: 600; color: #334155;">${window.escapeHTML(att.name || '')}</div>
                                        <div style="font-size: 10px; color: #94a3b8;">${window.escapeHTML(String(att.type || '').toUpperCase())} ${window.escapeHTML(String(att.size || ''))}</div>
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
                    
                    detailPane.innerHTML = eIco(`
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 15px; flex: 1; overflow-y: auto;">
                            <div>
                                <span style="font-size: 9px; font-weight: 800; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">Podrobnosti o zprávě</span>
                                <h2 style="font-size: 16px; font-weight: 800; color: #1e293b; margin: 8px 0 4px; line-height: 1.3;">${window.escapeHTML(msg.subject || '')}</h2>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; color: #64748b; margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                                    <div><strong>Odesílatel:</strong> ${window.escapeHTML(msg.senderName || '')}</div>
                                    <div><strong>Datová schránka ID:</strong> <span style="font-family: monospace;">${window.escapeHTML(msg.senderId || '')}</span></div>
                                    <div><strong>Datum doručení:</strong> ${window.escapeHTML(msg.receivedDate || '')}</div>
                                    <div><strong>Zpracování lhůty:</strong> ${msg.deadlineDays > 0 ? `Lhůta do ${msg.receivedDate} (${msg.deadlineDays} dní)` : 'Není sledována'}</div>
                                </div>
                            </div>
                            
                            <div style="border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background: #fafafb; font-size: 13px; line-height: 1.5; color: #334155; max-height: 150px; overflow-y: auto;">
                                ${typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(msg.body || '') : window.escapeHTML(msg.body || '')}
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
                    `);
                    
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
                            this.setDocumentStatus(null, true);
                            
                            // Track in activeDeadlines
                            this.activeDeadlines.push({
                                id: 'dl_' + Date.now(),
                                title: `Vyjádření k soudní výzvě sp. zn. 15 Co 123/2026`,
                                dueDate: dueDateStr
                            });
                            this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
                            this.renderDeadlines();
                            this.updateDeadlineBadge();
                            this.updateDocTitleDOM();
                            this.saveActiveDocumentState();
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
            this.core.safePasteHTML(range.index, content);
            this.customAlert("✅ <b>Příloha byla úspěšně importována!</b><br><br>Textový obsah přílohy byl vložen přímo na pozici vašeho kurzoru.");
        } catch (e) {
            console.error("Chyba při importu přílohy z ISDS:", e);
            this.customAlert("Nebylo možné vložit obsah přílohy do editoru.");
        }
    }

    // ==========================================
    // EXTRA LEGAL & RIBBON UI HELPERS (Resolving Blind Buttons)
    // ==========================================

    editHeader() {
        const header = document.getElementById('header-area');
        if (header) {
            header.scrollIntoView({ behavior: 'smooth', block: 'center' });
            header.focus();
            
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(header);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    editFooter() {
        const footer = document.getElementById('footer-area');
        if (footer) {
            footer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            footer.focus();
            
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(footer);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
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
            this.showTimeTrackingDialog();
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


    initRibbonTooltips() {
        let tooltipEl = document.getElementById('lexis-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'lexis-tooltip';
            tooltipEl.className = 'lexis-tooltip';
            document.body.appendChild(tooltipEl);
        }

        const targets = document.querySelectorAll('.btn-icon, .qa-btn, .ribbon [title]');
        console.log("[Tooltip Debug] initRibbonTooltips found targets count:", targets.length);
        const actionMap = {
            'goToStartScreen': 'Přejít na rozcestník s historií dokumentů a šablonami.',
            'window.print': 'Uložit dokument jako soubor PDF nebo jej vytisknout.',
            'sendViaEmail': 'Odeslat dokument jako přílohu e-mailu.',
            'saveAsTemplateDialog': 'Uložit aktuální dokument jako uživatelskou šablonu.',
            'exportWebPreview': 'Zobrazit dokument v rozvržení pro webový prohlížeč.',
            'indexCurrentDocument': 'Indexovat dokument do vaší místní znalostní báze pro AI.',
            'showHelpTip(\'connect\')': 'Zkontrolovat stav připojení k místnímu serveru LexisLocal.',
            'syncCloud(\'Dropbox\')': 'Synchronizovat soubory s cloudovým úložištěm Dropbox.',
            'syncCloud(\'Google Drive\')': 'Synchronizovat soubory s Google Drive.',
            'syncCloud(\'OneDrive\')': 'Synchronizovat soubory s Microsoft OneDrive.',
            'exportToDocx': 'Exportovat dokument do formátu Microsoft Word (.docx).',
            'exportToBundle': 'Exportovat kompletní sadu dokumentů ve formátu .lexis.',
            'startMailMerge': 'Spustit hromadné obesílání (Mail Merge) na více příjemců přes datové schránky.',
            'document.execCommand(\'copy\')': 'Zkopírovat označený text do schránky (Ctrl+C).',
            'showFindReplace': 'Vyhledat a nahradit text v dokumentu (Ctrl+F).',
            'toggleDictation': 'Spustit hlasové diktování textu.',
            'exec(\'bold\')': 'Tučné písmo (Ctrl+B).',
            'exec(\'italic\')': 'Kurzíva (Ctrl+I).',
            'exec(\'underline\')': 'Podtržené písmo (Ctrl+U).',
            'applyHighlight': 'Zvýraznit text žlutou barvou.',
            'setLineHeight(\'1.0\')': 'Nastavit řádkování na 1.0 (jednoduché).',
            'setLineHeight(\'1.5\')': 'Nastavit řádkování na 1.5 (jeden a půl).',
            'indent(1)': 'Zvětšit odsazení odstavce.',
            'indent(-1)': 'Zmenšit odsazení odstavce.',
            'exec(\'align\', \'left\')': 'Zarovnat text doleva.',
            'exec(\'align\', \'center\')': 'Zarovnat text na střed.',
            'exec(\'align\', \'right\')': 'Zarovnat text doprava.',
            'exec(\'align\', \'justify\')': 'Zarovnat text do bloku.',
            'openPdfViewer': 'Otevřít integrovaný prohlížeč PDF pro srovnání textu.',
            'importZfo': 'Importovat obsah doručené zprávy z datové schránky (.zfo).',
            'insertTOC': 'Vložit automaticky generovaný obsah na pozici kurzoru.',
            'insertCurrentDate': 'Vložit aktuální datum do dokumentu.',
            'insertTitlePage': 'Vložit formální titulní stranu pro právní podání.',
            'insertFootnote': 'Vložit poznámku pod čarou na pozici kurzoru.',
            'lexisUI.convertCitationsToLinks()': 'Automaticky převést spisové značky a odkazy na zákony na klikatelné odkazy.',
            'insertClause': 'Vložit vybranou právní doložku z knihovny vzorů.',
            'insertSubjectHeader(\'person\')': 'Vložit vzorovou hlavičku pro fyzickou osobu.',
            'insertSubjectHeader(\'entrepreneur\')': 'Vložit vzorovou hlavičku pro podnikající fyzickou osobu (OSVČ).',
            'insertSubjectHeader(\'company\')': 'Vložit vzorovou hlavičku pro právnickou osobu (s.r.o., a.s.).',
            'insertTable': 'Vložit tabulku na pozici kurzoru.',
            'generateToC': 'Vygenerovat obsah dokumentu.',
            'searchAres': 'Vyhledat firmu v registru ARES podle IČO a vložit její sídlo a název.',
            'insertIllustration': 'Vložit ilustrační obrázek.',
            'insertImage': 'Vložit vlastní obrázek z počítače.',
            'insertLink': 'Vložit hypertextový odkaz na webovou stránku.',
            'insertBookmark': 'Vložit záložku pro rychlou navigaci v dokumentu.',
            'editHeader': 'Upravit záhlaví stránky (hladký přesun a focus).',
            'editFooter': 'Upravit zápatí stránky (hladký přesun a focus).',
            'insertPageNumber': 'Vložit pole s dynamickým číslem stránky.',
            'calculateFee': 'Spočítat soudní poplatek podle výše nároku.',
            'calculateTariff': 'Spočítat mimosmluvní odměnu advokáta podle vyhlášky č. 177/1996 Sb. (Advokátní tarif).',
            'openDeadlineCalc': 'Spočítat procesní lhůtu a zkontrolovat pracovní dny.',
            'calculateInterests': 'Spočítat úrok z prodlení podle nařízení vlády.',
            'translateSelection': 'Přeložit vybraný právní text do zvoleného jazyka.',
            'generateClause': 'Vygenerovat novou smluvní doložku na základě popisu.',
            'continueWriting': 'Nechat AI navázat a dopsat text za pozicí kurzoru.',
            'insertSignatureBlock': 'Vložit formální podpisový blok na konec dokumentu.',
            'insertMySignature': 'Vložit váš uložený digitální podpis.',
            'anonymizeSelection': 'Spustit automatickou anonymizaci citlivých osobních údajů v dokumentu.',
            'checkHierarchy': 'Zkontrolovat správnost hierarchie a číslování článků.',
            'checkTerminology': 'Zkontrolovat jednotnost definovaných pojmů ve smlouvě.',
            'insertArticle': 'Vložit článek se stabilním právnickým číslováním.',
            'insertParagraph': 'Vložit paragraf se stabilním právnickým číslováním.',
            'insertCitation': 'Vložit citaci z judikatury.',
            'insertSectionSign': 'Vložit speciální znak paragrafu (§).',
            'lookupCaseLaw': 'Vyhledat judikáty k vybranému tématu.',
            'autoLinkLaws': 'Automaticky převést odkazy na zákony na hypertextové odkazy.',
            'openISDS': 'Odeslat dokument přímo přes integrovanou datovou schránku.',
            'openPostDialog': 'Odeslat dokument jako fyzický dopis přes službu České pošty (Dopis Online).',
            'signDigital': 'Digitálně podepsat dokument zaručeným podpisem.',
            'logTime': 'Zapsat čas strávený na tomto dokumentu do výkazu.',
            'exportTimesheet': 'Exportovat časový výkaz prací (timesheet).',
            'setMargins(\'normal\')': 'Nastavit standardní okraje stránky.',
            'setMargins(\'narrow\')': 'Nastavit úzké okraje stránky (více textu).',
            'setMargins(\'wide\')': 'Nastavit široké okraje stránky.',
            'setOrientation(\'portrait\')': 'Nastavit orientaci papíru na výšku.',
            'setOrientation(\'landscape\')': 'Nastavit orientaci papíru na šířku.',
            'setColumns(1)': 'Zobrazit text v jednom sloupci.',
            'setColumns(2)': 'Rozdělit text do dvou sloupců.',
            'generateTableOfAuthorities': 'Vytvořit rejstřík citované judikatury a zákonů.',
            'toggleTrackChanges': 'Zapnout režim sledování změn (Redlining).',
            'acceptAll': 'Přijmout všechny navržené změny v dokumentu.',
            'rejectAll': 'Odmítnout všechny navržené změny v dokumentu.',
            'compareVersions': 'Porovnat dvě verze dokumentu (Blackline).',
            'showHistory': 'Zobrazit historii automatických záloh a verzí dokumentu.',
            'toggleCommentDrawer(true)': 'Otevřít postranní panel s komentáři a revizemi.',
            'runFinalAudit': 'Spustit hloubkovou AI analýzu chyb, rizik a rozporů.',
            'scrubMetadata': 'Odstranit skryté revize a metadata před odesláním.',
            'clearHighlights': 'Vymazat veškeré barevné zvýraznění textu.',
            'toggleRuler': 'Zobrazit horizontální pravítko nad stránkou.',
            'toggleGrid': 'Zobrazit mřížku pro přesné zarovnání objektů.',
            'toggleSidebar(\'sidebar\')': 'Zobrazit/skrýt levý postranní panel s osnovou.',
            'toggleSidebar(\'right-sidebar\')': 'Zobrazit/skrýt pravý postranní panel s referencemi.',
            'toggleDarkMode': 'Přepnout rozhraní do tmavého vzhledu.',
            'showHelpTip(\'redlining\')': 'Zobrazit nápovědu ke sledování změn.',
            'showHelpTip(\'blackline\')': 'Zobrazit nápovědu k porovnávání verzí.',
            'showHelpTip(\'scan\')': 'Zobrazit návod pro mobilní skenování.',
            'showHelpTip(\'clauses\')': 'Jak používat knihovnu vzorových doložek.',
            'showHelpTip(\'toc\')': 'Návod na generování obsahu a rejstříků.',
            'showHelpTip(\'qat-guide\')': 'Jak si přizpůsobit panel Rychlý přístup.',
            'runSelfDiagnostic': 'Spustit diagnostiku aplikace a připojení.',
            'startOnboarding': 'Spustit interaktivního průvodce aplikací.',
            'showHelpTip(\'user-guide\')': 'Otevřít kompletní manuál LexisEditoru.',
            'showHelpTip(\'updates\')': 'Zkontrolovat dostupnost nových verzí aplikace.',
            'showHelpTip(\'about\')': 'Zobrazit informace o verzi a licenci.'
        };

        let activeTimeout = null;

        const showTooltip = (e) => {
            const btn = e.currentTarget;
            const text = btn.getAttribute('data-tooltip');
            if (!text) return;

            if (activeTimeout) clearTimeout(activeTimeout);

            activeTimeout = setTimeout(() => {
                tooltipEl.textContent = text;
                const rect = btn.getBoundingClientRect();
                
                const tooltipWidth = tooltipEl.offsetWidth || 180;
                
                // Position below the element
                const top = rect.bottom + window.scrollY + 6;
                let left = rect.left + window.scrollX + rect.width / 2;
                
                // Prevent going off screen horizontally
                const minLeft = tooltipWidth / 2 + 10;
                const maxLeft = window.innerWidth - (tooltipWidth / 2) - 10;
                left = Math.max(minLeft, Math.min(left, maxLeft));
                
                tooltipEl.style.top = `${top}px`;
                tooltipEl.style.left = `${left}px`;
                
                tooltipEl.classList.add('show');
            }, 150);
        };

        const hideTooltip = () => {
            if (activeTimeout) clearTimeout(activeTimeout);
            tooltipEl.classList.remove('show');
        };

        targets.forEach(btn => {
            let matchedTooltip = '';

            if (btn.hasAttribute('title')) {
                matchedTooltip = btn.getAttribute('title');
                btn.removeAttribute('title');
            }

            if (!matchedTooltip) {
                const onclickAttr = btn.getAttribute('onclick') || '';
                for (const [key, value] of Object.entries(actionMap)) {
                    if (onclickAttr.includes(key)) {
                        matchedTooltip = value;
                        break;
                    }
                }
            }

            if (!matchedTooltip) {
                const btnText = btn.innerText.trim();
                const textMap = {
                    'Pravopis': 'Spustit kontrolu pravopisu a překlepů.',
                    'Tezaurus': 'Vyhledat synonyma pro označené slovo.',
                    'Otevřít AI Bridge': 'Otevřít postranní panel s AI chatem a rešeršemi.',
                    'LexisLink Remote': 'Připojit mobilní telefon jako dálkový skener a diktafon.',
                    'Čtení': 'Přepnout do režimu čtení (skryje lišty).',
                    'Tisk': 'Zobrazit dokument v rozvržení před tiskem.',
                    'Web': 'Přepnout do webového zobrazení dokumentu.'
                };
                for (const [key, value] of Object.entries(textMap)) {
                    if (btnText.includes(key)) {
                        matchedTooltip = value;
                        break;
                    }
                }
            }

            if (matchedTooltip) {
                btn.setAttribute('data-tooltip', matchedTooltip);
                btn.addEventListener('mouseenter', showTooltip);
                btn.addEventListener('mouseleave', hideTooltip);
                btn.addEventListener('click', hideTooltip);
            }
        });
    }



    // ==========================================
    // ZÁHLAVÍ / ZÁPATÍ — Header Footer Editor
    // ==========================================

    _currentHFTarget = 'header'; // 'header' | 'footer'
    _hfImages = { left: null, center: null, right: null };

    editHeader() {
        this._currentHFTarget = 'header';
        this._openHFModal();
    }

    editFooter() {
        this._currentHFTarget = 'footer';
        this._openHFModal();
    }

    _openHFModal() {
        const overlay = document.getElementById('hf-modal-overlay');
        const title = document.getElementById('hf-modal-title');
        if (!overlay) return;

        if (title) title.textContent = this._currentHFTarget === 'header' ? 'Editor záhlaví' : 'Editor zápatí';

        // Load current content from the actual header/footer area
        const areaId = this._currentHFTarget === 'header' ? 'header-area' : 'footer-area';
        const area = document.getElementById(areaId);

        // Try to restore structured data if available
        const savedKey = `hf-data-${this._currentHFTarget}`;
        const saved = this._hfData?.[this._currentHFTarget];
        if (saved) {
            const l = document.getElementById('hf-left');
            const c = document.getElementById('hf-center');
            const r = document.getElementById('hf-right');
            if (l) l.value = saved.left || '';
            if (c) c.value = saved.center || '';
            if (r) r.value = saved.right || '';
        } else {
            // Default content from textarea
            ['left','center','right'].forEach(pos => {
                const el = document.getElementById(`hf-${pos}`);
                if (el) el.value = '';
            });
        }

        // Reset images
        ['left','center','right'].forEach(pos => {
            const img = document.getElementById(`hf-img-${pos}`);
            if (img) {
                const savedImg = this._hfImages[pos];
                img.src = savedImg || '';
                img.style.display = savedImg ? 'block' : 'none';
            }
        });

        this.switchHFTab('layout');
        this.updateHFPreview();
        overlay.style.display = 'flex';
    }

    closeHFModal() {
        const overlay = document.getElementById('hf-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    switchHFTab(tab) {
        ['layout','style','templates'].forEach(t => {
            const btn = document.getElementById(`hf-tab-${t}`);
            const panel = document.getElementById(`hf-panel-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
            if (panel) panel.style.display = t === tab ? 'block' : 'none';
        });
    }


    pickHFImage(position) {
        const input = document.getElementById(`hf-img-input-${position}`);
        if (input) input.click();
    }

    onHFImagePicked(position, input) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            this._hfImages[position] = dataUrl;
            const imgEl = document.getElementById(`hf-img-${position}`);
            if (imgEl) { imgEl.src = dataUrl; imgEl.style.display = 'block'; }
            this.updateHFPreview();
        };
        reader.readAsDataURL(file);
        input.value = ''; // reset so same file can be picked again
    }


    applyHFTemplate(type) {
        const templates = {
            advokatura: {
                left: 'Advokátní kancelář\nJUDr. Jan Novák\nwww.ak-novak.cz',
                center: '',
                right: 'Č.j.: {TITULEK}\nDatum: {DATUM}\nStrana: {STRANA}'
            },
            urad: {
                left: 'Logo úřadu', // user can replace with image
                center: '{TITULEK}\nRef. č.: 2025/001',
                right: 'V Praze dne {DATUM}'
            },
            soud: {
                left: 'Sp. zn.: \nK rukám soudu',
                center: 'Krajský soud v Praze\nNáměstí Kinských 34\n150 00 Praha 5',
                right: '{DATUM}\nStrana {STRANA}'
            },
            smlouva: {
                left: '',
                center: '',
                right: 'Strana {STRANA}'
            }
        };

        const tpl = templates[type];
        if (!tpl) return;

        ['left','center','right'].forEach(pos => {
            const el = document.getElementById(`hf-${pos}`);
            if (el) el.value = tpl[pos] || '';
        });

        this.switchHFTab('layout');
        this.updateHFPreview();
    }

    async saveHFAsTemplate() {
        this.customPrompt('Zadejte název šablony záhlaví:', 'Moje záhlaví', async (name) => {
            if (!name) return;
            const left = document.getElementById('hf-left')?.value || '';
            const center = document.getElementById('hf-center')?.value || '';
            const right = document.getElementById('hf-right')?.value || '';

            const templates = await this.core.storage.get('settings', 'hf-templates') || {};
            templates[`hf_${Date.now()}`] = { name, left, center, right };
            await this.core.storage.set('settings', { key: 'hf-templates', value: templates });
            this.customAlert(`✅ <b>Šablona uložena!</b><br><br>Šablona záhlaví <b>${name}</b> je uložena pro budoucí použití.`);
        });
    }

    // ==========================================
    // REŽIMY ZOBRAZENÍ — View Modes
    // ==========================================

    _currentViewMode = 'normal';

    setViewMode(mode) {
        // Remove all view mode classes
        document.body.classList.remove('reading-mode', 'print-layout', 'web-layout');

        // Update button active states
        ['reading','print','web'].forEach(m => {
            const btn = document.getElementById(`view-btn-${m}`);
            if (btn) btn.classList.remove('view-mode-active');
        });

        if (mode === 'normal' || mode === this._currentViewMode) {
            // Toggle off — return to normal
            this._currentViewMode = 'normal';
            return;
        }

        this._currentViewMode = mode;

        if (mode === 'reading') {
            document.body.classList.add('reading-mode');
            const btn = document.getElementById('view-btn-reading');
            if (btn) btn.classList.add('view-mode-active');
        } else if (mode === 'print') {
            document.body.classList.add('print-layout');
            const btn = document.getElementById('view-btn-print');
            if (btn) btn.classList.add('view-mode-active');
        } else if (mode === 'web') {
            document.body.classList.add('web-layout');
            const btn = document.getElementById('view-btn-web');
            if (btn) btn.classList.add('view-mode-active');
        }
    }

    // ==========================================
    // HROMADNÉ KAMPANĚ — Campaign Wizard
    // ==========================================

    _campaignStep = 1;
    _campaignRecords = [];
    _campaignPreviewIdx = 0;
    _campaignAction = 'pdf';

    closeCampaign() {
        const overlay = document.getElementById('campaign-overlay');
        if (overlay) overlay.style.display = 'none';
    }


    _setCampaignAction(action) {
        this._campaignAction = action;
        document.querySelectorAll('.campaign-action-card').forEach(card => card.classList.remove('selected'));
        // Re-render step 4
        this.renderCampaignStep(4);
    }

    _campaignPreviewNav(dir) {
        const count = this._campaignRecords.length;
        this._campaignPreviewIdx = (this._campaignPreviewIdx + dir + count) % count;
        this.renderCampaignStep(3);
    }



    onCampaignCsvPicked(input) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this._campaignCsvText = e.target.result;
            const ta = document.getElementById('campaign-csv-ta');
            if (ta) {
                ta.value = this._campaignCsvText;
                this._updateCampaignRecordsPreview();
            }
        };
        reader.readAsText(file, 'utf-8');
        input.value = '';
    }

    // ==========================================
    // ADRESÁŘ KONTAKTŮ — Contacts Manager
    // ==========================================

    _contacts = null; // LexisContacts instance

    _getContacts() {
        if (!this._contacts) {
            this._contacts = new LexisContacts(this.core.storage);
        }
        return this._contacts;
    }

    async openContacts() {
        const overlay = document.getElementById('contacts-modal-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        await this.renderContactsList();
        await this._renderContactGroupFilter();
    }

    closeContacts() {
        const overlay = document.getElementById('contacts-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    }


    // ==========================================
    // PŘEPRACOVANÁ KAMPAŇ — 3 módy příjemců
    // ==========================================

    _campaignRecipientMode = 'courts'; // 'courts' | 'contacts' | 'csv'
    _selectedCourts = new Set();
    _selectedContacts = new Set();
    _courtTypeFilter = '';
    _courtSearchQuery = '';

    // window.openContacts shortcut
}

window.LexisUI = LexisUI;
