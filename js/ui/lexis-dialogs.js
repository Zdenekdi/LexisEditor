/* global Quill, DOMPurify, localStorage */
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

    showTariffCalc() {
        this.ui.checkEnterpriseFeature("Kalkulačka mimosmluvní odměny", () => {
            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);";
            
            const modal = document.createElement('div');
            modal.style = "background:#fff;padding:24px;border-radius:12px;width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif;box-sizing:border-box;";
            
            modal.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;">
                    <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px;">⚖️ Advokátní tarif (§ 7)</h3>
                    <button id="tc-close" style="background:none;border:none;font-size:24px;color:#94a3b8;cursor:pointer;line-height:1;outline:none;">&times;</button>
                </div>
                
                <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px;">
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label style="font-size:12px;font-weight:600;color:#475569;">Tarifní hodnota (hodnota věci v Kč)</label>
                        <input type="text" id="tc-value" placeholder="např. 150 000" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;">
                    </div>
                    
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label style="font-size:12px;font-weight:600;color:#475569;">Počet úkonů právní služby</label>
                        <input type="number" id="tc-acts" value="1" min="1" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;">
                    </div>
                    
                    <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;cursor:pointer;">
                            <input type="checkbox" id="tc-flatrate" checked style="width:16px;height:16px;cursor:pointer;">
                            Připočíst režijní paušál (300 Kč za úkon)
                        </label>
                        
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;cursor:pointer;">
                            <input type="checkbox" id="tc-vat" style="width:16px;height:16px;cursor:pointer;">
                            Plátce DPH (připočíst 21 %)
                        </label>
                    </div>
                </div>
                
                <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;font-family:'Inter',sans-serif;">
                    <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;">
                        <span>Sazba za 1 úkon:</span>
                        <span id="tc-out-single" style="font-weight:600;color:#0f172a;">0 Kč</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;">
                        <span>Odměna celkem:</span>
                        <span id="tc-out-base" style="font-weight:600;color:#0f172a;">0 Kč</span>
                    </div>
                    <div id="tc-out-flatrate-row" style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;">
                        <span>Režijní paušál celkem:</span>
                        <span id="tc-out-flatrate" style="font-weight:600;color:#0f172a;">0 Kč</span>
                    </div>
                    <div id="tc-out-vat-row" style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;display:none;">
                        <span>DPH (21 %):</span>
                        <span id="tc-out-vat" style="font-weight:600;color:#0f172a;">0 Kč</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#0f172a;margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:10px;">
                        <span>CELKEM:</span>
                        <span id="tc-out-total" style="color:#2563eb;">0 Kč</span>
                    </div>
                </div>
                
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="tc-cancel" style="padding:10px 16px;background:#f1f5f9;color:#475569;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;">Zavřít</button>
                    <button id="tc-insert" style="padding:10px 16px;background:#2563eb;color:#fff;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-size:13px;outline:none;display:flex;align-items:center;gap:6px;">✍️ Vložit výpočet</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            const valInput = document.getElementById('tc-value');
            const actsInput = document.getElementById('tc-acts');
            const flatrateCheck = document.getElementById('tc-flatrate');
            const vatCheck = document.getElementById('tc-vat');
            
            const outSingle = document.getElementById('tc-out-single');
            const outBase = document.getElementById('tc-out-base');
            const outFlatrate = document.getElementById('tc-out-flatrate');
            const outFlatrateRow = document.getElementById('tc-out-flatrate-row');
            const outVat = document.getElementById('tc-out-vat');
            const outVatRow = document.getElementById('tc-out-vat-row');
            const outTotal = document.getElementById('tc-out-total');
            
            const calculate = () => {
                const rawVal = valInput.value.replace(/\s/g, '');
                const val = rawVal === '' ? 0 : parseFloat(rawVal);
                if (isNaN(val)) {
                    outSingle.innerText = "Chyba";
                    outBase.innerText = "Chyba";
                    outTotal.innerText = "Chyba";
                    return;
                }
                
                const acts = parseInt(actsInput.value) || 1;
                const includeFlatrate = flatrateCheck.checked;
                const includeVat = vatCheck.checked;
                
                // Calculate single act rate from tariff value (§ 7)
                let singleRate = 0;
                if (val <= 500) {
                    singleRate = 300;
                } else if (val <= 1000) {
                    singleRate = 500;
                } else if (val <= 5000) {
                    singleRate = 1000;
                } else if (val <= 10000) {
                    singleRate = 1500;
                } else if (val <= 200000) {
                    const diff = val - 10000;
                    const blocks = Math.ceil(diff / 1000);
                    singleRate = 1500 + (blocks * 40);
                } else if (val <= 10000000) {
                    const diff = val - 200000;
                    const blocks = Math.ceil(diff / 10000);
                    singleRate = 9100 + (blocks * 40);
                } else {
                    const diff = val - 10000000;
                    const blocks = Math.ceil(diff / 100000);
                    singleRate = 48300 + (blocks * 40);
                }
                
                const baseReward = singleRate * acts;
                const flatrateTotal = includeFlatrate ? (300 * acts) : 0;
                
                outSingle.innerText = `${singleRate.toLocaleString('cs-CZ')} Kč`;
                outBase.innerText = `${baseReward.toLocaleString('cs-CZ')} Kč`;
                
                if (includeFlatrate) {
                    outFlatrateRow.style.display = 'flex';
                    outFlatrate.innerText = `${flatrateTotal.toLocaleString('cs-CZ')} Kč`;
                } else {
                    outFlatrateRow.style.display = 'none';
                }
                
                let totalBeforeVat = baseReward + flatrateTotal;
                let vatTotal = 0;
                
                if (includeVat) {
                    vatTotal = Math.round(totalBeforeVat * 0.21);
                    outVatRow.style.display = 'flex';
                    outVat.innerText = `${vatTotal.toLocaleString('cs-CZ')} Kč`;
                } else {
                    outVatRow.style.display = 'none';
                }
                
                const finalTotal = totalBeforeVat + vatTotal;
                outTotal.innerText = `${finalTotal.toLocaleString('cs-CZ')} Kč`;
            };
            
            valInput.oninput = (e) => {
                let cursorPosition = valInput.selectionStart;
                let originalLength = valInput.value.length;
                let clean = valInput.value.replace(/\s/g, '');
                if (/^\d*$/.test(clean)) {
                    let formatted = clean.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
                    valInput.value = formatted;
                    let newLength = formatted.length;
                    valInput.setSelectionRange(cursorPosition + (newLength - originalLength), cursorPosition + (newLength - originalLength));
                }
                calculate();
            };
            
            actsInput.oninput = calculate;
            flatrateCheck.onchange = calculate;
            vatCheck.onchange = calculate;
            
            document.getElementById('tc-close').onclick = () => document.body.removeChild(overlay);
            document.getElementById('tc-cancel').onclick = () => document.body.removeChild(overlay);
            
            document.getElementById('tc-insert').onclick = () => {
                const rawVal = valInput.value.replace(/\s/g, '');
                const val = rawVal === '' ? 0 : parseFloat(rawVal);
                if (isNaN(val)) return;
                
                const acts = parseInt(actsInput.value) || 1;
                const includeFlatrate = flatrateCheck.checked;
                const includeVat = vatCheck.checked;
                
                let singleRate = 0;
                if (val <= 500) singleRate = 300;
                else if (val <= 1000) singleRate = 500;
                else if (val <= 5000) singleRate = 1000;
                else if (val <= 10000) singleRate = 1500;
                else if (val <= 200000) singleRate = 1500 + (Math.ceil((val - 10000) / 1000) * 40);
                else if (val <= 10000000) singleRate = 9100 + (Math.ceil((val - 200000) / 10000) * 40);
                else singleRate = 48300 + (Math.ceil((val - 10000000) / 100000) * 40);
                
                const baseReward = singleRate * acts;
                const flatrateTotal = includeFlatrate ? (300 * acts) : 0;
                let totalBeforeVat = baseReward + flatrateTotal;
                let vatTotal = includeVat ? Math.round(totalBeforeVat * 0.21) : 0;
                const finalTotal = totalBeforeVat + vatTotal;
                
                let textToInsert = `
                    <p><b>Výpočet mimosmluvní odměny advokáta dle vyhlášky č. 177/1996 Sb. (Advokátní tarif):</b></p>
                    <ul>
                        <li>Tarifní hodnota: ${val.toLocaleString('cs-CZ')} Kč</li>
                        <li>Sazba za jeden úkon (§ 7): ${singleRate.toLocaleString('cs-CZ')} Kč</li>
                        <li>Počet úkonů právní služby (§ 11): ${acts}</li>
                        <li>Odměna celkem (bez režie): ${baseReward.toLocaleString('cs-CZ')} Kč</li>
                        \${includeFlatrate ? \`<li>Režijní paušál (\${acts} &times; 300 Kč dle § 13): \${flatrateTotal.toLocaleString('cs-CZ')} Kč</li>\` : ''}
                        \${includeVat ? \`<li>DPH (21 %): \${vatTotal.toLocaleString('cs-CZ')} Kč</li>\` : ''}
                        <li><b>CELKEM K ÚHRADĚ: \${finalTotal.toLocaleString('cs-CZ')} Kč</b></li>
                    </ul>
                `.trim().replace(/ {2,}/g, '').replace(/\n/g, '');
                
                const range = this.core.quill.getSelection(true);
                const index = range ? range.index : this.core.quill.getLength();
                
                this.core.safePasteHTML(index, textToInsert);
                document.body.removeChild(overlay);
                
                this.customAlert("✅ <b>Výpočet vložen</b><br><br>Kompletní rozbor výpočtu odměny byl vložen na pozici kurzoru.");
                this.ui.saveActiveDocumentState();
            };
            
            calculate();
            valInput.focus();
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
        
        const paText = type === 'procesní' ? `
                <h1>PLNÁ MOC (PROCESNÍ)</h1>
                <p>Já, níže podepsaný/á:</p>
                <p><b>${name}</b>, nar. [DOPLNIT], trvale bytem [DOPLNIT]</p>
                <p>tímto uděluji procesní plnou moc advokátní kanceláři [DOPLNIT] k tomu, aby mě zastupovala ve všech právních věcech, před soudy, orgány státní správy i samosprávy a vůči třetím osobám v plném rozsahu.</p>
                <p>V Praze dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                <p>.......................................<br><b>${name}</b> (zmocnitel)</p>
            `.replace(/ {2,}/g, '') : `
                <h1>PLNÁ MOC (OBECNÁ)</h1>
                <p>Já, níže podepsaný/á:</p>
                <p><b>${name}</b>, nar. [DOPLNIT], trvale bytem [DOPLNIT]</p>
                <p>tímto zmocňuji pana/paní [DOPLNIT], nar. [DOPLNIT], trvale bytem [DOPLNIT], aby mě zastupoval/a ve všech běžných záležitostech a činil/a mým jménem veškeré právní úkony.</p>
                <p>V Praze dne ${new Date().toLocaleDateString('cs-CZ')}</p>
                <p>.......................................<br><b>${name}</b> (zmocnitel)</p>
            `.replace(/ {2,}/g, '');
        
        const range = this.core.quill.getSelection(true);
        const index = range ? range.index : this.core.quill.getLength();
        
        this.core.safePasteHTML(index, paText);
        nameInput.value = '';
        
        this.customAlert("✅ <b>Plná moc vygenerována</b><br><br>Šablona plné moci byla úspěšně vložena na pozici kurzoru.");
        this.ui.toggleAIDrawer(false);
        this.ui.saveActiveDocumentState();
        this.ui.updateDocumentOutline();
    }

}

