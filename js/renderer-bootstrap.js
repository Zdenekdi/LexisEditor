// renderer-bootstrap.js — SDK init & bridge, vytaženo z index.html (žádná změna chování).
        // --- SDK INITIALIZATION & BRIDGE ---
        let lexisCore;
        let lexisUI;
        let quill; // Legacy global exposure

        async function initApp() {
            if (lexisCore) return; // Already initialized
            
            // 1. Initialize Core
            lexisCore = new LexisCore('#editor', {
                aiProvider: window.LexisAIProvider,
                onTextChange: () => {
                    if (window.lexisUI) lexisUI.updateStats();
                },
                onAutoScan: () => {
                    // Logic for background scans
                }
            });

            // Asynchronní inicializace lokálního úložiště (IndexedDB)
            await lexisCore.storage.init();

            // Načtení dat z úložiště do Core
            const savedKB = await lexisCore.storage.get('settings', 'knowledge-base');
            if (savedKB) {
                lexisCore.knowledgeBase = savedKB;
            }

            // 2. Initialize UI
            lexisUI = new LexisUI(lexisCore);
            
            // 3. Global exposure for legacy onclicks
            window.lexisCore = lexisCore;
            window.lexisUI = lexisUI;
            window.quill = lexisCore.quill;
            quill = window.quill;

            // 4. Load Dynamic Content
            await lexisUI.loadDynamicTemplates();
            lexisUI.updateVersionDisplay();
        }

        // --- BRIDGE FUNCTIONS (Mapping Ribbon onclicks to SDK/UI) ---
        window.switchTab = (tabId) => {
            if (lexisUI) lexisUI.switchTab(tabId);
        };
        window.toggleAIDrawer = (open) => {
            if (lexisUI) lexisUI.toggleAIDrawer(open);
            if (!open) {
                const commentDrawer = document.getElementById('comment-sidebar');
                if (commentDrawer) commentDrawer.classList.remove('open');
            }
            setTimeout(repositionTabs, 420);
            repositionTabs();
        };
        // Pixel-perfect tab positioning — measures actual panel edges, no gaps ever
        function repositionTabs() {
            const sidebar       = document.getElementById('sidebar');
            const rightSidebar  = document.getElementById('right-sidebar');
            const aiDrawer      = document.getElementById('ai-drawer');
            const commentDrawer = document.getElementById('comment-sidebar');
            const sidebarTab    = document.getElementById('sidebar-tab');
            const referenceTab  = document.getElementById('reference-tab');
            const aiTab         = document.getElementById('ai-tab');
            const commentTab    = document.getElementById('comment-tab');

            // Left sidebar tab positioning
            if (sidebar && sidebarTab) {
                if (!sidebar.classList.contains('collapsed')) {
                    const r = sidebar.getBoundingClientRect();
                    sidebarTab.style.left = r.right + 'px';
                } else {
                    sidebarTab.style.left = '0px';
                }
            }

            // Right side tabs positioning (Unified offset to prevent overlap)
            let rightOffset = 0;
            if (aiDrawer && aiDrawer.classList.contains('open')) {
                const r = aiDrawer.getBoundingClientRect();
                rightOffset = Math.max(rightOffset, window.innerWidth - r.left);
            }
            if (commentDrawer && commentDrawer.classList.contains('open')) {
                const r = commentDrawer.getBoundingClientRect();
                rightOffset = Math.max(rightOffset, window.innerWidth - r.left);
            }
            if (rightSidebar && !rightSidebar.classList.contains('collapsed')) {
                const r = rightSidebar.getBoundingClientRect();
                rightOffset = Math.max(rightOffset, window.innerWidth - r.left);
            }

            const offsetStr = rightOffset + 'px';
            if (referenceTab) referenceTab.style.right = offsetStr;
            if (aiTab) aiTab.style.right = offsetStr;
            if (commentTab) commentTab.style.right = offsetStr;
        }
        window.addEventListener('resize', repositionTabs);

        window.toggleSidebar = (id) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('collapsed');
            // Wait for CSS transition then reposition
            setTimeout(repositionTabs, 350);
            repositionTabs();
        };
        window.toggleDarkMode = () => {
            document.body.classList.toggle('dark-mode');
        };
        window.toggleCommentDrawer = (open) => {
            const drawer = document.getElementById('comment-sidebar');
            const overlay = document.getElementById('ai-overlay');
            if (!drawer || !overlay) return;
            const shouldOpen = open !== undefined ? open : !drawer.classList.contains('open');
            if (shouldOpen) {
                drawer.classList.add('open');
                overlay.classList.add('active');
            } else {
                drawer.classList.remove('open');
                overlay.classList.remove('active');
            }
            setTimeout(repositionTabs, 420);
            repositionTabs();
        };
        window.requestStartupUnlock = async () => {
            const el = document.getElementById('startup-lock-screen');
            // BEZPEČNOST: zámek se smí sundat JEN po úspěšném ověření. Dřívější kód
            // volal neexistující requestTouchID a v else větvi zámek sundal BEZ
            // ověření. Používáme reálné authenticateBiometric; bez něj zůstane
            // obrazovka zobrazená (odemčení řeší heslo/PIN hlavního zámku).
            if (window.electronAPI && window.electronAPI.authenticateBiometric) {
                try {
                    const ok = await window.electronAPI.authenticateBiometric('Odemknout LexisEditor');
                    if (ok && el) el.style.display = 'none';
                } catch (e) { /* neúspěch → zůstane zamčeno */ }
            }
        };

        window.startAppWithContent = async (html) => {
            await initApp();
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            lexisCore.setContent(html || '<p><br></p>');
            // Ensure UI state matches
            if (html === '') lexisUI.switchTab('tab-help');
        };

        window.openStartDocument = async (type) => {
            await initApp();
            lexisUI.openStartDocument(type);
        };

        window.formatLegal = (type) => lexisUI.formatLegal(type);
        window.toggleTrackChanges = () => lexisUI.toggleTrackChanges();
        window.anonymize = () => lexisUI.anonymize();
        window.makePlaceholder = () => lexisUI.makePlaceholder();
        window.insertClause = (type) => lexisUI.insertClause(type);
        window.runFinalAudit = () => lexisUI.runFinalAudit();
        window.showFeeCalc = () => lexisUI.showFeeCalc();
        window.showInterestCalc = () => lexisUI.showInterestCalc();
        window.startMailMerge = () => lexisUI.startMailMerge();
        window.applyPaper = (size) => lexisUI.applyPaper(size);
        window.applyOrientation = (mode) => lexisUI.applyOrientation(mode);
        window.applyZoom = (val) => lexisUI.applyZoom(val);
        window.updateMargins = () => lexisUI.updateMargins();
        window.saveDocument = () => lexisUI.saveDocument();
        window.printDocument = () => lexisUI.printDocument();
        window.importDocument = () => lexisUI.importDocument();
        window.importZfo = (filePath) => lexisUI.importZfo(filePath);
        window.toggleQATItem = (id) => lexisUI.toggleQATItem(id);
        window.saveSelectedAsClause = () => lexisUI.saveSelectedAsClause();
        window.sendAIQuery = () => lexisUI.sendAIQuery();
        window.openPoweOfAttorneyDialog = () => lexisUI.dialogs.openPoweOfAttorneyDialog();
        window.goToStartScreen = () => lexisUI.goToStartScreen();
        window.filterRecentDocs = (status) => lexisUI.filterRecentDocs(status);
        window.openRecentDocument = (id) => lexisUI.openRecentDocument(id);
        window.deleteRecentDocument = (id) => lexisUI.deleteRecentDocument(id);
        window.signDigital = () => lexisUI.signDigital();
        
        window.insertFootnote = () => lexisUI.insertFootnote();
        // Word-parita: porovnání s externím .docx (redline), recenzní panel a komentář k výběru.
        window.compareWithFile = () => lexisUI.compareWithFile();
        window.openReviewPanel = () => lexisUI.openReviewPanel();
        window.insertCommentOnSelection = () => lexisUI.insertComment();
        // AI redline: AI přepíše výběr a rozdíl vloží jako sledované změny (přijmout/odmítnout).
        window.reviseSelectionAsRedline = (instr) => lexisUI.reviseSelectionAsRedline(instr);
        // AI anotace výběru: poznámka pod čarou s pramenem / redakční komentář.
        window.aiFootnoteForSelection = () => lexisUI.aiAnnotateSelection('footnote');
        window.aiCommentForSelection = () => lexisUI.aiAnnotateSelection('comment');
        // Word-parita: Ctrl+Alt+M = komentář k výběru; Ctrl+Alt+R = AI revize výběru (redline).
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
                e.preventDefault();
                if (lexisUI && typeof lexisUI.insertComment === 'function') lexisUI.insertComment();
            } else if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) {
                e.preventDefault();
                if (!lexisUI || typeof lexisUI.reviseSelectionAsRedline !== 'function') return;
                const range = lexisCore && lexisCore.quill.getSelection();
                if (!range || range.length === 0) { lexisUI.reviseSelectionAsRedline(); return; }
                // Nepovinný pokyn (co má AI udělat); prázdné = obecné vylepšení.
                lexisUI.customPrompt('Jak má AI text upravit? (nepovinné — např. „zkrať", „formálněji", „doplň sankci")', '', (instr) => {
                    lexisUI.reviseSelectionAsRedline(instr || '');
                });
            }
        });
        window.openLexisLink = () => lexisUI.openLexisLink();
        window.switchSidebarTab = (tab) => lexisUI.switchSidebarTab(tab);
        window.switchAITab = (tab, el) => lexisUI.switchAITab(tab, el);
        window.scanForVariables = () => lexisUI.scanForVariables();
        window.saveCurrentSelectionAsClause = () => lexisUI.saveSelectedAsClause();


        window.insertLink = () => lexisUI.insertLink();
        window.insertDate = () => lexisUI.insertDate();
        window.insertSymbol = (sym) => lexisUI.insertSymbol(sym);
        window.changeCase = (type) => lexisUI.changeCase(type);
        window.showFindReplace = () => lexisUI.showFindReplace();
        window.applyWatermark = () => lexisUI.applyWatermark();
        window.toggleSpellcheck = () => lexisUI.toggleSpellcheck();
        
        window.sendViaEmail = () => lexisUI.sendViaEmail();
        window.saveAsTemplateDialog = () => lexisUI.saveAsTemplateDialog();
        window.exportWebPreview = () => lexisUI.exportWebPreview();
        window.indexCurrentDocument = () => lexisUI.indexCurrentDocument();
        window.exportToDocx = () => lexisUI.exportToDocx();
        window.exportToBundle = () => lexisUI.exportToBundle();
        window.searchAres = () => lexisUI.searchAres();
        
        window.openPdfViewer = () => lexisUI.openPdfViewer();
        window.closePdfViewer = () => lexisUI.closePdfViewer();
        window.importCurrentPdfText = () => lexisUI.importCurrentPdfText();
        window.generateReplyFromPdf = () => lexisUI.generateReplyFromPdf();
        
        window.exec = (format, value) => lexisUI.exec(format, value);
        window.indent = (val) => lexisUI.indent(val);
        window.applyStyle = (style) => lexisUI.applyStyle(style);
        window.applyHighlight = (color) => lexisUI.applyHighlight(color);
        window.setLineHeight = (val) => lexisUI.setLineHeight(val);

        // Jádrové formátování z pásu Domů (písmo/velikost/barva) — dříve nedefinované.
        window.applyFont = (value) => {
            const q = lexisCore.quill; q.focus();
            q.format('font', value || false);
        };
        window.applySize = (value) => {
            const q = lexisCore.quill; q.focus();
            q.format('size', value || false);
        };
        window.applyColor = (value) => {
            const q = lexisCore.quill; q.focus();
            q.format('color', value || false);
        };

        // Napojení existujících metod LexisUI na globální onclick handlery.
        // checkHierarchy/checkTerminology jen počítají — výsledky vykreslíme do panelu auditu.
        window.checkHierarchy = () => {
            const r = lexisUI.checkHierarchy();
            lexisUI.renderAuditResults(r);
            lexisUI.customAlert(r.length ? `Kontrola hierarchie: nalezeno ${r.length} upozornění (viz levý panel).` : '✅ Hierarchie a číslování jsou v pořádku.');
        };
        window.checkTerminology = () => {
            const r = lexisUI.checkTerminology();
            lexisUI.renderAuditResults(r);
            lexisUI.customAlert(r.length ? `Kontrola pojmů: nalezeno ${r.length} upozornění (viz levý panel).` : '✅ Terminologie je jednotná.');
        };
        // Jazyková kontrola: rychlý linter spisovné češtiny + hloubková AI kontrola v kontextu.
        window.checkLanguage = () => lexisUI.checkLanguage();
        window.checkLanguageAI = () => lexisUI.checkLanguageAI();
        window.openContacts = () => lexisUI.openContacts();
        window.toggleDictation = () => lexisUI.toggleDictation();
        window.openPostDialog = () => lexisUI.openPostDialog();
        window.syncCloud = (service) => lexisUI.syncCloud(service);
        window.showHelpTip = (topic) => lexisUI.showHelpTip(topic);
        window.saveAISettings = () => lexisUI.saveAISettings();
        window.updateAIProviderDefaults = () => lexisUI.updateAIProviderDefaults();
        
        window.askAIAboutSelection = () => {
            const range = lexisCore.quill.getSelection();
            if (range && range.length > 0) {
                const text = lexisCore.quill.getText(range.index, range.length);
                lexisUI.toggleAIDrawer(true);
                const input = document.getElementById('ai-prompt');
                if (input) {
                    input.value = `Analyzuj a navrhni úpravy pro následující smluvní doložku:\n\n"${text}"`;
                }
            } else {
                lexisUI.customAlert("ℹ️ <b>Žádný výběr</b><br><br>Nejprve prosím označte myší část textu, kterou chcete analyzovat pomocí LexisAI.");
            }
        };

        window.rewriteSelection = () => {
            const range = lexisCore.quill.getSelection();
            if (range && range.length > 0) {
                const text = lexisCore.quill.getText(range.index, range.length);
                lexisUI.toggleAIDrawer(true);
                const input = document.getElementById('ai-prompt');
                if (input) {
                    input.value = `Přeformuluj a vylepši následující právní text, zachovej význam, ale zlepši stylistiku a přesnost:\n\n"${text}"`;
                    window.sendAIQuery();
                }
            } else {
                lexisUI.customAlert("ℹ️ <b>Žádný výběr</b><br><br>Nejprve prosím označte myší text, který chcete přepsat pomocí LexisAI.");
            }
        };

        window.explainSelection = () => {
            const range = lexisCore.quill.getSelection();
            if (range && range.length > 0) {
                const text = lexisCore.quill.getText(range.index, range.length);
                lexisUI.toggleAIDrawer(true);
                const input = document.getElementById('ai-prompt');
                if (input) {
                    input.value = `Vysvětli laicky i právně význam a právní důsledky následující smluvní doložky:\n\n"${text}"`;
                    window.sendAIQuery();
                }
            } else {
                lexisUI.customAlert("ℹ️ <b>Žádný výběr</b><br><br>Nejprve prosím označte myší doložku, kterou chcete vysvětlit.");
            }
        };

        window.checkLegalRisks = () => {
            lexisUI.toggleAIDrawer(true);
            const input = document.getElementById('ai-prompt');
            if (input) {
                const range = lexisCore.quill.getSelection();
                let text = "";
                if (range && range.length > 0) {
                    text = lexisCore.quill.getText(range.index, range.length);
                    input.value = `Analyzuj možná právní rizika, nevýhodná ustanovení a slabá místa v této části textu:\n\n"${text}"`;
                } else {
                    text = lexisCore.quill.getText();
                    input.value = `Analyzuj možná právní rizika, jednostranně nevýhodná ustanovení a slabá místa v celém tomto dokumentu:\n\n"${text.substring(0, 8000)}"`;
                }
                window.sendAIQuery();
            }
        };

        window.summarizeDocument = () => {
            lexisUI.toggleAIDrawer(true);
            const input = document.getElementById('ai-prompt');
            if (input) {
                const range = lexisCore.quill.getSelection();
                let text = "";
                if (range && range.length > 0) {
                    text = lexisCore.quill.getText(range.index, range.length);
                    input.value = `Vytvoř stručné, přehledné a strukturované shrnutí této části textu:\n\n"${text}"`;
                } else {
                    text = lexisCore.quill.getText();
                    input.value = `Vytvoř stručné, přehledné a strukturované manažerské shrnutí celého tohoto dokumentu (hlavní předmět, závazky, lhůty):\n\n"${text.substring(0, 8000)}"`;
                }
                window.sendAIQuery();
            }
        };

        window.translateSelection = () => {
            const range = lexisCore.quill.getSelection();
            if (range && range.length > 0) {
                const text = lexisCore.quill.getText(range.index, range.length);
                lexisUI.customPrompt("Zadejte cílový jazyk (např. angličtina, němčina):", "angličtina", (lang) => {
                    if (!lang) return;
                    lexisUI.toggleAIDrawer(true);
                    const input = document.getElementById('ai-prompt');
                    if (input) {
                        input.value = `Přelož následující právní text do jazyka [${lang}] a zajisti, aby byla použita správná a přesná právní terminologie:\n\n"${text}"`;
                        window.sendAIQuery();
                    }
                });
            } else {
                lexisUI.customAlert("ℹ️ <b>Žádný výběr</b><br><br>Nejprve prosím označte myší text, který chcete přeložit.");
            }
        };

        window.generateClause = () => {
            lexisUI.customPrompt("Zadejte účel/popis doložky (např. Smluvní pokuta za prodlení, Rozhodčí doložka):", "", (desc) => {
                if (!desc) return;
                lexisUI.toggleAIDrawer(true);
                const input = document.getElementById('ai-prompt');
                if (input) {
                    input.value = `Vygeneruj profesionální českou smluvní doložku pro následující účel: "${desc}". Odpověz zněním doložky a přidej stručný komentář k jejímu použití.`;
                    window.sendAIQuery();
                }
            });
        };

        window.continueWriting = () => {
            const range = lexisCore.quill.getSelection();
            const index = range ? range.index : lexisCore.quill.getLength();
            const start = Math.max(0, index - 1500);
            const textBefore = lexisCore.quill.getText(start, index - start);
            
            if (textBefore.trim().length === 0) {
                lexisUI.customAlert("ℹ️ <b>Prázdný dokument</b><br><br>Pro pokračování v psaní musí dokument obsahovat alespoň nějaký text před kurzorem.");
                return;
            }
            
            lexisUI.toggleAIDrawer(true);
            const input = document.getElementById('ai-prompt');
            if (input) {
                input.value = `Pokračuj v psaní a rozviň následující rozepsaný právní text. Navážeš přesně na jeho konec, udržíš stejný styl, terminologii a formátování:\n\n"${textBefore}"`;
                window.sendAIQuery();
            }
        };
        
        window.anonymizeSelection = () => {
            lexisUI.anonymize();
        };

        // Missing Ribbon/Legal UI helpers
        window.customAlert = (text) => lexisUI.customAlert(text);
        // customConfirm/customPrompt jsou v LexisUI callback-based; navenek je
        // vystavíme jako Promise (tak je volají moduly jako Externí rešerše).
        window.customConfirm = (text, ok = 'Potvrdit', cancel = 'Zrušit') =>
            new Promise((res) => lexisUI.customConfirm(text, ok, cancel, res));
        window.customPrompt = (title, def = '') =>
            new Promise((res) => lexisUI.customPrompt(title, def, res));
        window.showQATMenu = (e) => lexisUI.showQATMenu(e);
        window.showProfileModal = () => lexisUI.showProfileModal();
        window.insertLetterhead = () => lexisUI.insertLetterhead();
        window.insertTOC = () => lexisUI.insertTOC();
        window.generateToC = () => lexisUI.insertTOC();
        window.insertCurrentDate = () => lexisUI.insertDate();
        window.insertTitlePage = () => lexisUI.insertTitlePage();
        window.insertSubjectHeader = (type) => lexisUI.insertSubjectHeader(type);
        window.insertIllustration = () => lexisUI.insertIllustration();
        window.insertBookmark = () => lexisUI.insertBookmark();
        window.editHeader = () => lexisUI.editHeader();
        window.editFooter = () => lexisUI.editFooter();
        window.insertPageNumber = () => lexisUI.insertPageNumber();
        window.setViewMode = (mode) => lexisUI.setViewMode(mode);
        window.calculateFee = () => lexisUI.showFeeCalc();
        window.calculateTariff = () => lexisUI.showTariffCalc();
        window.calculateInterests = () => lexisUI.showInterestCalc();
        window.openDeadlineCalc = () => lexisUI.showDeadlineCalc();
        window.insertSignatureBlock = () => lexisUI.insertSignatureBlock();
        window.insertMySignature = () => lexisUI.insertMySignature();
        window.insertArticle = () => lexisUI.insertArticle();
        window.insertParagraph = () => lexisUI.insertParagraph();
        window.insertCitation = () => lexisUI.insertCitation();
        window.insertSectionSign = () => lexisUI.insertSectionSign();
        window.lookupCaseLaw = () => lexisUI.lookupCaseLaw();
        window.logTime = () => lexisUI.logTime();
        window.exportTimesheet = () => lexisUI.exportTimesheet();
        window.setMargins = (m) => lexisUI.setMargins(m);
        window.setOrientation = (o) => lexisUI.setOrientation(o);
        window.setColumns = (c) => lexisUI.setColumns(c);
        window.autoLinkLaws = () => lexisUI.convertCitationsToLinks();
        
        window.addEventListener('DOMContentLoaded', () => {
            initApp().catch(err => console.error("Chyba při startu:", err));
            setTimeout(repositionTabs, 500);
        });
        window.addEventListener('load', () => { setTimeout(repositionTabs, 300); });
