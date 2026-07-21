/**
 * LexisEditor — Icon System
 * Runtime náhrada emoji ikon konzistentní inline-SVG sadou (Lucide styl).
 * Nemapované emoji zůstávají beze změny (žádné rozbité ikony).
 * Cílí na .icon-sq (ribbon) a .card-icon (úvodní dlaždice).
 */
(function () {
    const V = (inner) =>
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
        inner + '</svg>';

    // Klíč = základní emoji (bez variačního selektoru). Hodnota = vnitřek SVG.
    const P = {
        '📄': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
        '📜': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>',
        '📂': '<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/>',
        '📁': '<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/>',
        '📖': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
        '📚': '<path d="M4 19.5V5a2 2 0 0 1 2-2h1v18H6a2 2 0 0 1-2-1.5z"/><path d="M8 3h3v18H8z"/><path d="m13 4 4 .8-3 15.6-4-.8z"/>',
        '📒': '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-1.5z"/><path d="M8 3v18"/>',
        '📋': '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/>',
        '📑': '<rect width="13" height="16" x="8" y="5" rx="2"/><path d="M4 17V5a2 2 0 0 1 2-2h9"/>',
        '🗂': '<rect width="13" height="16" x="8" y="5" rx="2"/><path d="M4 17V5a2 2 0 0 1 2-2h9"/>',
        '🔍': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        '🔎': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        '🕵': '<circle cx="10" cy="7" r="4"/><path d="M2 21a8 8 0 0 1 12.5-6.6"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.5-1.5"/>',
        '🎙': '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
        '🖍': '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
        '🖊': '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
        '🖋': '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
        '✒': '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
        '✍': '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
        '📝': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        '✨': '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
        '🧠': '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
        '🌐': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
        '🛡': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        '⚖': '<path d="M12 3v18"/><path d="M7 21h10"/><path d="M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0z"/><path d="M19 7l-3 6a3 3 0 0 0 6 0z"/>',
        '⚡': '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
        '💡': '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
        '🔗': '<path d="M9 12a5 5 0 0 1 5-5h3a5 5 0 0 1 0 10h-1"/><path d="M15 12a5 5 0 0 1-5 5H7a5 5 0 0 1 0-10h1"/>',
        '📦': '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
        '📊': '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/>',
        '💹': '<path d="M3 3v18h18"/><path d="m7 15 3-4 3 2 4-6"/>',
        '💾': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
        '🏛': '<path d="M3 22h18"/><path d="M6 18V11"/><path d="M10 18V11"/><path d="M14 18V11"/><path d="M18 18V11"/><path d="M12 2 3 8h18z"/>',
        '🏢': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M9 11h1M9 15h1M14 7h1M14 11h1M14 15h1"/>',
        '🏭': '<path d="M2 20V10l6 4V10l6 4V5l6 3v12z"/><path d="M2 20h20"/>',
        '🏠': '<path d="m3 10 9-7 9 7"/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M9 21v-6h6v6"/>',
        '🌙': '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
        '☁': '<path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6 18z"/>',
        '🖨': '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        '📧': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
        '✉': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
        '📨': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
        '📮': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
        '📤': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v13"/><path d="m7 8 5-5 5 5"/>',
        '📱': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
        '📸': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        '📆': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
        '📅': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
        '💬': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        '🗨': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        '🔒': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        '🔐': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        '🔑': '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8-8"/><path d="m16 6 2 2"/><path d="m19 3 2 2"/>',
        '📏': '<path d="M3 15 15 3l6 6L9 21z"/><path d="m7 11 2 2M11 7l2 2M15 3l2 2"/>',
        '🔄': '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
        '↩': '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
        '➡': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
        '⬅': '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
        '⬆': '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
        '🔽': '<path d="m6 9 6 6 6-6"/>',
        '🔼': '<path d="m6 15 6-6 6 6"/>',
        '↔': '<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>',
        '✅': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
        '❌': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        'ℹ': '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        '⏱': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>',
        '⏰': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M5 3 3 5M21 5l-2-2"/>',
        '🕰': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        '⏳': '<path d="M6 2h12M6 22h12"/><path d="M6 2c0 4 3 5 6 10 3-5 6-6 6-10M6 22c0-4 3-5 6-10 3 5 6 6 6 10"/>',
        '🎨': '<circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 2a10 10 0 0 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.6-.2-1.1-.6-1.5-.4-.4-.6-.9-.6-1.5A2.5 2.5 0 0 1 15.3 14H17a5 5 0 0 0 5-5c0-4-4.5-7-10-7z"/>',
        '🌈': '<path d="M22 17a10 10 0 0 0-20 0"/><path d="M18 17a6 6 0 0 0-12 0"/><path d="M14 17a2 2 0 0 0-4 0"/>',
        '🎓': '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/>',
        '📌': '<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l2 3.2H7z"/>',
        '🔖': '<path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
        '🏷': '<path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L3.6 11.6A2 2 0 0 1 3 10.2V4a1 1 0 0 1 1-1h6.2a2 2 0 0 1 1.4.6z"/><circle cx="8" cy="8" r="1.2"/>',
        '🖼': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
        '❡': '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M17 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
        '🔤': '<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>',
        '🔠': '<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>',
        '🔡': '<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>',
        '🔢': '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
        '🔟': '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
        '¹': '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
        '🏁': '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
        '🧹': '<path d="m7 21-4-4a2 2 0 0 1 0-3L14 3a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 21z"/><path d="m9 12 4 4"/>',
        '🧽': '<path d="m7 21-4-4a2 2 0 0 1 0-3L14 3a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 21z"/><path d="m9 12 4 4"/>',
        '🧼': '<path d="m7 21-4-4a2 2 0 0 1 0-3L14 3a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 21z"/><path d="m9 12 4 4"/>',
        '🧍': '<circle cx="12" cy="6" r="3"/><path d="M12 9v8"/><path d="m9 21 3-4 3 4"/>',
        '▯': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
        '💰': '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11"/><path d="M14.7 9.3a2.4 2 0 0 0-2.7-1.3h-.6a2 2 0 0 0 0 4h1.2a2 2 0 0 1 0 4H12a2.4 2 0 0 1-2.7-1.3"/>',
        '🤐': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        '🏗': '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.7-.7-.7-2.7z"/>',
        '➕': '<path d="M12 5v14"/><path d="M5 12h14"/>',
        '✕': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        '📎': '<path d="M21 8.5 12 17.5a3.5 3.5 0 0 1-5-5l9-9a2.5 2.5 0 0 1 3.5 3.5l-8.5 8.5a1.5 1.5 0 0 1-2-2l7.5-7.5"/>'
    };

    function baseKey(text) {
        const t = (text || '').trim();
        if (!t) return '';
        // vezmi první „grafém" a odstraň variační selektor
        const first = Array.from(t)[0] || '';
        return first.replace(/️/g, '');
    }

    // Nahradí VEDOUCÍ emoji v textu prvku inline SVG ikonou (zachová zbytek obsahu).
    // Pro panely: .clause-item, .panel-title apod.
    function iconifyLeading(selectors) {
        document.querySelectorAll(selectors).forEach((el) => {
            if (el.dataset.leadIconified) return;
            const node = el.firstChild;
            if (!node || node.nodeType !== 3) return; // musí začínat textovým uzlem
            const arr = Array.from(node.nodeValue);
            let i = 0;
            while (i < arr.length && /\s/.test(arr[i])) i++;
            const first = arr[i] || '';
            const key = first.replace(/️/g, '');
            if (!key || !P[key]) return;
            // přeskoč emoji + navazující variační/ZWJ znaky + jednu mezeru
            let j = i + 1;
            while (j < arr.length && /[️‍♀♂]/.test(arr[j])) j++;
            if (arr[j] === ' ') j++;
            node.nodeValue = arr.slice(0, i).join('') + arr.slice(j).join('');
            const span = document.createElement('span');
            span.className = 'lx-inline-icon';
            span.innerHTML = V(P[key]);
            el.insertBefore(span, el.firstChild);
            el.dataset.leadIconified = '1';
        });
    }

    function apply(root) {
        const scope = root || document;
        scope.querySelectorAll('.icon-sq, .card-icon').forEach((el) => {
            if (el.dataset.iconified) return;
            // Nediraj do prvků, které obsahují HTML (např. <b>B</b>) nebo čistý text/čísla.
            if (el.children.length) return;
            const key = baseKey(el.textContent);
            if (key && P[key]) {
                el.innerHTML = V(P[key]);
                el.dataset.iconified = '1';
                el.classList.add('has-svg-icon');
            }
        });
        // Panely: vedoucí emoji v doložkách a titulcích sekcí.
        iconifyLeading('.clause-item, .panel-title');
    }

    window.LexisIcons = { apply, iconifyLeading, MAP: P };

    if (document.readyState !== 'loading') {
        apply();
    } else {
        document.addEventListener('DOMContentLoaded', () => apply());
    }
    // Druhý průchod pro případný obsah vykreslený těsně po startu.
    setTimeout(() => apply(), 500);
})();

/* --- Pravý icon rail: aktivní stav + viditelnost (napojení na existující panely) --- */
(function () {
    // rail tlačítko -> panel a podmínka „otevřeno"
    const RAIL = [
        { btn: 'rail-knihovna',  panel: 'sidebar',         open: (el) => !el.classList.contains('collapsed') },
        { btn: 'rail-ai',        panel: 'ai-drawer',       open: (el) => el.classList.contains('open') },
        { btn: 'rail-reference', panel: 'right-sidebar',   open: (el) => !el.classList.contains('collapsed') },
        { btn: 'rail-revize',    panel: 'comment-sidebar', open: (el) => el.classList.contains('open') }
    ];

    function sync() {
        RAIL.forEach((m) => {
            const btn = document.getElementById(m.btn);
            const panel = document.getElementById(m.panel);
            if (!btn || !panel) return;
            btn.classList.toggle('active', !!m.open(panel));
        });
    }

    function updateRailVisibility() {
        const rail = document.getElementById('lexis-rail');
        const app = document.getElementById('app-container');
        if (!rail) return;
        const appVisible = app && getComputedStyle(app).display !== 'none';
        rail.style.display = appVisible ? 'flex' : 'none';
    }

    function attach() {
        const observed = new Set();
        RAIL.forEach((m) => {
            const panel = document.getElementById(m.panel);
            if (panel && !observed.has(m.panel)) {
                observed.add(m.panel);
                new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
            }
        });
        const app = document.getElementById('app-container');
        if (app) new MutationObserver(updateRailVisibility).observe(app, { attributes: true, attributeFilter: ['style', 'class'] });
        sync();
        updateRailVisibility();
    }

    function boot() {
        attach();
        // panely/app-container mohou vzniknout až po initApp → pár opakování
        let n = 0;
        const iv = setInterval(() => { attach(); if (++n >= 6) clearInterval(iv); }, 500);
    }

    if (document.readyState !== 'loading') boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();

/* --- Klávesnicová přístupnost interaktivních div/span prvků (ribbon, taby, doložky) --- */
(function () {
    const SEL = '.btn-icon, .tab, .qa-btn, .clause-item, .context-menu-item';

    function enhance(root) {
        (root || document).querySelectorAll(SEL).forEach((el) => {
            if (el.dataset.a11y) return;
            const tag = el.tagName;
            if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA') { el.dataset.a11y = '1'; return; }
            if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
            el.dataset.a11y = '1';
        });
    }

    // Delegovaná obsluha kláves — Enter / mezerník spustí klik.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        const el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        const tag = el.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        el.click();
    });

    function boot() {
        enhance();
        let n = 0;
        const iv = setInterval(() => { enhance(); if (++n >= 6) clearInterval(iv); }, 500);
    }
    if (document.readyState !== 'loading') boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();
