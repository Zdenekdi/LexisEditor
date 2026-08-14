// lexis-reply-inbox.js — vytvoří koncept ODPOVĚDI z příchozí datové zprávy.
// Doplňuje mezeru: „Odpovědět" dosud šlo jen z otevřeného dokumentu / importu PDF,
// ne z přijaté datovky. Reuse čisté logiky z LexisReply (extract + buildReplyHtml) —
// lexis-reply.js zůstává netknutý. Advokát koncept zkontroluje a odešle datovkou.
(function () {
    'use strict';

    // Sesbírá text zprávy pro extrakci č.j./sp.zn.: předmět (annotation), odesílatel
    // a texty stažených příloh (když jsou k dispozici). Čisté a testovatelné.
    function itemText(item) {
        item = item || {};
        var parts = [item.annotation || '', item.sender || '', item.senderId || ''];
        if (Array.isArray(item.files)) {
            item.files.forEach(function (f) { if (f && f.text) parts.push(f.text); });
        }
        return parts.filter(Boolean).join('\n');
    }

    // ----- dále jen prohlížečová část (DOM/IPC) -----
    if (typeof window !== 'undefined') {
        var toast = function (m) {
            var u = window.lexisUI;
            if (u && typeof u.customAlert === 'function') u.customAlert(m);
            else console.log('[LexisReplyInbox]', m);
        };
        var esc = function (s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        };

        var extractFrom = function (item) {
            try { if (window.LexisReply && window.LexisReply.extract) return window.LexisReply.extract(itemText(item)); }
            catch (e) { /* ignore */ }
            return {};
        };

        // Otevře modal s náležitostmi (předvyplněnými z přijaté zprávy) a po potvrzení
        // vloží koncept odpovědi do editoru. Zrcadlí chování createReplyFromDocument.
        // Doplní f.text u PDF příloh (č.j./sp. zn. bývá právě v příloze, ne v
        // předmětu). Bez toho zůstávaly náležitosti odpovědi prázdné.
        var hydrateAttachmentText = function (item) {
            var api = window.electronAPI;
            if (!item || !Array.isArray(item.files) || !api || !api.extractFileText) return Promise.resolve();
            var jobs = item.files.map(function (f) {
                if (!f || f.text || !f.path) return Promise.resolve();
                var isPdf = /\.pdf$/i.test(f.path) || (f.mimeType && /pdf/i.test(f.mimeType));
                if (!isPdf) return Promise.resolve();
                return api.extractFileText(f.path).then(function (r) {
                    if (r && r.text) f.text = r.text;
                }).catch(function () { /* ignore */ });
            });
            return Promise.all(jobs);
        };

        window.createReplyFromMessage = async function (item) {
            if (!window.lexisCore || !window.lexisCore.setContent) { toast('Editor není připraven.'); return; }
            if (!window.LexisReply || !window.LexisReply.buildReplyHtml) { toast('Modul odpovědí není načten.'); return; }
            try { await hydrateAttachmentText(item); } catch (e) { /* pokračuj i bez příloh */ }
            var f = extractFrom(item) || {};
            if (!f.subject && item) f.subject = item.sender || item.senderId || '';

            var row = function (label, id, val) {
                return '<label style="font-size:12px; font-weight:700; color:#4a453f;">' + label + '</label>' +
                    '<input id="' + id + '" value="' + esc(val || '') + '" style="width:100%; box-sizing:border-box; padding:8px; margin:3px 0 10px; border:1px solid #ddd6cb; border-radius:8px; font-size:13px;">';
            };

            var ov = document.createElement('div');
            ov.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:100000; display:flex; align-items:center; justify-content:center; padding:20px;';
            var card = document.createElement('div');
            card.style = 'background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:520px; max-height:88vh; overflow:auto; padding:22px;';
            card.innerHTML =
                eIco('<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
                    '<h2 style="margin:0; font-size:16px; color:#2b2926;">↩️ Odpověď na datovou zprávu</h2>' +
                    '<button id="rpi-close" style="border:none; background:#edeae4; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>' +
                '</div>' +
                '<div style="font-size:11px; color:#77716a; margin-bottom:12px;">Náležitosti jsou vytažené z přijaté zprávy — zkontrolujte a doplňte. Prázdná pole se do hlavičky nedají.</div>' +
                row('Adresát / subjekt', 'rpi-subject', f.subject) +
                row('Spisová značka', 'rpi-spzn', f.spzn) +
                row('Číslo jednací (č. j.)', 'rpi-cj', f.cj) +
                row('Věc', 'rpi-vec', f.vec) +
                row('IČO', 'rpi-ico', f.ico) +
                '<div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;">' +
                    '<button id="rpi-cancel" style="padding:9px 14px; border:1px solid #ddd6cb; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">Zrušit</button>' +
                    '<button id="rpi-create" style="padding:9px 16px; border:none; background:#9a5b22; color:#fff; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">Vytvořit odpověď</button>' +
                '</div>');
            ov.appendChild(card);
            ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
            document.body.appendChild(ov);

            card.querySelector('#rpi-close').onclick = function () { ov.remove(); };
            card.querySelector('#rpi-cancel').onclick = function () { ov.remove(); };
            card.querySelector('#rpi-create').onclick = function () {
                var data = {
                    subject: card.querySelector('#rpi-subject').value.trim(),
                    spzn: card.querySelector('#rpi-spzn').value.trim(),
                    cj: card.querySelector('#rpi-cj').value.trim(),
                    vec: card.querySelector('#rpi-vec').value.trim(),
                    ico: card.querySelector('#rpi-ico').value.trim()
                };
                if (!window.confirm('Vytvoření odpovědi nahradí aktuální obsah editoru. Původní dokument si nejdřív uložte. Pokračovat?')) return;
                window.lexisCore.setContent(window.LexisReply.buildReplyHtml(data));
                ov.remove();
                toast('↩️ Koncept odpovědi vytvořen — doplňte text a odešlete datovkou.');
            };
        };
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { itemText: itemText };
})();
