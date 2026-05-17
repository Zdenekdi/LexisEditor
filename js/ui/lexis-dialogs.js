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
}
