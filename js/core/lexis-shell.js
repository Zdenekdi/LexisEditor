'use strict';
/**
 * lexis-shell.js — Přepínač režimů shellu editoru (redesign, turn 1 + 2).
 * Tři nezávislé režimy rozhraní (nezávislé na světlém/tmavém):
 *   ribbon — Klasický ribbon (výchozí, dnešní chování)
 *   single — Jedna lišta (nástrojové skupiny schované)
 *   paper  — Papír (jen text, lišty schované)
 * Stav v localStorage, aplikuje se přes body[data-shell]. Přepínač 2a je čip
 * ve stavovém řádku; klávesy ⌘⌥1/2/3 (režim) a ⌘⌥D (tmavý vzhled).
 * Věrné rozpracování režimů single/paper (plovoucí formátování, tools-on-demand)
 * přijde v dalších krocích; teď je efekt základní, ale funkční.
 */
(function () {
    const MODES = [
        { id: 'ribbon', name: 'Klasický ribbon', desc: 'Vše po ruce, jako ve Wordu' },
        { id: 'single', name: 'Jedna lišta', desc: 'Formátování až při výběru textu' },
        { id: 'paper', name: 'Papír', desc: 'Jen text, nástroje na vyžádání' }
    ];
    const KEY = 'lexis_shell';
    const DEFAULT = 'ribbon';

    function getMode() {
        try { const v = localStorage.getItem(KEY); return MODES.some(m => m.id === v) ? v : DEFAULT; }
        catch (e) { return DEFAULT; }
    }
    function apply(mode) {
        document.body.setAttribute('data-shell', mode);
        updateChip(mode);
        renderActive(mode);
    }
    function setMode(mode) {
        if (!MODES.some(m => m.id === mode)) return;
        try { localStorage.setItem(KEY, mode); } catch (e) {}
        apply(mode);
    }

    function modeName(id) { const m = MODES.find(x => x.id === id); return m ? m.name : id; }

    // ---- Chip ve stavovém řádku ----
    let chipEl, labelEl, menuEl;
    function buildChip() {
        const bar = document.querySelector('.status-bar');
        if (!bar || document.getElementById('shell-chip')) return;
        const group = document.createElement('div');
        group.className = 'status-group shell-switcher-group';
        group.innerHTML =
            eIco('<button id="shell-chip" class="shell-chip" type="button" title="Režim zobrazení">' +
            '<span id="shell-chip-label">' + modeName(getMode()) + '</span>' +
            '<span class="shell-chip-caret">▴</span></button>');
        bar.appendChild(group);
        chipEl = group.querySelector('#shell-chip');
        labelEl = group.querySelector('#shell-chip-label');
        chipEl.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(); });
    }
    function updateChip(mode) { if (labelEl) labelEl.textContent = modeName(mode); }

    // ---- Popover nabídka ----
    function buildMenu() {
        if (document.getElementById('shell-menu')) { menuEl = document.getElementById('shell-menu'); return; }
        menuEl = document.createElement('div');
        menuEl.id = 'shell-menu';
        menuEl.className = 'shell-menu';
        menuEl.setAttribute('hidden', '');
        const rows = MODES.map(function (m) {
            return '<button class="shell-menu-item" data-mode="' + m.id + '">' +
                '<span class="shell-thumb shell-thumb-' + m.id + '"></span>' +
                '<span class="shell-menu-text"><span class="shell-menu-name">' + m.name + '</span>' +
                '<span class="shell-menu-desc">' + m.desc + '</span></span>' +
                '<span class="shell-menu-check">✓</span></button>';
        }).join('');
        menuEl.innerHTML =
            eIco('<div class="shell-menu-label">Režim zobrazení</div>' +
            '<div class="shell-menu-list">' + rows + '</div>' +
            '<div class="shell-menu-divider"></div>' +
            '<button class="shell-menu-dark" id="shell-menu-dark"><span>Tmavý vzhled</span>' +
            '<span class="shell-dark-toggle" id="shell-dark-toggle"></span></button>');
        document.body.appendChild(menuEl);
        menuEl.querySelectorAll('.shell-menu-item').forEach(function (btn) {
            btn.addEventListener('click', function (e) { e.stopPropagation(); setMode(btn.getAttribute('data-mode')); closeMenu(); });
        });
        menuEl.querySelector('#shell-menu-dark').addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.toggleDarkMode === 'function') window.toggleDarkMode();
            reflectDark();
        });
        menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    function renderActive(mode) {
        if (!menuEl) return;
        menuEl.querySelectorAll('.shell-menu-item').forEach(function (btn) {
            btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
        });
    }
    function reflectDark() {
        const t = document.getElementById('shell-dark-toggle');
        if (t) t.classList.toggle('on', document.body.classList.contains('dark-mode'));
    }
    function positionMenu() {
        if (!chipEl || !menuEl) return;
        const r = chipEl.getBoundingClientRect();
        menuEl.style.left = Math.max(8, Math.min(r.right - menuEl.offsetWidth, window.innerWidth - menuEl.offsetWidth - 8)) + 'px';
        menuEl.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    }
    function openMenu() {
        buildMenu(); renderActive(getMode()); reflectDark();
        menuEl.removeAttribute('hidden');
        positionMenu();
        if (chipEl) chipEl.classList.add('open');
    }
    function closeMenu() { if (menuEl) menuEl.setAttribute('hidden', ''); if (chipEl) chipEl.classList.remove('open'); }
    function toggleMenu() { if (menuEl && !menuEl.hasAttribute('hidden')) closeMenu(); else openMenu(); }

    // ---- Klávesy ----
    function onKey(e) {
        const mod = (e.metaKey || e.ctrlKey) && e.altKey;
        if (!mod) return;
        if (e.key === '1') { e.preventDefault(); setMode('ribbon'); }
        else if (e.key === '2') { e.preventDefault(); setMode('single'); }
        else if (e.key === '3') { e.preventDefault(); setMode('paper'); }
        else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); if (typeof window.toggleDarkMode === 'function') window.toggleDarkMode(); reflectDark(); }
    }

    function init() {
        buildChip();
        apply(getMode());
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', closeMenu);
        window.addEventListener('resize', function () { if (menuEl && !menuEl.hasAttribute('hidden')) positionMenu(); });
    }

    window.LexisShell = { getMode: getMode, setMode: setMode, MODES: MODES };
    window.setShellMode = setMode;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

/* ── Plovoucí formátovací lišta (režim Jedna lišta / Papír, turn 1c) ──
   Objeví se při výběru textu v editoru, když je skrytý ribbon. B/I/U přes Quill;
   § Odstavec / Citace / Přepsat s AI volají existující globální funkce. */
(function () {
    var barEl = null;
    function quill() { return (window.lexisUI && window.lexisUI.core && window.lexisUI.core.quill) || null; }
    function editorEl() { return document.querySelector('#editor .ql-editor'); }
    function mode() { return (window.LexisShell && window.LexisShell.getMode()) || 'ribbon'; }

    function build() {
        if (barEl) return barEl;
        barEl = document.createElement('div');
        barEl.id = 'lexis-float-format';
        barEl.className = 'lx-float';
        barEl.setAttribute('hidden', '');
        barEl.innerHTML =
            eIco('<button class="lxf-btn" data-fmt="bold" title="Tučně (⌘B)"><b>B</b></button>' +
            '<button class="lxf-btn" data-fmt="italic" title="Kurzíva (⌘I)"><i>I</i></button>' +
            '<button class="lxf-btn" data-fmt="underline" title="Podtržení (⌘U)"><span style="text-decoration:underline">U</span></button>' +
            '<span class="lxf-sep"></span>' +
            '<button class="lxf-btn lxf-text" data-act="section">§ Odstavec</button>' +
            '<button class="lxf-btn lxf-text" data-act="citation">Citace zákona</button>' +
            '<span class="lxf-sep"></span>' +
            '<button class="lxf-btn lxf-ai" data-act="ai">Přepsat s AI</button>');
        document.body.appendChild(barEl);
        // mousedown nesmí přebrat výběr/fokus
        barEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
        barEl.addEventListener('click', function (e) {
            var btn = e.target.closest('button'); if (!btn) return;
            e.preventDefault();
            var fmt = btn.getAttribute('data-fmt');
            var act = btn.getAttribute('data-act');
            if (fmt) {
                var q = quill(); if (!q) return;
                var range = q.getSelection(); if (!range || !range.length) return;
                var cur = q.getFormat(range);
                q.format(fmt, !cur[fmt], 'user');
                reflect();
            } else if (act === 'section') { if (typeof window.formatLegal === 'function') window.formatLegal('legal-section'); }
            else if (act === 'citation') { if (typeof window.insertCitation === 'function') window.insertCitation(); }
            else if (act === 'ai') { if (typeof window.toggleAIDrawer === 'function') window.toggleAIDrawer(); }
        });
        return barEl;
    }
    function reflect() {
        var q = quill(); if (!q || !barEl) return;
        var range = q.getSelection(); if (!range) return;
        var f = q.getFormat(range);
        ['bold', 'italic', 'underline'].forEach(function (k) {
            var b = barEl.querySelector('[data-fmt="' + k + '"]');
            if (b) b.classList.toggle('active', !!f[k]);
        });
    }
    function selectionRange() {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        var ed = editorEl(); if (!ed) return null;
        var r = sel.getRangeAt(0);
        if (!ed.contains(r.commonAncestorContainer)) return null;
        return r;
    }
    function hide() { if (barEl) barEl.setAttribute('hidden', ''); }
    function position(rect) {
        build().removeAttribute('hidden');
        var bw = barEl.offsetWidth, bh = barEl.offsetHeight;
        var left = rect.left + rect.width / 2 - bw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
        var top = rect.top - bh - 9;
        if (top < 8) top = rect.bottom + 9; // pod výběrem, když nahoře není místo
        barEl.style.left = left + 'px';
        barEl.style.top = top + 'px';
    }
    function update() {
        var m = mode();
        if (m !== 'single') { hide(); return; } // v Papíru je spodní dok
        var r = selectionRange();
        if (!r) { hide(); return; }
        var rect = r.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { hide(); return; }
        position(rect);
        reflect();
    }

    function setup() {
        document.addEventListener('selectionchange', function () { requestAnimationFrame(update); });
        document.addEventListener('scroll', function () { if (barEl && !barEl.hasAttribute('hidden')) update(); }, true);
        window.addEventListener('resize', hide);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();

/* ── Plovoucí spodní dok (režim Papír, turn 1e) — nástroje na vyžádání ── */
(function () {
    var dock = null, clausePop = null;
    var CLAUSES = [
        ['pravni_moc', 'Doložka právní moci'],
        ['arbitration', 'Rozhodčí doložka'],
        ['prorogation', 'Prorogační doložka'],
        ['interest', 'Úrok z prodlení'],
        ['gdpr', 'Doložka GDPR'],
        ['confidentiality', 'Mlčenlivost']
    ];
    function quill() { return (window.lexisUI && window.lexisUI.core && window.lexisUI.core.quill) || null; }
    function call(name, arg) { if (typeof window[name] === 'function') { try { window[name](arg); } catch (e) {} } }

    function build() {
        if (dock) return;
        dock = document.createElement('div');
        dock.id = 'lexis-paper-dock';
        dock.className = 'lx-dock';
        dock.innerHTML =
            eIco('<button class="lxd-primary" data-act="ai">Zeptat se LexisAI</button>' +
            '<span class="lxd-sep"></span>' +
            '<button class="lxd-btn" data-fmt="bold" title="Tučně"><b>B</b></button>' +
            '<button class="lxd-btn" data-fmt="italic" title="Kurzíva"><i>I</i></button>' +
            '<button class="lxd-btn lxd-text" data-act="section" title="Právní odstavec">§</button>' +
            '<button class="lxd-btn lxd-text" data-act="clause">Doložka</button>' +
            '<span class="lxd-sep"></span>' +
            '<button class="lxd-btn lxd-text" data-act="audit">Audit</button>' +
            '<button class="lxd-btn lxd-text" data-act="send">Odeslat</button>');
        document.body.appendChild(dock);
        dock.addEventListener('mousedown', function (e) { if (e.target.closest('[data-fmt]')) e.preventDefault(); });
        dock.addEventListener('click', function (e) {
            var btn = e.target.closest('button'); if (!btn) return;
            var fmt = btn.getAttribute('data-fmt'), act = btn.getAttribute('data-act');
            if (fmt) { var q = quill(); if (!q) return; var r = q.getSelection(); var cur = q.getFormat(r || undefined); q.format(fmt, !cur[fmt], 'user'); }
            else if (act === 'ai') call('toggleAIDrawer');
            else if (act === 'section') call('formatLegal', 'legal-section');
            else if (act === 'audit') call('runFinalAudit');
            else if (act === 'send') call('openDatovkaDialog');
            else if (act === 'clause') { e.stopPropagation(); toggleClausePopover(btn); }
        });
    }
    function buildClausePopover() {
        if (clausePop) return clausePop;
        clausePop = document.createElement('div');
        clausePop.id = 'lexis-clause-pop';
        clausePop.className = 'lx-clausepop';
        clausePop.setAttribute('hidden', '');
        clausePop.innerHTML = eIco('<div class="lx-clausepop-label">Vložit doložku</div>' +
            CLAUSES.map(function (c) { return '<button class="lx-clause-item" data-clause="' + c[0] + '">' + c[1] + '</button>'; }).join(''));
        document.body.appendChild(clausePop);
        clausePop.addEventListener('click', function (e) {
            var b = e.target.closest('[data-clause]'); if (!b) return;
            e.stopPropagation(); call('insertClause', b.getAttribute('data-clause')); closeClausePopover();
        });
        return clausePop;
    }
    function toggleClausePopover(anchor) {
        buildClausePopover();
        if (!clausePop.hasAttribute('hidden')) { closeClausePopover(); return; }
        clausePop.removeAttribute('hidden');
        var r = anchor.getBoundingClientRect();
        clausePop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - clausePop.offsetWidth - 8)) + 'px';
        clausePop.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    }
    function closeClausePopover() { if (clausePop) clausePop.setAttribute('hidden', ''); }

    function setup() { build(); document.addEventListener('click', closeClausePopover); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();

/* ── ⌘K příkazová paleta (turn 2c) + příkazové pole v Jedné liště ── */
(function () {
    var overlay = null, input = null, listEl = null, items = [], filtered = [], sel = 0;
    function call(name, arg) { if (typeof window[name] === 'function') { try { window[name](arg); } catch (e) {} } }
    function shell(m) { if (window.LexisShell) window.LexisShell.setMode(m); }

    function commands() {
        return [
            { g: 'Režim rozhraní', label: 'Přepnout na Klasický ribbon', hint: '⌘⌥1', run: function () { shell('ribbon'); } },
            { g: 'Režim rozhraní', label: 'Přepnout na Jednu lištu', hint: '⌘⌥2', run: function () { shell('single'); } },
            { g: 'Režim rozhraní', label: 'Přepnout na Papír', hint: '⌘⌥3', run: function () { shell('paper'); } },
            { g: 'Zobrazení', label: 'Přepnout tmavý vzhled', hint: '⌘⌥D', run: function () { call('toggleDarkMode'); } },
            { g: 'Zobrazení', label: 'Režim čtení', run: function () { call('setViewMode', 'reading'); } },
            { g: 'Akce', label: 'Zeptat se LexisAI', run: function () { call('toggleAIDrawer'); } },
            { g: 'Akce', label: 'Spustit finální audit', run: function () { call('runFinalAudit'); } },
            { g: 'Akce', label: 'Najít a nahradit', hint: '⌘F', run: function () { call('showFindReplace'); } },
            { g: 'Akce', label: 'Odeslat datovou schránkou', run: function () { call('openDatovkaDialog'); } }
        ];
    }
    function build() {
        if (overlay) return;
        items = commands();
        overlay = document.createElement('div');
        overlay.id = 'lexis-cmdk';
        overlay.className = 'lx-cmdk-overlay';
        overlay.setAttribute('hidden', '');
        overlay.innerHTML =
            eIco('<div class="lx-cmdk" role="dialog" aria-label="Příkazová paleta">' +
            '<div class="lx-cmdk-head"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.2" cy="6.2" r="4"/><path d="M9.2 9.2L12 12"/></svg>' +
            '<input class="lx-cmdk-input" type="text" placeholder="Hledat v spisu nebo zadat příkaz" autocomplete="off"></div>' +
            '<div class="lx-cmdk-list"></div></div>');
        document.body.appendChild(overlay);
        input = overlay.querySelector('.lx-cmdk-input');
        listEl = overlay.querySelector('.lx-cmdk-list');
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        input.addEventListener('input', function () { render(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); paintSel(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paintSel(); }
            else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
    }
    function render() {
        var q = (input.value || '').trim().toLowerCase();
        filtered = q ? items.filter(function (c) { return (c.label + ' ' + c.g).toLowerCase().indexOf(q) !== -1; }) : items.slice();
        sel = 0;
        var html = '', lastG = null;
        filtered.forEach(function (c, i) {
            if (c.g !== lastG) { html += '<div class="lx-cmdk-group">' + c.g + '</div>'; lastG = c.g; }
            html += '<button class="lx-cmdk-item" data-i="' + i + '"><span>' + c.label + '</span>' +
                (c.hint ? '<span class="lx-cmdk-hint">' + c.hint + '</span>' : '') + '</button>';
        });
        listEl.innerHTML = eIco(html || '<div class="lx-cmdk-empty">Nic nenalezeno</div>');
        listEl.querySelectorAll('.lx-cmdk-item').forEach(function (b) {
            b.addEventListener('mouseenter', function () { sel = +b.getAttribute('data-i'); paintSel(); });
            b.addEventListener('click', function () { exec(+b.getAttribute('data-i')); });
        });
        paintSel();
    }
    function paintSel() {
        listEl.querySelectorAll('.lx-cmdk-item').forEach(function (b) { b.classList.toggle('is-sel', +b.getAttribute('data-i') === sel); });
        var el = listEl.querySelector('.lx-cmdk-item.is-sel'); if (el) el.scrollIntoView({ block: 'nearest' });
    }
    function exec(i) { var c = filtered[i]; if (!c) return; close(); setTimeout(function () { c.run(); }, 0); }
    function open() { build(); overlay.removeAttribute('hidden'); input.value = ''; render(); setTimeout(function () { input.focus(); }, 20); }
    function close() { if (overlay) overlay.setAttribute('hidden', ''); }
    function toggle() { if (overlay && !overlay.hasAttribute('hidden')) close(); else open(); }
    window.LexisCmdK = { open: open, close: close, toggle: toggle };

    // ⌘K / Ctrl+K
    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault(); toggle();
        }
    });

    // Příkazové pole v Jedné liště (vloží se do .title-bar; zobrazí se jen v režimu single)
    function buildCmdField() {
        var bar = document.querySelector('.ribbon .title-bar');
        if (!bar || document.getElementById('lx-cmdfield')) return;
        var f = document.createElement('button');
        f.id = 'lx-cmdfield';
        f.className = 'lx-cmdfield';
        f.type = 'button';
        f.innerHTML = eIco('<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.2" cy="6.2" r="4"/><path d="M9.2 9.2L12 12"/></svg>' +
            '<span>Hledat v spisu nebo zadat příkaz</span><span class="lx-cmdfield-kbd">⌘K</span>');
        f.addEventListener('click', open);
        bar.appendChild(f);
    }
    function setup() { buildCmdField(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
    else setup();
})();
