/* global window, document, localStorage */
/**
 * LexisVersions — historie verzí dokumentu (lokální snapshoty).
 *
 * Aditivní modul. Ukládá průběžné HTML snapshoty dokumentu do localStorage
 * (klíč `lexis_versions`), vypisuje je do #history-list, umí verzi obnovit
 * i smazat. Před obnovením uloží aktuální stav jako verzi → obnovení je vratné.
 *
 * Nahrazuje dřívější „čestné" stuby window.showHistory / window.compareVersions
 * (viz lexis-actions.js), proto se načítá AŽ ZA nimi a přiřazuje přímo.
 *
 * Data neopouštějí počítač — vše je jen v localStorage tohoto zařízení.
 */
(function () {
    'use strict';

    var KEY = 'lexis_versions';
    var MAX = 40;                 // strop počtu verzí (nejstarší se zahazují)
    var AUTO_MIN = 5;             // interval automatického snapshotu (min)
    var counter = 0;

    // ── Napojení na jádro editoru ──────────────────────────────────────────
    function core() { return window.lexisCore || null; }
    function getHTML() {
        var c = core();
        if (c && typeof c.getContent === 'function') return c.getContent();
        var q = (c && c.quill) || window.quill;
        return (q && q.root) ? q.root.innerHTML : '';
    }
    function setHTML(html) {
        var c = core();
        if (c && typeof c.setContent === 'function') { c.setContent(html); return true; }
        var q = (c && c.quill) || window.quill;
        if (q && q.root) { q.root.innerHTML = eIco(html || '<p><br></p>'); return true; }
        return false;
    }
    function toast(m) {
        if (window.lexisUI && typeof window.lexisUI.customAlert === 'function') window.lexisUI.customAlert(m);
        else console.log('[LexisVersions]', m);
    }
    function editorOpen() {
        var app = document.getElementById('app-container');
        return app && app.style.display !== 'none';
    }

    // ── Úložiště ───────────────────────────────────────────────────────────
    function load() {
        try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function persist(list) {
        // Ořízni na MAX a zkoušej uložit; při překročení kvóty ubírej nejstarší.
        var arr = list.slice(-MAX);
        while (arr.length) {
            try { localStorage.setItem(KEY, JSON.stringify(arr)); return; }
            catch (e) { arr.shift(); } // quota → zahoď nejstarší a zkus znovu
        }
        try { localStorage.setItem(KEY, '[]'); } catch (e) { /* vzdej to */ }
    }

    // ── Pomůcky ──────────────────────────────────────────────────────────────
    function newId() { counter++; return 'v' + Date.now() + '_' + counter; }
    function docTitle() {
        var el = document.getElementById('window-doc-title');
        var t = el ? (el.textContent || '').trim() : '';
        return t || 'Dokument';
    }
    function plainLen(html) {
        var d = document.createElement('div');
        d.innerHTML = eIco(html || '');
        return (d.textContent || '').replace(/\s+/g, ' ').trim().length;
    }
    function two(n) { return n < 10 ? '0' + n : '' + n; }
    function absTime(d) {
        return two(d.getHours()) + ':' + two(d.getMinutes());
    }
    function relTime(iso) {
        var then = new Date(iso).getTime();
        if (isNaN(then)) return '';
        var diff = Math.floor((Date.now() - then) / 1000);
        if (diff < 45) return 'právě teď';
        if (diff < 90) return 'před minutou';
        var m = Math.floor(diff / 60);
        if (m < 60) return 'před ' + m + ' min';
        var h = Math.floor(m / 60);
        if (h < 24) return 'před ' + h + ' h';
        var days = Math.floor(h / 24);
        if (days === 1) return 'včera';
        if (days < 7) return 'před ' + days + ' dny';
        var d = new Date(iso);
        return two(d.getDate()) + '.' + two(d.getMonth() + 1) + '.';
    }
    function autoLabel() {
        var d = new Date();
        return absTime(d) + ' · ' + two(d.getDate()) + '.' + two(d.getMonth() + 1) + '.';
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // ── Jádro: ukládání / obnova / mazání ────────────────────────────────────
    function saveVersion(label, opts) {
        opts = opts || {};
        var html = getHTML();
        if (!html || plainLen(html) === 0) {
            if (!opts.silent) toast('Není co uložit — dokument je prázdný.');
            return null;
        }
        var list = load();
        if (list.length && list[list.length - 1].html === html && !opts.force) {
            if (!opts.silent) toast('Beze změny od poslední verze.');
            return null;
        }
        var snap = {
            id: newId(),
            at: new Date().toISOString(),
            label: (label || '').trim() || autoLabel(),
            title: docTitle(),
            chars: plainLen(html),
            html: html
        };
        list.push(snap);
        persist(list);
        renderVersionHistory();
        if (!opts.silent) toast('💾 Verze uložena (' + snap.chars + ' znaků).');
        return snap;
    }

    function restoreVersion(id) {
        var list = load();
        var snap = null;
        for (var i = 0; i < list.length; i++) { if (list[i].id === id) { snap = list[i]; break; } }
        if (!snap) { toast('Verze nenalezena.'); return; }
        // Aktuální stav ulož jako verzi → obnovení je vratné.
        saveVersion('Před obnovením ' + absTime(new Date()), { silent: true, force: true });
        if (setHTML(snap.html)) {
            toast('↩︎ Obnovena verze z ' + relTime(snap.at) + '. (Předchozí stav je uložen jako verze.)');
            renderVersionHistory();
        } else {
            toast('Obnovení se nezdařilo — editor není připraven.');
        }
    }

    function deleteVersion(id) {
        var list = load().filter(function (v) { return v.id !== id; });
        persist(list);
        renderVersionHistory();
    }

    function clearVersions() {
        persist([]);
        renderVersionHistory();
        toast('Historie verzí vymazána.');
    }

    // ── Vykreslení do #history-list (tématické barvy → funguje i v dark) ──────
    function renderVersionHistory() {
        var host = document.getElementById('history-list');
        if (!host) return;
        var list = load().slice().reverse(); // nejnovější nahoře
        if (!list.length) {
            host.innerHTML =
                eIco('<div style="font-size:11px;color:var(--text-faint);line-height:1.5;padding:6px 2px;">' +
                'Zatím žádné verze. Uložením verze vytvoříte bod, ke kterému se lze vrátit.</div>');
            return;
        }
        var rows = list.map(function (v) {
            var meta = esc(relTime(v.at)) + ' · ' + esc(String(v.chars)) + ' zn.';
            return '' +
                '<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid var(--border);' +
                'border-radius:8px;margin-bottom:6px;background:var(--surface-2);">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(v.label) + '</div>' +
                '<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">' + meta + '</div>' +
                '</div>' +
                '<button title="Obnovit tuto verzi" onclick="restoreVersion(\'' + v.id + '\')" ' +
                'style="flex:none;border:1px solid var(--accent);background:transparent;color:var(--accent-text);' +
                'border-radius:7px;font:600 11px var(--font-ui,sans-serif);padding:5px 9px;cursor:pointer;">Obnovit</button>' +
                '<button title="Smazat verzi" onclick="deleteVersion(\'' + v.id + '\')" ' +
                'style="flex:none;border:none;background:transparent;color:var(--text-faint);font-size:15px;' +
                'line-height:1;padding:2px 4px;cursor:pointer;">×</button>' +
                '</div>';
        }).join('');
        host.innerHTML = eIco(rows);
    }

    // ── Náhradní implementace dřívějších stubů ───────────────────────────────
    window.saveVersion = saveVersion;
    window.restoreVersion = restoreVersion;
    window.deleteVersion = deleteVersion;
    window.clearVersions = clearVersions;
    window.renderVersionHistory = renderVersionHistory;

    // showHistory: teď reálně vykreslí a nasměruje uživatele k panelu.
    window.showHistory = function () {
        renderVersionHistory();
        var host = document.getElementById('history-list');
        if (host && host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        var n = load().length;
        toast(n ? ('🕒 Historie verzí: ' + n + ' ' + (n === 1 ? 'verze' : (n < 5 ? 'verze' : 'verzí')) + ' v pravém panelu.')
                : 'Zatím žádné uložené verze. Uložte verzi tlačítkem „Uložit verzi".');
    };

    // compareVersions: jednoduché porovnání dvou posledních verzí (rozdíl délky).
    window.compareVersions = function () {
        var list = load();
        if (list.length < 2) { toast('Pro porovnání jsou potřeba alespoň 2 uložené verze.'); return; }
        var a = list[list.length - 2], b = list[list.length - 1];
        var d = b.chars - a.chars;
        var sign = d > 0 ? ('+' + d) : ('' + d);
        toast('Poslední dvě verze: ' + relTime(a.at) + ' (' + a.chars + ' zn.) → ' +
              relTime(b.at) + ' (' + b.chars + ' zn.). Rozdíl ' + sign + ' znaků.');
    };

    // ── Automatický snapshot (jen když je editor otevřený a obsah se změnil) ──
    setInterval(function () {
        if (editorOpen()) saveVersion('', { silent: true });
    }, AUTO_MIN * 60 * 1000);

    // ── Vykresli po startu ───────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderVersionHistory);
    } else {
        renderVersionHistory();
    }
})();
