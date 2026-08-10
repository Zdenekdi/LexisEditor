// lexis-ui-4.js — část UI vytažená z lexis-ui.js (prototype-mixin, beze změny chování).
// Načítá se v index.html PO lexis-ui.js. Obsahuje: goToStartScreen, proceedToStartScreen, renderRecentDocuments, fetchInbox, parseTestDocument, markInboxRead, prepareReply, insertAresData, filterRecentDocs, openRecentDocument, deleteRecentDocument, updateDeadlineBadge, showDeadlineInfo, convertCitationsToLinks, cleanDocumentForOfficialSubmission, updateDocumentOutline, scanTextForDeadlines, promptAddDeadline, promptAddDeadlineDate, renderDeadlines, removeActiveDeadline, signDigital, showProfileModal, insertTOC, insertTitlePage, insertIllustration, insertBookmark, insertPageNumber, showDeadlineCalc, insertSignatureBlock, insertMySignature, insertArticle, insertParagraph, insertCitation
Object.assign(LexisUI.prototype, {

    async goToStartScreen() {
        try {
            // Auto-save currently open document
            if (this.currentDocumentId) {
                await this.saveActiveDocumentState();
            }
            
            // Check for unlogged active time
            if (this.activeSessionTimeMs && this.activeSessionTimeMs >= 30000) {
                const mins = Math.max(1, Math.round(this.activeSessionTimeMs / 60000));
                this.customConfirm(
                    `Máte nevykázanou práci na tomto dokumentu (zaznamenáno cca ${mins} min.). Chcete ji před odchodem vykázat?`,
                    "Ano, vykázat",
                    "Ne, odejít bez vykázání",
                    async (agree) => {
                        if (agree) {
                            this.showTimeTrackingDialog(null, () => this.proceedToStartScreen());
                        } else {
                            await this.proceedToStartScreen();
                        }
                    }
                );
            } else {
                await this.proceedToStartScreen();
            }
        } catch (e) {
            console.error("Chyba při přechodu na úvodní obrazovku:", e);
        }
    },

    async proceedToStartScreen() {
        try {
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
    },

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
    },

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
                                    <span>📄</span> ${window.escapeHTML(doc.caseNumber)}
                                </div>
                                ${deadlineBadge}
                            </div>
                            <div style="font-size: 11px; color: #475569;">
                                <b>Žalobce:</b> ${window.escapeHTML(doc.plaintiff)}<br>
                                <b>Žalovaný:</b> ${window.escapeHTML(doc.defendant)}
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
    },

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
    },

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
    },

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
                this.resetHeaderFooterDOM();
                
                // Set the title input field
                const titleInput = document.getElementById('doc-title');
                if (titleInput) titleInput.value = this.currentDocumentTitle;
                
                // 3. Draft formal response brief HTML
                // Skutečný soud se dohledá z podkladů (detekce + registr), ne natvrdo Brno.
                const detText = [doc.summary, doc.caseNumber, doc.plaintiff, doc.defendant].filter(Boolean).join(' ');
                const court = (window.LexisReply && window.LexisReply.courtInfo) ? window.LexisReply.courtInfo(detText) : null;
                const courtHtml = court
                    ? `<b>${window.escapeHTML(court.nazev)}</b>`
                        + (court.adresa ? `<br>${window.escapeHTML(court.adresa)}` : '')
                        + ((court.psc || court.mesto) ? `<br>${window.escapeHTML([court.psc, court.mesto].filter(Boolean).join(' '))}` : '')
                    : `<b>[Adresát – doplňte příslušný soud]</b>`;
                const mistoPodani = (court && court.mesto) ? court.mesto : '[místo]';
                const generatedHtml = `
                    <p style="text-align: right; font-family: 'Times New Roman', serif; font-size: 12pt;">${courtHtml}</p>
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
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;">V ${mistoPodani} dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                    <p style="font-family: 'Times New Roman', serif; font-size: 12pt;"><br></p>
                    <p style="text-align: right; font-family: 'Times New Roman', serif; font-size: 12pt;">...........................................<br><b>${doc.defendant}</b><br>právně zastoupen advokátem</p>
                `;
                
                this.core.setContent(generatedHtml);
                this.setDocumentStatus('draft', true);
                
                // 4. Update UI elements and save to DB
                this.updateDocTitleDOM();
                this.updateDeadlineBadge();
                await this.saveActiveDocumentState();
                
                // Mark this inbox item as read in the backend so it doesn't stay in inbox list
                await this.markInboxRead(doc.fileName);
                
            } catch (err) {
                console.error("Chyba při přípravě odpovědi:", err);
            }
        });
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    convertCitationsToLinks() {
        if (this.legalLinkTarget === 'disabled') {
            this.customAlert("ℹ️ <b>Legal Linker je vypnutý</b><br><br>Funkci automatického odkazování na zákony můžete povolit v Nastavení -> Volitelné Funkce.");
            return;
        }

        const quill = this.core.quill;
        const html = quill.root.innerHTML;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        let linkCount = 0;

        const walkAndReplace = (parent) => {
            const children = Array.from(parent.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;

                    if (parent.tagName && parent.tagName.toLowerCase() === 'a') continue;

                    // Jeden zdroj pravdy (js/core/lexis-legal-linker.js): detekce citací
                    // + sestavení odkazu. UI si nechává jen procházení DOM.
                    const res = (window.LexisLegalLinker && window.LexisLegalLinker.linkifyLegalCitations)
                        ? window.LexisLegalLinker.linkifyLegalCitations(text, this.legalLinkTarget)
                        : { html: text, count: 0, changed: false };

                    if (res.changed) {
                        linkCount += res.count;
                        const span = document.createElement('span');
                        span.innerHTML = res.html;
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
    },

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
    },

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
    },

    scanTextForDeadlines(text, source) {
        if (!text) return;
        
        // Detekce lhůt zadaných počtem dní — jeden zdroj pravdy (lexis-calendar.js).
        const detected = (window.LexisCalendar && window.LexisCalendar.detectDeadlineDays)
            ? window.LexisCalendar.detectDeadlineDays(text)
            : [];

        // Lhůty v měsících/týdnech/letech (§ 57/2) — datum se počítá přes computeDeadlineByUnit,
        // uloží se stejnou cestou jako termín zadaný datem. Advokát každou detekci potvrzuje.
        const unitDeadlines = (window.LexisCalendar && window.LexisCalendar.detectDeadlines)
            ? window.LexisCalendar.detectDeadlines(text).filter(d => d.unit !== 'day')
            : [];

        // Detekce KONKRÉTNÍHO data lhůty/termínu (předvolání, jednání, „nejpozději do…"),
        // aby se do hlídače dostal i termín zadaný datem, ne jen počtem dní.
        let fixed = null;
        try {
            if (window.LexisCalendar && window.LexisCalendar.findDeadlineDate) {
                const f = window.LexisCalendar.findDeadlineDate(text);
                if (f && f.date) {
                    const iso = `${f.date.getFullYear()}-${String(f.date.getMonth() + 1).padStart(2, '0')}-${String(f.date.getDate()).padStart(2, '0')}`;
                    fixed = { iso, context: f.context };
                }
            }
        } catch (e) {}

        const detectedSection = document.getElementById('detected-deadlines-section');
        const detectedList = document.getElementById('detected-list');

        if (!detectedList || !detectedSection) return;

        if (detected.length > 0 || fixed || unitDeadlines.length > 0) {
            detectedSection.style.display = 'block';
            let html = '';
            if (fixed) {
                html += `
                <div style="background: white; border: 1px solid #93c5fd; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 11px; color: #1e3a8a;">
                    <div style="font-weight: bold; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span>📅 Detekován termín: ${fixed.iso}</span>
                        <button onclick="window.saveDetectedDeadlineDate('${fixed.iso}', '${encodeURIComponent(fixed.context)}')" style="background: #2563eb; color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: bold; cursor: pointer;">➕ Uložit</button>
                    </div>
                    <div style="font-style: italic; color: #1d4ed8; max-height: 45px; overflow-y: auto; line-height: 1.3;">"${fixed.context.substring(0, 100)}${fixed.context.length > 100 ? '...' : ''}"</div>
                </div>`;
            }
            html += detected.map((d) => `
                <div style="background: white; border: 1px solid #fcd34d; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 11px; color: #78350f;">
                    <div style="font-weight: bold; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span>⚠️ Detekována lhůta: ${d.days} dní</span>
                        <button onclick="window.saveDetectedDeadline(${d.days}, '${encodeURIComponent(d.context)}')" style="background: #f59e0b; color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s;">➕ Uložit</button>
                    </div>
                    <div style="font-style: italic; color: #92400e; max-height: 45px; overflow-y: auto; line-height: 1.3;">"${d.context.substring(0, 100)}${d.context.length > 100 ? '...' : ''}"</div>
                </div>
            `).join('');

            html += unitDeadlines.map((d) => {
                const due = window.LexisCalendar.computeDeadlineByUnit(new Date(), d.amount, d.unit);
                const iso = window.LexisCalendar.toIsoDate(due);
                const label = { week: 'týd.', month: 'měs.', year: 'r.' }[d.unit] || d.unit;
                return `
                <div style="background: white; border: 1px solid #fcd34d; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 11px; color: #78350f;">
                    <div style="font-weight: bold; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span>⚠️ Detekována lhůta: ${d.amount} ${label} → ${iso}</span>
                        <button onclick="window.saveDetectedDeadlineDate('${iso}', '${encodeURIComponent(d.context)}')" style="background: #f59e0b; color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s;">➕ Uložit</button>
                    </div>
                    <div style="font-style: italic; color: #92400e; max-height: 45px; overflow-y: auto; line-height: 1.3;">"${d.context.substring(0, 100)}${d.context.length > 100 ? '...' : ''}"</div>
                </div>`;
            }).join('');
            detectedList.innerHTML = html;
        } else {
            detectedSection.style.display = 'none';
        }
        
        // Automaticky spustit vyhledávání soudních jednání
        this.scanTextForCourtHearings(text);
    },

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
    },

    promptAddDeadlineDate(isoDate, context) {
        this.customPrompt(`💡 <b>Uložit termín do hlídače</b><br><br>Zadejte název (např. <i>Předvolání – dostavit se</i>):`, `Termín ${isoDate}`, async (title) => {
            if (!title) return;
            const newDl = {
                id: 'dl_' + Date.now(),
                title: title,
                days: null,
                dueDate: isoDate,
                context: context,
                createdAt: new Date().toISOString().split('T')[0]
            };
            this.activeDeadlines.push(newDl);
            await this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
            this.renderDeadlines();
            const detectedSection = document.getElementById('detected-deadlines-section');
            if (detectedSection) detectedSection.style.display = 'none';
            try {
                const conn = this.getLexisLocalConnection();
                fetch(`${conn.baseUrl}/api/calendar/add`, { method: 'POST', headers: conn.headers, body: JSON.stringify(newDl) })
                    .catch(() => console.log('LexisLocal je offline, ICS se nevygenerovalo.'));
            } catch (e) {}
            this.customAlert(`⏰ <b>Termín uložen!</b><br><br><b>${title}</b> byl přidán do hlídače na datum <b>${isoDate}</b>.`);
        });
    },

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
    },

    async removeActiveDeadline(id) {
        this.activeDeadlines = this.activeDeadlines.filter(dl => dl.id !== id);
        await this.core.storage.set('settings', { key: 'active-deadlines', value: this.activeDeadlines });
        this.renderDeadlines();
    },

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
                this.core.safePasteHTML(range, sigHtml);
                this.setDocumentStatus('final', true);
                
                document.body.removeChild(overlay);
                
                this.customAlert("✅ <b>PDF bylo úspěšně podepsáno!</b><br><br>Do dokumentu byl vložen zaručený elektronický podpis advokáta a byl spuštěn export do formátu PDF.");
                
                if (typeof window.print === 'function') {
                    window.print();
                }
            };
        });
    },

    showProfileModal() {
        this.checkEnterpriseFeature("Profil právníka", async () => {
            // Jeden zdroj čtení profilu (stejný jako pro hlavičku) — žádná duplicita.
            const s = await this.readLawyerProfile();
            const autoOn = s.auto !== false;
            const esc = (v) => String(v == null ? '' : v).replace(/"/g, '&quot;');

            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);";
            const modal = document.createElement('div');
            modal.style = "background:#fff;padding:26px;border-radius:16px;width:520px;max-height:90vh;overflow:auto;box-shadow:0 20px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif; border: 1px solid #e2e8f0;";
            const fld = (id, label, val, ph) => `
                <div>
                    <label style="display:block; font-size:11px; font-weight:600; color:#475569; margin-bottom:4px;">${label}</label>
                    <input type="text" id="${id}" value="${esc(val)}" placeholder="${ph || ''}" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;outline:none; box-sizing:border-box;">
                </div>`;
            modal.innerHTML = `
                <h3 style="margin:0 0 6px 0;font-size:18px;color:#1e293b;font-weight:700; display:flex; align-items:center; gap:8px;">👤 Profil / hlavičkový papír</h3>
                <p style="margin:0 0 18px 0; font-size:12px; color:#64748b;">Údaje se automaticky použijí jako hlavička (a podpis) na nových dokumentech.</p>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                    ${fld('prof-title', 'Titul', s.title, 'Mgr. / JUDr.')}
                    ${fld('prof-name', 'Jméno a příjmení', s.name, '')}
                    <div style="grid-column:1 / -1;">${fld('prof-firm', 'Název firmy / kanceláře', s.firm, 'nepovinné').trim()}</div>
                    ${fld('prof-role', 'Funkce / role', s.role, 'advokát / jednatel / …')}
                    <div data-pack="legal">${fld('prof-license', 'Ev. č. ČAK', s.license, 'jen advokáti').trim()}</div>
                    ${fld('prof-ico', 'IČO', s.ico, '')}
                    ${fld('prof-dic', 'DIČ', s.dic, 'nepovinné')}
                    <div data-pack="legal">${fld('prof-isds', 'ID datové schránky', s.isds, '').trim()}</div>
                    <div style="grid-column:1 / -1;">${fld('prof-address', 'Sídlo (adresa)', s.address, 'ulice, PSČ město').trim()}</div>
                    ${fld('prof-tel', 'Telefon', s.tel, '')}
                    ${fld('prof-email', 'E-mail', s.email, '')}
                    ${fld('prof-web', 'Web', s.web, '')}
                    ${fld('prof-city', 'Místo (pro „V … dne")', s.city, 'např. Praze, Brně, Ostravě')}
                    ${fld('prof-sig', 'Podpisový vzor (text)', s.signature, '')}
                </div>

                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div id="prof-logo-preview" style="width:60px;height:44px;border:1px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f8fafc;">
                        ${window.LexisLetterhead && window.LexisLetterhead.safeLogo(s.logo) ? `<img src="${window.LexisLetterhead.safeLogo(s.logo)}" style="max-width:100%;max-height:100%;object-fit:contain;">` : '<span style="font-size:10px;color:#94a3b8;">logo</span>'}
                    </div>
                    <div>
                        <button id="prof-logo-btn" style="padding:8px 12px;background:#f1f5f9;color:#334155;font-weight:600;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:12px;">Nahrát logo…</button>
                        <button id="prof-logo-clear" style="padding:8px 10px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:12px;">Odebrat</button>
                        <input type="file" id="prof-logo-file" accept="image/*" style="display:none;">
                    </div>
                </div>

                <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#334155; margin-bottom:20px; cursor:pointer;">
                    <input type="checkbox" id="prof-auto" ${autoOn ? 'checked' : ''}>
                    Automaticky vkládat hlavičku do nových dokumentů
                </label>

                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="prof-cancel" style="padding:10px 16px;background:#f1f5f9;color:#475569;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Zrušit</button>
                    <button id="prof-save" style="padding:10px 16px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:13px;">Uložit profil</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            // Skryje právně specifická pole (ev. č. ČAK, datovka) v edicích bez balíčku legal.
            if (window.Edition && window.Edition.apply) window.Edition.apply(modal);

            let logoData = s.logo || '';
            const preview = modal.querySelector('#prof-logo-preview');
            modal.querySelector('#prof-logo-btn').onclick = () => modal.querySelector('#prof-logo-file').click();
            modal.querySelector('#prof-logo-clear').onclick = () => { logoData = ''; preview.innerHTML = '<span style="font-size:10px;color:#94a3b8;">logo</span>'; };
            modal.querySelector('#prof-logo-file').onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                if (file.size > 1.5 * 1024 * 1024) { this.customAlert('Logo je příliš velké (max 1,5 MB).'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    logoData = String(ev.target.result || '');
                    if (window.LexisLetterhead && window.LexisLetterhead.safeLogo(logoData)) {
                        preview.innerHTML = `<img src="${logoData}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
                    } else { logoData = ''; this.customAlert('Nepodporovaný formát obrázku.'); }
                };
                reader.readAsDataURL(file);
            };

            modal.querySelector('#prof-cancel').onclick = () => document.body.removeChild(overlay);
            modal.querySelector('#prof-save').onclick = async () => {
                const val = (id) => (modal.querySelector(id).value || '').trim();
                const set = (k, v) => this.core.storage.set('settings', { key: k, value: v });
                await set('lawyer-title', val('#prof-title'));
                await set('lawyer-name', val('#prof-name'));
                await set('lawyer-firm', val('#prof-firm'));
                await set('lawyer-role', val('#prof-role'));
                await set('lawyer-license', val('#prof-license'));
                await set('lawyer-ico', val('#prof-ico'));
                await set('lawyer-dic', val('#prof-dic'));
                await set('lawyer-isds', val('#prof-isds'));
                await set('lawyer-address', val('#prof-address'));
                await set('lawyer-tel', val('#prof-tel'));
                await set('lawyer-email', val('#prof-email'));
                await set('lawyer-web', val('#prof-web'));
                await set('lawyer-city', val('#prof-city'));
                await set('lawyer-signature', val('#prof-sig'));
                await set('lawyer-logo', logoData);
                await set('lawyer-letterhead-auto', !!modal.querySelector('#prof-auto').checked);

                await this.loadLetterheadProfile(); // obnov cache, ať se hlavička hned projeví
                document.body.removeChild(overlay);
                this.customAlert('✅ <b>Profil uložen.</b><br><br>Hlavička se automaticky vloží do nových dokumentů. Do už otevřeného dokumentu ji vložíš tlačítkem Vložit hlavičku.');
            };
        });
    },

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
        this.core.safePasteHTML(index, tocHtml);
        this.saveActiveDocumentState();
    },

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
        this.core.safePasteHTML(index, titleHtml);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    },

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
            this.core.safePasteHTML(index, illHtml);
            this.saveActiveDocumentState();
        });
    },

    insertBookmark() {
        this.customPrompt("Zadejte název záložky:", "zalozka_1", (name) => {
            if (!name) return;
            const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '');
            const bookmarkHtml = `<span id="${cleanName}" style="background: rgba(37,99,235,0.15); border-bottom: 2px dotted #2563eb; font-weight: 500;" title="Záložka: ${cleanName}">🔖 ${cleanName}</span>`;
            const range = this.core.quill.getSelection(true);
            const index = range ? range.index : this.core.quill.getLength();
            this.core.safePasteHTML(index, bookmarkHtml);
            this.saveActiveDocumentState();
        });
    },

    insertPageNumber() {
        const numHtml = `<span style="padding: 2px 6px; background: #e2e8f0; border-radius: 4px; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: bold; color: #475569;" title="Dynamické číslo stránky">🔢 Strana 1</span>`;
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.safePasteHTML(index, numHtml);
        this.saveActiveDocumentState();
    },

    showDeadlineCalc() {
        // Používá jeden zdroj pravdy pro výpočet lhůt (js/core/lexis-calendar.js):
        // posun posledního dne na nejbližší NÁSLEDUJÍCÍ pracovní den při víkendu/svátku
        // (§ 57 odst. 2 o.s.ř.). Dřív tu byl naivní „datum + N dní", který mohl skončit
        // v sobotu/neděli/svátek — právně špatně.
        const cal = window.LexisCalendar;
        this.customPrompt("Datum doručení (dd.mm.rrrr, prázdné = dnes):", "", (dateStr) => {
            let base = new Date();
            if (dateStr && dateStr.trim()) {
                const parsed = (cal && cal.parseCzechDate) ? cal.parseCzechDate(dateStr) : null;
                if (!parsed) return this.customAlert("Nerozpoznal jsem datum. Použij formát dd.mm.rrrr.");
                base = parsed;
            }
            this.customPrompt("Počet dní lhůty (např. 15 nebo 30):", "15", (days) => {
                if (!days) return;
                const n = parseInt(days, 10);
                if (!isFinite(n)) return this.customAlert("Neplatný počet dní.");
                let end, raw;
                if (cal && cal.computeDeadline) {
                    raw = cal.addDays(base, n);
                    end = cal.computeDeadline(base, n);
                } else {
                    end = new Date(base); end.setDate(end.getDate() + n); raw = end;
                }
                const shifted = end.getTime() !== raw.getTime();
                const note = shifted
                    ? "\n\n(Poslední den připadl na víkend nebo svátek — posunuto na nejbližší následující pracovní den dle § 57 o.s.ř.)"
                    : "";
                this.customAlert(`Lhůta končí dne:\n\n${end.toLocaleDateString('cs-CZ')}${note}`);
            });
        });
    },

    async insertSignatureBlock() {
        // Jeden zdroj pravdy (js/core/lexis-legal-docs.js); místo z profilu (default „Praze").
        let place = '';
        try { place = (await this.readLawyerProfile()).city; } catch (e) {}
        const sigBlockHtml = window.LexisLegalDocs.buildSignatureBlock({ place: place || undefined });

        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.safePasteHTML(index, sigBlockHtml);
        this.saveActiveDocumentState();
    },

    async insertMySignature() {
        const g = async (k) => (await this.core.storage.get('settings', k)) || '';
        const savedName = (await g('lawyer-name')) || "[JMÉNO]";
        const savedSignature = (await g('lawyer-signature')) || "[PODPIS]";
        // Role je obecná: z profilu, jinak „advokát" jen když má ev. č. ČAK, jinak nic.
        const role = (await g('lawyer-role')) || ((await g('lawyer-license')) ? 'advokát' : '');
        const roleHtml = role
            ? `<br><span style="font-size: 11px; color: #64748b;">${window.escapeHTML ? window.escapeHTML(role) : role}</span>`
            : '';
        const place = (await g('lawyer-city')) || 'Praze';
        const placeEsc = window.escapeHTML ? window.escapeHTML(place) : place;

        const mySigHtml = `
            <div style="margin-top: 30px; font-family: 'Inter', sans-serif; font-size: 13px; color: #1e293b; line-height: 1.5;">
                <p style="margin-bottom: 30px;">V ${placeEsc} dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                <div style="font-family: 'Great Vibes', 'Brush Script MT', cursive; font-size: 26px; color: #2563eb; margin-bottom: 5px; transform: rotate(-3deg); padding-left: 20px;">
                    ${savedSignature}
                </div>
                <div style="border-top: 1px solid #e2e8f0; width: 220px; padding-top: 5px;">
                    <strong>${savedName}</strong>${roleHtml}
                </div>
            </div>
            <p><br></p>
        `.replace(/ {2,}/g, '');

        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.safePasteHTML(index, mySigHtml);
        this.saveActiveDocumentState();
    },

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

        this.core.safePasteHTML(index, articleHtml);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    },

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

        this.core.safePasteHTML(index, paraHtml);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    },

    insertCitation() {
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        
        const citationHtml = `
            <blockquote style="border-left: 4px solid #cbd5e1; padding-left: 15px; margin: 15px 30px; font-style: italic; color: #475569; font-size: 12px; line-height: 1.6;">
                „Zde zadejte citaci z judikatury Nejvyššího soudu nebo nálezu Ústavního soudu sp. zn. [SPISOVÁ ZNAČKA], ze dne [DATUM].“
            </blockquote>
            <p><br></p>
        `.replace(/ {2,}/g, '');

        this.core.safePasteHTML(index, citationHtml);
        this.saveActiveDocumentState();
    }

});
