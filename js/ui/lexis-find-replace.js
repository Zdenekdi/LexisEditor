// --- LexisFindReplace — skutečné Najít / Nahradit nad Quillem ---
// Nahrazuje původní showFindReplace(), který přes quill.setText() ZAHODIL
// veškeré formátování dokumentu (tučné, nadpisy, tabulky, barvy) a uměl jen
// „nahradit vše" přes prompt. Tady:
//   • samostatné hledání se zvýrazněním aktuálního nálezu a počtem „3 / 12",
//   • skok na další/předchozí (Enter / Shift+Enter),
//   • nahradit jeden / nahradit vše,
//   • přepínač velkých/malých písmen,
//   • BEZ ztráty formátování — nahrazení jde přes Quill API (deleteText +
//     insertText se zachováním formátu daného úseku), ne přes setText.
// Nálezy se needitují do dokumentu (žádné trvalé zvýraznění) — aktuální nález
// se ukazuje přes výběr (selection), takže se nešpiní obsah ani undo historie.

'use strict';

(function () {
    let quill = null;
    let panel = null;
    let matches = [];      // [{ index, length }]
    let current = -1;      // index do matches
    let caseSensitive = false;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    // Najde všechny výskyty needle v plain textu dokumentu. Indexy z getText()
    // odpovídají indexům Quillu (setSelection/deleteText je berou 1:1).
    function computeMatches(needle) {
        matches = [];
        current = -1;
        if (!quill || !needle) return;
        const hay0 = quill.getText();
        const hay = caseSensitive ? hay0 : hay0.toLowerCase();
        const nee = caseSensitive ? needle : needle.toLowerCase();
        if (!nee.length) return;
        let from = 0;
        while (true) {
            const i = hay.indexOf(nee, from);
            if (i === -1) break;
            matches.push({ index: i, length: nee.length });
            from = i + nee.length; // bez překryvu
        }
    }

    function updateCount() {
        const el = panel && panel.querySelector('#lfr-count');
        if (!el) return;
        if (!matches.length) {
            const needle = panel.querySelector('#lfr-find').value;
            el.textContent = needle ? 'Nenalezeno' : '';
            el.style.color = needle ? '#b04331' : '#a09a92';
        } else {
            el.textContent = `${current + 1} / ${matches.length}`;
            el.style.color = '#5c574f';
        }
    }

    // Zvýrazní aktuální nález přes výběr a odscrolluje k němu (needestruktivní).
    function focusCurrent() {
        if (current < 0 || current >= matches.length) return;
        const m = matches[current];
        quill.setSelection(m.index, m.length, 'user');
        try {
            const b = quill.getBounds(m.index, m.length);
            const root = quill.root;
            if (b && root) {
                const pad = 60;
                if (b.top < pad) root.scrollTop += b.top - pad;
                else if (b.bottom > root.clientHeight - pad) root.scrollTop += b.bottom - root.clientHeight + pad;
            }
        } catch (e) { /* getBounds může selhat u okrajových indexů — nevadí */ }
    }

    function runSearch(keepIndex) {
        const needle = panel.querySelector('#lfr-find').value;
        const prev = (keepIndex && current >= 0 && matches[current]) ? matches[current].index : null;
        computeMatches(needle);
        if (matches.length) {
            // po nahrazení zůstaň co nejblíž předchozí pozici
            current = 0;
            if (prev != null) {
                const at = matches.findIndex(m => m.index >= prev);
                current = at === -1 ? 0 : at;
            }
            focusCurrent();
        }
        updateCount();
    }

    function go(delta) {
        if (!matches.length) return;
        current = (current + delta + matches.length) % matches.length;
        focusCurrent();
        updateCount();
    }

    // Nahradí JEDEN (aktuální) nález se zachováním formátování úseku.
    function replaceOne() {
        if (current < 0 || current >= matches.length) { runSearch(); return; }
        const rep = panel.querySelector('#lfr-replace').value;
        const m = matches[current];
        const fmt = quill.getFormat(m.index, m.length); // formáty společné celému úseku
        quill.deleteText(m.index, m.length, 'user');
        if (rep) quill.insertText(m.index, rep, fmt, 'user');
        // přepočítej nálezy a zůstaň na místě
        runSearch(true);
    }

    // Nahradí VŠECHNY nálezy. Jde odzadu, aby se neposouvaly indexy; každý úsek
    // si nese vlastní formát.
    function replaceAll() {
        const needle = panel.querySelector('#lfr-find').value;
        const rep = panel.querySelector('#lfr-replace').value;
        computeMatches(needle);
        if (!matches.length) { updateCount(); return; }
        const n = matches.length;
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            const fmt = quill.getFormat(m.index, m.length);
            quill.deleteText(m.index, m.length, 'user');
            if (rep) quill.insertText(m.index, rep, fmt, 'user');
        }
        computeMatches(rep && needle ? rep : ''); // po nahrazení už hledaný řetězec typicky není
        current = -1;
        const el = panel.querySelector('#lfr-count');
        if (el) { el.textContent = `Nahrazeno: ${n}×`; el.style.color = '#5a8a4a'; }
    }

    function build() {
        panel = document.createElement('div');
        panel.id = 'lfr-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Najít a nahradit');
        // Barvy z tématu (CSS proměnné) → panel se sám přizpůsobí světlému
        // i tmavému režimu editoru (body.dark-mode). Panel visí na <body>,
        // takže var() dědí správnou variantu.
        panel.style.cssText = [
            'position:fixed', 'top:74px', 'right:24px', 'z-index:100000',
            'background:var(--surface,#ffffff)', 'border:1px solid var(--border,#e0dbd3)', 'border-radius:10px',
            'box-shadow:0 12px 30px rgba(0,0,0,0.28)', 'padding:10px',
            'font-family:Inter,system-ui,sans-serif', 'width:320px'
        ].join(';');

        const inputStyle = 'flex:1;padding:7px 9px;border:1px solid var(--border-strong,#ddd6cb);border-radius:7px;font-size:13px;outline:none;box-sizing:border-box;background:var(--surface,#fff);color:var(--ink,#2b2926);';
        const btn = 'border:1px solid var(--border-strong,#ddd6cb);background:var(--surface,#fff);border-radius:7px;cursor:pointer;font-size:13px;padding:6px 9px;line-height:1;color:var(--ink,#4a453f);';
        const btnPrimary = 'border:1px solid var(--accent,#9a5b22);background:var(--accent,#9a5b22);color:#fff;border-radius:7px;cursor:pointer;font-size:12.5px;padding:7px 10px;font-weight:600;';

        panel.innerHTML = eIco(`
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <strong style="font-size:12.5px;color:var(--ink,#2b2926);">Najít a nahradit</strong>
                <button id="lfr-close" title="Zavřít (Esc)" style="${btn}border:none;font-size:16px;color:var(--text-faint,#a09a92);padding:2px 6px;">×</button>
            </div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                <input id="lfr-find" type="text" placeholder="Hledat…" style="${inputStyle}" autocomplete="off">
                <button id="lfr-case" title="Rozlišovat velká/malá písmena" style="${btn}font-weight:700;min-width:34px;">Aa</button>
            </div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                <input id="lfr-replace" type="text" placeholder="Nahradit za…" style="${inputStyle}" autocomplete="off">
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span id="lfr-count" style="font-size:12px;color:var(--text-faint,#a09a92);min-width:64px;"></span>
                <button id="lfr-prev" title="Předchozí (Shift+Enter)" style="${btn}">↑</button>
                <button id="lfr-next" title="Další (Enter)" style="${btn}">↓</button>
                <span style="flex:1;"></span>
                <button id="lfr-one" title="Nahradit tento výskyt" style="${btn}">Nahradit</button>
                <button id="lfr-all" title="Nahradit všechny výskyty" style="${btnPrimary}">Vše</button>
            </div>
        `);
        document.body.appendChild(panel);

        const $ = sel => panel.querySelector(sel);
        $('#lfr-close').onclick = close;
        $('#lfr-prev').onclick = () => go(-1);
        $('#lfr-next').onclick = () => go(1);
        $('#lfr-one').onclick = replaceOne;
        $('#lfr-all').onclick = replaceAll;
        $('#lfr-case').onclick = () => {
            caseSensitive = !caseSensitive;
            $('#lfr-case').style.background = caseSensitive ? 'var(--accent-tint-bg,#efe3cf)' : 'var(--surface,#fff)';
            $('#lfr-case').style.borderColor = caseSensitive ? 'var(--accent,#9a5b22)' : 'var(--border-strong,#ddd6cb)';
            $('#lfr-case').style.color = caseSensitive ? 'var(--accent-text,#8a5320)' : 'var(--ink,#4a453f)';
            runSearch();
        };

        let t = null;
        $('#lfr-find').addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => runSearch(), 120);
        });
        $('#lfr-find').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        $('#lfr-replace').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
    }

    function open(q, mode) {
        quill = q || (window.lexisUI && window.lexisUI.core && window.lexisUI.core.quill);
        if (!quill) return;
        if (!panel) build();
        panel.style.display = 'block';
        const find = panel.querySelector('#lfr-find');
        // předvyplň hledání aktuálním výběrem, pokud nějaký je
        try {
            const sel = quill.getSelection();
            if (sel && sel.length > 0) find.value = quill.getText(sel.index, sel.length).trim();
        } catch (e) { /* ignore */ }
        find.focus();
        find.select();
        if (find.value) runSearch(); else updateCount();
    }

    function close() {
        if (panel) panel.style.display = 'none';
        matches = [];
        current = -1;
    }

    // Zjistí, zda je aplikace zamčená (zámek #lock-screen překrývá dokument).
    function isAppLocked() {
        const ls = document.getElementById('lock-screen');
        return !!(ls && ls.style.display && ls.style.display !== 'none');
    }

    // Ctrl/Cmd+F otevře panel a potlačí nativní hledání prohlížeče.
    // BEZPEČNOST: při zamčené aplikaci se panel NESMÍ otevřít — jinak by přes
    // Najít/Nahradit šlo číst i přepisovat dokument bez odemčení (obejití zámku).
    document.addEventListener('keydown', (e) => {
        const key = (e.key || '').toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'f') {
            if (isAppLocked()) { e.preventDefault(); return; }
            const inEditor = document.getElementById('app-container');
            if (inEditor && inEditor.style.display !== 'none') {
                e.preventDefault();
                open();
            }
        }
    }, true);

    window.LexisFindReplace = { open, close };
})();
