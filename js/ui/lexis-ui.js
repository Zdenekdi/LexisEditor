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
        this.letterheadProfile = null; // hlavičkový papír advokáta (načte se v init)
        
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
        window.saveDetectedDeadlineDate = (iso, encContext) => {
            this.promptAddDeadlineDate(iso, decodeURIComponent(encContext));
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
        this.loadLetterheadProfile(); // hlavičkový papír advokáta (viz lexis-letterhead.js)
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
                    actionBtn.innerHTML = isPinned 
                        ? `<span class="icon">❌</span> Odebrat z panelu Rychlý přístup` 
                        : `<span class="icon">📌</span> Přidat na panel Rychlý přístup`;
                    
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
                        actionBtn.innerHTML = `<span class="icon">❌</span> Skrýt z panelu Rychlý přístup`;
                        this.tempQATPinData = { id: btn.id, isHardcoded: true };
                    } else {
                        // Custom item
                        const action = btn.getAttribute('onclick');
                        actionBtn.innerHTML = `<span class="icon">❌</span> Odebrat z panelu Rychlý přístup`;
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
















    // Načte profil (hlavičkový papír) do cache pro synchronní použití. Úložné klíče
    // mají historický prefix `lawyer-` (nepřejmenováváme kvůli existujícím profilům),
    // ale význam je obecný — funguje pro firmu i jednotlivce, ne jen advokáta.


    // Vloží hlavičku advokáta do záhlaví aktuálního dokumentu (jednorázově, na kliknutí).




















    






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













    // Stav úložiště. LexisEditor je záměrně LOKÁLNÍ (datová suverenita) — data
    // neopouštějí počítač advokáta. Vzdálená cloudová synchronizace NENÍ aktivní,
    // a proto nic „nesynchronizujeme" a netvrdíme, že se data někam nahrála.
    // (Dřív tato funkce jen náhodně předstírala úspěch/kolizi — matoucí a nebezpečné
    // u aplikace, na jejíž zálohy se advokát spoléhá.)



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
                        headerArea.innerHTML = saved.headerHtml !== undefined ? saved.headerHtml : `<div>Advokátní kancelář Lexis</div><div style="text-align: right;">Spis: 2024/005/ZD</div>`;
                    }
                    if (footerArea) {
                        footerArea.innerHTML = saved.footerHtml !== undefined ? saved.footerHtml : `<div>www.lexiseditor.cz</div><div style="text-align: right;">Strana 1 z 1</div>`;
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



    // Uložení lhůty s KONKRÉTNÍM datem (např. předvolání, jednání) — na rozdíl od
    // promptAddDeadline se datum nepočítá z počtu dní, ale bere se rovnou.




    // ==========================================
    // EXTRA LEGAL & RIBBON UI HELPERS (Resolving Blind Buttons)
    // ==========================================






















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












    // ==========================================
    // REŽIMY ZOBRAZENÍ — View Modes
    // ==========================================

    _currentViewMode = 'normal';


    // ==========================================
    // HROMADNÉ KAMPANĚ — Campaign Wizard
    // ==========================================

    _campaignStep = 1;
    _campaignRecords = [];
    _campaignPreviewIdx = 0;
    _campaignAction = 'pdf';








    // ==========================================
    // ADRESÁŘ KONTAKTŮ — Contacts Manager
    // ==========================================

    _contacts = null; // LexisContacts instance














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
