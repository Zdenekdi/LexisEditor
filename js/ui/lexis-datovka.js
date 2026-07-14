/* global window, document */
/**
 * LexisDatovka — UI pro odeslání dokumentu datovou schránkou (i hromadně).
 *
 * openDatovkaDialog() – vybere příjemce (adresář / soud / IČO / ruční dbID),
 *   ověří jejich doručitelnost přes FindDataBox, přiloží aktuální dokument jako
 *   PDF a zařadí do odesílací fronty (jedno odeslání na příjemce).
 * openDatovkaOutbox() – přehled odeslaných zpráv se stavem doručení + retry.
 *
 * Napojení: preload electronAPI (isdsFindDataBox, isdsOutbox*, renderPdfBase64).
 */
(function () {
    'use strict';

    function api() { return window.electronAPI || null; }
    function ui() { return window.lexisUI || null; }
    function toast(msg) {
        const u = ui();
        if (u && typeof u.customAlert === 'function') u.customAlert(msg);
        else console.log('[LexisDatovka]', msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    let recipients = []; // [{ dbID, name, deliverable }]

    function addRecipient(box) {
        if (!box || !box.dbID) return false;
        if (recipients.some(r => r.dbID === box.dbID)) return false;
        recipients.push({ dbID: box.dbID, name: box.name || box.firmName || box.dbID, deliverable: box.deliverable !== false });
        return true;
    }

    function collectCss() {
        let css = '';
        try {
            for (const sheet of document.styleSheets) {
                try { for (const rule of sheet.cssRules) css += rule.cssText + '\n'; } catch (e) { /* cross-origin */ }
            }
        } catch (e) { /* ignore */ }
        return css;
    }

    function currentDoc() {
        const core = window.lexisCore;
        const html = core && core.getContent ? core.getContent() : (document.querySelector('.ql-editor') || {}).innerHTML || '';
        const editorEl = document.querySelector('.ql-editor');
        const text = (core && core.getText) ? core.getText() : (editorEl ? editorEl.innerText : '');
        const header = document.getElementById('header-area');
        const footer = document.getElementById('footer-area');
        const titleEl = document.getElementById('window-doc-title');
        return {
            html,
            text,
            css: collectCss(),
            headerHtml: header ? header.innerHTML : '',
            footerHtml: footer ? footer.innerHTML : '',
            title: (titleEl && titleEl.innerText.trim()) || 'Dokument'
        };
    }

    // Detekuje soud zmíněný v textu — jeden zdroj (window.LexisCourt.detect).
    function detectCourtInText(text) {
        return (window.LexisCourt && window.LexisCourt.detect) ? window.LexisCourt.detect(text) : null;
    }

    function closeOverlay(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function makeOverlay(innerHtml, maxWidth) {
        const overlay = document.createElement('div');
        overlay.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        const card = document.createElement('div');
        card.style = `background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:${maxWidth || 560}px; max-height:88vh; overflow:auto; padding:22px;`;
        card.innerHTML = innerHtml;
        overlay.appendChild(card);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeOverlay(overlay); });
        document.body.appendChild(overlay);
        return { overlay, card };
    }

    // Vyhledávací picker soudů z registru. onPick(court) dostane vybraný soud.
    function showCourtPicker(onPick) {
        const courts = Array.isArray(window.COURT_REGISTRY) ? window.COURT_REGISTRY : [];
        if (courts.length === 0) { toast('Registr soudů není načten.'); return; }
        const { overlay, card } = makeOverlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h2 style="margin:0; font-size:16px; color:#0f172a;">⚖️ Vybrat soud</h2>
                <button id="cp-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <input id="cp-search" placeholder="Hledat soud…" style="width:100%; box-sizing:border-box; padding:9px; margin-bottom:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            <div style="font-size:11px; color:#64748b; margin-bottom:8px;">Po výběru se ověří <b>reálná</b> schránka soudu přes ISDS (FindDataBox).</div>
            <div id="cp-list" style="max-height:52vh; overflow:auto;"></div>`, 520);
        const listEl = card.querySelector('#cp-list');
        const searchEl = card.querySelector('#cp-search');
        function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
        function renderCourts(filter) {
            const f = norm(filter);
            const matched = courts.filter(c => !f || norm(c.nazev).includes(f) || norm(c.zkratka).includes(f) || norm(c.mesto).includes(f)).slice(0, 200);
            listEl.innerHTML = matched.length ? matched.map((c, i) => `
                <div class="cp-item" data-i="${courts.indexOf(c)}" style="padding:8px 6px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:12px;">
                    <div style="font-weight:700; color:#0f172a;">${esc(c.nazev)}</div>
                    <div style="color:#64748b;">${esc(c.mesto || '')}${c.zkratka ? ' · ' + esc(c.zkratka) : ''}</div>
                </div>`).join('') : '<div style="font-size:12px; color:#94a3b8; padding:12px; text-align:center;">Nic nenalezeno.</div>';
            listEl.querySelectorAll('.cp-item').forEach(el => el.onclick = () => {
                const court = courts[parseInt(el.getAttribute('data-i'), 10)];
                closeOverlay(overlay);
                onPick(court);
            });
        }
        renderCourts('');
        searchEl.oninput = () => renderCourts(searchEl.value);
        searchEl.focus();
        card.querySelector('#cp-close').onclick = () => closeOverlay(overlay);
    }

    // ---------------- Odesílací dialog ----------------

    window.openDatovkaDialog = function () {
        if (!api() || !api().isdsOutboxEnqueue) {
            toast('Odesílání datovkou je dostupné jen v desktopové aplikaci.');
            return;
        }
        recipients = [];
        const doc = currentDoc();
        const html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:17px; color:#0f172a;">📨 Odeslat datovou schránkou</h2>
                <button id="dtv-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <label style="font-size:12px; font-weight:700; color:#334155;">Předmět</label>
            <input id="dtv-subject" value="${esc(doc.title)}" style="width:100%; box-sizing:border-box; padding:9px; margin:4px 0 14px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">

            <div id="dtv-suggest" style="margin-bottom:10px;"></div>

            <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">Přidat příjemce</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
                <button class="dtv-add" data-mode="ic" style="flex:1; min-width:110px; padding:8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer; font-size:12px;">🔎 Dle IČO</button>
                <button class="dtv-add" data-mode="id" style="flex:1; min-width:110px; padding:8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer; font-size:12px;">⌨️ Ruční ID</button>
                <button class="dtv-add" data-mode="contacts" style="flex:1; min-width:110px; padding:8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer; font-size:12px;">📇 Adresář</button>
                <button class="dtv-add" data-mode="court" style="flex:1; min-width:110px; padding:8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer; font-size:12px;">⚖️ Soud</button>
            </div>
            <div id="dtv-status" style="font-size:11px; color:#64748b; min-height:16px; margin-bottom:6px;"></div>
            <div id="dtv-recipients" style="border:1px solid #e2e8f0; border-radius:8px; min-height:60px; padding:8px; margin-bottom:14px;"></div>

            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="font-size:11px; color:#64748b;">Přílohou bude aktuální dokument jako PDF.</div>
                <div style="display:flex; gap:8px;">
                    <button id="dtv-inbox" style="padding:9px 14px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">📥 Přijaté</button>
                    <button id="dtv-outbox" style="padding:9px 14px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">📤 Odeslané</button>
                    <button id="dtv-send" style="padding:9px 16px; border:none; background:#16a34a; color:#fff; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">Odeslat všem</button>
                </div>
            </div>`;
        const { overlay, card } = makeOverlay(html, 600);
        const statusEl = card.querySelector('#dtv-status');
        const listEl = card.querySelector('#dtv-recipients');

        function setStatus(msg) { statusEl.textContent = msg || ''; }
        function renderList() {
            if (recipients.length === 0) {
                listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; text-align:center; padding:14px;">Zatím žádní příjemci</div>';
                return;
            }
            listEl.innerHTML = recipients.map((r, i) => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 4px; border-bottom:1px solid #f1f5f9;">
                    <div style="font-size:12px;">
                        <span style="font-weight:700; color:#0f172a;">${esc(r.name)}</span>
                        <span style="color:#64748b;"> · ${esc(r.dbID)}</span>
                        ${r.deliverable ? '<span style="color:#16a34a;"> · doručitelná</span>' : '<span style="color:#dc2626;"> · nedoručitelná</span>'}
                    </div>
                    <button class="dtv-rm" data-i="${i}" style="border:none; background:none; color:#dc2626; cursor:pointer; font-size:14px;">✕</button>
                </div>`).join('');
            listEl.querySelectorAll('.dtv-rm').forEach(btn => btn.onclick = () => {
                recipients.splice(parseInt(btn.getAttribute('data-i'), 10), 1);
                renderList();
            });
        }
        renderList();

        // Návrh soudu detekovaného v dokumentu — přidání příjemce na jedno kliknutí.
        (function suggestCourt() {
            const suggestEl = card.querySelector('#dtv-suggest');
            const detected = detectCourtInText(doc.text);
            if (!detected) return;
            // Přesnější název ze registru, pokud ho lze spárovat.
            let officialName = detected.nazev;
            try {
                if (window.LexisCourtISDS && window.LexisCourtISDS.findCourtInRegistry) {
                    const reg = window.LexisCourtISDS.findCourtInRegistry(detected.nazev);
                    if (reg && reg.nazev) officialName = reg.nazev;
                }
            } catch (e) {}
            suggestEl.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 10px;">
                    <div style="font-size:12px; color:#1e3a8a;">📍 V dokumentu: <b>${esc(officialName)}</b></div>
                    <button id="dtv-suggest-add" style="border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; padding:6px 12px; flex-shrink:0;">Přidat soud</button>
                </div>`;
            suggestEl.querySelector('#dtv-suggest-add').onclick = async () => {
                setStatus(`Ověřuji schránku: ${officialName}…`);
                await findAndAdd({ firmName: officialName, dbType: 'OVM' }, officialName);
            };
        })();

        async function findAndAdd(query, label) {
            setStatus('Ověřuji schránku…');
            try {
                const res = await api().isdsFindDataBox(null, query);
                if (!res || !res.success) { setStatus('❌ ' + ((res && res.error) || 'Vyhledání selhalo.')); return; }
                if (!res.boxes || res.boxes.length === 0) { setStatus('⚠️ Nenalezeno: ' + (label || '')); return; }
                let added = 0;
                res.boxes.forEach(b => { if (addRecipient(b)) added++; });
                renderList();
                setStatus(added ? `✅ Přidáno: ${added}` : 'Schránka už je v seznamu.');
            } catch (e) { setStatus('❌ ' + e.message); }
        }

        function promptText(msg, def) {
            // jednoduchý prompt (window.prompt je v Electronu k dispozici)
            return window.prompt(msg, def || '');
        }

        card.querySelectorAll('.dtv-add').forEach(btn => btn.onclick = async () => {
            const mode = btn.getAttribute('data-mode');
            if (mode === 'ic') {
                const ic = promptText('Zadejte IČO subjektu:');
                if (ic) await findAndAdd({ ic: ic.replace(/\D/g, '') }, 'IČO ' + ic);
            } else if (mode === 'id') {
                const id = promptText('Zadejte ID datové schránky (7 znaků):');
                if (id) await findAndAdd({ dbID: id.trim() }, id);
            } else if (mode === 'court') {
                showCourtPicker(async (court) => {
                    setStatus(`Ověřuji schránku: ${court.nazev}…`);
                    // Ověříme reálnou schránku soudu přes ISDS (ne smyšlené ISDS z registru).
                    await findAndAdd({ firmName: court.nazev, dbType: 'OVM' }, court.nazev);
                });
            } else if (mode === 'contacts') {
                await addFromContacts(setStatus);
            }
        });

        async function addFromContacts() {
            try {
                const Ct = window.LexisContacts;
                const storage = window.lexisCore && window.lexisCore.storage;
                if (!Ct || !storage) { setStatus('Adresář není dostupný.'); return; }
                const contacts = new Ct(storage);
                const all = await contacts.getAll();
                const withBox = (all || []).filter(c => c.isds && String(c.isds).trim());
                if (withBox.length === 0) { setStatus('V adresáři nejsou kontakty s datovou schránkou.'); return; }
                let added = 0;
                withBox.forEach(c => { if (addRecipient({ dbID: String(c.isds).trim(), name: c.jmeno || c.isds, deliverable: true })) added++; });
                renderList();
                setStatus(`✅ Z adresáře přidáno: ${added}`);
            } catch (e) { setStatus('❌ ' + e.message); }
        }

        card.querySelector('#dtv-close').onclick = () => closeOverlay(overlay);
        card.querySelector('#dtv-outbox').onclick = () => { closeOverlay(overlay); window.openDatovkaOutbox(); };
        card.querySelector('#dtv-inbox').onclick = () => { closeOverlay(overlay); window.openDatovkaInbox(); };

        card.querySelector('#dtv-send').onclick = async () => {
            if (recipients.length === 0) { setStatus('Přidejte alespoň jednoho příjemce.'); return; }
            const undeliverable = recipients.filter(r => !r.deliverable);
            if (undeliverable.length && !window.confirm(`${undeliverable.length} schránek je nedoručitelných. Přesto odeslat ostatním?`)) return;
            const subject = (card.querySelector('#dtv-subject').value || 'Bez předmětu').trim();
            const sendList = recipients.filter(r => r.deliverable);
            if (sendList.length === 0) { setStatus('Žádný doručitelný příjemce.'); return; }
            setStatus('Generuji PDF přílohu…');
            try {
                const pdf = await api().renderPdfBase64(doc.html, doc.css, doc.headerHtml, doc.footerHtml);
                if (!pdf || !pdf.success) { setStatus('❌ Nepodařilo se vytvořit PDF: ' + ((pdf && pdf.error) || '')); return; }
                const files = [{ name: (doc.title || 'dokument').replace(/[^\w\-. ]+/g, '_') + '.pdf', mimeType: 'application/pdf', base64: pdf.base64 }];
                const res = await api().isdsOutboxEnqueue(sendList.map(r => ({ dbID: r.dbID, name: r.name })), { subject, files });
                if (res && res.success) {
                    closeOverlay(overlay);
                    toast(`📨 Zařazeno k odeslání: ${res.enqueued} zpráv. Průběh sleduj v „Odeslané".`);
                    window.openDatovkaOutbox();
                } else {
                    setStatus('❌ ' + ((res && res.error) || 'Zařazení selhalo.'));
                }
            } catch (e) { setStatus('❌ ' + e.message); }
        };
    };

    // ---------------- Outbox panel ----------------

    const STATUS_STYLE = {
        pending: ['#f59e0b', 'čeká'],
        sending: ['#3b82f6', 'odesílá se'],
        sent: ['#0ea5e9', 'odesláno'],
        delivered: ['#16a34a', 'doručeno'],
        failed: ['#dc2626', 'chyba'],
        review: ['#a855f7', 'ověřit ručně']
    };

    window.openDatovkaOutbox = function () {
        if (!api() || !api().isdsOutboxList) { toast('Outbox je dostupný jen v desktopové aplikaci.'); return; }
        const { overlay, card } = makeOverlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:17px; color:#0f172a;">📤 Odeslané datové zprávy</h2>
                <div style="display:flex; gap:8px;">
                    <button id="ob-refresh" style="padding:7px 12px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">🔄 Aktualizovat stav</button>
                    <button id="ob-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
                </div>
            </div>
            <div id="ob-list">Načítám…</div>`, 680);
        const listEl = card.querySelector('#ob-list');

        function badge(status) {
            const s = STATUS_STYLE[status] || ['#64748b', status];
            return `<span style="background:${s[0]}22; color:${s[0]}; font-size:10px; font-weight:800; padding:2px 8px; border-radius:20px;">${s[1].toUpperCase()}</span>`;
        }
        function render(items) {
            if (!items || items.length === 0) {
                listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; text-align:center; padding:20px;">Zatím nic odesláno.</div>';
                return;
            }
            items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            listEl.innerHTML = items.map(it => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 6px; border-bottom:1px solid #f1f5f9;">
                    <div style="font-size:12px; min-width:0;">
                        <div style="font-weight:700; color:#0f172a;">${esc(it.recipient && it.recipient.name)} <span style="color:#94a3b8; font-weight:400;">· ${esc(it.recipient && it.recipient.dbID)}</span></div>
                        <div style="color:#64748b;">${esc(it.subject || '')}${it.dmID ? ' · dmID ' + esc(it.dmID) : ''}${it.statusLabel ? ' · ' + esc(it.statusLabel) : ''}${it.lastError ? ' · <span style="color:#dc2626;">' + esc(it.lastError) + '</span>' : ''}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        ${badge(it.status)}
                        ${it.dmID ? `<button class="ob-receipt" data-id="${esc(it.dmID)}" title="Uložit podepsanou doručenku (právní doklad)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-size:11px; padding:3px 8px;">📄 Doručenka</button>` : ''}
                        ${(it.status === 'failed' || it.status === 'review') ? `<button class="ob-retry" data-id="${esc(it.id)}" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-size:11px; padding:3px 8px;">Opakovat</button>` : ''}
                    </div>
                </div>`).join('');
            listEl.querySelectorAll('.ob-retry').forEach(btn => btn.onclick = async () => {
                await api().isdsOutboxRetry(btn.getAttribute('data-id'));
                setTimeout(load, 400);
            });
        }
        async function load() {
            try { const res = await api().isdsOutboxList(); render(res && res.items); }
            catch (e) { listEl.innerHTML = '<div style="color:#dc2626; font-size:12px;">Chyba: ' + esc(e.message) + '</div>'; }
        }
        card.querySelector('#ob-close').onclick = () => { closeOverlay(overlay); if (window._obUnsub) window._obUnsub(); };
        card.querySelector('#ob-refresh').onclick = async () => {
            listEl.innerHTML = 'Aktualizuji stavy doručení…';
            try { const res = await api().isdsOutboxRefreshStatus(); render(res && res.items); }
            catch (e) { load(); }
        };
        load();
        // Auto-obnova při změně fronty.
        if (api().onIsdsOutboxChanged) api().onIsdsOutboxChanged(() => load());
    };

    // ---------------- Inbox (příchozí zprávy) ----------------

    let inboxMode = 'envelope'; // 'envelope' = jen upozornění, 'download' = plné stažení

    window.openDatovkaInbox = function () {
        if (!api() || !api().isdsInboxList) { toast('Přijaté zprávy jsou dostupné jen v desktopové aplikaci.'); return; }
        const { overlay, card } = makeOverlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h2 style="margin:0; font-size:17px; color:#0f172a;">📥 Přijaté datové zprávy</h2>
                <button id="ib-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
                <label style="font-size:12px; color:#334155; display:flex; align-items:center; gap:6px;">
                    Režim:
                    <select id="ib-mode" style="padding:6px; border:1px solid #cbd5e1; border-radius:8px; font-size:12px;">
                        <option value="envelope">Jen upozornění (nespustí doručení)</option>
                        <option value="download">Automaticky stáhnout (spustí doručení)</option>
                    </select>
                </label>
                <button id="ib-refresh" style="padding:8px 14px; border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">🔄 Načíst přijaté</button>
            </div>
            <div id="ib-warn" style="font-size:11px; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:8px; margin-bottom:10px;">
                ⚠️ „Stáhnout" u zprávy stáhne její obsah, což se považuje za <b>doručení přihlášením</b> a spustí běh lhůty. „Jen upozornění" doručení nespouští.
            </div>
            <div id="ib-list">Klikni na „Načíst přijaté".</div>`, 720);
        const listEl = card.querySelector('#ib-list');
        const modeSel = card.querySelector('#ib-mode');
        modeSel.value = inboxMode;
        modeSel.onchange = () => { inboxMode = modeSel.value; };

        function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

        function render(items) {
            if (!items || items.length === 0) { listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; text-align:center; padding:18px;">Zatím žádné přijaté zprávy. Klikni na „Načíst přijaté".</div>'; return; }
            items.sort((a, b) => (b.deliveryTime || '').localeCompare(a.deliveryTime || ''));
            listEl.innerHTML = items.map(it => {
                const downloaded = it.localStatus === 'downloaded';
                const filesHtml = downloaded && it.files && it.files.length
                    ? '<div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">' + it.files.map((f, fi) => `<button class="ib-file" data-id="${esc(it.dmID)}" data-fi="${fi}" style="border:1px solid #cbd5e1; background:#f8fafc; border-radius:6px; font-size:11px; padding:2px 8px; cursor:pointer;">📎 ${esc(f.name)}</button>`).join('') + '</div>'
                    : '';
                return `
                <div style="padding:9px 6px; border-bottom:1px solid #f1f5f9;">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                        <div style="font-size:12px; min-width:0;">
                            <div style="font-weight:700; color:#0f172a;">${esc(it.sender || it.senderId || 'Neznámý odesílatel')}</div>
                            <div style="color:#334155;">${esc(it.annotation || '(bez předmětu)')}</div>
                            <div style="color:#64748b; font-size:11px;">Doručeno: ${esc(fmtTime(it.deliveryTime)) || '—'} · ${esc(it.statusLabel || '')}${downloaded ? ' · staženo' : ''}</div>
                            ${filesHtml}
                        </div>
                        <div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0; align-items:flex-end;">
                            ${!downloaded ? `<button class="ib-dl" data-id="${esc(it.dmID)}" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-size:11px; padding:4px 8px;">⬇️ Stáhnout</button>` : ''}
                            <button class="ib-deadline" data-id="${esc(it.dmID)}" style="border:none; background:${it.deadlineCreated ? '#e2e8f0' : '#16a34a'}; color:${it.deadlineCreated ? '#475569' : '#fff'}; border-radius:6px; cursor:pointer; font-size:11px; padding:4px 8px;">⏳ ${it.deadlineCreated ? 'Lhůta ✓' : 'Vytvořit lhůtu'}</button>
                        </div>
                    </div>
                </div>`;
            }).join('');

            listEl.querySelectorAll('.ib-dl').forEach(btn => btn.onclick = async () => {
                if (!window.confirm('Stažením se zpráva považuje za DORUČENOU a spustí se běh lhůty. Pokračovat?')) return;
                btn.textContent = '…'; btn.disabled = true;
                const res = await api().isdsInboxDownload(btn.getAttribute('data-id'));
                if (!res || !res.success) { toast('Stažení selhalo: ' + ((res && res.error) || '')); }
                load();
            });
            listEl.querySelectorAll('.ib-file').forEach(btn => btn.onclick = async () => {
                const it = (window._ibItems || []).find(x => String(x.dmID) === btn.getAttribute('data-id'));
                const f = it && it.files[parseInt(btn.getAttribute('data-fi'), 10)];
                if (f && f.path) await api().isdsInboxOpenFile(f.path);
                else toast('Soubor není uložen.');
            });
            listEl.querySelectorAll('.ib-deadline').forEach(btn => btn.onclick = () => {
                const it = (window._ibItems || []).find(x => String(x.dmID) === btn.getAttribute('data-id'));
                if (!it) return;
                const delivered = it.deliveryTime ? String(it.deliveryTime).slice(0, 10) : '';
                closeOverlay(overlay);
                window.openDeadlineDialog({
                    title: it.annotation || ('Zpráva od ' + (it.sender || it.senderId || '')),
                    deliveredAt: delivered,
                    days: 15,
                    description: `Datová zpráva od ${it.sender || it.senderId || ''} (dmID ${it.dmID}).`
                });
                api().isdsInboxMarkDeadline(it.dmID);
            });
        }
        async function load() {
            try { const res = await api().isdsInboxList(); window._ibItems = (res && res.items) || []; render(window._ibItems); }
            catch (e) { listEl.innerHTML = '<div style="color:#dc2626;">Chyba: ' + esc(e.message) + '</div>'; }
        }
        card.querySelector('#ib-close').onclick = () => closeOverlay(overlay);
        card.querySelector('#ib-refresh').onclick = async () => {
            listEl.innerHTML = 'Načítám přijaté zprávy…';
            const res = await api().isdsInboxRefresh(modeSel.value);
            if (!res || !res.success) { listEl.innerHTML = '<div style="color:#dc2626;">Chyba: ' + esc((res && res.error) || '') + '</div>'; return; }
            window._ibItems = res.items || [];
            render(window._ibItems);
        };
        load();
    };

    // ---------------- Kalendář lhůt (Apple / Google / Outlook) ----------------

    // event = { title, date (Date|'YYYY-MM-DD'), description?, reminderDays? }
    window.showCalendarPicker = function (event) {
        const cal = window.LexisCalendar;
        if (!cal) { toast('Kalendářní modul není načten.'); return; }
        const t = cal.calendarTargets(event);
        const name = (event.title || 'lhuta').replace(/[^\w\-. ]+/g, '_');
        const { overlay, card } = makeOverlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h2 style="margin:0; font-size:16px; color:#0f172a;">📅 Přidat lhůtu do kalendáře</h2>
                <button id="cal-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="font-size:12px; color:#334155; margin-bottom:14px;"><b>${esc(event.title || 'Lhůta')}</b><br>${esc(cal.toIsoDate(event.date))}</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button class="cal-btn" data-a="apple" style="padding:10px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:13px; text-align:left;">  Apple / systémový kalendář (otevřít .ics)</button>
                <button class="cal-btn" data-a="google" style="padding:10px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:13px; text-align:left;">📆 Přidat do Google kalendáře</button>
                <button class="cal-btn" data-a="outlook" style="padding:10px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:13px; text-align:left;">📧 Přidat do Outlook kalendáře</button>
                <button class="cal-btn" data-a="save" style="padding:10px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer; font-size:12px; text-align:left; color:#475569;">💾 Uložit soubor .ics (pro libovolný kalendář)</button>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:12px;">Data zůstávají u vás — odkaz jen předvyplní událost ve vašem kalendáři.</div>`, 460);
        card.querySelector('#cal-close').onclick = () => closeOverlay(overlay);
        card.querySelectorAll('.cal-btn').forEach(btn => btn.onclick = async () => {
            const a = btn.getAttribute('data-a');
            try {
                if (a === 'apple') await api().calendarOpenIcs(t.ics, name);
                else if (a === 'google') await api().openExternalUrl(t.google);
                else if (a === 'outlook') await api().openExternalUrl(t.outlookOffice);
                else if (a === 'save') { await api().calendarSaveIcs(t.ics, name); }
                if (a !== 'save') closeOverlay(overlay);
            } catch (e) { toast('Nepodařilo se otevřít kalendář: ' + e.message); }
        });
    };

    // Dialog pro ruční vytvoření lhůty (název + datum doručení + počet dní).
    window.openDeadlineDialog = function (preset) {
        const p = preset || {};
        const cal = window.LexisCalendar;
        const today = (cal ? cal.toIsoDate(new Date()) : '');
        const { overlay, card } = makeOverlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:16px; color:#0f172a;">⏳ Nová lhůta</h2>
                <button id="dl-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <label style="font-size:12px; font-weight:700; color:#334155;">Název lhůty</label>
            <input id="dl-title" value="${esc(p.title || '')}" placeholder="např. Odvolání – spis 12 C 34/2026" style="width:100%; box-sizing:border-box; padding:9px; margin:4px 0 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <label style="font-size:12px; font-weight:700; color:#334155;">Datum doručení</label>
                    <input id="dl-date" type="date" value="${esc(p.deliveredAt || today)}" style="width:100%; box-sizing:border-box; padding:9px; margin:4px 0 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
                </div>
                <div style="width:110px;">
                    <label style="font-size:12px; font-weight:700; color:#334155;">Dní</label>
                    <input id="dl-days" type="number" value="${esc(p.days != null ? p.days : 15)}" min="0" style="width:100%; box-sizing:border-box; padding:9px; margin:4px 0 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
                </div>
                <div style="width:110px;">
                    <label style="font-size:12px; font-weight:700; color:#334155;">Připomenout (dní)</label>
                    <input id="dl-remind" type="number" value="3" min="0" style="width:100%; box-sizing:border-box; padding:9px; margin:4px 0 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
                </div>
            </div>
            <div id="dl-preview" style="font-size:12px; color:#16a34a; min-height:16px; margin-bottom:12px;"></div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button id="dl-cancel" style="padding:9px 14px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">Zrušit</button>
                <button id="dl-next" style="padding:9px 16px; border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">Přidat do kalendáře →</button>
            </div>`, 520);
        function computeAndShow() {
            if (!cal) return null;
            const d = card.querySelector('#dl-date').value;
            const days = card.querySelector('#dl-days').value;
            if (!d) return null;
            const deadline = cal.computeDeadline(d, days);
            card.querySelector('#dl-preview').textContent = 'Konec lhůty: ' + cal.toIsoDate(deadline);
            return deadline;
        }
        card.querySelector('#dl-date').oninput = computeAndShow;
        card.querySelector('#dl-days').oninput = computeAndShow;
        computeAndShow();
        card.querySelector('#dl-close').onclick = () => closeOverlay(overlay);
        card.querySelector('#dl-cancel').onclick = () => closeOverlay(overlay);
        card.querySelector('#dl-next').onclick = () => {
            const deadline = computeAndShow();
            if (!deadline) { toast('Zadejte datum doručení.'); return; }
            const title = card.querySelector('#dl-title').value.trim() || 'Lhůta';
            const remind = card.querySelector('#dl-remind').value;
            closeOverlay(overlay);
            window.showCalendarPicker({
                title: 'Lhůta: ' + title,
                date: deadline,
                description: (p.description || '') + (p.deliveredAt || card.querySelector('#dl-date').value ? `\nDoručeno: ${card.querySelector('#dl-date').value}` : ''),
                reminderDays: remind
            });
        };
    };
})();
