/* global Quill */
/**
 * LexisActions — doplnění dříve nedefinovaných (mrtvých) handlerů ribbonu.
 *
 * Historicky několik tlačítek v pásech Revize / Vložit / Zobrazení / Nápověda /
 * Nastavení volalo globální funkce, které nikde neexistovaly → onclick házel
 * ReferenceError a tlačítko nedělalo nic (v konzoli chyba).
 *
 * Tento modul je ADITIVNÍ (nezasahuje do monolitu lexis-ui.js): definuje chybějící
 * window.* funkce. Tam, kde je to smysluplné, poskytuje plnou funkčnost; u funkcí,
 * které vyžadují dosud neexistující subsystém (verzování, tabulkový modul Quillu),
 * poskytuje čestnou zpětnou vazbu místo tichého pádu.
 */
(function () {
    'use strict';

    function quill() { return (window.lexisCore && window.lexisCore.quill) || window.quill || null; }
    function ui() { return window.lexisUI || null; }
    function toast(msg) {
        const u = ui();
        if (u && typeof u.customAlert === 'function') u.customAlert(msg);
        else console.log('[LexisActions]', msg);
    }
    // Definuj globální handler jen když ještě neexistuje (nepřepisuj reálné metody).
    function def(name, fn) {
        if (typeof window[name] !== 'function') window[name] = fn;
    }

    // ================= REVIZE (#32) =================

    // Odstranění veškerého zvýraznění (background) z celého dokumentu.
    def('clearHighlights', function () {
        const q = quill(); if (!q) return;
        const len = q.getLength();
        q.formatText(0, len, 'background', false, 'user');
        toast('✅ Zvýraznění bylo odstraněno z celého dokumentu.');
    });

    // Přijmout / odmítnout všechny sledované změny.
    // Vsuvky = span.ql-insertion (formát 'insertion'), smazání = 'deletion'.
    function resolveTrackedChanges(accept) {
        const q = quill(); if (!q) return 0;
        let Delta;
        try { Delta = Quill.import('delta'); } catch (e) { return -1; }
        const contents = q.getContents();
        const out = new Delta();
        let touched = 0;
        contents.ops.forEach(op => {
            const attr = op.attributes || {};
            if (attr.deletion) {
                touched++;
                if (accept) { /* přijmout smazání → text zahodit */ }
                else { const a = Object.assign({}, attr); delete a.deletion; out.insert(op.insert, cleanAttrs(a)); }
            } else if (attr.insertion) {
                touched++;
                if (accept) { const a = Object.assign({}, attr); delete a.insertion; out.insert(op.insert, cleanAttrs(a)); }
                else { /* odmítnout vsuvku → text zahodit */ }
            } else {
                out.insert(op.insert, op.attributes);
            }
        });
        if (touched > 0) q.setContents(out, 'user');
        return touched;
    }
    function cleanAttrs(a) { return Object.keys(a).length ? a : undefined; }

    def('acceptAll', function () {
        const n = resolveTrackedChanges(true);
        if (n === -1) return toast('Nelze zpracovat sledované změny (chybí Quill delta).');
        toast(n > 0 ? `✅ Přijato ${n} sledovaných změn.` : 'Žádné sledované změny k přijetí.');
    });
    def('rejectAll', function () {
        const n = resolveTrackedChanges(false);
        if (n === -1) return toast('Nelze zpracovat sledované změny (chybí Quill delta).');
        toast(n > 0 ? `↩️ Odmítnuto ${n} sledovaných změn.` : 'Žádné sledované změny k odmítnutí.');
    });

    // Vyčištění metadat: přijme sledované změny, odstraní zvýraznění a komentářové
    // značky — připraví "čistý" dokument k odeslání.
    def('scrubMetadata', function () {
        const q = quill(); if (!q) return;
        resolveTrackedChanges(true);
        const len = q.getLength();
        q.formatText(0, len, 'background', false, 'user');
        // Odstranit komentářové spany, pokud v DOMu jsou.
        try {
            q.root.querySelectorAll('[data-comment-id], .comment-highlight').forEach(node => {
                const parent = node.parentNode;
                while (node.firstChild) parent.insertBefore(node.firstChild, node);
                parent.removeChild(node);
            });
            q.update();
        } catch (e) { /* best-effort */ }
        toast('🧹 Metadata vyčištěna: sledované změny přijaty, zvýraznění a komentáře odstraněny.');
    });

    // Verzování zatím není implementováno jako subsystém — čestná zpětná vazba.
    def('compareVersions', function () {
        toast('ℹ️ Porovnání verzí vyžaduje historii verzí dokumentu, která zatím není zapnutá. Doporučený postup: uložte průběžné kopie přes „Uložit".');
    });
    def('showHistory', function () {
        toast('ℹ️ Historie změn zatím není vedena. Pro sledování úprav použijte režim „Sledovat změny".');
    });

    // ================= VLOŽIT (#34) =================

    // Vložení obrázku z disku do editoru (Quill umí embed 'image').
    def('insertImage', function () {
        const q = quill(); if (!q) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function () {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                const range = q.getSelection(true) || { index: q.getLength() };
                q.insertEmbed(range.index, 'image', e.target.result, 'user');
                q.setSelection(range.index + 1, 0);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    });

    // Quill core nemá tabulkový modul — čestná zpětná vazba místo tichého selhání.
    def('insertTable', function () {
        toast('ℹ️ Vkládání tabulek vyžaduje rozšířený tabulkový modul. Zatím doporučujeme tabulku připravit v šabloně nebo vložit jako obrázek.');
    });

    // ================= ZOBRAZENÍ (#34) =================

    function ensureViewCss() {
        if (document.getElementById('lexis-actions-css')) return;
        const style = document.createElement('style');
        style.id = 'lexis-actions-css';
        style.textContent = `
            #editor-wrapper.show-grid #editor {
                background-image:
                    linear-gradient(to right, rgba(37,99,235,0.08) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(37,99,235,0.08) 1px, transparent 1px);
                background-size: 24px 24px;
            }
            #editor-wrapper.show-ruler { border-top: 18px solid #eef2f7; position: relative; }
            #editor-wrapper.show-ruler::before {
                content: ""; position: absolute; top: -18px; left: 0; right: 0; height: 18px;
                background-image: repeating-linear-gradient(to right,
                    #94a3b8 0, #94a3b8 1px, transparent 1px, transparent 20px);
            }
        `;
        document.head.appendChild(style);
    }
    def('toggleRuler', function () {
        ensureViewCss();
        const w = document.getElementById('editor-wrapper'); if (!w) return;
        const on = w.classList.toggle('show-ruler');
        toast(on ? 'Pravítko zapnuto.' : 'Pravítko vypnuto.');
    });
    def('toggleGrid', function () {
        ensureViewCss();
        const w = document.getElementById('editor-wrapper'); if (!w) return;
        const on = w.classList.toggle('show-grid');
        toast(on ? 'Mřížka zapnuta.' : 'Mřížka vypnuta.');
    });

    // ================= NÁPOVĚDA (#34) =================

    def('runSelfDiagnostic', function () {
        const checks = [];
        const q = quill();
        checks.push(['Editor (Quill)', !!q]);
        checks.push(['UI vrstva (LexisUI)', !!ui()]);
        checks.push(['Nativní most (electronAPI)', !!window.electronAPI]);
        checks.push(['AI poskytovatel', typeof window.LexisAIProvider === 'function']);
        checks.push(['Úložiště kontaktů', !!(window.LexisContacts || window.lexisContacts)]);
        const ok = checks.filter(c => c[1]).length;
        const lines = checks.map(c => `${c[1] ? '✅' : '❌'} ${c[0]}`).join('\n');
        toast(`🔧 Autodiagnostika (${ok}/${checks.length} v pořádku):\n\n${lines}`);
    });

    def('startOnboarding', function () {
        toast('👋 Vítejte v LexisEditoru!\n\n1) Pás Domů = formátování textu.\n2) Vložit = tabulky, obrázky, ZFO/PDF, datum.\n3) Revize = sledování změn a finální audit.\n4) LexisLink (Nápověda) = ovládání z mobilu.\n\nTip: Adresář kontaktů otevřete tlačítkem „Adresář".');
    });

    // ================= NASTAVENÍ (#34) =================

    // Obnova továrních šablon přes nativní IPC (reset-templates).
    def('resetFactoryTemplates', function () {
        if (window.electronAPI && typeof window.electronAPI.resetTemplates === 'function') {
            Promise.resolve(window.electronAPI.resetTemplates())
                .then(() => toast('✅ Šablony byly obnoveny do továrního nastavení. Znovu je načtěte otevřením panelu šablon.'))
                .catch(err => toast('❌ Obnovu šablon se nepodařilo provést: ' + (err && err.message ? err.message : err)));
        } else {
            toast('❌ Obnova šablon není v tomto prostředí dostupná.');
        }
    });

    // Přepnutí jazyka UI (vyžaduje načtený modul lexis-i18n.js).
    def('changeLanguage', function (lang) {
        const target = lang || 'cs';
        if (window.LexisI18n && typeof window.LexisI18n.setLang === 'function') {
            window.LexisI18n.setLang(target);
            toast(target === 'en' ? '🌐 Language switched to English.' : '🌐 Jazyk přepnut na češtinu.');
        } else {
            toast('ℹ️ Lokalizační modul není načten, jazyk nelze přepnout.');
        }
    });

    // --- Automatické ukládání ---
    let autoSaveTimer = null;
    function readAutoSaveCfg() {
        try { return JSON.parse(localStorage.getItem('lexis_autosave') || '{}'); }
        catch (e) { return {}; }
    }
    function writeAutoSaveCfg(cfg) {
        try { localStorage.setItem('lexis_autosave', JSON.stringify(cfg)); } catch (e) {}
    }
    function restartAutoSave() {
        if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
        const cfg = readAutoSaveCfg();
        if (!cfg.enabled) return;
        const minutes = Math.max(1, parseInt(cfg.intervalMin, 10) || 5);
        autoSaveTimer = setInterval(function () {
            const q = quill();
            if (!q) return;
            try {
                // Bezpečná průběžná záloha do localStorage (nespouští dialog uložení).
                localStorage.setItem('lexis_autosave_snapshot', JSON.stringify({
                    at: new Date().toISOString(),
                    html: (window.lexisCore && window.lexisCore.getContent) ? window.lexisCore.getContent() : q.root.innerHTML
                }));
            } catch (e) { /* ignore quota */ }
        }, minutes * 60 * 1000);
    }
    def('toggleAutoSave', function (enabled) {
        const cfg = readAutoSaveCfg();
        cfg.enabled = !!enabled;
        writeAutoSaveCfg(cfg);
        restartAutoSave();
        toast(cfg.enabled ? '💾 Automatické ukládání zapnuto.' : 'Automatické ukládání vypnuto.');
    });
    def('updateAutoSaveInterval', function (value) {
        const cfg = readAutoSaveCfg();
        cfg.intervalMin = Math.max(1, parseInt(value, 10) || 5);
        writeAutoSaveCfg(cfg);
        restartAutoSave();
        toast(`Interval automatického ukládání nastaven na ${cfg.intervalMin} min.`);
    });

    // Uložení nastavení integrací (perzistuje do localStorage; ISDS/pošta mají
    // vlastní zabezpečené uložení přes electronAPI).
    def('saveIntegrationSettings', function () {
        try {
            const cfg = {};
            document.querySelectorAll('[data-integration-setting]').forEach(el => {
                const key = el.getAttribute('data-integration-setting');
                cfg[key] = el.type === 'checkbox' ? el.checked : el.value;
            });
            localStorage.setItem('lexis_integration_settings', JSON.stringify(cfg));
            toast('✅ Nastavení integrací uloženo.');
        } catch (e) {
            toast('❌ Nastavení integrací se nepodařilo uložit: ' + e.message);
        }
    });

    // Obnovit případný autosave režim po startu.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restartAutoSave);
    } else {
        restartAutoSave();
    }
})();
