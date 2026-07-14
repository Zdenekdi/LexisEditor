/* global window, document */
/**
 * LexisParties — vložení identifikace strany do dokumentu na jedno kliknutí.
 * Zdroj: databáze soudů (COURT_REGISTRY) nebo adresář kontaktů (LexisContacts).
 * Vloží do textu adresáta / smluvní stranu i s adresou, IČO a datovou schránkou,
 * ať se identifikace nemusí pořád přepisovat a kopírovat.
 */
(function () {
    'use strict';

    function ui() { return window.lexisUI || null; }
    function toast(m) { const u = ui(); if (u && u.customAlert) u.customAlert(m); else console.log('[LexisParties]', m); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

    const ROLES = ['— bez popisku —', 'Adresát', 'Žalobce', 'Žalovaný', 'Navrhovatel', 'Odpůrce',
        'Prodávající', 'Kupující', 'Zmocnitel', 'Zmocněnec', 'Věřitel', 'Dlužník', 'Účastník'];

    // Vloží HTML do editoru na pozici kurzoru (jeden zdroj pravdy pro vkládání stran).
    function insertHtml(html) {
        const core = window.lexisCore;
        const quill = core && core.quill;
        if (!quill) { toast('Editor není připraven.'); return false; }
        const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
        if (core.safePasteHTML) core.safePasteHTML(range.index, html);
        else quill.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
        quill.setSelection(range.index + 1, 0);
        return true;
    }

    // Načte kontakt z adresáře a vloží ho (používá i tlačítko „Vložit" v Adresáři).
    async function insertContactById(id, role) {
        try {
            if (!window.LexisContacts || !window.lexisCore || !window.lexisCore.storage) return false;
            const all = await new window.LexisContacts(window.lexisCore.storage).getAll();
            const k = (all || []).find(c => String(c.id) === String(id));
            if (!k) return false;
            return insertHtml(formatContact(k, role));
        } catch (e) { return false; }
    }

    function rolePrefix(role) {
        return (role && role !== ROLES[0]) ? `<strong>${esc(role)}:</strong> ` : '';
    }

    // Formátování soudu (bez ISDS z registru — to je zatím neověřené).
    function formatCourt(c, role) {
        const addr = [c.adresa, [c.psc, c.mesto].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        return `<p>${rolePrefix(role)}<strong>${esc(c.nazev)}</strong>${addr ? '<br>' + esc(addr) : ''}</p>`;
    }

    // Formátování kontaktu (osoba i firma), včetně IČO a datové schránky.
    function formatContact(k, role) {
        const isCompany = (String(k.typ || '').toLowerCase().includes('pravnic')) || (!!k.ic && !k.typ);
        const parts = [];
        if (k.ic) parts.push('IČO: ' + esc(k.ic));
        const addr = [k.adresa, [k.psc, k.mesto].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        if (addr) parts.push((isCompany ? 'se sídlem ' : 'bytem ') + esc(addr));
        if (k.isds) parts.push('datová schránka: ' + esc(k.isds));
        const tail = parts.length ? ', ' + parts.join(', ') : '';
        return `<p>${rolePrefix(role)}<strong>${esc(k.jmeno || 'Neznámý')}</strong>${tail}</p>`;
    }

    function overlay(inner, w) {
        const ov = document.createElement('div');
        ov.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        const card = document.createElement('div');
        card.style = `background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:${w || 560}px; max-height:88vh; overflow:auto; padding:22px;`;
        card.innerHTML = inner;
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
        return { ov, card };
    }

    window.insertParty = async function () {
        const courts = Array.isArray(window.COURT_REGISTRY) ? window.COURT_REGISTRY : [];
        let contacts = [];
        try {
            if (window.LexisContacts && window.lexisCore && window.lexisCore.storage) {
                contacts = await new window.LexisContacts(window.lexisCore.storage).getAll() || [];
            }
        } catch (e) {}

        const { ov, card } = overlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h2 style="margin:0; font-size:16px; color:#0f172a;">👤 Vložit stranu do dokumentu</h2>
                <button id="pt-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:10px; align-items:center;">
                <div style="display:flex; background:#f1f5f9; border-radius:8px; padding:3px;">
                    <button id="pt-tab-contacts" class="pt-tab" style="border:none; background:#fff; border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer; font-weight:700;">📇 Kontakty</button>
                    <button id="pt-tab-courts" class="pt-tab" style="border:none; background:transparent; border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer;">⚖️ Soudy</button>
                </div>
                <select id="pt-role" style="margin-left:auto; padding:6px; border:1px solid #cbd5e1; border-radius:8px; font-size:12px;">
                    ${ROLES.map(r => `<option>${esc(r)}</option>`).join('')}
                </select>
            </div>
            <input id="pt-search" placeholder="Hledat…" style="width:100%; box-sizing:border-box; padding:9px; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            <div id="pt-list" style="max-height:52vh; overflow:auto;"></div>`, 560);

        let source = 'contacts';
        const listEl = card.querySelector('#pt-list');
        const searchEl = card.querySelector('#pt-search');
        const roleEl = card.querySelector('#pt-role');

        function setTab(s) {
            source = s;
            card.querySelector('#pt-tab-contacts').style.background = s === 'contacts' ? '#fff' : 'transparent';
            card.querySelector('#pt-tab-contacts').style.fontWeight = s === 'contacts' ? '700' : '400';
            card.querySelector('#pt-tab-courts').style.background = s === 'courts' ? '#fff' : 'transparent';
            card.querySelector('#pt-tab-courts').style.fontWeight = s === 'courts' ? '700' : '400';
            renderList();
        }

        function renderList() {
            const f = norm(searchEl.value);
            let rows = '';
            if (source === 'courts') {
                if (courts.length === 0) { listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:14px; text-align:center;">Registr soudů není načten.</div>'; return; }
                const matched = courts.filter(c => !f || norm(c.nazev).includes(f) || norm(c.mesto).includes(f) || norm(c.zkratka).includes(f)).slice(0, 300);
                rows = matched.map(c => `
                    <div class="pt-item" data-t="court" data-i="${courts.indexOf(c)}" style="padding:8px 6px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:12px;">
                        <div style="font-weight:700; color:#0f172a;">${esc(c.nazev)}</div>
                        <div style="color:#64748b;">${esc([c.adresa, c.mesto].filter(Boolean).join(', '))}</div>
                    </div>`).join('');
            } else {
                if (contacts.length === 0) { listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:14px; text-align:center;">V adresáři nejsou žádné kontakty.</div>'; return; }
                const matched = contacts.filter(k => !f || norm(k.jmeno).includes(f) || norm(k.ic).includes(f) || norm(k.mesto).includes(f)).slice(0, 300);
                rows = matched.map(k => `
                    <div class="pt-item" data-t="contact" data-id="${esc(k.id)}" style="padding:8px 6px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:12px;">
                        <div style="font-weight:700; color:#0f172a;">${esc(k.jmeno || 'Neznámý')}</div>
                        <div style="color:#64748b;">${esc([k.ic ? 'IČO ' + k.ic : '', k.mesto].filter(Boolean).join(' · '))}</div>
                    </div>`).join('');
            }
            listEl.innerHTML = rows || '<div style="font-size:12px; color:#94a3b8; padding:14px; text-align:center;">Nic nenalezeno.</div>';
            listEl.querySelectorAll('.pt-item').forEach(el => el.onclick = () => {
                const role = roleEl.value;
                let html = '';
                if (el.getAttribute('data-t') === 'court') {
                    html = formatCourt(courts[parseInt(el.getAttribute('data-i'), 10)], role);
                } else {
                    const k = contacts.find(x => String(x.id) === el.getAttribute('data-id'));
                    if (k) html = formatContact(k, role);
                }
                if (html && insertHtml(html)) { ov.remove(); toast('✅ Strana vložena do dokumentu.'); }
            });
        }

        card.querySelector('#pt-close').onclick = () => ov.remove();
        card.querySelector('#pt-tab-contacts').onclick = () => setTab('contacts');
        card.querySelector('#pt-tab-courts').onclick = () => setTab('courts');
        searchEl.oninput = renderList;
        setTab('contacts');
        searchEl.focus();
    };

    // Veřejné API — jeden zdroj pravdy pro formátování a vkládání stran.
    window.LexisParties = { formatCourt, formatContact, insertHtml, insertContactById };
})();
