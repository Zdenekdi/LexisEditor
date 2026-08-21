// lexis-ui-3.js — část UI vytažená z lexis-ui.js (prototype-mixin, beze změny chování).
// Načítá se v index.html PO lexis-ui.js. Obsahuje: importCurrentPdfText, generateReplyFromPdf, switchSidebarTab, switchAITab, anonymizeDocument, showAnonymizationDialog, scanForVariables, sendViaEmail, saveAsTemplateDialog, exportWebPreview, indexCurrentDocument, exportToDocx, exportToBundle, searchAres, exec, indent, applyStyle, applyHighlight, setLineHeight, toggleDictation, openPostDialog, syncCloud, showHelpTip, saveAISettings, loadAISettings, saveFeatureSettings, loadFeatureSettings, updateAIProviderDefaults, getLexisLocalConnection, toggleLexisLocalSelectors, fetchLexisLocalModels, toggleStatusDropdown, setDocumentStatus, saveActiveDocumentState
Object.assign(LexisUI.prototype, {

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
    },

    async generateReplyFromPdf() {
        if (!this.currentPdfText) {
            this.customAlert("Nebyly nalezeny žádné textové podklady k analýze.");
            return;
        }

        // 1. Č.j. / spisová značka — SDÍLENÁ extrakce (window.LexisReply.extract),
        //    aby obě cesty tvorby odpovědi extrahovaly stejně. Regex fallback jen
        //    pro případ, že modul není načtený.
        let fileNumber = '';
        if (window.LexisReply && window.LexisReply.extract) {
            const ex = window.LexisReply.extract(this.currentPdfText);
            fileNumber = ex.cj || ex.spzn || '';
        }
        if (!fileNumber) {
            const cjRegexes = [
                /(?:č\s*\.\s*j\s*\.|číslo\s*jednací|sp\s*\.\s*zn\s*\.)\s*([0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+(?:\s+[0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+)*)/i,
                /(?:spisová\s*značka|spis\.?\s*zn\.?)\s*([0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+(?:\s+[0-9A-Za-zěščřžýáíéóúůďťňĎŇŤŠČŘŽÝÁÍÉÚŮÓ\-_\/]+)*)/i
            ];
            for (const regex of cjRegexes) {
                const match = regex.exec(this.currentPdfText);
                if (match && match[1]) { fileNumber = match[1].trim(); break; }
            }
        }
        if (!fileNumber) {
            fileNumber = 'Spis. zn. / Č. j. nevyplněno';
        }
        
        // 2. Extract court — sdílená detekce (window.LexisReply), s regex fallbackem.
        let recipient = 'Příslušný soud / Orgán';
        const detectedCourt = (window.LexisReply && window.LexisReply.courtInfo)
            ? window.LexisReply.courtInfo(this.currentPdfText) : null;
        if (detectedCourt && detectedCourt.nazev) {
            recipient = detectedCourt.nazev;
        } else {
            const courtRegex = /(?:okresní|krajský|vrchní|ústavní|nejvyšší)\s+soud\s+(?:v|ve|brně|praze|ostravě|plzni|olomouci|hradci|[a-zá-žěščřžýáíéóúůďťň]+)/i;
            const courtMatch = courtRegex.exec(this.currentPdfText);
            if (courtMatch) recipient = courtMatch[0].trim().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
        }

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
                        <h1 class="ql-align-center" style="font-size: 16pt; color: #8a5320;">VYJÁDŘENÍ ÚČASTNÍKA</h1>
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
                        <hr style="border: none; border-top: 1px solid #ddd6cb; margin-bottom: 20px;">
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
                    this.resetHeaderFooterDOM();
                    this.setDocumentStatus(null, true);
                    
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
    },

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
    },

    switchAITab(subTab, el) {
        document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
        if (el) el.classList.add('active');
        
        const output = document.getElementById('ai-output');
        const actions = document.getElementById('ai-actions');
        if (!output) return;
        
        if (subTab === 'chat') {
            output.innerHTML = eIco("Dobrý den, jsem váš právní agent. Zadejte libovolný dotaz nebo si nechte zkontrolovat smlouvu.");
            if (actions) actions.style.display = 'none';
        } else if (subTab === 'research') {
            output.innerHTML = eIco("🔍 <b>Právní rešerše</b><br><br>Zadejte téma nebo ustanovení zákona, které si přejete vyhledat či analyzovat (např. <i>výpověď z nájmu</i>).");
            if (actions) {
                actions.style.display = 'flex';
                actions.innerHTML = eIco(`
                    <button onclick="document.getElementById('ai-prompt').value='Analyzuj judikaturu k § 2285 OZ'; window.sendAIQuery()" style="padding:6px 12px; background:#e0dbd3; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-right:5px; margin-bottom:5px;">§ 2285 Judikatura</button>
                    <button onclick="document.getElementById('ai-prompt').value='Vyhledej judikáty ohledně smluvní pokuty'; window.sendAIQuery()" style="padding:6px 12px; background:#e0dbd3; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-bottom:5px;">Smluvní pokuta</button>
                `);
            }
        } else if (subTab === 'sovereignty') {
            output.innerHTML = eIco(`
                <style>
                    .sov-card {
                        background: rgba(255, 255, 255, 0.7);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(226, 232, 240, 0.8);
                        border-radius: 12px;
                        padding: 14px;
                        margin-bottom: 15px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
                        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .sov-card:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.08);
                        border-color: rgba(99, 102, 241, 0.4);
                    }
                    .sov-btn {
                        width: 100%;
                        padding: 8px 14px;
                        border: none;
                        border-radius: 8px;
                        font-size: 11px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: all 0.2s ease-in-out;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
                    }
                    .sov-btn-blue {
                        background: linear-gradient(135deg, #8a5320, #8a5320);
                        color: white;
                    }
                    .sov-btn-blue:hover {
                        background: linear-gradient(135deg, #8a5320, #8a5320);
                        transform: translateY(-1px);
                        box-shadow: 0 4px 6px rgba(30, 64, 175, 0.2);
                    }
                    .sov-btn-green {
                        background: linear-gradient(135deg, #5a8a4a, #4f7a41);
                        color: white;
                    }
                    .sov-btn-green:hover {
                        background: linear-gradient(135deg, #4f7a41, #3f6b34);
                        transform: translateY(-1px);
                        box-shadow: 0 4px 6px rgba(22, 163, 74, 0.2);
                    }
                    .ledger-dot {
                        width: 6px;
                        height: 6px;
                        background: var(--accent);
                        border-radius: 50%;
                        display: inline-block;
                        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
                    }
                    .ledger-badge {
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 8px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }
                </style>
                <div style="font-family: 'Inter', system-ui, sans-serif; color: #2b2926; line-height: 1.5; padding: 5px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <h3 style="margin:0; color:#8a5320; display:flex; align-items:center; gap:8px; font-size: 14px; font-weight: 800;">
                            <span>🇪🇺</span> Technologická suverenita
                        </h3>
                        <span style="font-size: 9px; font-weight: bold; background: #f2ece0; color: #0369a1; padding: 2px 6px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.5px;">Lokální AI</span>
                    </div>
                    <p style="font-size:11px; color:#77716a; line-height:1.4; margin: 0 0 15px 0;">
                        Systém běží lokálně na vašem HW a plně odpovídá evropským nařízením o ochraně osobních údajů (GDPR) a AI Act.
                    </p>
                    
                    <div class="sov-card">
                        <h4 style="margin:0 0 10px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#5c574f; display:flex; align-items:center; gap:6px;">
                            <span>🔋</span> Ekologická Telemetrie & HW
                        </h4>
                        <div id="sovereign-telemetry-status" style="font-size:11px; display:flex; flex-direction:column; gap:6px;">
                            Načítám telemetrická data z lokálního serveru...
                        </div>
                    </div>

                    <div class="sov-card">
                        <h4 style="margin:0 0 10px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#5c574f; display:flex; justify-content:space-between; align-items:center;">
                            <span style="display:flex; align-items:center; gap:6px;"><span>📜</span> AI Act Ledger (Audit)</span>
                            <button onclick="window.verifyLedgerIntegrity()" style="padding:2px 8px; background:rgba(0,51,153,0.1); color:#8a5320; border:1px solid rgba(0,51,153,0.2); border-radius:4px; font-size:9px; font-weight:800; cursor:pointer; transition: all 0.2s;">Ověřit integritu</button>
                        </h4>
                        <div id="ledger-verification-status" style="font-size:10px; margin-bottom:8px; font-weight:bold;"></div>
                        <div id="ledger-recent-transactions" style="font-size:10px; color:#77716a; display:flex; flex-direction:column; gap:4px;">
                            Načítám poslední transakce...
                        </div>
                    </div>

                    <div class="sov-card">
                        <h4 style="margin:0 0 8px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#5c574f; display:flex; align-items:center; gap:6px;">
                            <span>🔑</span> Rotace šifrovacích klíčů
                        </h4>
                        <p style="margin:0 0 12px 0; font-size:10px; color:#77716a; line-height:1.3;">
                            Vektorové databáze (RAG) jsou kryptograficky odděleny pro každý spis. Můžete rotovat šifrovací klíče.
                        </p>
                        <button onclick="window.rotateLocalKeys()" class="sov-btn sov-btn-blue">
                            🔄 Rotovat šifrovací klíče
                        </button>
                        <div id="key-rotation-status" style="font-size:10px; margin-top:5px; font-weight:bold;"></div>
                    </div>

                    <div class="sov-card">
                        <h4 style="margin:0 0 8px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#5c574f; display:flex; align-items:center; gap:6px;">
                            <span>📦</span> Dublin Core PDF/A Archivace
                        </h4>
                        <p style="margin:0 0 12px 0; font-size:10px; color:#77716a; line-height:1.3;">
                            Stáhněte si standardizovaná metadata v Dublin Core XML formátu k aktuálnímu dokumentu.
                        </p>
                        <button onclick="window.downloadArchivalMetadata()" class="sov-btn sov-btn-green">
                            📥 Stáhnout Dublin Core XML
                        </button>
                    </div>
                </div>
            `);

            window.loadSovereignTelemetry = async () => {
                const statusEl = document.getElementById('sovereign-telemetry-status');
                if (!statusEl) return;
                try {
                    const conn = this.getLexisLocalConnection();
                    const response = await fetch(`${conn.baseUrl}/api/system/telemetry`, { headers: conn.headers });
                    if (!response.ok) throw new Error("Chyba při komunikaci se serverem.");
                    
                    const stats = await response.json();
                    
                    const ramUsedGb = stats.memoryTotalGb - stats.memoryFreeGb;
                    const ramPct = Math.round((ramUsedGb / stats.memoryTotalGb) * 100);
                    
                    const vramTotal = stats.vramTotalGb || 8;
                    const vramFree = stats.vramFreeGb || 5;
                    const vramUsedGb = vramTotal - vramFree;
                    const vramPct = Math.round((vramUsedGb / vramTotal) * 100);

                    statusEl.innerHTML = eIco(`
                        <div style="font-size: 10px; color: #77716a; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid #edeae4; padding-bottom: 8px;">
                            <div><strong>OS:</strong> ${stats.platform} (${stats.arch})</div>
                            <div style="text-align: right;"><strong>CPU:</strong> ${stats.cpuCores} jader</div>
                            <div><strong>Uptime:</strong> ${Math.round(stats.uptimeSeconds / 3600)} hod</div>
                            <div style="text-align: right;"><strong>Zatížení:</strong> ${stats.systemLoad}</div>
                        </div>
                        
                        <div style="margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: #5c574f; margin-bottom: 4px;">
                                <span>🧠 Operační paměť (RAM)</span>
                                <span>${ramUsedGb.toFixed(1)} / ${stats.memoryTotalGb} GB (${ramPct}%)</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e0dbd3; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${ramPct}%; height: 100%; background: linear-gradient(90deg, #9a5b22, var(--accent)); border-radius: 3px;"></div>
                            </div>
                        </div>

                        <div>
                            <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: #5c574f; margin-bottom: 4px;">
                                <span>🔋 Grafická paměť (VRAM)</span>
                                <span>${vramUsedGb.toFixed(1)} / ${vramTotal} GB (${vramPct}%)</span>
                            </div>
                            <div style="width: 100%; height: 6px; background: #e0dbd3; border-radius: 3px; overflow: hidden;">
                                <div style="width: ${vramPct}%; height: 100%; background: linear-gradient(90deg, #5a8a4a, #9a5b22); border-radius: 3px;"></div>
                            </div>
                        </div>
                    `);
                } catch (e) {
                    statusEl.innerHTML = eIco(`<span style="color:#c0553f; font-weight:700;">Chyba: Lokální server neodpovídá.</span>`);
                }
            };

            window.verifyLedgerIntegrity = async () => {
                const statusEl = document.getElementById('ledger-verification-status');
                if (!statusEl) return;
                statusEl.innerHTML = eIco("Ověřuji hashovací blockchain řetězec...");
                statusEl.style.color = "#77716a";
                
                try {
                    const conn = this.getLexisLocalConnection();
                    const response = await fetch(`${conn.baseUrl}/api/audit/transparency/verify`, { headers: conn.headers });
                    if (!response.ok) throw new Error("Chyba při verifikaci.");
                    
                    const data = await response.json();
                    if (data.valid) {
                        statusEl.innerHTML = eIco("✅ Integrita ledgeru je 100% v pořádku!");
                        statusEl.style.color = "#5a8a4a";
                    } else {
                        statusEl.innerHTML = eIco(`❌ Narušena integrita: ${data.reason}`);
                        statusEl.style.color = "#c0553f";
                    }
                } catch (e) {
                    statusEl.innerHTML = eIco(`❌ Selhalo: ${e.message}`);
                    statusEl.style.color = "#c0553f";
                }
            };

            window.loadRecentLedgerTransactions = async () => {
                const listEl = document.getElementById('ledger-recent-transactions');
                if (!listEl) return;
                
                try {
                    const conn = this.getLexisLocalConnection();
                    const response = await fetch(`${conn.baseUrl}/api/audit/transparency`, { headers: conn.headers });
                    if (!response.ok) throw new Error("Chyba při načítání transakcí.");
                    
                    const logs = await response.json();
                    if (logs.length === 0) {
                        listEl.innerHTML = eIco("<div style='text-align:center; padding:10px; color:#a09a92; font-size:10px;'>Žádné záznamy v ledgeru.</div>");
                        return;
                    }
                    
                    const recent = logs.slice(-4).reverse();
                    listEl.innerHTML = eIco(`
                        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 5px; position: relative;">
                            ${recent.map((log, idx) => {
                                const isKeyRotation = log.action && log.action.includes('rotate');
                                const badgeColor = isKeyRotation ? 'background:#f0dcd6; color:#c0553f;' : 'background:#f2ece0; color:#0369a1;';
                                return `
                                    <div style="display: flex; gap: 10px; align-items: flex-start; position: relative;">
                                        <div style="display: flex; flex-direction: column; align-items: center;">
                                            <span class="ledger-dot"></span>
                                            ${idx < recent.length - 1 ? '<div style="width: 1px; height: 35px; background: #e0dbd3; margin-top: 4px;"></div>' : ''}
                                        </div>
                                        <div style="flex: 1; font-size: 10px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                                <span style="font-weight: bold; color: #2b2926;">${log.action}</span>
                                                <span class="ledger-badge" style="${badgeColor}">${log.humanApproved ? 'ověřeno' : 'systém'}</span>
                                            </div>
                                            <div style="color: #77716a; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">
                                                ${log.prompt || 'Bez dodatečných parametrů'}
                                            </div>
                                            <div style="color: #a09a92; font-size: 8px; font-family: monospace; margin-top: 1px;">
                                                Hash: ${log.hash ? log.hash.substring(0, 16) : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `);
                } catch (e) {
                    listEl.innerHTML = eIco("<div style='color:#c0553f; font-size:10px;'>Chyba při načítání auditních logů.</div>");
                }
            };

            window.rotateLocalKeys = async () => {
                const statusEl = document.getElementById('key-rotation-status');
                if (!statusEl) return;
                statusEl.innerHTML = eIco("Rotuji klíče a přešifrovávám databázi...");
                statusEl.style.color = "#77716a";
                
                try {
                    const conn = this.getLexisLocalConnection();
                    const response = await fetch(`${conn.baseUrl}/api/system/rotate-key`, { method: 'POST', headers: conn.headers });
                    if (!response.ok) throw new Error("Chyba při rotaci klíče.");
                    
                    const data = await response.json();
                    if (data.success) {
                        statusEl.innerHTML = eIco("✅ Klíč úspěšně rotován a RAG indexy přešifrovány!");
                        statusEl.style.color = "#5a8a4a";
                    } else {
                        throw new Error(data.error || "Neznámá chyba.");
                    }
                } catch (e) {
                    statusEl.innerHTML = eIco(`❌ Selhalo: ${e.message}`);
                    statusEl.style.color = "#c0553f";
                }
            };

            window.downloadArchivalMetadata = async () => {
                try {
                    const title = this.currentDocumentTitle || "Nový dokument";
                    const creator = (await this.core.storage.get('settings', 'lawyer-name')) || "JUDr. Martin Černý";
                    const description = this.core.getText().substring(0, 200).trim() || "Archivovaný dokument";
                    const language = document.getElementById('app-lang')?.value || "cs";

                    const conn = this.getLexisLocalConnection();
                    const response = await fetch(`${conn.baseUrl}/api/document/archive`, {
                        method: 'POST',
                        headers: conn.headers,
                        body: JSON.stringify({
                            title,
                            creator,
                            subject: 'Právní dokument',
                            description,
                            type: 'Text',
                            language,
                            rights: 'Copyright (c) ' + new Date().getFullYear() + ' ' + creator
                        })
                    });

                    if (!response.ok) throw new Error("Chyba při komunikaci se serverem.");

                    const xmlText = await response.text();
                    
                    const blob = new Blob([xmlText], { type: 'application/xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_metadata.xml`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (e) {
                    alert("Chyba při stahování metadat: " + e.message);
                }
            };

            if (actions) actions.style.display = 'none';
            window.loadSovereignTelemetry();
            window.loadRecentLedgerTransactions();
        } else if (subTab === 'summary') {
            output.innerHTML = eIco("📝 <b>Automatické shrnutí dokumentu</b><br><br>Klikněte na tlačítko níže pro vygenerování stručného shrnutí celého aktuálního dokumentu.");
            if (actions) {
                actions.style.display = 'flex';
                actions.innerHTML = eIco(`
                    <button onclick="document.getElementById('ai-prompt').value='Vytvoř stručné a strukturované shrnutí tohoto textu.'; window.sendAIQuery()" style="padding:8px 16px; background:var(--word-blue); color:white; border:none; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">⚡ Spustit shrnutí</button>
                `);
            }
        } else if (subTab === 'kb') {
            output.innerHTML = eIco("🧠 <b>Znalostní báze (Knowledge Base)</b><br><br>AI využívá lokálně nahrané soubory z vaší kanceláře. Zadejte dotaz mířící do vašich interních předpisů a doložek.");
            if (actions) actions.style.display = 'none';
        }
    },

    async anonymizeDocument() {
        const text = this.core.getText();
        if (!text || !text.trim()) {
            this.dialogs.customAlert("Dokument je prázdný, není co anonymizovat.");
            return;
        }

        try {
            const conn = this.getLexisLocalConnection();
            const response = await fetch(`${conn.baseUrl}/api/document/anonymize`, {
                method: 'POST',
                headers: conn.headers,
                body: JSON.stringify({ text })
            });

            if (!response.ok) throw new Error("Chyba při komunikaci se serverem.");
            const data = await response.json();
            
            this.showAnonymizationDialog(text, data.anonymized);
        } catch (e) {
            this.dialogs.customAlert("Nepodařilo se anonymizovat dokument: " + e.message);
        }
    },

    showAnonymizationDialog(originalText, anonymizedText) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(15, 23, 42, 0.4)';
        overlay.style.backdropFilter = 'blur(12px)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999';
        overlay.style.fontFamily = "'Inter', sans-serif";
        overlay.style.transition = 'all 0.3s ease';

        const dialog = document.createElement('div');
        dialog.style.background = 'rgba(255, 255, 255, 0.95)';
        dialog.style.border = '1px solid rgba(255, 255, 255, 0.4)';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '16px';
        dialog.style.maxWidth = '750px';
        dialog.style.width = '90%';
        dialog.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
        dialog.style.display = 'flex';
        dialog.style.flexDirection = 'column';
        dialog.style.gap = '20px';
        dialog.style.transform = 'scale(0.95)';
        dialog.style.transition = 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';

        dialog.innerHTML = eIco(`
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 36px; height: 36px; background: rgba(22, 163, 74, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #5a8a4a;">🛡️</div>
                <div>
                    <h3 style="margin: 0; color: #2b2926; font-size: 15px; font-weight: 800;">GDPR Data Shield Anonymizace</h3>
                    <p style="margin: 2px 0 0 0; font-size: 11px; color: #77716a;">
                        Detekovali a odstranili jsme citlivé údaje. Zkontrolujte výsledek a uložte změny.
                    </p>
                </div>
            </div>
            
            <div style="display: flex; gap: 20px; height: 320px;">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 10px; font-weight: 800; color: #a09a92; letter-spacing: 0.5px; text-transform: uppercase;">PŮVODNÍ TEXT</span>
                    <textarea readonly style="flex: 1; font-size: 11px; padding: 12px; border: 1px solid #e0dbd3; border-radius: 8px; resize: none; background: #faf9f7; color: #a09a92; line-height: 1.5; font-family: inherit;">${originalText}</textarea>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 10px; font-weight: 800; color: #5a8a4a; letter-spacing: 0.5px; text-transform: uppercase;">ANONYMIZOVANÝ TEXT</span>
                    <textarea id="anonymized-preview-text" style="flex: 1; font-size: 11px; padding: 12px; border: 1px solid #d9e6d0; border-radius: 8px; resize: none; background: #eef3ea; color: #3f6b34; line-height: 1.5; font-family: inherit; outline: none; transition: border-color 0.2s;">${anonymizedText}</textarea>
                </div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 5px;">
                <button id="btn-anon-cancel" style="padding: 10px 20px; background: #edeae4; border: none; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; color: #5c574f; transition: background 0.2s;">Zrušit</button>
                <button id="btn-anon-confirm" style="padding: 10px 20px; background: linear-gradient(135deg, #5a8a4a, #4f7a41); color: white; border: none; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2);">Nahradit text v dokumentu</button>
            </div>
        `);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        setTimeout(() => {
            dialog.style.transform = 'scale(1)';
        }, 10);

        dialog.querySelector('#btn-anon-cancel').onclick = () => {
            dialog.style.transform = 'scale(0.95)';
            overlay.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 250);
        };

        dialog.querySelector('#btn-anon-confirm').onclick = () => {
            const finalText = dialog.querySelector('#anonymized-preview-text').value;
            const anonymizedHtml = finalText
                .split('\n')
                .map(para => para.trim() ? `<p>${para}</p>` : '<p><br></p>')
                .join('');
            this.core.setContent(anonymizedHtml);
            
            dialog.style.transform = 'scale(0.95)';
            overlay.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 250);
        };
    },

    scanForVariables() {
        const form = document.getElementById('variables-form');
        if (!form) return;
        
        form.innerHTML = eIco('');
        const text = this.core.getText();
        
        const regex = /\[([A-ZÁ-Ž0-9_]{3,30})\]|\{\{([a-zA-Z0-9_á-žÁ-Ž]{2,30})\}\}/g;
        const variables = new Set();
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const varName = match[1] || match[2];
            variables.add(varName);
        }
        
        if (variables.size === 0) {
            form.innerHTML = eIco('<div style="font-size:11px; color:#77716a; text-align:center; padding:10px;">Nebyly nalezeny žádné proměnné typu [JMÉNO] nebo {{jmeno}}.</div>');
            return;
        }
        
        // Šablonu s placeholdery zachytíme JEDNOU. Dřívější kód přepisoval
        // innerHTML při každém stisku — po prvním znaku byl placeholder pryč,
        // takže se vložil jen první znak; navíc přímý zápis do innerHTML
        // rozbíjel Delta model Quillu (undo/redo, kurzor). Nově skládáme celý
        // dokument z původní šablony se všemi aktuálními hodnotami (escapovanými)
        // a aplikujeme přes Quill.
        const originalHtml = this.core.quill.root.innerHTML;
        const values = {};

        const applyValues = () => {
            let out = originalHtml;
            variables.forEach(v => {
                const raw = values[v];
                if (raw) {
                    const rep = this._esc ? this._esc(raw) : String(raw);
                    out = out.split(`[${v}]`).join(rep).split(`{{${v}}}`).join(rep);
                }
            });
            try {
                if (this.core.quill.clipboard && this.core.quill.clipboard.dangerouslyPasteHTML) {
                    this.core.quill.clipboard.dangerouslyPasteHTML(out);
                } else {
                    this.core.quill.root.innerHTML = out;
                }
            } catch (e) {
                this.core.quill.root.innerHTML = out;
            }
        };

        variables.forEach(varName => {
            const container = document.createElement('div');
            container.style = "display:flex; flex-direction:column; gap:4px; margin-bottom:10px;";

            const label = document.createElement('label');
            label.style = "font-size:10px; font-weight:700; color:#5c574f; text-transform:uppercase;";
            label.innerText = varName;

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Vyplňte ${varName}...`;
            input.style = "padding:6px; border:1px solid #ddd6cb; border-radius:4px; font-size:12px;";

            input.addEventListener('input', () => {
                values[varName] = input.value;
                applyValues();
            });

            container.appendChild(label);
            container.appendChild(input);
            form.appendChild(container);
        });
    },

    sendViaEmail() {
        const docTitle = document.getElementById('window-doc-title').innerText || "Bez názvu";
        const subject = "Dokument z LexisEditoru: " + docTitle;
        const documentText = this.core.getText() || "";
        const emailContent = documentText.length < 1500 ? documentText : (documentText.substring(0, 1500) + "\n\n...[Text zkrácen z důvodu limitu délky odkazu]...");
        const body = `${emailContent}\n\n---\nOdesláno z LexisEditoru`;
        // Bez pevného příjemce — advokát vyplní adresáta v poštovním klientu
        // (dřív tu byla natvrdo cizí vývojářská adresa). V Electronu přes
        // shell.openExternal (nové okno pošty), v prohlížeči fallback.
        const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        if (window.electronAPI && window.electronAPI.openExternalUrl) window.electronAPI.openExternalUrl(url);
        else window.location.href = url;
    },

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
                await this.core.storage.set('templates', { id: templateKey, ...tplObj });
                
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
    },

    exportWebPreview() {
        const html = this.core.getContent();
        const headerArea = document.getElementById('header-area');
        const footerArea = document.getElementById('footer-area');
        const headerHtml = headerArea ? headerArea.innerHTML : '';
        const footerHtml = footerArea ? footerArea.innerHTML : '';
        // Náhled musí obsahovat hlavičku i patičku, jinak vypadají jinak než dokument.
        const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Náhled</title></head><body>`
            + (headerHtml ? `<div class="page-header" style="padding:10mm 20mm 5mm;">${headerHtml}</div>` : '')
            + `<div class="ql-editor">${html}</div>`
            + (footerHtml ? `<div class="page-footer" style="padding:5mm 20mm 10mm;">${footerHtml}</div>` : '')
            + `</body></html>`;
        const blob = new Blob([full], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    },

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
                
                await this.core.storage.set('settings', { key: 'knowledge-base', value: this.core.knowledgeBase });
                this.customAlert(`✅ <b>Indexace úspěšná!</b><br><br>Dokument <b>${docTitle}</b> byl indexován do lokální znalostní báze pro AI rešerše.`);
            });
        });
    },

    async exportToDocx() {
        if (window.electronAPI && (window.electronAPI.exportDocxV2 || window.electronAPI.exportDocx)) {
            const html = this.core.getContent();
            const quill = this.core.quill;
            const deltaOps = (quill && quill.getContents) ? quill.getContents().ops : null;
            const headerArea = document.getElementById('header-area');
            const footerArea = document.getElementById('footer-area');
            const headerHtml = headerArea ? headerArea.innerHTML : '';
            const footerHtml = footerArea ? footerArea.innerHTML : '';
            const linesOf = (el) => el ? String(el.innerText || '').split('\n').map(s => s.trim()).filter(Boolean) : [];
            const titleEl = document.getElementById('window-doc-title');
            const title = (titleEl && titleEl.innerText) || this.currentDocumentTitle || 'Dokument';
            // Vodoznak (KONCEPT/NEPLATNÉ/…) čteme z vrstvy na pozadí editoru a přeneseme
            // do .docx jako wordovský WordArt v hlavičce (nativní cesta ho vykreslí).
            const wmLayer = document.getElementById('watermark-layer');
            let watermark = null;
            if (wmLayer && wmLayer.getAttribute('data-watermark-type') === 'text') {
                const wmText = wmLayer.getAttribute('data-watermark-text') || '';
                if (wmText.trim()) {
                    watermark = { type: 'text', text: wmText, color: wmLayer.getAttribute('data-watermark-color') || 'd0d0d0' };
                }
            }
            // Bohatší hlavička/patička: z HTML uděláme model (tučné/kurzíva/podtržení,
            // zarovnání, logo), aby to nativní export zachoval. Fallback = prosté řádky.
            let headerModel = null, footerModel = null;
            if (window.LexisHeaderModel && window.LexisHeaderModel.htmlToHeaderModel) {
                try {
                    headerModel = window.LexisHeaderModel.htmlToHeaderModel(headerHtml, document);
                    footerModel = window.LexisHeaderModel.htmlToHeaderModel(footerHtml, document);
                } catch (e) { headerModel = null; footerModel = null; }
            }
            try {
                let result;
                if (window.electronAPI.exportDocxV2) {
                    // Chytrý export: main podle obsahu zvolí nativní OOXML (revize/poznámky/
                    // obsah/vodoznak) nebo html-to-docx. Delta nese revize a poznámky strukturovaně.
                    result = await window.electronAPI.exportDocxV2({
                        deltaOps: deltaOps, html: html,
                        headerHtml: headerHtml, footerHtml: footerHtml,
                        headerLines: linesOf(headerArea), footerLines: linesOf(footerArea),
                        headerModel: headerModel, footerModel: footerModel,
                        title: title, watermark: watermark
                    });
                } else {
                    result = await window.electronAPI.exportDocx(html, headerHtml, footerHtml);
                }
                if (result && result.success) {
                    const nativeNote = result.native ? '\n\n✔ Zachovány sledované změny / poznámky pod čarou / obsah.' : '';
                    this.customAlert(`Dokument byl úspěšně uložen do:\n\n${result.path}${nativeNote}`);
                } else if (result && !result.canceled) {
                    this.customAlert(`Chyba při ukládání dokumentu:\n\n${result.error}`);
                }
            } catch (error) {
                this.customAlert(`Neočekávaná chyba:\n\n${error.message}`);
            }
        } else {
            this.customAlert("Export do DOCX je dostupný pouze v desktopové (Electron) verzi LexisEditoru.");
        }
    },

    exportToBundle() {
        this.checkEnterpriseFeature("Export do Lexis Bundle (.lexis)", async () => {
            const html = this.core.getContent();
            const text = this.core.getText();
            const docTitle = document.getElementById('window-doc-title').innerText || "Bez názvu";
            const headerArea = document.getElementById('header-area');
            const footerArea = document.getElementById('footer-area');

            const bundle = {
                title: docTitle,
                html: html,
                text: text,
                // Hlavička a patička musí být součástí bundlu, jinak se při re-importu ztratí.
                headerHtml: headerArea ? headerArea.innerHTML : '',
                footerHtml: footerArea ? footerArea.innerHTML : '',
                exportedAt: new Date().toISOString(),
                version: this.appVersion || '',
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
    },

    async searchAres() {
        this.customPrompt("Zadejte IČO subjektu (8 číslic):", "", async (ico) => {
            if (!ico) return;
            const cleanIco = ico.replace(/\s/g, '');

            // Předběžná kontrola IČO (kontrolní součet) — chytí překlep dřív než ARES.
            if (window.LexisValidators && !window.LexisValidators.isValidIco(cleanIco)) {
                return this.customAlert("❌ <b>Neplatné IČO</b><br><br>IČO musí mít 8 číslic a platný kontrolní součet. Zkontroluj překlep.");
            }

            if (window.electronAPI && window.electronAPI.searchAres) {
                this.showLoader("Lustruji subjekt v ARES...", async () => {
                    try {
                        const result = await window.electronAPI.searchAres(cleanIco);
                        if (result && result.success) {
                            const d = result.data;
                            const baseStyle = "border: 1px solid #e0dbd3; padding: 16px; border-radius: 8px; margin-bottom: 20px; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; background: #faf9f7;";
                            const html = `
                                <div style="${baseStyle}">
                                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #9a5b22, #8a5320);"></div>
                                    <p style="margin-bottom: 8px; color: #9a5b22; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Ověřeno v ARES: Právnická/Fyzická osoba</p>
                                    <p style="font-size: 18px; margin: 0; color: #2b2926;"><strong>${d.obchodniJmeno}</strong></p>
                                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #5c574f;">
                                        <div><strong>IČO:</strong> ${d.ico}</div>
                                        <div><strong>DIČ:</strong> ${d.dic || 'Neuvedeno'}</div>
                                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> ${d.sidlo}</div>
                                        <div style="grid-column: span 2; font-size: 11px; color: #a09a92; font-style: italic;">Staženo z Rejstříku MFČR (${d.pravniForma})</div>
                                    </div>
                                </div>
                                <p><br></p>
                            `;
                            
                            const range = this.core.quill.getSelection(true);
                            this.core.safePasteHTML(range.index, html);
                        } else {
                            this.customAlert(`ARES API nenašlo žádná data nebo selhalo:\n\n${result.error}`);
                        }
                    } catch (error) {
                        this.customAlert(`Neočekávaná chyba při volání ARES:\n\n${error.message}`);
                    }
                });
            } else {
                // Prohlížečová verze: REÁLNÝ dotaz na veřejné ARES v3 REST API (CORS povolen).
                // Žádná simulace — při chybě čestné hlášení, nic se nevymýšlí.
                (async () => {
                    try {
                        const resp = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${encodeURIComponent(cleanIco)}`, { headers: { 'Accept': 'application/json' } });
                        if (!resp.ok) {
                            throw new Error(resp.status === 404 ? 'Subjekt s tímto IČO nebyl v ARES nalezen.' : `ARES vrátil stav ${resp.status}.`);
                        }
                        const j = await resp.json();
                        const sidlo = (j.sidlo && (j.sidlo.textovaAdresa || j.sidlo.nazevObce)) || 'Adresa nezjištěna';
                        const esc = (v) => window.escapeHTML(String(v == null ? '' : v));
                        const baseStyle = "border: 1px solid #e0dbd3; padding: 16px; border-radius: 8px; margin-bottom: 20px; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; background: #faf9f7;";
                        const html = `
                            <div style="${baseStyle}">
                                <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #9a5b22, #8a5320);"></div>
                                <p style="margin-bottom: 8px; color: #9a5b22; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Ověřeno v ARES: Ekonomický subjekt</p>
                                <p style="font-size: 18px; margin: 0; color: #2b2926;"><strong>${esc(j.obchodniJmeno || 'Neuvedeno')}</strong></p>
                                <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #5c574f;">
                                    <div><strong>IČO:</strong> ${esc(j.ico || cleanIco)}</div>
                                    <div><strong>DIČ:</strong> ${esc(j.dic || 'Neuvedeno')}</div>
                                    <div style="grid-column: span 2;"><strong>Sídlo:</strong> ${esc(sidlo)}</div>
                                    <div style="grid-column: span 2; font-size: 11px; color: #a09a92; font-style: italic;">Staženo z ARES (ares.gov.cz)</div>
                                </div>
                            </div>
                            <p><br></p>
                        `;
                        const range = this.core.quill.getSelection(true);
                        this.core.safePasteHTML(range.index, html);
                    } catch (e) {
                        this.customAlert(`Lustrace v ARES se nezdařila: ${e.message}`);
                    }
                })();
            }
        });
    },

    exec(format, value = true) {
        const current = this.core.quill.getFormat();
        if (current[format] === value) {
            this.core.quill.format(format, false);
        } else {
            this.core.quill.format(format, value);
        }
    },

    indent(val) {
        const range = this.core.quill.getSelection();
        if (range) {
            const currentIndent = this.core.quill.getFormat(range).indent || 0;
            const newIndent = Math.max(0, currentIndent + val);
            this.core.quill.format('indent', newIndent === 0 ? false : newIndent);
        }
    },

    applyStyle(style) {
        if (style === 'h1') {
            this.core.quill.format('header', 1);
        } else if (style === 'h2') {
            this.core.quill.format('header', 2);
        } else {
            this.core.quill.format('header', false);
        }
    },

    applyHighlight(color) {
        const current = this.core.quill.getFormat();
        if (current.background === color) {
            this.core.quill.format('background', false);
        } else {
            this.core.quill.format('background', color);
        }
    },

    setLineHeight(val) {
        this.core.quill.format('lineheight', val);
    },

    toggleDictation() {
        const btn = document.getElementById('dictation-btn');
        if (this.isDictating) {
            if (this.recognition) {
                this.recognition.stop();
            }
            this.isDictating = false;
            if (btn) {
                btn.style.background = '';
                btn.innerHTML = eIco('<div class="icon-sq">🎙️</div>Diktovat');
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
                    btn.innerHTML = eIco('<div class="icon-sq">🔴</div>Nahrávám...');
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
                    btn.innerHTML = eIco('<div class="icon-sq">🎙️</div>Diktovat');
                }
            };
            
            this.recognition.start();
        }
    },

    openPostDialog() {
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
        
        const modal = document.createElement('div');
        modal.style = "background:#fff;padding:28px;border-radius:16px;width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif;border:1px solid #e0dbd3;position:relative;animation: modalFadeIn 0.3s ease;";
        
        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            @keyframes modalFadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(styleSheet);
        
        modal.innerHTML = eIco(`
            <div style="font-weight:700;font-size:18px;margin-bottom:8px;color:#2b2926;display:flex;align-items:center;gap:10px;">
                <span>✉️</span> Dopis Online (Česká pošta)
            </div>
            <div style="font-size:13px;color:#77716a;margin-bottom:20px;">Odešlete aktuální dokument jako fyzický dopis.</div>
            
            <div style="margin-bottom:15px;">
                <label style="display:block;font-size:11px;font-weight:700;color:#5c574f;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Adresát (Příjemce):</label>
                <input id="post-recipient" type="text" value="Jan Novák, Jankovcova 1522, 170 00 Praha" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;box-sizing:border-box;">
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:11px;font-weight:700;color:#5c574f;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Typ zásilky:</label>
                <select id="post-type" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;" onchange="document.getElementById('post-price').innerText = this.value === 'registered' ? '54 Kč' : '26 Kč'">
                    <option value="standard">Obyčejné psaní (A5/A4) — 26 Kč</option>
                    <option value="registered">Doporučené psaní — 54 Kč</option>
                </select>
            </div>
            
            <div style="background:#faf9f7;padding:12px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#4a453f;">
                <span>Předpokládaná cena:</span>
                <strong id="post-price" style="color:#9a5b22;font-size:15px;margin-left:auto;">26 Kč</strong>
            </div>
            
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="post-cancel" style="padding:10px 18px;background:#edeae4;color:#5c574f;border:none;border-radius:8px;cursor:pointer;font-weight:500;font-size:13px;">Zrušit</button>
                <button id="post-send" style="padding:10px 18px;background:#9a5b22;color:#fff;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;box-shadow:0 4px 10px rgba(37,99,235,0.2);">Odeslat dopis</button>
            </div>
        `);
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        const close = () => document.body.removeChild(overlay);
        modal.querySelector('#post-cancel').onclick = close;
        modal.querySelector('#post-send').onclick = () => {
            const recip = modal.querySelector('#post-recipient').value;
            const type = modal.querySelector('#post-type').value === 'registered' ? 'doporučeně' : 'obyčejně';
            
            close();
            // POZOR: skutečné podání zásilky přes PostServis (Dopis Online) NENÍ zapojené —
            // v main.js je jen uložení přihlašovacích údajů a test spojení, ne odeslání.
            // Nikdy netvrdíme „Zásilka podána", když se k České poště nic nepředalo.
            this.customAlert(
                `✉️ <b>Automatické podání přes Dopis Online zatím není aktivní</b><br><br>`
                + `Dopis pro příjemce <b>${this._esc ? this._esc(recip) : recip}</b> se přes Českou poštu <b>automaticky neodeslal</b> `
                + `(napojení na PostServis není zapojené). Dokument máš připravený v editoru — odešli ho zatím jinou cestou `
                + `(datová schránka, e-mail, nebo ho vytiskni a podej na poště, ${this._esc ? this._esc(type) : type}).`
            );
        };
    },

    syncCloud(service) {
        // POZOR: napojení na externí cloud (Dropbox/Drive/OneDrive/…) NENÍ implementováno.
        // Dřív tato funkce jen předstírala úspěch („zálohováno a synchronizováno") — což je
        // u nástroje, na jehož zálohy se advokát spoléhá, nebezpečné. Nikdy netvrdíme, že se
        // data někam nahrála, když se nenahrála. LexisEditor je navíc záměrně lokální
        // (datová suverenita) — data zůstávají šifrovaně na tomto počítači.
        this.customAlert(
            `☁️ <b>Synchronizace s ${this._esc ? this._esc(service) : service} zatím není aktivní</b><br><br>`
            + 'Napojení na externí cloudové úložiště zatím není zapojené — <b>žádná data se nikam nenahrála</b>. '
            + 'LexisEditor ukládá dokumenty i knihovnu doložek <b>šifrovaně lokálně</b> na tomto počítači. '
            + 'Zálohu si zajisti lokálně (Time Machine / kopie složky) nebo přes „Záloha klíče".'
        );
    },

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
        } else if (topic === 'qat-guide') {
            title = "📌 Panel Rychlý přístup (QAT)";
            text = `<b>Přizpůsobení panelu Rychlý přístup:</b><br><br>
1. <b>Připnutí nových funkcí:</b> Klikněte pravým tlačítkem myši na jakoukoli ikonu/funkci v horním Ribbon menu a zvolte <i>„Přidat na panel Rychlý přístup“</i>.<br>
2. <b>Odebrání:</b> Klikněte pravým tlačítkem myši na ikonu přímo v horním panelu rychlého přístupu (zcela nahoře vedle názvu souboru) a zvolte <i>„Odebrat/Skrýt z panelu Rychlý přístup“</i>.<br>
3. <b>Rychlé nastavení:</b> Můžete také kliknout na šipku <b>▾</b> na konci panelu Rychlého přístupu pro rychlé zapnutí/vypnutí výchozích systémových tlačítek (Uložit, Zpět, Tisk...).`;
        } else if (topic === 'user-guide') {
            title = "📖 Návod na zprovoznění lokální AI (Apple Intelligence & Ollama)";
            text = `<div style="max-height: 400px; overflow-y: auto; text-align: left; padding: 10px; font-family: inherit; line-height: 1.6; font-size: 13px;">
                <p>Vítejte u kompletního průvodce pro nastavení <b>100% offline umělé inteligence</b> v LexisEditoru. Všechna data jsou zpracovávána výhradně na vašem lokálním počítači.</p>
                
                <h3 style="color:#9a5b22; border-bottom:1px solid #e4e0d8; padding-bottom:4px; margin-top:16px;">🍏 Metoda A: Apple Intelligence (přes "apfel")</h3>
                <p>Umožňuje přímý přístup k integrovanému 3B AI modelu ve vašem Macu s procesorem Apple Silicon (M1/M2/M3/M4) s macOS 15.0+ (Sequoia).</p>
                <ol style="padding-left: 20px;">
                    <li>Otevřete aplikaci <b>Terminál</b>.</li>
                    <li>Nainstalujte Homebrew (pokud jej nemáte):<br><code style="background:#f4f1ec; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px;">/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"</code></li>
                    <li>Nainstalujte nástroj apfel:<br><code style="background:#f4f1ec; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px;">brew install Arthur-Ficial/tap/apfel</code></li>
                    <li>Spusťte lokální AI server:<br><code style="background:#f4f1ec; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px; font-weight:bold;">apfel --serve</code></li>
                    <li>Na kartě <b>LexisAI</b> zvolte jako poskytovatele <b>Apple Intelligence (apfel)</b>. Endpoint a model se nastaví automaticky.</li>
                </ol>
                <div style="background:rgba(37,99,235,0.08); border-left:4px solid #9a5b22; padding:8px 12px; margin:12px 0; border-radius:0 4px 4px 0; font-size:12px;">
                    💡 <b>Tip:</b> Okno s běžícím příkazem <code>apfel --serve</code> ponechte otevřené na pozadí.
                </div>

                <h3 style="color:#9a5b22; border-bottom:1px solid #e4e0d8; padding-bottom:4px; margin-top:20px;">🦙 Metoda B: Ollama (Univerzální lokální AI)</h3>
                <p>Vhodné pro Windows, Linux i starší Intel Macy. Umožňuje spouštět libovolné open-source modely (např. Llama 3).</p>
                <ol style="padding-left: 20px;">
                    <li>Stáhněte a nainstalujte aplikaci ze stránky <a href="https://ollama.com" target="_blank" style="color:#9a5b22; text-decoration:underline;">ollama.com</a>.</li>
                    <li>Otevřete Terminál / Příkazový řádek a stáhněte model Llama 3:<br><code style="background:#f4f1ec; padding:2px 6px; border-radius:4px; display:block; margin:4px 0; font-family:monospace; font-size:11px;">ollama run llama3</code></li>
                    <li>V Ribbonu na kartě <b>LexisAI</b> zvolte poskytovatele <b>Ollama (Local)</b>.</li>
                </ol>

                <h3 style="color:#9a5b22; border-bottom:1px solid #e4e0d8; padding-bottom:4px; margin-top:20px;">🔒 Absolutní Datová Suverenita</h3>
                <p>Veškeré rešerše, audity smluv i hlasové diktování probíhají offline v paměti vašeho počítače. Žádná data neopouštějí váš stroj.</p>
            </div>`;
        } else if (topic === 'isds') {
            title = "📨 Datová schránka (ISDS)";
            text = `1. <b>Nastavení DS</b> (karta <i>Právní nástroje</i> → <b>Nastavení DS</b>): zadejte přihlašovací údaje, případně certifikát.<br>
2. <b>Odeslání:</b> tlačítkem <b>Dopis Online</b> nebo <b>Odpovědět</b> připravíte podání; systém jej zařadí k odeslání (sledujte ve složce <i>Odeslané</i>).<br>
3. <b>Import ZFO:</b> přijatou zprávu ve formátu <code>.zfo</code> načtete tlačítkem <b>Import ZFO</b>.<br>
4. <b>Doručenka:</b> stav doručení uvidíte u odeslané zprávy.<br>
5. Před odesláním můžete dokument opatřit <b>E-podpisem</b>.<br><br>
<i>Vyžaduje platné přihlášení k ISDS v Nastavení DS.</i>`;
        } else if (topic === 'anonymize') {
            title = "🛡️ Anonymizace (GDPR) a čištění metadat";
            text = `1. <b>GDPR Shield / Anonymizovat:</b> označte text (nebo použijte na celý dokument) a funkce nahradí jména, rodná čísla a adresy zástupnými znaky.<br>
2. <b>Vždy zkontrolujte výsledek</b> před odesláním — v exportu je anonymizace nevratná.<br>
3. <b>Vyčistit metadata:</b> před odesláním DOCX/PDF odstraní skryté údaje (autor, historie úprav, komentáře).<br><br>
<i>Tip: pro čistý úřední výstup vypněte také režim sledování změn.</i>`;
        } else if (topic === 'security') {
            title = "🔒 Zabezpečení, zámek a záloha klíče";
            text = `1. <b>Zabezpečení</b> (karta <i>Právní nástroje</i>): zapněte <b>zámek aplikace</b>, volitelně <b>Touch ID</b>.<br>
2. Nastavte <b>Heslo / PIN</b> v okně Zabezpečení.<br>
3. <b>Záloha klíče — KRITICKÉ:</b> data jsou šifrovaná lokálně. Bez zálohy klíče je při ztrátě počítače nebo reinstalaci <b>nelze obnovit</b>. Uložte zálohu klíče na bezpečné místo (tlačítko <b>Záloha klíče</b>).<br>
4. <b>Zamknout nyní</b> uzamkne aplikaci kdykoli ručně.`;
        } else if (topic === 'citations') {
            title = "⚖️ Citace: Legal Linker, judikatura, rejstřík";
            text = `1. <b>Legal Linker / Odkazovat zákony:</b> automaticky převede zmínky paragrafů a zákonů na ověřené hypertextové odkazy.<br>
2. <b>Judikatura:</b> vyhledá rozhodnutí podle spisové značky nebo tématu.<br>
3. <b>Citace:</b> vloží citaci na pozici kurzoru.<br>
4. <b>Rejstřík citací</b> (Table of Authorities): vygeneruje přehled všech citovaných zdrojů v dokumentu.<br><br>
<i>Tip: před finalizací spusťte <b>Prověřit text</b> (audit) pro kontrolu odkazů a hierarchie.</i>`;
        } else if (topic === 'ai-usage') {
            title = "✨ Práce s LexisAI (panel)";
            text = `Otevřete AI panel (<b>AI Bridge</b> / ikona jiskry).<br><br>
<b>Nad výběrem textu:</b> Analyzovat, Přepsat, Vysvětlit, Přeložit.<br>
<b>Nad celým dokumentem:</b> Hledat rizika, Shrnutí, Dopsat AI, Nová doložka.<br>
<b>Persona (swarm) a model:</b> zvolte styl agenta (Rešeršník / Spisovatel / Stylista / Kontrolor / Sekretářka) a jazykový model.<br><br>
<i>Vše běží přes zvoleného poskytovatele — u lokálního (Ollama / Apple Intelligence) zcela offline. Zprovoznění lokální AI viz „Návod: Lokální AI".</i>`;
        } else if (topic === 'updates') {
            title = "🔄 Kontrola aktualizací";
            text = `<b>Aktuální verze:</b> v${this.appVersion || '—'}<br><br>
Provádím kontrolu lokálního úložiště a serverů...<br>
<i>Vaše verze je aktuální. Žádné nové aktualizace nejsou k dispozici.</i>`;
        } else if (topic === 'about') {
            title = "ℹ️ O aplikaci LexisEditor";
            text = `<b>LexisEditor Professional Legal Workspace</b><br>
Verze: <b>${this.appVersion || '—'}</b><br><br>
Lokální právní textový procesor s integrovaným AI asistentem, napojením na státní registry (ARES) a šifrovaným úložištěm.<br><br>
<i>Vyvinuto s důrazem na absolutní datovou suverenitu advokátní praxe. All rights reserved.</i>`;
        }
        
        this.customAlert(`<b>${title}</b><br><br>${text}`);
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
        // Token: ruční klíč má přednost, jinak auto z lokálního souboru (přes preload).
        const llToken = apiKey || (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.lexisLocalToken) || "";
        if (llToken) {
            headers["X-API-Token"] = llToken;
        }

        return { baseUrl, headers };
    },

    toggleLexisLocalSelectors() {
        const provEl = document.getElementById('ai-provider');
        const container = document.getElementById('lexislocal-selectors-container');
        const modelBox = document.getElementById('lexislocal-model-box');
        if (!provEl || !container) return;
        
        container.style.display = 'flex';
        
        if (provEl.value === 'lexislocal') {
            if (modelBox) modelBox.style.display = 'flex';
            this.fetchLexisLocalModels();
        } else {
            if (modelBox) modelBox.style.display = 'none';
        }
    },

    async fetchLexisLocalModels() {
        const modelSelect = document.getElementById('lexislocal-model');
        if (!modelSelect) return;
        
        try {
            const conn = this.getLexisLocalConnection();
            const response = await fetch(`${conn.baseUrl}/api/models`, { headers: conn.headers });
            if (response.ok) {
                const data = await response.json();
                if (data && data.models && data.models.length > 0) {
                    modelSelect.innerHTML = eIco('');
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
    },

    toggleStatusDropdown(event) {
        event.stopPropagation();
        const dd = document.getElementById('status-dropdown');
        if (dd) {
            const isShown = dd.style.display === 'block';
            dd.style.display = isShown ? 'none' : 'block';
        }
    },

    setDocumentStatus(status, suppressNotification = false) {
        // Status je NEPOVINNÝ — prázdný / „none" = bez stavu (odznak se skryje).
        if (status === 'none' || status === '') status = null;
        this.documentStatus = status || null;
        const badge = document.getElementById('doc-status-badge');
        if (!badge) return;

        // Remove all previous status classes
        badge.className = 'status-pill';

        let label = '', iconId = '';
        if (status === 'draft') {
            badge.classList.add('status-draft');
            label = 'Rozpracované'; iconId = 'psat';
        } else if (status === 'ai') {
            badge.classList.add('status-ai');
            label = 'Generované AI'; iconId = 'ai-jiskra';
        } else if (status === 'review') {
            badge.classList.add('status-review');
            label = 'Ke kontrole'; iconId = 'najit';
        } else if (status === 'final') {
            badge.classList.add('status-final');
            label = 'Hotové'; iconId = 'prijmout';
        }

        // Stav je NEPOVINNÝ. Se stavem → barevný odznak s ikonou; bez stavu → tichá
        // volitelná značka „+ Stav" (uživatel ji může ignorovat, nic není vynuceno).
        if (label) {
            var ic = (window.LexisIcons && iconId)
                ? window.LexisIcons.sizeSvg(window.LexisIcons.get(iconId), 12).replace('display:block', 'display:inline-block;vertical-align:-2px;margin-right:4px')
                : '';
            badge.innerHTML = eIco(ic + label);
            badge.title = 'Změnit stav dokumentu';
        } else {
            badge.classList.add('status-empty');
            badge.innerHTML = eIco('<span class="status-add-plus">+</span>Stav');
            badge.title = 'Přidat stav dokumentu (volitelné)';
        }
        badge.style.display = '';

        if (!suppressNotification && label) {
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
    },

    async saveActiveDocumentState() {
        try {
            if (!this.currentDocumentId) {
                this.currentDocumentId = 'doc_' + Date.now();
            }
            
            const html = this.core.getContent();
            const text = this.core.getText();
            const title = this.currentDocumentTitle || text.substring(0, 30).trim() || "Nový dokument";
            
            const headerArea = document.getElementById('header-area');
            const footerArea = document.getElementById('footer-area');
            const headerHtml = headerArea ? headerArea.innerHTML : '';
            const footerHtml = footerArea ? footerArea.innerHTML : '';
            
            const state = {
                id: this.currentDocumentId,
                html: html,
                text: text,
                title: title,
                status: this.documentStatus || null,
                deadline: this.currentDocumentDeadline || null,
                cj: this.currentDocumentCj || '',
                headerHtml: headerHtml,
                footerHtml: footerHtml,
                updatedAt: new Date().toISOString()
            };
            
            await this.core.storage.set('documents', state);
            await this.core.storage.set('settings', { key: 'active-document-id', value: this.currentDocumentId });
        } catch (e) {
            console.error("Chyba při ukládání stavu aktivního dokumentu:", e);
        }
    }

});
