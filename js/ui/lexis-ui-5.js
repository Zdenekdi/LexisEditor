// lexis-ui-5.js — část UI vytažená z lexis-ui.js (prototype-mixin, beze změny chování).
// Načítá se v index.html PO lexis-ui.js. Obsahuje: insertSectionSign, lookupCaseLaw, logTime, showTimeTrackingDialog, exportTimesheet, setMargins, setOrientation, setColumns, insertSubjectHeader, scanTextForCourtHearings, promptAddHearingToCalendar, editHeader, editFooter, _openHFModal, closeHFModal, switchHFTab, updateHFPreview, pickHFImage, onHFImagePicked, applyHFChanges, applyHFTemplate, saveHFAsTemplate, setViewMode, closeCampaign, parseCsvToRecords, _setCampaignAction, _campaignPreviewNav, _updateCampaignRecordsPreview, exportCampaignRecord, onCampaignCsvPicked, _getContacts, openContacts, closeContacts, renderContactsList
Object.assign(LexisUI.prototype, {

    insertSectionSign() {
        const range = this.core.quill.getSelection(true);
        if (range) {
            this.core.quill.insertText(range.index, "§ ");
            this.core.quill.setSelection(range.index + 2);
        } else {
            this.core.quill.insertText(this.core.quill.getLength(), "§ ");
        }
    },

    lookupCaseLaw() {
        this.switchSidebarTab('chat');
        const input = document.getElementById('ai-prompt');
        if (input) {
            input.value = "Najdi judikaturu Nejvyššího soudu ohledně náhrady škody způsobené vadou výrobku podle nového občanského zákoníku.";
            this.customAlert("🏛️ <b>Judikatura spuštěna!</b><br><br>V pravém AI panelu byl přednastaven dotaz na judikaturu.");
        }
    },

    async logTime() {
        this.checkEnterpriseFeature("Evidence práce", () => {
            this.showTimeTrackingDialog();
        });
    },

    showTimeTrackingDialog(prefilledHours = null, onComplete = null) {
        // Calculate default hours
        let defaultHours = "0.25";
        if (prefilledHours !== null) {
            defaultHours = parseFloat(prefilledHours).toFixed(2);
        } else if (this.activeSessionTimeMs && this.activeSessionTimeMs > 0) {
            const calculated = this.activeSessionTimeMs / (3600 * 1000);
            defaultHours = Math.max(0.1, parseFloat(calculated.toFixed(2))).toString();
        }

        const defaultDocName = this.currentDocumentTitle || "Nový dokument";
        const todayStr = new Date().toISOString().split('T')[0];

        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);font-family:'Inter',sans-serif;";
        
        const modal = document.createElement('div');
        modal.style = "background:#ffffff;border-radius:16px;width:480px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);border:1px solid #e0dbd3;display:flex;flex-direction:column;overflow:hidden;animation: modalFadeIn 0.25s ease-out;";

        // Ensure keyframes animation is present
        if (!document.getElementById('modal-fade-in-style')) {
            const styleSheet = document.createElement("style");
            styleSheet.id = 'modal-fade-in-style';
            styleSheet.innerText = `
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `;
            document.head.appendChild(styleSheet);
        }

        modal.innerHTML = eIco(`
            <div style="padding:20px 24px;background:#faf9f7;border-bottom:1px solid #e0dbd3;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h2 style="margin:0;font-size:16px;font-weight:700;color:#2b2926;display:flex;align-items:center;gap:8px;">⏱️ Vykázat činnost</h2>
                    <p style="margin:2px 0 0 0;font-size:11px;color:#77716a;">Zapsat odpracovaný čas do výkazů v LexisLocal</p>
                </div>
                <button id="tt-close" style="background:none;border:none;font-size:24px;color:#a09a92;cursor:pointer;line-height:1;outline:none;padding:0;">&times;</button>
            </div>
            
            <div style="padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-size:12px;font-weight:600;color:#5c574f;">Spis / Věc / Dokument</label>
                    <input type="text" id="tt-doc-name" placeholder="např. sp. zn. 77 EX 123/2026" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;transition:border-color 0.2s;" value="${defaultDocName}">
                </div>
                
                <div style="display:flex;gap:16px;">
                    <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                        <label style="font-size:12px;font-weight:600;color:#5c574f;">Datum</label>
                        <input type="date" id="tt-date" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;background:#fff;" value="${todayStr}">
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                        <label style="font-size:12px;font-weight:600;color:#5c574f;">Čas (hodiny)</label>
                        <input type="number" id="tt-hours" step="0.05" min="0.05" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;" value="${defaultHours}">
                    </div>
                </div>
                
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-size:12px;font-weight:600;color:#5c574f;">Typ úkonu</label>
                    <select id="tt-action-type" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;background:#fff;appearance:none;-webkit-appearance:none;">
                        <option value="psaní" selected>Sepisování a úpravy dokumentu</option>
                        <option value="revize">Revize a kontrola</option>
                        <option value="studium">Studium spisu</option>
                        <option value="právní analýza">Právní analýza a rešerše</option>
                        <option value="ostatní">Ostatní administrativní činnost</option>
                    </select>
                </div>
                
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-size:12px;font-weight:600;color:#5c574f;">Popis (nepovinné)</label>
                    <input type="text" id="tt-desc" placeholder="např. Příprava žaloby na zaplacení" style="width:100%;padding:10px;border:1px solid #ddd6cb;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;">
                </div>
            </div>
            
            <div style="padding:16px 24px;background:#faf9f7;border-top:1px solid #e0dbd3;display:flex;justify-content:flex-end;gap:12px;">
                <button id="tt-cancel" style="padding:10px 18px;background:#edeae4;color:#5c574f;font-weight:600;font-size:13px;border:none;border-radius:8px;cursor:pointer;transition:background 0.2s;">Zrušit</button>
                <button id="tt-submit" style="padding:10px 20px;background:#9a5b22;color:#ffffff;font-weight:600;font-size:13px;border:none;border-radius:8px;cursor:pointer;box-shadow:0 4px 6px -1px rgba(37,99,235,0.2);transition:background 0.2s;">Vykázat</button>
            </div>
        `);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Bind events
        document.getElementById('tt-close').onclick = () => overlay.remove();
        document.getElementById('tt-cancel').onclick = () => overlay.remove();
        
        const submitBtn = document.getElementById('tt-submit');
        submitBtn.onmouseover = () => submitBtn.style.background = "#8a5320";
        submitBtn.onmouseout = () => submitBtn.style.background = "#9a5b22";
        const cancelBtn = document.getElementById('tt-cancel');
        cancelBtn.onmouseover = () => cancelBtn.style.background = "#e0dbd3";
        cancelBtn.onmouseout = () => cancelBtn.style.background = "#edeae4";

        submitBtn.onclick = async () => {
            const documentName = document.getElementById('tt-doc-name').value.trim();
            const date = document.getElementById('tt-date').value;
            const hoursVal = parseFloat(document.getElementById('tt-hours').value);
            const actionType = document.getElementById('tt-action-type').value;
            const desc = document.getElementById('tt-desc').value.trim() || actionType;

            if (!documentName) {
                this.customAlert("⚠️ Prosím vyplňte název dokumentu / spisu.");
                return;
            }
            if (isNaN(hoursVal) || hoursVal <= 0) {
                this.customAlert("⚠️ Prosím vyplňte platný počet hodin.");
                return;
            }
            if (!date) {
                this.customAlert("⚠️ Prosím vyplňte datum.");
                return;
            }

            // Post to LexisLocal backend
            let success = false;
            try {
                const { baseUrl, headers } = this.getLexisLocalConnection();
                const res = await fetch(`${baseUrl}/api/activity/custom`, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        documentName,
                        hours: hoursVal,
                        actionType: desc,
                        date
                    })
                });

                const data = await res.json();
                if (data.success) {
                    success = true;
                }
            } catch (err) {
                console.warn("Timesheet logging to LexisLocal failed, falling back to local database:", err.message);
            }

            // Fallback (save locally in settings storage so we don't lose the log)
            try {
                const log = {
                    desc: desc,
                    hours: hoursVal,
                    date: new Date(date).toLocaleDateString('cs-CZ'),
                    timestamp: Date.now(),
                    synced: success
                };

                const savedLogs = await this.core.storage.get('settings', 'timesheet-logs') || [];
                savedLogs.push(log);
                await this.core.storage.set('settings', { key: 'timesheet-logs', value: savedLogs });
            } catch (err) {
                console.error("Local storage logging failed:", err.message);
            }

            // Reset session time tracker since we've logged it
            this.activeSessionTimeMs = 0;

            overlay.remove();
            
            if (success) {
                this.customAlert(`✅ <b>Činnost vykázána!</b><br><br>Čas <b>${hoursVal} hod.</b> na spis <b>${documentName}</b> byl úspěšně zaznamenán do LexisLocal.`);
            } else {
                this.customAlert(`✅ <b>Uloženo lokálně</b><br><br>Čas <b>${hoursVal} hod.</b> byl zaznamenán offline v editoru. Bude synchronizován po spuštění LexisLocal.`);
            }

            // Run callback (e.g. exit start screen transition)
            if (onComplete) {
                await onComplete();
            }
        };
    },

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
    },

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
    },

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
    },

    setColumns(c) {
        const editor = document.querySelector('.ql-editor');
        if (!editor) return;
        editor.style.columnCount = c;
        editor.style.columnGap = '10mm';
    },

    insertSubjectHeader(type) {
        let html = "";
        const baseStyle = "padding: 20px 25px; margin: 30px 0; background: #ffffff; border-radius: 12px; font-family: 'Inter', sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e0dbd3; position: relative; overflow: hidden;";
        
        if (type === 'person') {
            html = `
                <div style="${baseStyle}">
                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #9a5b22, #9a5b22);"></div>
                    <p style="margin-bottom: 8px; color: #9a5b22; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Fyzická osoba</p>
                    <p style="font-size: 18px; margin: 0; color: #2b2926;"><strong>[JMÉNO A PŘÍJMENÍ]</strong></p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #5c574f;">
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
                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #d9a441, #b06a2a);"></div>
                    <p style="margin-bottom: 8px; color: #b06a2a; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Podnikající fyzická osoba</p>
                    <p style="font-size: 18px; margin: 0; color: #2b2926;"><strong>[JMÉNO A PŘÍJMENÍ]</strong></p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #5c574f;">
                        <div><strong>IČO:</strong> [IČO]</div>
                        <div><strong>DIČ:</strong> [DIČ]</div>
                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> [ADRESA MÍSTA PODNIKÁNÍ]</div>
                        <div style="grid-column: span 2; font-size: 11px; color: #a09a92;">Zapsán v živnostenském rejstříku vedeném [ÚŘAD]</div>
                    </div>
                </div>
                <p><br></p>
            `;
        } else if (type === 'company') {
            html = `
                <div style="${baseStyle}">
                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #5a8a4a, #4f7a41);"></div>
                    <p style="margin-bottom: 8px; color: #5a8a4a; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Právnická osoba</p>
                    <p style="font-size: 18px; margin: 0; color: #2b2926;"><strong>[OBCHODNÍ FIRMA / NÁZEV]</strong></p>
                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #5c574f;">
                        <div><strong>IČO:</strong> [IČO]</div>
                        <div><strong>DIČ:</strong> [DIČ]</div>
                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> [ADRESA SÍDLA]</div>
                        <div style="grid-column: span 2;"><strong>Zastoupená:</strong> [JMÉNO], [FUNKCE]</div>
                        <div style="grid-column: span 2; font-size: 11px; color: #a09a92; font-style: italic;">Zapsaná v obchodním rejstříku vedeném [SOUD] v [MĚSTO], oddíl [ODDÍL], vložka [VLOŽKA]</div>
                    </div>
                </div>
                <p><br></p>
            `;
        }
        
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        this.core.safePasteHTML(index, html);
        this.saveActiveDocumentState();
        this.updateDocumentOutline();
    },

    scanTextForCourtHearings(text) {
        if (!text) return;
        
        let detectedCourt = null;
        
        // Detekce soudu — jeden zdroj (window.LexisCourt.detect z js/core/court-data.js).
        if (window.LexisCourt && window.LexisCourt.detect) {
            detectedCourt = window.LexisCourt.detect(text);
        }
        
        // Spisová značka — jeden zdroj pravdy: sdílená extrakce (LexisReply.extract)
        // + strukturovaný parser (LexisReply.parseSpzn). Dřív tu byl vlastní regex,
        // který se mohl rozejít s hlavní extrakcí náležitostí.
        let detectedSpzn = null;
        if (window.LexisReply && window.LexisReply.extract && window.LexisReply.parseSpzn) {
            const spznStr = window.LexisReply.extract(text).spzn;
            detectedSpzn = window.LexisReply.parseSpzn(spznStr);
        }
        
        const hearingsSection = document.getElementById('court-hearings-section');
        const hearingsList = document.getElementById('hearings-list');
        
        if (!hearingsSection || !hearingsList) return;
        
        if (detectedCourt && detectedSpzn) {
            hearingsSection.style.display = 'block';
            hearingsList.innerHTML = eIco(`
                <div style="font-size: 11px; color: #77716a; text-align: center; padding: 10px; font-style: italic;">
                    🔍 Vyhledávám nařízená jednání u ${detectedCourt.nazev}...
                </div>
            `);
            
            const queryParams = {
                druhOrganizace: null,
                okresniSoud: null,
                cisloSenatu: detectedSpzn.cisloSenatu,
                druhVeci: detectedSpzn.druhVeci,
                bcVec: detectedSpzn.bcVec,
                rocnik: detectedSpzn.rocnik,
                agenda: null,
                typHledani: "SPZN"
            };
            
            if (detectedCourt.kod.startsWith('OS')) {
                queryParams.okresniSoud = detectedCourt.kod;
            } else {
                queryParams.druhOrganizace = detectedCourt.kod;
            }
            
            window.electronAPI.queryInfoJednani(queryParams).then((res) => {
                if (res && res.success && res.data) {
                    const data = res.data;
                    const udalosti = data.udalosti || [];
                    if (udalosti.length > 0) {
                        hearingsList.innerHTML = eIco(udalosti.map((u, idx) => {
                            const dateStr = u.datum || '';
                            const timeStr = u.cas || '';
                            const room = u.jednaciSin || 'Neznámá síň';
                            const type = u.druhJednani || 'Soudní jednání';
                            const judge = u.resitel || 'Neuveden';
                            const isCancelled = u.jednaciZruseno === 'Ano' || u.jednaciZruseno === true;
                            
                            const statusPill = isCancelled 
                                ? `<span style="background: #f0dcd6; color: #8a3626; border: 1px solid #e0a99d; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block;">❌ ZRUŠENO</span>`
                                : `<span style="background: #d9e6d0; color: #4f7a41; border: 1px solid #d9e6d0; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block;">📅 NAŘÍZENO</span>`;

                            const hearingData = {
                                id: 'hearing_' + Date.now() + '_' + idx,
                                title: type,
                                spzn: detectedSpzn.fullText,
                                courtName: data.organizace || detectedCourt.nazev,
                                courtCode: detectedCourt.kod,
                                spisovaZnacka: {
                                    cisloSenatu: detectedSpzn.cisloSenatu,
                                    druhVeci: detectedSpzn.druhVeci,
                                    bcVec: detectedSpzn.bcVec,
                                    rocnik: detectedSpzn.rocnik
                                },
                                date: dateStr,
                                time: timeStr,
                                location: (data.organizace || detectedCourt.nazev) + ', síň ' + room
                            };

                            return `
                                <div style="background: white; border: 1px solid #d9e6d0; border-radius: 6px; padding: 8px; margin-bottom: 6px; font-size: 11px; color: #33562a;">
                                    <div style="font-weight: bold; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                        <span>⚖️ ${type}</span>
                                        ${statusPill}
                                    </div>
                                    <div style="margin-bottom: 3px;"><b>Sp. zn.:</b> ${detectedSpzn.fullText}</div>
                                    <div style="margin-bottom: 3px;"><b>Termín:</b> ${dateStr} v ${timeStr}</div>
                                    <div style="margin-bottom: 3px;"><b>Místo:</b> ${data.organizace || detectedCourt.nazev}, síň ${room}</div>
                                    <div style="margin-bottom: 5px;"><b>Soudce:</b> ${judge}</div>
                                    ${!isCancelled ? `
                                        <button onclick="window.saveHearingToCalendar('${encodeURIComponent(JSON.stringify(hearingData))}')" style="background: #5a8a4a; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s; width: 100%; text-align: center;">📅 Zapsat do kalendáře</button>
                                    ` : ''}
                                </div>
                            `;
                        }).join(''));
                    } else {
                        hearingsList.innerHTML = eIco(`
                            <div style="font-size: 11px; color: #77716a; text-align: center; padding: 10px; font-style: italic;">
                                Pro sp. zn. <b>${detectedSpzn.fullText}</b> není u ${detectedCourt.nazev} v následujících 30 dnech nařízeno žádné jednání.
                            </div>
                        `);
                    }
                } else {
                    hearingsList.innerHTML = eIco(`
                        <div style="font-size: 11px; color: #c0553f; text-align: center; padding: 10px; font-style: italic;">
                            ⚠️ Nepodařilo se načíst jednání z InfoJednání.
                        </div>
                    `);
                }
            }).catch((err) => {
                console.error("Chyba InfoJednání API:", err);
                hearingsList.innerHTML = eIco(`
                    <div style="font-size: 11px; color: #c0553f; text-align: center; padding: 10px; font-style: italic;">
                        ⚠️ Chyba spojení s portálem InfoJednání.
                    </div>
                `);
            });
        } else {
            hearingsSection.style.display = 'none';
        }
    },

    promptAddHearingToCalendar(data) {
        const title = `Jednání sp. zn. ${data.spzn} - ${data.title}`;
        this.customPrompt(`💡 <b>Zapsat jednání do kalendáře</b><br><br>Upravte název události (např. <i>Hlavní líčení sp. zn. ${data.spzn}</i>):`, title, async (userTitle) => {
            if (!userTitle) return;
            
            // Format DD.MM.YYYY to YYYY-MM-DD
            let isoDate = data.date;
            const parts = data.date.replace(/\s+/g, '').split('.');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parts[2];
                isoDate = `${year}-${month}-${day}`;
            }
            
            const body = {
                id: data.id,
                title: userTitle,
                dueDate: isoDate,
                time: data.time,
                location: data.location,
                context: `Soudní jednání u ${data.courtName}.\nSpisová značka: ${data.spzn}\nDetekováno z portálu InfoJednání.`,
                isHearing: true,
                courtCode: data.courtCode,
                spisovaZnacka: data.spisovaZnacka
            };
            
            try {
                const conn = this.getLexisLocalConnection();
                const res = await fetch(`${conn.baseUrl}/api/calendar/add`, {
                    method: 'POST',
                    headers: conn.headers,
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const resData = await res.json();
                this.customAlert(`📅 <b>Jednání zapsáno do kalendáře!</b><br><br>Událost byla úspěšně uložena a byl vygenerován kalendářový soubor:<br><span style="font-size: 11px; color:#5a8a4a; font-family:monospace; word-break: break-all;">${resData.filePath}</span>`);
            } catch (e) {
                console.error(e);
                this.customAlert("❌ <b>Chyba zapsání do kalendáře</b><br><br>LexisLocal backend je offline, nebo se nepodařilo uložit událost.");
            }
        });
    },

    editHeader() {
        this._currentHFTarget = 'header';
        this._openHFModal();
    },

    editFooter() {
        this._currentHFTarget = 'footer';
        this._openHFModal();
    },

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
    },

    closeHFModal() {
        const overlay = document.getElementById('hf-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    switchHFTab(tab) {
        ['layout','style','templates'].forEach(t => {
            const btn = document.getElementById(`hf-tab-${t}`);
            const panel = document.getElementById(`hf-panel-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
            if (panel) panel.style.display = t === tab ? 'block' : 'none';
        });
    },

    updateHFPreview() {
        const left = document.getElementById('hf-left')?.value || '';
        const center = document.getElementById('hf-center')?.value || '';
        const right = document.getElementById('hf-right')?.value || '';
        const fontSize = document.getElementById('hf-fontsize')?.value || '11px';

        const today = new Date().toLocaleDateString('cs-CZ');
        const docTitle = document.getElementById('window-doc-title')?.innerText || 'Dokument';

        const resolve = (text) => text
            .replace(/{DATUM}/g, today)
            .replace(/{STRANA}/g, '1')
            .replace(/{TITULEK}/g, docTitle)
            .replace(/\n/g, '<br>');

        const pl = document.getElementById('hf-preview-left');
        const pc = document.getElementById('hf-preview-center');
        const pr = document.getElementById('hf-preview-right');
        const previewEl = document.getElementById('hf-preview-content');

        // Show image if set
        const imgLeft = this._hfImages['left'];
        const imgCenter = this._hfImages['center'];
        const imgRight = this._hfImages['right'];

        if (pl) pl.innerHTML = eIco(imgLeft
            ? `<img src="${imgLeft}" style="max-height:36px; object-fit:contain;"><br>${resolve(left)}`
            : resolve(left) || '<span style="color:#ddd6cb">—</span>');
        if (pc) pc.innerHTML = eIco(imgCenter
            ? `<img src="${imgCenter}" style="max-height:36px; object-fit:contain;"><br>${resolve(center)}`
            : resolve(center) || '<span style="color:#ddd6cb">—</span>');
        if (pr) pr.innerHTML = eIco(imgRight
            ? `<img src="${imgRight}" style="max-height:36px; object-fit:contain;"><br>${resolve(right)}`
            : resolve(right) || '<span style="color:#ddd6cb">—</span>');

        if (previewEl) previewEl.style.fontSize = fontSize;
    },

    pickHFImage(position) {
        const input = document.getElementById(`hf-img-input-${position}`);
        if (input) input.click();
    },

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
    },

    applyHFChanges() {
        const left = document.getElementById('hf-left')?.value || '';
        const center = document.getElementById('hf-center')?.value || '';
        const right = document.getElementById('hf-right')?.value || '';
        const showLine = document.getElementById('hf-show-line')?.checked ?? true;
        const height = document.getElementById('hf-height')?.value || 'normal';
        const fontSize = document.getElementById('hf-fontsize')?.value || '11px';
        const bgColor = document.getElementById('hf-bg-color')?.value || '#ffffff';
        const textColor = document.getElementById('hf-text-color')?.value || '#4a453f';
        const lineColor = document.getElementById('hf-line-color')?.value || '#ddd6cb';
        const fontFamily = document.getElementById('hf-font-family')?.value || "'Segoe UI', sans-serif";

        const today = new Date().toLocaleDateString('cs-CZ');
        const docTitle = document.getElementById('window-doc-title')?.innerText || 'Dokument';

        const resolve = (text) => text
            .replace(/{DATUM}/g, today)
            .replace(/{STRANA}/g, '1')
            .replace(/{TITULEK}/g, docTitle);

        // Build HTML for header/footer area
        const paddingMap = { compact: '5mm 40mm', normal: '10mm 40mm', tall: '15mm 40mm' };
        const padding = paddingMap[height] || '10mm 40mm';

        const buildCellHtml = (text, imgSrc, align) => {
            let html = `<div style="flex:1; text-align:${align}; font-family:${fontFamily}; font-size:${fontSize}; color:${textColor}; white-space:pre-line;">`;
            if (imgSrc) html += `<img src="${imgSrc}" style="max-height:40px; max-width:120px; object-fit:contain; display:block; margin-bottom:3px; ${align === 'right' ? 'margin-left:auto;' : align === 'center' ? 'margin:0 auto 3px auto;' : ''}"><br>`;
            html += resolve(text) + '</div>';
            return html;
        };

        const borderStyle = showLine ? `border-bottom: 1px solid ${lineColor};` : '';
        const areaHtml = `<div style="display:flex; align-items:center; gap:10px; padding:${padding}; background:${bgColor}; ${borderStyle}">
            ${buildCellHtml(left, this._hfImages['left'], 'left')}
            ${buildCellHtml(center, this._hfImages['center'], 'center')}
            ${buildCellHtml(right, this._hfImages['right'], 'right')}
        </div>`;

        const areaId = this._currentHFTarget === 'header' ? 'header-area' : 'footer-area';
        const area = document.getElementById(areaId);
        if (area) {
            area.innerHTML = eIco(areaHtml);
            area.contentEditable = 'false'; // Lock from direct editing now
        }

        // Save structured data for re-editing
        if (!this._hfData) this._hfData = {};
        this._hfData[this._currentHFTarget] = { left, center, right, showLine, height, fontSize, bgColor, textColor, lineColor, fontFamily };

        this.closeHFModal();
        this.saveActiveDocumentState();
        this.customAlert(`✅ <b>Záhlaví použito!</b><br><br>Záhlaví dokumentu bylo aktualizováno. Změny jsou uloženy se stavem dokumentu.`);
    },

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
    },

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
    },

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
    },

    closeCampaign() {
        const overlay = document.getElementById('campaign-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    parseCsvToRecords(csvText) {
        // Delegace na sdílenou, testovanou logiku (js/core/lexis-merge.js) — jeden zdroj
        // pravdy, navíc s podporou uvozovek (adresa s čárkou). Fallback pro jistotu.
        if (window.LexisMerge && window.LexisMerge.parseCsvToRecords) {
            return window.LexisMerge.parseCsvToRecords(csvText);
        }
        const lines = csvText.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim());
            const record = {};
            headers.forEach((h, i) => { record[h] = vals[i] || ''; });
            return record;
        });
    },

    _setCampaignAction(action) {
        this._campaignAction = action;
        document.querySelectorAll('.campaign-action-card').forEach(card => card.classList.remove('selected'));
        // Re-render step 4
        this.renderCampaignStep(4);
    },

    _campaignPreviewNav(dir) {
        const count = this._campaignRecords.length;
        this._campaignPreviewIdx = (this._campaignPreviewIdx + dir + count) % count;
        this.renderCampaignStep(3);
    },

    _updateCampaignRecordsPreview() {
        const ta = document.getElementById('campaign-csv-ta');
        const preview = document.getElementById('campaign-table-preview');
        if (!ta || !preview) return;
        const csvText = ta.value;
        this._campaignCsvText = csvText;
        const records = this.parseCsvToRecords(csvText);
        this._campaignRecords = records;

        if (records.length === 0) {
            preview.innerHTML = eIco('<div style="font-size:12px;color:#a09a92;padding:8px;">Žádné záznamy.</div>');
            return;
        }
        const headers = Object.keys(records[0]);
        preview.innerHTML = eIco(`
            <table class="campaign-recipients-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>Adresát č.</th></tr></thead>
                <tbody>${records.map((r, i) => `<tr><td>${headers.map(h => r[h]).join('</td><td>')}</td><td>#${i+1}</td></tr>`).join('')}</tbody>
            </table>
        `);
    },

    exportCampaignRecord(record, templateHtml) {
        let html = templateHtml;
        for (const [key, val] of Object.entries(record)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            html = html.replace(regex, `<span class="filled-var">${val}</span>`);
        }
        return html;
    },

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
    },

    _getContacts() {
        if (!this._contacts) {
            this._contacts = new LexisContacts(this.core.storage);
        }
        return this._contacts;
    },

    async openContacts() {
        const overlay = document.getElementById('contacts-modal-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        await this.renderContactsList();
        await this._renderContactGroupFilter();
    },

    closeContacts() {
        const overlay = document.getElementById('contacts-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    async renderContactsList() {
        const tbody = document.getElementById('contacts-table-body');
        const countEl = document.getElementById('contacts-count');
        if (!tbody) return;

        const search = (document.getElementById('contacts-search')?.value || '').toLowerCase();
        const typeFilter = document.getElementById('contacts-type-filter')?.value || '';
        const activeGroup = this._contactsActiveGroup || '';

        tbody.innerHTML = eIco(`<tr><td colspan="6" style="padding:30px;text-align:center;color:#a09a92;">⏳ Načítám...</td></tr>`);

        const all = await this._getContacts().getAll();
        let filtered = all.filter(c => {
            const matchSearch = !search ||
                (c.jmeno || '').toLowerCase().includes(search) ||
                (c.adresa || '').toLowerCase().includes(search) ||
                (c.mesto || '').toLowerCase().includes(search) ||
                (c.isds || '').toLowerCase().includes(search) ||
                (c.email || '').toLowerCase().includes(search);
            const matchType = !typeFilter || c.typ === typeFilter;
            const matchGroup = !activeGroup || (c.skupiny || []).includes(activeGroup);
            return matchSearch && matchType && matchGroup;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = eIco(`<tr><td colspan="6" style="padding:40px;text-align:center;color:#a09a92;font-size:13px;">
                📭 Žádné kontakty. Přidejte první kontakt tlačítkem "+ Nový kontakt" nebo importujte CSV.
            </td></tr>`);
            if (countEl) countEl.textContent = `Celkem: 0 kontaktů`;
            return;
        }

        const typLabels = { fyzicka: '👤 FO', pravnicka: '🏢 PO', organ: '🏛️ Úřad', soud: '⚖️ Soud' };

        tbody.innerHTML = eIco(filtered.map(c => `
            <tr>
                <td style="padding:10px 16px;">
                    <div style="font-weight:700;color:#2b2926;font-size:13px;">${this._esc(c.jmeno || '')}</div>
                    <div style="font-size:11px;color:#a09a92;margin-top:2px;">${typLabels[c.typ] || ''}${c.ic ? ` · IČO: ${c.ic}` : ''}</div>
                </td>
                <td style="padding:10px 16px;font-size:12px;color:#5c574f;">
                    ${c.adresa ? `${this._esc(c.adresa)}<br>` : ''}
                    ${c.psc || c.mesto ? `${c.psc || ''} ${c.mesto || ''}`.trim() : '<span style="color:#ddd6cb">—</span>'}
                </td>
                <td style="padding:10px 16px;">
                    ${c.isds ? `<span class="court-isds-badge">${this._esc(c.isds)}</span>` : '<span style="font-size:11px;color:#ddd6cb">—</span>'}
                </td>
                <td style="padding:10px 16px;font-size:12px;color:#5c574f;">
                    ${c.email ? `📧 ${this._esc(c.email)}<br>` : ''}
                    ${c.tel ? `📞 ${this._esc(c.tel)}` : ''}
                    ${!c.email && !c.tel ? '<span style="color:#ddd6cb">—</span>' : ''}
                </td>
                <td style="padding:10px 16px;">
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${(c.skupiny || []).map(g => `<span style="background:#f6efe4;color:#9a5b22;border:1px solid #efe3cf;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;">${this._esc(g)}</span>`).join('')}
                    </div>
                </td>
                <td style="padding:10px 16px;text-align:center;">
                    <div style="display:flex;gap:6px;justify-content:center;">
                        <button onclick="lexisUI.insertContactToDoc('${c.id}')" style="padding:5px 10px;border-radius:6px;background:#5a8a4a;color:white;border:none;font-size:11px;font-weight:700;cursor:pointer;">✅ Vložit</button>
                        <button onclick="lexisUI.openContactForm('${c.id}')" style="padding:5px 10px;border-radius:6px;background:#edeae4;border:1px solid #e0dbd3;font-size:11px;font-weight:700;cursor:pointer;color:#4a453f;">✏️ Upravit</button>
                        <button onclick="lexisUI.deleteContact('${c.id}')" style="padding:5px 10px;border-radius:6px;background:#f6ebe7;border:1px solid #e6c3ba;font-size:11px;font-weight:700;cursor:pointer;color:#8a3626;">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join(''));

        if (countEl) countEl.textContent = `Zobrazeno: ${filtered.length} / ${all.length} kontaktů`;
    }

});
