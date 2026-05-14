        let customTemplatesCache = {};

        async function loadDynamicTemplates() {
            if (!window.electronAPI || !window.electronAPI.getTemplates) return;
            const grid = document.getElementById('templates-grid');
            
            try {
                customTemplatesCache = await window.electronAPI.getTemplates();
                // Vyčistíme staré šablony (necháme jen první dvě statické karty)
                const staticCards = Array.from(grid.children).slice(0, 2);
                grid.innerHTML = '';
                staticCards.forEach(c => grid.appendChild(c));

                for (const [key, tpl] of Object.entries(customTemplatesCache)) {
                    const card = document.createElement('div');
                    card.className = 'start-card';
                    card.onclick = () => openStartDocument(key);
                    card.innerHTML = `
                        <div class="card-icon">${tpl.icon || '📝'}</div>
                        <div class="card-title">${tpl.title}</div>
                        <div class="card-desc">${tpl.desc || 'Vlastní vzor'}</div>
                    `;
                    grid.appendChild(card);
                }
            } catch (error) {
                console.error("Nepodařilo se načíst šablony:", error);
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            loadDynamicTemplates();
        });

        function showLoader(text, callback) {
            const loader = document.getElementById('loader-overlay');
            document.getElementById('loader-text').innerText = text;
            loader.style.display = 'flex';
            setTimeout(() => {
                callback();
                loader.style.display = 'none';
            }, 800);
        }

        function startAppWithContent(htmlContent) {
            document.getElementById('start-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('start-screen').style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                quill.clipboard.dangerouslyPasteHTML(0, htmlContent || '');
            }, 500);
        }

        function openStartDocument(type) {
            if (type === 'file') {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.txt,.html,.docx';
                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    showLoader(`Otevírání dokumentu: ${file.name}...`, () => {
                        if (file.name.endsWith('.docx')) {
                            // Konverze DOCX do HTML pomocí Mammoth.js
                            const reader = new FileReader();
                            reader.onload = function(event) {
                                const arrayBuffer = event.target.result;
                                mammoth.convertToHtml({arrayBuffer: arrayBuffer})
                                    .then(function(result){
                                        startAppWithContent(result.value);
                                    })
                                    .catch(function(err){
                                        console.error("Chyba při čtení DOCX:", err);
                                        customAlert("Nelze přečíst tento DOCX soubor. Zkontrolujte, zda není poškozený.");
                                        startAppWithContent('');
                                    });
                            };
                            reader.readAsArrayBuffer(file);
                        } else {
                            const reader = new FileReader();
                            reader.onload = function(event) {
                                startAppWithContent(event.target.result);
                            };
                            reader.readAsText(file);
                        }
                    });
                };
                input.click();
            } else if (type === 'blank') {
                startAppWithContent('');
            } else {
                showLoader('Načítání právní šablony...', () => {
                    let content = customTemplatesCache[type] ? customTemplatesCache[type].content : '';
                    startAppWithContent(content);
                });
            }
        }

        async function saveAsTemplateDialog() {
            if (!window.electronAPI || !window.electronAPI.saveTemplate) {
                return customAlert("Ukládání šablon vyžaduje spuštění v desktopovém režimu (Electron).");
            }
            
            // Jednoduchý vlastní prompt s výběrem šablony
            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);";
            const modal = document.createElement('div');
            modal.style = "background:#fff;padding:24px;border-radius:12px;width:340px;box-shadow:0 15px 30px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;";
            
            let optionsHtml = '';
            for (const [key, tpl] of Object.entries(customTemplatesCache)) {
                optionsHtml += `<option value="${key}">${tpl.icon} ${tpl.title}</option>`;
            }

            modal.innerHTML = `
                <div style="font-weight:600;font-size:16px;margin-bottom:15px;color:#1e293b;">Uložit jako výchozí šablonu</div>
                <div style="font-size:13px;color:#64748b;margin-bottom:15px;">Tento dokument trvale nahradí vybranou šablonu na Úvodní obrazovce.</div>
                <select id="tpl-select" style="width:100%;padding:10px;margin-bottom:20px;border:1px solid #cbd5e1;border-radius:6px;font-family:'Inter',sans-serif;">
                    ${optionsHtml}
                </select>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="tpl-cancel" style="padding:8px 16px;background:#f1f5f9;color:#475569;border:none;border-radius:6px;cursor:pointer;">Zrušit</button>
                    <button id="tpl-save" style="padding:8px 16px;background:#2563eb;color:#fff;font-weight:500;border:none;border-radius:6px;cursor:pointer;">Přepsat šablonu</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            document.getElementById('tpl-cancel').onclick = () => document.body.removeChild(overlay);
            document.getElementById('tpl-save').onclick = async () => {
                const selectedKey = document.getElementById('tpl-select').value;
                const htmlContent = document.querySelector('.ql-editor').innerHTML;
                
                // Aktualizujeme obsah u vybrané šablony
                customTemplatesCache[selectedKey].content = htmlContent;
                const result = await window.electronAPI.saveTemplate(selectedKey, customTemplatesCache[selectedKey]);
                
                document.body.removeChild(overlay);
                if (result.success) {
                    customAlert(`Šablona byla úspěšně přepsána!\\nPři příštím spuštění aplikace se načte tento vzor.`);
                } else {
                    customAlert(`Chyba při ukládání: ${result.error}`);
                }
            };
        }

        async function resetFactoryTemplates() {
            if (!window.electronAPI || !window.electronAPI.resetTemplates) return;
            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);";
            const modal = document.createElement('div');
            modal.style = "background:#fff;padding:24px;border-radius:12px;width:340px;box-shadow:0 15px 30px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;";
            modal.innerHTML = `
                <div style="font-weight:600;font-size:16px;margin-bottom:15px;color:#dc2626;">Obnovit tovární šablony?</div>
                <div style="font-size:13px;color:#64748b;margin-bottom:20px;">Vaše vlastní uložené texty v šablonách budou nenávratně smazány a nahrazeny těmi původními od LexisEditoru. Jste si jistí?</div>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="rst-cancel" style="padding:8px 16px;background:#f1f5f9;color:#475569;border:none;border-radius:6px;cursor:pointer;">Zrušit</button>
                    <button id="rst-confirm" style="padding:8px 16px;background:#dc2626;color:#fff;font-weight:500;border:none;border-radius:6px;cursor:pointer;">Ano, Smazat a obnovit</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            document.getElementById('rst-cancel').onclick = () => document.body.removeChild(overlay);
            document.getElementById('rst-confirm').onclick = async () => {
                const result = await window.electronAPI.resetTemplates();
                document.body.removeChild(overlay);
                if (result.success) {
                    customAlert("Tovární nastavení šablon bylo obnoveno. Změna se projeví při novém spuštění aplikace.");
                }
            };
        }
        var quill = new Quill('#editor', { theme: 'snow', modules: { toolbar: false } });

        function switchTab(tabId) {
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
                if (t.getAttribute('onclick') && t.getAttribute('onclick').includes(tabId)) {
                    t.classList.add('active');
                }
            });
            document.querySelectorAll('.tool-groups-container').forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        }

        function toggleAIDrawer(open) {
            const drawer = document.getElementById('ai-drawer');
            const overlay = document.getElementById('ai-overlay');
            if (open) {
                drawer.classList.add('open');
                overlay.classList.add('active');
            } else {
                drawer.classList.remove('open');
                overlay.classList.remove('active');
            }
        }

        // New Insert Functions
        function insertLink() {
            const range = quill.getSelection();
            if (range && range.length > 0) {
                const url = prompt("Zadejte URL adresu:");
                if (url) quill.format('link', url);
            } else {
                const text = prompt("Zadejte text odkazu:");
                const url = prompt("Zadejte URL adresu:");
                if (text && url) {
                    const r = quill.getSelection(true);
                    quill.insertText(r.index, text, 'link', url);
                }
            }
        }

        function uploadImageWatermark(input) {
            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const wrapper = document.getElementById('editor-wrapper');
                    let wm = document.getElementById('watermark-overlay');
                    if (!wm) {
                        wm = document.createElement('div');
                        wm.id = 'watermark-overlay';
                        wm.style = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70%; height: 70%; pointer-events: none; user-select: none; z-index: 1000; opacity: 0.15; background-size: contain; background-repeat: no-repeat; background-position: center;";
                        wrapper.appendChild(wm);
                    }
                    wm.style.backgroundImage = `url(${e.target.result})`;
                    wm.innerText = ""; // Clear text if image is used
                    document.getElementById('watermark-select').value = 'NONE';
                };
                reader.readAsDataURL(input.files[0]);
            }
        }

        function changeCase(type) {
            const range = quill.getSelection();
            if (range && range.length > 0) {
                const text = quill.getText(range.index, range.length);
                const newText = type === 'upper' ? text.toUpperCase() : text.toLowerCase();
                quill.deleteText(range.index, range.length);
                quill.insertText(range.index, newText);
                quill.setSelection(range.index, range.length);
            }
        }

        function showFindReplace() {
            const find = prompt("Hledat:");
            if (!find) return;
            const replace = prompt(`Nahradit "${find}" za:`);
            if (replace === null) return;
            
            const text = quill.getText();
            const newText = text.split(find).join(replace);
            quill.setText(newText);
            alert("Všechny výskyty byly nahrazeny.");
        }

        // Real-time stats
        quill.on('text-change', () => {
            const text = quill.getText().trim();
            const words = text ? text.split(/\s+/).length : 0;
            const chars = text.length;
            document.getElementById('word-count').innerText = `Slova: ${words}`;
            document.getElementById('char-count').innerText = `Znaky: ${chars}`;
        });

        function insertTable() {
            const range = quill.getSelection(true);
            const tableModule = quill.getModule('table');
            if (tableModule) {
                tableModule.insertTable(3, 3);
            } else {
                quill.insertText(range.index, "\n[Tabulka 3x3]\n");
            }
        }

        function insertImage() {
            const url = prompt("Zadejte URL obrázku:");
            if (url) {
                const range = quill.getSelection(true);
                quill.insertEmbed(range.index, 'image', url);
            }
        }

        function insertDate() {
            const now = new Date();
            const dateStr = now.toLocaleDateString('cs-CZ');
            quill.insertText(quill.getSelection(true).index, dateStr);
        }

        function insertSymbol(sym) {
            quill.insertText(quill.getSelection(true).index, sym);
        }

        function insertWatermark() {
            // Deprecated by applyWatermark
        }

        // Typography Logic
        function applyFont(font) {
            quill.format('font', font);
            document.getElementById('editor').style.fontFamily = font;
        }

        function applySize(size) {
            quill.format('size', size);
        }

        function exec(format, value = true) {
            const current = quill.getFormat();
            if (current[format] === value) {
                quill.format(format, false);
            } else {
                quill.format(format, value);
            }
        }

        function indent(val) {
            const range = quill.getSelection();
            if (range) {
                const currentIndent = quill.getFormat(range).indent || 0;
                const newIndent = Math.max(0, currentIndent + val);
                quill.format('indent', newIndent === 0 ? false : newIndent);
            }
        }

        // Klávesové zkratky pro Tab
        quill.keyboard.addBinding({
            key: 9, // Tab
            handler: function(range, context) {
                if (context.format.list) {
                    indent(1);
                    return false;
                }
                return true;
            }
        });
        quill.keyboard.addBinding({
            key: 9, // Tab
            shiftKey: true,
            handler: function(range, context) {
                if (context.format.list) {
                    indent(-1);
                    return false;
                }
                return true;
            }
        });

        function setLineSpacing(val) {
            const editor = document.querySelector('.ql-editor');
            editor.style.lineHeight = val;
        }

        // Legal Tools
        function insertPara() { quill.insertText(quill.getSelection()?.index || 0, "§ "); }
        function insertCite() { quill.insertText(quill.getSelection()?.index || 0, "[Citace: č. 89/2012 Sb.]"); }
        function anonymize() { quill.setText(quill.getText().replace(/Jan Novák/g, "J. N.")); }

        function insertClause(type) {
            const clauses = {
                'arbitration': "\n\nSmluvní strany se dohodly, že veškeré spory budou rozhodovány v rozhodčím řízení před Rozhodčím soudem při HK ČR a AK ČR.\n",
                'gdpr': "\n\nSmluvní strany berou na vědomí, že dochází ke zpracování osobních údajů v souladu s Nařízením GDPR.\n",
                'prorogation': "\n\nPro veškeré spory je místně příslušným soudem obecný soud zhotovitele.\n",
                'interest': "\n\nV případě prodlení s úhradou je dlužník povinen uhradit smluvní pokutu ve výši 0,05 % z dlužné částky za každý den prodlení.\n",
                'confidentiality': "\n\nSmluvní strany se zavazují zachovávat mlčenlivost o všech skutečnostech, které se dozvědí v souvislosti s touto smlouvou.\n"
            };
            const range = quill.getSelection(true);
            quill.insertText(range.index, clauses[type]);
        }

        // ==========================================
        // ✨ CUSTOM MODALS (Náhrada za blokovaný prompt/alert)
        // ==========================================
        function customPrompt(title, defaultValue, callback) {
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
            input.focus();
            input.select();
            
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('cp-ok').click(); });

            document.getElementById('cp-ok').onclick = () => {
                document.body.removeChild(overlay);
                callback(input.value);
            };
            document.getElementById('cp-cancel').onclick = () => {
                document.body.removeChild(overlay);
                callback(null);
            };
        }

        function customAlert(text) {
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
            document.getElementById('ca-ok').focus();
            document.getElementById('ca-ok').onclick = () => {
                document.body.removeChild(overlay);
            };
        }

        function showFeeCalc() {
            customPrompt("Zadejte žalovanou částku (Kč):", "", (amount) => {
                if (!amount) return;
                const val = parseFloat(amount.replace(/\s/g, ''));
                if (isNaN(val)) return customAlert("Zadána neplatná částka.");
                let fee = 0;
                if (val <= 20000) fee = 1000;
                else if (val <= 40000000) fee = Math.ceil(val * 0.05);
                else fee = 2000000 + Math.ceil((val - 40000000) * 0.01);
                customAlert(`Soudní poplatek činí:\n\n${fee.toLocaleString('cs-CZ')} Kč`);
            });
        }

        function showInterestCalc() {
            customPrompt("Zadejte jistinu (Kč):", "", (amount) => {
                if (!amount) return;
                const val = parseFloat(amount.replace(/\s/g, ''));
                if (isNaN(val)) return customAlert("Zadána neplatná jistina.");
                const repo = 5.25;
                const rate = repo + 8;
                customAlert(`Zákonný úrok z prodlení (sazba ${rate}% p.a.):\n\nRočně: ${(val * rate / 100).toLocaleString('cs-CZ')} Kč\nMěsíčně: ${(val * rate / 1200).toLocaleString('cs-CZ')} Kč`);
            });
        }

        function insertSignBlock() {
            // Zajištění focusu pro quill
            let range = quill.getSelection();
            if (!range) { quill.focus(); range = quill.getSelection(); }
            if (!range) range = { index: quill.getLength() };

            const text = quill.getText();
            
            // Inteligentní detekce stran - bez dialogu
            let partyA = "Objednatel";
            let partyB = "Zhotovitel";
            if (text.includes("Prodávající") || text.includes("Kupující")) {
                partyA = "Prodávající"; partyB = "Kupující";
            } else if (text.includes("Pronajímatel") || text.includes("Nájemce")) {
                partyA = "Pronajímatel"; partyB = "Nájemce";
            } else if (text.includes("Půjčitel") || text.includes("Vypůjčitel")) {
                partyA = "Půjčitel"; partyB = "Vypůjčitel";
            }

            const block = `

V ........................ dne ...............     V ........................ dne ...............



..............................................     ..............................................
             ${partyA.padEnd(20)}                                   ${partyB.padEnd(20)}
`;
            quill.insertText(range.index, block);
            quill.removeFormat(range.index, block.length); // Zabrání dědění nadpisu (H1, bold)
            quill.setSelection(range.index + block.length); 
        }

        function checkHierarchy() {
            const text = quill.getText();
            const matches = [...text.matchAll(/§\s*(\d+)/g)];
            let lastNum = 0;
            let errors = [];
            matches.forEach(m => {
                const num = parseInt(m[1]);
                if (num <= lastNum) errors.push(`Chyba v pořadí u § ${num}`);
                if (num > lastNum + 1) errors.push(`Možná chybějící sekce mezi § ${lastNum} a § ${num}`);
                lastNum = num;
            });
            if (errors.length > 0) customAlert("Kontrola hierarchie nalezla chyby:\n\n" + errors.join('\n'));
            else customAlert("Značení § je v naprostém pořádku.");
        }

        function openPoweOfAttorneyDialog() {
            toggleAIDrawer(true);
            document.getElementById('ai-header-text').innerText = "Generátor Plné moci";
            document.getElementById('ai-output').innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <input id="pa-name" placeholder="Jméno zmocnitele" class="combo-box" style="width:100%">
                    <select id="pa-type" class="combo-box" style="width:100%">
                        <option value="obecná">Obecná plná moc</option>
                        <option value="procesní">Procesní plná moc</option>
                    </select>
                    <button onclick="generatePA()" style="padding:10px; background:var(--word-blue); color:white; border:none; border-radius:4px; cursor:pointer">Vygenerovat</button>
                </div>
            `;
        }

        function generatePA() {
            const name = document.getElementById('pa-name').value || "[JMÉNO]";
            const type = document.getElementById('pa-type').value;
            const text = `
                \n\nPLNÁ MOC\n\n
                Já, níže podepsaný/á ${name}, tímto uděluji plnou moc k tomu, aby mě zmocněnec zastupoval v rozsahu: ${type}.
                V Praze dne ${new Date().toLocaleDateString('cs-CZ')}
            `.replace(/ {2,}/g, '');
            quill.insertText(quill.getSelection(true).index, text);
            document.getElementById('pa-name').value = '';
        }

        // Page Layout Logic
        function applyPaper(size) {
            const wrapper = document.getElementById('editor-wrapper');
            if (size === 'letter') {
                wrapper.style.width = '215.9mm';
                wrapper.style.minHeight = '279.4mm';
            } else {
                wrapper.style.width = '210mm';
                wrapper.style.minHeight = '297mm';
            }
        }

        function applyOrientation(mode) {
            const wrapper = document.getElementById('editor-wrapper');
            const w = wrapper.offsetWidth;
            const h = wrapper.offsetHeight;
            if (mode === 'landscape') {
                wrapper.style.width = '297mm';
                wrapper.style.minHeight = '210mm';
            } else {
                wrapper.style.width = '210mm';
                wrapper.style.minHeight = '297mm';
            }
        }

        function applyZoom(val) {
            const wrapper = document.getElementById('editor-wrapper');
            wrapper.style.transform = `scale(${val})`;
            wrapper.style.transformOrigin = 'top center';
        }

        function updateMargins() {
            const m = document.getElementById('margin-val').value;
            const editor = document.querySelector('.ql-editor');
            editor.style.setProperty('padding-left', `${m}mm`, 'important');
            editor.style.setProperty('padding-right', `${m}mm`, 'important');
            // Také upravíme záhlaví a zápatí
            document.getElementById('header-area').style.paddingLeft = `${m}mm`;
            document.getElementById('header-area').style.paddingRight = `${m}mm`;
            document.getElementById('footer-area').style.paddingLeft = `${m}mm`;
            document.getElementById('footer-area').style.paddingRight = `${m}mm`;
        }
        function toggleSidebar(id) {
            document.getElementById(id).classList.toggle('collapsed');
        }

        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
        }

        function openPostDialog() {
            document.getElementById('ai-panel').style.display = 'flex';
            document.getElementById('ai-output').innerHTML = "<b>Hybridní pošta:</b><br>Příjemce: Jan Novák<br><br><button onclick='this.innerText=\"Odesláno!\"' style='padding:8px; width:100%;'>Odeslat doporučeně</button>";
        }

        function lookupARES() {
            const ico = document.getElementById('ares-ico').value.trim();
            if (!ico) return alert("Zadejte prosím IČO.");
            
            document.getElementById('ai-panel').style.display = 'flex';
            document.getElementById('ai-header-text').innerText = "Lustrace ARES";
            document.getElementById('ai-output').innerHTML = "Vyhledávám v registru...";

            // Poznámka: V čistém prohlížeči může fetch na státní API selhat kvůli CORS.
            // V Electronu/Tauri toto omezení neplatí. Zde implementujeme robustní simulaci s reálnými daty.
            setTimeout(() => {
                const results = {
                    "27082440": { nazev: "Alza.cz a.s.", adresa: "Jankovcova 1522/53, Holešovice, 170 00 Praha 7" },
                    "45244782": { nazev: "MAFRA, a.s.", adresa: "Karla Engliše 519/11, Smíchov, 150 00 Praha 5" },
                    "25107354": { nazev: "Seznam.cz, a.s.", adresa: "Radlická 3294/10, Smíchov, 150 00 Praha 5" }
                };

                const data = results[ico];
                if (data) {
                    document.getElementById('ai-output').innerHTML = `
                        <b>Subjekt nalezen:</b><br>
                        ${data.nazev}<br>
                        IČO: ${ico}<br>
                        ${data.adresa}<br><br>
                        <button onclick="insertARES('${data.nazev}', '${ico}', '${data.adresa}')" style="width:100%; padding:8px;">Vložit do záhlaví</button>
                    `;
                } else {
                    document.getElementById('ai-output').innerHTML = "Subjekt nebyl v ARES nalezen (pro demo použijte 27082440).";
                }
            }, 800);
        }

        function insertARES(nazev, ico, adresa) {
            const text = `Smluvní strana:\n${nazev}\nIČO: ${ico}\nsídlem: ${adresa}\n\n`;
            quill.insertText(0, text, { bold: true });
            document.getElementById('ai-panel').style.display = 'none';
        }

        // Persistence & History
        let history = JSON.parse(localStorage.getItem('lexis_history') || '[]');

        function saveVersion(name = "Automatická záloha") {
            const version = {
                id: Date.now(),
                timestamp: new Date().toLocaleString('cs-CZ'),
                name: name,
                content: quill.getContents(),
                wordCount: quill.getText().trim().split(/\s+/).length - 1
            };
            history.unshift(version);
            if (history.length > 20) history.pop(); // Max 20 verzí
            localStorage.setItem('lexis_history', JSON.stringify(history));
            updateHistoryUI();
        }

        function saveVersionManually() {
            const name = prompt("Název verze (např. 'Před revizí'):", "");
            if (name !== null) saveVersion(name || "Ruční verze");
        }

        function updateHistoryUI() {
            const list = document.getElementById('history-list');
            list.innerHTML = history.map(v => `
                <div class="clause-item" style="padding: 6px; font-size: 11px; flex-direction: column; align-items: flex-start; gap: 2px;">
                    <div style="font-weight: 600; width: 100%; display: flex; justify-content: space-between;">
                        <span>${v.name}</span>
                        <span style="color: var(--accent); cursor: pointer;" onclick="restoreVersion(${v.id})">Obnovit</span>
                    </div>
                    <div style="color: #888; font-size: 10px;">${v.timestamp} • ${v.wordCount} slov</div>
                </div>
            `).join('');
        }

        function restoreVersion(id) {
            const v = history.find(v => v.id === id);
            if (v && confirm(`Opravdu chcete obnovit verzi ze dne ${v.timestamp}? Aktuální změny budou přepsány.`)) {
                quill.setContents(v.content);
            }
        }

        // Auto-save každých 5 minut
        setInterval(() => saveVersion(), 5 * 60 * 1000);

        quill.on('text-change', () => {
            const text = quill.getText();
            document.getElementById('word-count').innerText = (text.trim().split(/\s+/).length - 1) + " slov";
        });

        // Initial UI load
        updateHistoryUI();
        loadAISettings();

        // AI Settings Persistence
        function saveAISettings() {
            const settings = {
                provider: document.getElementById('ai-provider').value,
                model: document.getElementById('ai-model').value,
                endpoint: document.getElementById('ai-endpoint').value,
                apiKey: document.getElementById('ai-apikey').value
            };
            localStorage.setItem('lexis_ai_settings', JSON.stringify(settings));
            console.log('AI Settings saved:', settings);
        }

        function loadAISettings() {
            const saved = localStorage.getItem('lexis_ai_settings');
            if (saved) {
                const s = JSON.parse(saved);
                document.getElementById('ai-provider').value = s.provider;
                document.getElementById('ai-model').value = s.model;
                document.getElementById('ai-endpoint').value = s.endpoint;
                document.getElementById('ai-apikey').value = s.apiKey;
            }
        }

        function getAIConfig() {
            return {
                provider: document.getElementById('ai-provider').value,
                model: document.getElementById('ai-model').value,
                endpoint: document.getElementById('ai-endpoint').value,
                apiKey: document.getElementById('ai-apikey').value
            };
        }
        // ==========================================
        // ✨ LEXIS AI BRIDGE (Configurable)
        // ==========================================
        const AI_CONFIG = {
            provider: 'ollama', // 'ollama', 'openai', 'anthropic'
            endpoint: 'http://localhost:11434/api/generate',
            model: 'llama3',
            apiKey: ''
        };

        async function sendAIQuery() {
            const input = document.getElementById('ai-prompt');
            const output = document.getElementById('ai-output');
            const prompt = input.value.trim();
            if (!prompt) return;

            const config = getAIConfig();

            // UI: Add User Bubble
            output.innerHTML += `<div class="ai-bubble user">${prompt}</div>`;
            input.value = '';
            output.scrollTop = output.scrollHeight;

            // UI: Add Thinking Indicator
            const thinkingId = 'thinking-' + Date.now();
            output.innerHTML += `
                <div class="ai-bubble bot" id="${thinkingId}">
                    <div class="thinking"><div class="dot"></div><div class="dot" style="animation-delay:0.2s"></div><div class="dot" style="animation-delay:0.4s"></div></div>
                </div>
            `;
            output.scrollTop = output.scrollHeight;

            try {
                const response = await callAI(prompt, config);
                document.getElementById(thinkingId).innerHTML = response;
            } catch (err) {
                document.getElementById(thinkingId).innerHTML = `<span style="color:red">Chyba připojení: ${err.message}</span>`;
            }
            output.scrollTop = output.scrollHeight;
        }

        async function callAI(prompt, config) {
            // ZDE JE MÍSTO PRO VAŠE NAPOJENÍ
            // Aktuálně vrací simulovanou odpověď pro testování UI
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve("Toto je simulovaná odpověď z <b>LexisAI Bridge</b>. Rozhraní je připraveno pro napojení na <b>" + config.provider + "</b> (" + config.model + ") na adrese " + config.endpoint + ".");
                }, 1500);
            });
        }

        function insertSubjectHeader(type) {
            let html = "";
            const baseStyle = "padding: 20px 25px; margin: 30px 0; background: #ffffff; border-radius: 12px; font-family: 'Inter', sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; position: relative; overflow: hidden;";
            
            if (type === 'person') {
                html = `
                    <div style="${baseStyle}">
                        <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #3b82f6, #2563eb);"></div>
                        <p style="margin-bottom: 8px; color: #3b82f6; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Fyzická osoba</p>
                        <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>[JMÉNO A PŘÍJMENÍ]</strong></p>
                        <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
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
                        <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #f59e0b, #d97706);"></div>
                        <p style="margin-bottom: 8px; color: #d97706; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Podnikající fyzická osoba</p>
                        <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>[JMÉNO A PŘÍJMENÍ]</strong></p>
                        <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                            <div><strong>IČO:</strong> [IČO]</div>
                            <div><strong>DIČ:</strong> [DIČ]</div>
                            <div style="grid-column: span 2;"><strong>Sídlo:</strong> [ADRESA MÍSTA PODNIKÁNÍ]</div>
                            <div style="grid-column: span 2; font-size: 11px; color: #94a3b8;">Zapsán v živnostenském rejstříku vedeném [ÚŘAD]</div>
                        </div>
                    </div>
                    <p><br></p>
                `;
            } else if (type === 'company') {
                html = `
                    <div style="${baseStyle}">
                        <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #10b981, #059669);"></div>
                        <p style="margin-bottom: 8px; color: #10b981; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Identifikace: Právnická osoba</p>
                        <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>[OBCHODNÍ FIRMA / NÁZEV]</strong></p>
                        <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                            <div><strong>IČO:</strong> [IČO]</div>
                            <div><strong>DIČ:</strong> [DIČ]</div>
                            <div style="grid-column: span 2;"><strong>Sídlo:</strong> [ADRESA SÍDLA]</div>
                            <div style="grid-column: span 2;"><strong>Zastoupená:</strong> [JMÉNO], [FUNKCE]</div>
                            <div style="grid-column: span 2; font-size: 11px; color: #94a3b8; font-style: italic;">Zapsaná v obchodním rejstříku vedeném [SOUD] v [MĚSTO], oddíl [ODDÍL], vložka [VLOŽKA]</div>
                        </div>
                    </div>
                    <p><br></p>
                `;
            }
            
            const range = quill.getSelection();
            if (range) {
                quill.clipboard.dangerouslyPasteHTML(range.index, html);
            } else {
                quill.clipboard.dangerouslyPasteHTML(quill.getLength(), html);
            }
        }

        function sendViaEmail() {
            const subject = "Dokument z LexisEditoru: " + (document.querySelector('.ql-editor h1')?.innerText || "Bez názvu");
            const body = "V příloze naleznete vygenerovaný právní dokument.\n\n---\nOdesláno z LexisEditoru";
            window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }

        async function exportToDocx() {
            if (window.electronAPI && window.electronAPI.exportDocx) {
                const html = document.querySelector('.ql-editor').innerHTML;
                try {
                    const result = await window.electronAPI.exportDocx(html);
                    if (result.success) {
                        customAlert(`Dokument byl úspěšně uložen do:\n\n${result.path}`);
                    } else if (!result.canceled) {
                        customAlert(`Chyba při ukládání dokumentu:\n\n${result.error}`);
                    }
                } catch (error) {
                    customAlert(`Neočekávaná chyba:\n\n${error.message}`);
                }
            } else {
                customAlert("Export do DOCX je dostupný pouze v desktopové (Electron) verzi LexisEditoru.");
            }
        }

        function searchAres() {
            customPrompt("Zadejte IČO hledaného subjektu (8 číslic):", "", async (ico) => {
                if (!ico) return;
                const cleanIco = ico.replace(/\\s/g, '');
                
                if (window.electronAPI && window.electronAPI.searchAres) {
                    // Můžeme sem případně dát loader, ale necháme to zatím rychle běžet na pozadí
                    try {
                        const result = await window.electronAPI.searchAres(cleanIco);
                        if (result.success) {
                            const d = result.data;
                            
                            // Vygenerujeme identifikaci strany
                            const baseStyle = "border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 20px; font-family: 'Inter', sans-serif; position: relative; overflow: hidden; background: #f8fafc;";
                            const html = `
                                <div style="${baseStyle}">
                                    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: linear-gradient(to bottom, #2563eb, #1d4ed8);"></div>
                                    <p style="margin-bottom: 8px; color: #2563eb; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Ověřeno v ARES: Právnická/Fyzická osoba</p>
                                    <p style="font-size: 18px; margin: 0; color: #1e293b;"><strong>${d.obchodniJmeno}</strong></p>
                                    <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #475569;">
                                        <div><strong>IČO:</strong> ${d.ico}</div>
                                        <div><strong>DIČ:</strong> ${d.dic}</div>
                                        <div style="grid-column: span 2;"><strong>Sídlo:</strong> ${d.sidlo}</div>
                                        <div style="grid-column: span 2; font-size: 11px; color: #94a3b8; font-style: italic;">Staženo z Rejstříku MFČR (${d.pravniForma})</div>
                                    </div>
                                </div>
                                <p><br></p>
                            `;
                            
                            let range = quill.getSelection();
                            if (!range) { quill.focus(); range = quill.getSelection(); }
                            if (!range) range = { index: quill.getLength() };
                            
                            quill.clipboard.dangerouslyPasteHTML(range.index, html);
                            
                        } else {
                            customAlert(`ARES API nenašlo žádná data nebo selhalo:\\n\\n${result.error}`);
                        }
                    } catch (error) {
                        customAlert(`Neočekávaná chyba při volání ARES:\\n\\n${error.message}`);
                    }
                } else {
                    customAlert("Vyhledávání v ARES funguje z bezpečnostních důvodů jen ve verzi pro Desktop (Electron), protože prohlížeč blokuje CORS politiky státních úřadů.");
                }
            });
        }

        function setMargins(m) {
            const editorDiv = document.querySelector('.ql-editor');
            if (!editorDiv) return;
            if (m === 'narrow') editorDiv.style.setProperty('padding', '15mm', 'important');
            else if (m === 'wide') editorDiv.style.setProperty('padding', '35mm', 'important');
            else editorDiv.style.setProperty('padding', '25mm', 'important');
        }

        function toggleRuler() {
            const wrapper = document.getElementById('editor-wrapper');
            wrapper.classList.toggle('has-ruler');
            if (wrapper.classList.contains('has-ruler')) {
                alert("Pravítko zobrazeno (simulace v CSS)");
            }
        }

        function toggleGrid() {
            const scroll = document.querySelector('.editor-scroll');
            scroll.classList.toggle('has-grid');
        }

        function setOrientation(o) {
            const wrapper = document.getElementById('editor-wrapper');
            if (o === 'landscape') {
                wrapper.style.width = '297mm';
                wrapper.style.minHeight = '210mm';
            } else {
                wrapper.style.width = '210mm';
                wrapper.style.minHeight = '297mm';
            }
        }

        function setColumns(c) {
            const editor = document.querySelector('.ql-editor');
            editor.style.columnCount = c;
            editor.style.columnGap = '10mm';
        }

        let isTracking = false;
        function toggleTrackChanges() {
            isTracking = !isTracking;
            customAlert(isTracking ? "Sledování změn ZAPNUTO" : "Sledování změn VYPNUTO");
        }

        function showDeadlineCalc() {
            customPrompt("Zadejte počet dní lhůty (např. 15 nebo 30):", "15", (days) => {
                if (!days) return;
                const target = new Date();
                target.setDate(target.getDate() + parseInt(days));
                customAlert(`Lhůta končí dne:\n\n${target.toLocaleDateString('cs-CZ')}`);
            });
        }

        function toggleCommentDrawer(open) {
            const drawer = document.getElementById('comment-sidebar');
            const overlay = document.getElementById('ai-overlay');
            if (open) {
                drawer.classList.add('open');
                overlay.classList.add('active');
            } else {
                drawer.classList.remove('open');
                overlay.classList.remove('active');
            }
        }

        function addComment() {
            const range = quill.getSelection();
            if (!range || range.length === 0) {
                customAlert("Pro přidání komentáře nejprve vyberte text.");
                return;
            }

            customPrompt("Zadejte text komentáře:", "", (text) => {
                if (!text) return;

                // Highlight
                quill.formatText(range.index, range.length, { background: '#fef08a' });

                // Show Drawer
                toggleCommentDrawer(true);

                // Add to list
                const list = document.getElementById('comments-list');
                if (list.innerText === "Žádné komentáře") list.innerHTML = "";

                const commentId = 'comment-' + Date.now();
                const card = document.createElement('div');
                card.id = commentId;
                card.style = "background:#fefce8; border:1px solid #fef08a; padding:12px; border-radius:8px; font-size:12px; position:relative; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom:10px;";
                card.innerHTML = `
                    <div style="font-weight:600; color:#854d0e; margin-bottom:4px;">Uživatel (Právník)</div>
                    <div style="color:#713f12;">${text}</div>
                    <div style="margin-top:8px; display:flex; gap:8px;">
                        <button onclick="resolveComment('${commentId}', ${range.index}, ${range.length})" style="font-size:10px; background:#facc15; color:#111; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600;">Vyřešit</button>
                    </div>
                `;
                list.prepend(card);
            });
        }

        function resolveComment(id, index, length) {
            const el = document.getElementById(id);
            if (el) el.remove();
            quill.formatText(index, length, { background: false });
            const list = document.getElementById('comments-list');
            if (list.children.length === 0) list.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px; margin-top:20px;">Žádné komentáře</div>';
        }
