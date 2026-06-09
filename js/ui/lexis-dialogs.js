/**
 * LexisDialogs Helper
 * Spravuje pomocné dialogy, kalkulačky a generátory.
 */
class LexisDialogs {
    constructor(ui) {
        this.ui = ui;
        this.core = ui.core;
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

    customConfirm(text, okLabel, cancelLabel, callback) {
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);";
        const modal = document.createElement('div');
        modal.style = "background:#fff;padding:24px;border-radius:12px;width:360px;box-shadow:0 15px 30px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;";
        modal.innerHTML = `
            <div style="margin:0 0 20px 0;font-size:14px;color:#1e293b;line-height:1.5;white-space:pre-wrap;">${text}</div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="cc-cancel" style="padding:8px 16px;background:#f1f5f9;color:#475569;font-weight:500;border:none;border-radius:6px;cursor:pointer;">${cancelLabel}</button>
                <button id="cc-ok" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:500;border:none;border-radius:6px;cursor:pointer;">${okLabel}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        document.getElementById('cc-cancel').onclick = () => {
            document.body.removeChild(overlay);
            callback(false);
        };
        
        document.getElementById('cc-ok').onclick = () => {
            document.body.removeChild(overlay);
            callback(true);
        };
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
        this.ui.checkEnterpriseFeature("Kalkulačka soudních poplatků", () => {
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
        this.ui.checkEnterpriseFeature("Kalkulačka úroků z prodlení", () => {
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

    openPoweOfAttorneyDialog() {
        this.ui.toggleAIDrawer(true);
        const header = document.getElementById('ai-header-text');
        if (header) header.innerText = "Generátor Plné moci";
        
        const output = document.getElementById('ai-output');
        if (output) {
            output.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px; font-family:'Inter',sans-serif;">
                    <div style="font-weight:600; font-size:13px; color:#1e293b; margin-bottom:5px;">Nová Plná moc</div>
                    <input id="pa-name" placeholder="Jméno zmocnitele (např. Jan Novák)" class="combo-box" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; outline:none; box-sizing:border-box;">
                    <select id="pa-type" class="combo-box" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; outline:none; box-sizing:border-box; background:white;">
                        <option value="obecná">Obecná plná moc</option>
                        <option value="procesní">Procesní plná moc</option>
                    </select>
                    <button id="btn-generate-pa" style="padding:10px; background:var(--word-blue); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:700; transition:all 0.2s;">Vygenerovat plnou moc</button>
                </div>
            `;
            
            document.getElementById('btn-generate-pa').onclick = () => this.generatePA();
        }
    }

    generatePA() {
        const nameInput = document.getElementById('pa-name');
        const typeSelect = document.getElementById('pa-type');
        if (!nameInput || !typeSelect) return;
        
        const name = nameInput.value.trim() || "[JMÉNO ZMOCNITELE]";
        const type = typeSelect.value;
        
        let paText = "";
        if (type === 'procesní') {
            paText = `
                <h1>PLNÁ MOC (PROCESNÍ)</h1>
                <p>Já, níže podepsaný/á:</p>
                <p><b>${name}</b>, nar. [DOPLNIT], trvale bytem [DOPLNIT]</p>
                <p>tímto uděluji procesní plnou moc advokátní kanceláři [DOPLNIT] k tomu, aby mě zastupovala ve všech právních věcech, před soudy, orgány státní správy i samosprávy a vůči třetím osobám v plném rozsahu.</p>
                <p>V Praze dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                <p>.......................................<br><b>${name}</b> (zmocnitel)</p>
            `.replace(/ {2,}/g, '');
        } else {
            paText = `
                <h1>PLNÁ MOC (OBECNÁ)</h1>
                <p>Já, níže podepsaný/á:</p>
                <p><b>${name}</b>, nar. [DOPLNIT], trvale bytem [DOPLNIT]</p>
                <p>tímto zmocňuji pana/paní [DOPLNIT], nar. [DOPLNIT], trvale bytem [DOPLNIT], aby mě zastupoval/a ve všech běžných záležitostech a činil/a mým jménem veškeré právní úkony.</p>
                <p>V Praze dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                <p>.......................................<br><b>${name}</b> (zmocnitel)</p>
            `.replace(/ {2,}/g, '');
        }
        
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        
        this.core.quill.clipboard.dangerouslyPasteHTML(index, paText);
        nameInput.value = '';
        
        this.customAlert("✅ <b>Plná moc vygenerována</b><br><br>Šablona plné moci byla úspěšně vložena na pozici kurzoru.");
        this.ui.toggleAIDrawer(false);
        this.ui.saveActiveDocumentState();
        this.ui.updateDocumentOutline();
    }

    openCampaignWizard(baseHtml) {
        let step = 1;
        let clientName = "";
        let caseNumber = "";
        let icosRaw = "";
        let recipients = [];
        let activeRecipientIndex = 0;

        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);";
        
        const modal = document.createElement('div');
        modal.style = "background:#fff;border-radius:12px;width:800px;height:550px;box-shadow:0 20px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative;";
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const replacePlaceholders = (html, data) => {
            let res = html;
            const map = {
                '\\[PŘÍJEMCE\\]': data.name || '',
                '\\[NÁZEV\\]': data.name || '',
                '\\[IČO\\]': data.ico || '',
                '\\[SÍDLO\\]': data.seat || '',
                '\\[ADRESA\\]': data.seat || '',
                '\\[DATOVÁ_SCHRÁNKA\\]': data.isdsId || '',
                '\\[ISDS\\]': data.isdsId || '',
                '\\[KLIENT\\]': clientName || '',
                '\\[SPIS_ZNACKA\\]': caseNumber || '',
                '\\[CJ\\]': caseNumber || ''
            };
            
            for (const [key, value] of Object.entries(map)) {
                const regex = new RegExp(key, 'g');
                res = res.replace(regex, value);
            }
            return res;
        };

        const render = () => {
            // Render Header
            let headerHtml = `
                <div style="padding:16px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h2 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px;">📑 Hromadné obesílání (Mail Merge)</h2>
                        <p style="margin:2px 0 0 0;font-size:11px;color:#64748b;">Sloučení aktivního dokumentu se seznamem příjemců</p>
                    </div>
                    <button id="cw-close" style="background:none;border:none;font-size:24px;color:#94a3b8;cursor:pointer;line-height:1;outline:none;">&times;</button>
                </div>
                <div style="display:flex;background:#f1f5f9;border-bottom:1px solid #e2e8f0;padding:8px 24px;gap:20px;font-size:11px;font-weight:600;color:#64748b;user-select:none;">
                    <div style="color:${step === 1 ? '#2563eb' : '#64748b'};">1. Spis & Klient</div>
                    <div>&rarr;</div>
                    <div style="color:${step === 2 ? '#2563eb' : '#64748b'};">2. Příjemci (IČO)</div>
                    <div>&rarr;</div>
                    <div style="color:${step === 3 ? '#2563eb' : '#64748b'};">3. Lustrace & AI</div>
                    <div>&rarr;</div>
                    <div style="color:${step === 4 ? '#2563eb' : '#64748b'};">4. Náhled & Odeslání</div>
                </div>
            `;

            // Render Body
            let bodyHtml = "";
            if (step === 1) {
                bodyHtml = `
                    <div style="padding:24px;display:flex;flex-direction:column;gap:16px;flex:1;box-sizing:border-box;">
                        <div style="font-size:12px;color:#334155;line-height:1.5;background:#eff6ff;padding:12px;border-radius:8px;border:1px solid #bfdbfe;">
                            💡 <b>Šablona z rozepsaného dokumentu:</b> Právě otevřený text se použije jako vzor. Značky <code>[NÁZEV]</code>, <code>[IČO]</code>, <code>[SÍDLO]</code>, <code>[DATOVÁ_SCHRÁNKA]</code>, <code>[KLIENT]</code> a <code>[SPIS_ZNACKA]</code> se automaticky nahradí reálnými údaji z registrů.
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <label style="font-size:12px;font-weight:600;color:#475569;">Jméno klienta (nahradí [KLIENT])</label>
                            <input type="text" id="cw-client-name" placeholder="např. Jan Novák" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;" value="${clientName}">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <label style="font-size:12px;font-weight:600;color:#475569;">Spisová značka / Číslo jednací (nahradí [SPIS_ZNACKA])</label>
                            <input type="text" id="cw-case-number" placeholder="např. sp. zn. 77 EX 123/2026" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;" value="${caseNumber}">
                        </div>
                    </div>
                `;
            } else if (step === 2) {
                bodyHtml = `
                    <div style="padding:24px;display:flex;flex-direction:column;gap:12px;flex:1;box-sizing:border-box;height:calc(100% - 130px);">
                        <label style="font-size:12px;font-weight:600;color:#475569;">Zadejte seznam IČO příjemců (jedno na řádek, 8 číslic)</label>
                        <textarea id="cw-icos" placeholder="00001350&#10;00024252" style="width:100%;height:100%;min-height:180px;padding:12px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;font-size:13px;outline:none;resize:none;box-sizing:border-box;">${icosRaw}</textarea>
                    </div>
                `;
            } else if (step === 3) {
                bodyHtml = `
                    <div style="padding:24px;display:flex;flex-direction:column;gap:12px;flex:1;box-sizing:border-box;overflow-y:auto;height:calc(100% - 130px);">
                        <div id="cw-lustrace-status" style="font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;">Probíhá lustrace subjektů v ARES/ISIR...</div>
                        <div style="border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;max-height:220px;overflow-y:auto;">
                            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12px;">
                                <thead>
                                    <tr style="background:#f8fafc;border-bottom:1px solid #cbd5e1;color:#475569;font-weight:600;">
                                        <th style="padding:10px;">IČO</th>
                                        <th style="padding:10px;">Název</th>
                                        <th style="padding:10px;">Datová schránka</th>
                                        <th style="padding:10px;">Insolvence (ISIR)</th>
                                    </tr>
                                </thead>
                                <tbody id="cw-lustrace-table-body">
                                    <tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b;">Načítám...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            } else if (step === 4) {
                bodyHtml = `
                    <div style="display:flex;flex:1;overflow:hidden;height:calc(100% - 120px);">
                        <!-- Left panel: Recipient list -->
                        <div id="cw-recipient-list" style="width:230px;border-right:1px solid #e2e8f0;background:#f8fafc;overflow-y:auto;display:flex;flex-direction:column;">
                            <!-- Recipient items -->
                        </div>
                        
                        <!-- Right panel: Preview -->
                        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#fff;padding:16px;box-sizing:border-box;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px;display:flex;justify-content:space-between;">
                                <span>ÚPRAVA TEXTU DOPISU PŘED ODESLÁNÍM</span>
                                <span id="cw-preview-recipient-isds" style="color:#2563eb;font-family:monospace;">ID schránky: ...</span>
                            </div>
                            <div id="cw-letter-editor" contenteditable="true" style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:16px;overflow-y:auto;font-size:13px;line-height:1.5;outline:none;background:#fdfdfd;box-shadow:inset 0 1px 3px rgba(0,0,0,0.05);min-height:220px;box-sizing:border-box;">
                                <!-- Content -->
                            </div>
                        </div>
                    </div>
                `;
            }

            // Render Footer
            let footerHtml = "";
            let buttons = "";
            if (step === 1) {
                buttons = `<button id="cw-next" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;">Pokračovat &rarr;</button>`;
            } else if (step === 2) {
                buttons = `
                    <button id="cw-prev" style="padding:8px 16px;background:#f1f5f9;color:#475569;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;margin-right:10px;">&larr; Zpět</button>
                    <button id="cw-next" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;">Lustrovat příjemce &rarr;</button>
                `;
            } else if (step === 3) {
                buttons = `
                    <button id="cw-prev" style="padding:8px 16px;background:#f1f5f9;color:#475569;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;margin-right:10px;">&larr; Zpět</button>
                    <button id="cw-next" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;" disabled>Počkejte...</button>
                `;
            } else if (step === 4) {
                buttons = `
                    <button id="cw-prev" style="padding:8px 16px;background:#f1f5f9;color:#475569;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;margin-right:10px;">&larr; Zpět</button>
                    <button id="cw-send" style="padding:8px 20px;background:#16a34a;color:#fff;font-weight:700;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;display:flex;align-items:center;gap:6px;">🚀 Odeslat přes ISDS</button>
                `;
            }
            footerHtml = `
                <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;align-items:center;height:60px;box-sizing:border-box;">
                    ${buttons}
                </div>
            `;

            modal.innerHTML = `
                <div style="display:flex;flex-direction:column;height:100%;">
                    ${headerHtml}
                    <div style="flex:1;overflow:hidden;background:#fff;display:flex;flex-direction:column;">
                        ${bodyHtml}
                    </div>
                    ${footerHtml}
                </div>
            `;

            // Attach core events
            const closeBtn = document.getElementById('cw-close');
            if (closeBtn) closeBtn.onclick = () => document.body.removeChild(overlay);

            const nextBtn = document.getElementById('cw-next');
            const prevBtn = document.getElementById('cw-prev');
            const sendBtn = document.getElementById('cw-send');

            if (nextBtn) {
                nextBtn.onclick = () => {
                    if (step === 1) {
                        clientName = document.getElementById('cw-client-name').value.trim();
                        caseNumber = document.getElementById('cw-case-number').value.trim();
                        step = 2;
                        render();
                    } else if (step === 2) {
                        icosRaw = document.getElementById('cw-icos').value.trim();
                        step = 3;
                        render();
                        runLustrace();
                    } else if (step === 3) {
                        step = 4;
                        render();
                        renderStep4();
                    }
                };
            }

            if (prevBtn) {
                prevBtn.onclick = () => {
                    if (step === 2) {
                        icosRaw = document.getElementById('cw-icos').value.trim();
                        step = 1;
                        render();
                    } else if (step === 3) {
                        step = 2;
                        render();
                    } else if (step === 4) {
                        const editorDiv = document.getElementById('cw-letter-editor');
                        if (editorDiv && recipients[activeRecipientIndex]) {
                            recipients[activeRecipientIndex].text = editorDiv.innerHTML;
                        }
                        step = 2;
                        render();
                    }
                };
            }

            if (sendBtn) {
                sendBtn.onclick = () => runSend();
            }
        };

        const runLustrace = async () => {
            const tbody = document.getElementById('cw-lustrace-table-body');
            const statusDiv = document.getElementById('cw-lustrace-status');
            const nextBtn = document.getElementById('cw-next');
            
            if (!tbody || !statusDiv) return;
            
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#64748b;font-style:italic;">Provádím dotazy na ARES a ISIR registry...</td></tr>`;
            
            const lines = icosRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:#ef4444;font-weight:600;">Nebylo zadáno žádné IČO. Vraťte se a zadejte je.</td></tr>`;
                if (nextBtn) nextBtn.style.display = 'none';
                return;
            }
            
            try {
                const conn = this.ui.getLexisLocalConnection();
                const response = await fetch(`${conn.baseUrl}/api/campaigns/validate-recipients`, {
                    method: 'POST',
                    headers: conn.headers,
                    body: JSON.stringify({ icos: lines })
                });
                
                if (!response.ok) {
                    throw new Error(`Chyba API: ${response.status}`);
                }
                
                const data = await response.json();
                recipients = data.results.map(r => {
                    if (r.error) {
                        return {
                            ico: r.ico || "Neznámé",
                            name: "❌ Chyba",
                            seat: r.error,
                            inInsolvency: false,
                            isdsId: "",
                            text: ""
                        };
                    }
                    return {
                        ...r,
                        text: replacePlaceholders(baseHtml, r)
                    };
                });
                
                tbody.innerHTML = recipients.map(r => {
                    let insBadge = '';
                    if (r.name === "❌ Chyba") {
                        insBadge = `<span style="padding:2px 6px;background:#fee2e2;color:#ef4444;border-radius:4px;font-weight:600;">Chyba lustrace</span>`;
                    } else if (r.inInsolvency) {
                        insBadge = `<span style="padding:2px 6px;background:#fef2f2;color:#dc2626;border-radius:4px;font-weight:600;border:1px solid #fee2e2;">⚠️ V INSOLVENCI (${r.insolvencyCase || ''})</span>`;
                    } else {
                        insBadge = `<span style="padding:2px 6px;background:#f0fdf4;color:#16a34a;border-radius:4px;font-weight:600;border:1px solid #dcfce7;">🟢 Bez záznamu</span>`;
                    }
                    
                    return `
                        <tr style="border-bottom:1px solid #e2e8f0;">
                            <td style="padding:10px;font-family:monospace;font-weight:700;">${window.escapeHTML(r.ico)}</td>
                            <td style="padding:10px;font-weight:600;color:#1e293b;">${window.escapeHTML(r.name)}</td>
                            <td style="padding:10px;color:#2563eb;font-family:monospace;">${window.escapeHTML(r.isdsId || 'Nezjištěno')}</td>
                            <td style="padding:10px;">${insBadge}</td>
                        </tr>
                    `;
                }).join('');
                
                const hasInsolvency = recipients.some(r => r.inInsolvency);
                if (hasInsolvency) {
                    statusDiv.innerHTML = `<span style="color:#dc2626;font-weight:700;">⚠️ Upozornění: Někteří příjemci jsou v insolvenčním řízení!</span> Zkontrolujte je před odesláním.`;
                } else {
                    statusDiv.innerHTML = `<span style="color:#16a34a;font-weight:700;">🟢 Lustrace úspěšně dokončena.</span> Všechny subjekty jsou bez zjištěných rizik.`;
                }
                
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.innerText = "Zobrazit náhledy a upravit &rarr;";
                }
                
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#ef4444;font-weight:600;">Nepodařilo se spojit s LexisLocal serverem: ${err.message}</td></tr>`;
                statusDiv.innerHTML = `<span style="color:#ef4444;font-weight:700;">Selhalo spojení s backendem na portu 4000.</span> Ujistěte se, že LexisLocal běží.`;
            }
        };

        const renderStep4 = () => {
            const listDiv = document.getElementById('cw-recipient-list');
            const editorDiv = document.getElementById('cw-letter-editor');
            const isdsSpan = document.getElementById('cw-preview-recipient-isds');
            
            if (!listDiv || !editorDiv) return;
            
            listDiv.innerHTML = recipients.map((r, i) => {
                const isActive = i === activeRecipientIndex;
                const bg = isActive ? '#eff6ff' : '#f8fafc';
                const border = isActive ? '2px solid #2563eb' : '1px solid #e2e8f0';
                const color = isActive ? '#2563eb' : '#334155';
                const warningStyle = r.inInsolvency ? 'border-left: 4px solid #ef4444;' : '';
                
                return `
                    <div class="cw-recip-item" data-index="${i}" style="padding:10px;margin:6px;border-radius:6px;background:${bg};border:${border};cursor:pointer;transition:all 0.2s;${warningStyle}">
                        <div style="font-weight:700;font-size:11px;color:${color};text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${r.name}</div>
                        <div style="font-size:9px;color:#64748b;margin-top:2px;">IČO: ${r.ico} | ISDS: ${r.isdsId}</div>
                    </div>
                `;
            }).join('');
            
            const activeRecipient = recipients[activeRecipientIndex];
            if (activeRecipient) {
                editorDiv.innerHTML = activeRecipient.text;
                if (isdsSpan) isdsSpan.innerText = `ID schránky: ${activeRecipient.isdsId}`;
            }
            
            const items = listDiv.querySelectorAll('.cw-recip-item');
            items.forEach(item => {
                item.onclick = () => {
                    const currentActive = recipients[activeRecipientIndex];
                    if (currentActive) {
                        currentActive.text = editorDiv.innerHTML;
                    }
                    
                    activeRecipientIndex = parseInt(item.getAttribute('data-index'));
                    renderStep4();
                };
            });
        };

        const runSend = async () => {
            const editorDiv = document.getElementById('cw-letter-editor');
            if (editorDiv && recipients[activeRecipientIndex]) {
                recipients[activeRecipientIndex].text = editorDiv.innerHTML;
            }
            
            const sendBtn = document.getElementById('cw-send');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerText = "Odesílám...";
            }
            
            try {
                const conn = this.ui.getLexisLocalConnection();
                const response = await fetch(`${conn.baseUrl}/api/campaigns/send`, {
                    method: 'POST',
                    headers: conn.headers,
                    body: JSON.stringify({
                        clientName,
                        caseNumber,
                        recipients: recipients.map(r => ({
                            ico: r.ico,
                            name: r.name,
                            isdsId: r.isdsId,
                            text: r.text
                        }))
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Chyba odesílání: ${response.status}`);
                }
                
                const data = await response.json();
                
                document.body.removeChild(overlay);
                this.customAlert(`✅ <b>Hromadné obesílání úspěšné</b><br><br>Úspěšně odesláno <b>${data.results.length} zpráv</b> přes ISDS datové schránky.<br><br>V adresáři <b>Kalendar</b> byly vygenerovány .ics připomínky lhůt sledování doručenek.`);
            } catch (err) {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerText = "🚀 Zkusit znovu odeslat";
                }
                this.customAlert(`❌ Chyba při odesílání: ${err.message}`);
            }
        };

        render();
    }
}

