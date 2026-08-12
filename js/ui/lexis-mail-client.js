// lexis-mail-client.js — ODCHOZÍ tok: z právě otevřeného dokumentu připraví přílohu
// (PDF) a předvyplněný e-mail klientovi z adresáře. Advokát jen zkontroluje a odešle.
// NIC se neodesílá automaticky — jen se otevře okno systémové pošty s předvyplněnými poli.
// Doplněk k lexis-forward-client.js (ten řeší PŘÍCHOZÍ datovky → klient).
(function () {
    'use strict';

    function api() { return window.electronAPI || null; }
    function storage() { return (window.lexisCore && window.lexisCore.storage) || null; }
    function toast(msg) {
        const u = window.lexisUI;
        if (u && typeof u.customAlert === 'function') u.customAlert(msg);
        else console.log('[LexisMailClient]', msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function collectCss() {
        var css = '';
        try {
            for (var i = 0; i < document.styleSheets.length; i++) {
                var sheet = document.styleSheets[i];
                try {
                    var rules = sheet.cssRules || [];
                    for (var j = 0; j < rules.length; j++) css += rules[j].cssText + '\n';
                } catch (e) { /* cross-origin sheet, přeskoč */ }
            }
        } catch (e) { /* ignore */ }
        return css;
    }

    // Stejný sběr dokumentu jako v lexis-datovka.js (html, css, hlavička, patička, název).
    function currentDoc() {
        var core = window.lexisCore;
        var html = core && core.getContent ? core.getContent() : ((document.querySelector('.ql-editor') || {}).innerHTML || '');
        var editorEl = document.querySelector('.ql-editor');
        var text = (core && core.getText) ? core.getText() : (editorEl ? editorEl.innerText : '');
        var header = document.getElementById('header-area');
        var footer = document.getElementById('footer-area');
        var titleEl = document.getElementById('window-doc-title');
        return {
            html: html,
            text: text,
            css: collectCss(),
            headerHtml: header ? header.innerHTML : '',
            footerHtml: footer ? footer.innerHTML : '',
            title: (titleEl && titleEl.innerText.trim()) || 'Dokument'
        };
    }

    function safeFileName(name) {
        return String(name || 'dokument').replace(/[^\w\-. ]+/g, '_') + '.pdf';
    }

    async function loadContacts() {
        try { if (window.LexisContacts && storage()) return (await new window.LexisContacts(storage()).getAll()) || []; }
        catch (e) { /* ignore */ }
        return [];
    }
    async function loadLawyer() {
        try { if (window.lexisUI && window.lexisUI.readLawyerProfile) return await window.lexisUI.readLawyerProfile(); }
        catch (e) { /* ignore */ }
        return {};
    }
    function extractRefs(text) {
        try { if (window.LexisReply && window.LexisReply.extract) return window.LexisReply.extract(text || ''); }
        catch (e) { /* ignore */ }
        return {};
    }

    // Best-effort zápis do spisu (timeline v LexisLocalu). Stejný endpoint jako forward-client.
    async function logToCase(payload) {
        try {
            var conn = window.lexisUI && window.lexisUI.getLexisLocalConnection ? window.lexisUI.getLexisLocalConnection() : null;
            if (!conn || !conn.baseUrl) return;
            await fetch(conn.baseUrl + '/api/case/email-logged', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, conn.headers || {}),
                body: JSON.stringify(payload)
            }).catch(function () {});
        } catch (e) { /* ignore */ }
    }

    function closeOverlay(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

    async function open() {
        var doc = currentDoc();
        var refs = extractRefs(doc.text);
        var contacts = await loadContacts();
        var lawyer = await loadLawyer();
        var attName = safeFileName(doc.title);

        function draftFor(contact) {
            return window.LexisMailDraft.buildClientDraft({
                contact: contact || {}, lawyer: lawyer, docTitle: doc.title,
                spzn: refs.spzn, cj: refs.cj, attachmentName: attName
            });
        }
        var draft0 = draftFor(null);

        var options = contacts.map(function (c) {
            var has = !!(c.email);
            return '<option value="' + esc(c.id) + '"' + (has ? '' : ' disabled') + '>' +
                esc(c.jmeno || c.email || c.id) + (has ? '' : ' (bez e-mailu)') + '</option>';
        }).join('');

        var overlay = document.createElement('div');
        overlay.id = 'lmc-overlay';
        overlay.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        overlay.innerHTML =
            eIco('<div style="background:#fff; border-radius:14px; max-width:560px; width:100%; padding:22px; box-shadow:0 20px 60px rgba(0,0,0,.3); font-family:inherit;">' +
                '<div style="font-size:16px; font-weight:700; margin-bottom:4px;">📧 E-mail klientovi</div>' +
                '<div style="font-size:12px; color:#77716a; margin-bottom:14px;">Připraví přílohu (PDF) a předvyplní e-mail. Nic se neodešle — otevře se okno pošty ke kontrole.</div>' +
                '<label style="font-size:12px; font-weight:600;">Klient (z adresáře)</label>' +
                '<select id="lmc-client" style="width:100%; padding:8px; margin:4px 0 12px; border:1px solid #ddd6cb; border-radius:8px;">' +
                    '<option value="">— vyberte klienta —</option>' + options +
                '</select>' +
                '<label style="font-size:12px; font-weight:600;">Předmět</label>' +
                '<input id="lmc-subject" value="' + esc(draft0.subject) + '" style="width:100%; padding:8px; margin:4px 0 12px; border:1px solid #ddd6cb; border-radius:8px;">' +
                '<label style="font-size:12px; font-weight:600;">Zpráva</label>' +
                '<textarea id="lmc-body" rows="8" style="width:100%; padding:8px; margin:4px 0 12px; border:1px solid #ddd6cb; border-radius:8px; font-family:inherit; resize:vertical;">' + esc(draft0.body) + '</textarea>' +
                '<label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:14px;">' +
                    '<input type="checkbox" id="lmc-attach" checked> Přiložit aktuální dokument jako PDF (' + esc(attName) + ')' +
                '</label>' +
                '<div id="lmc-status" style="font-size:12px; color:#77716a; min-height:16px; margin-bottom:10px;"></div>' +
                '<div style="display:flex; justify-content:flex-end; gap:8px;">' +
                    '<button id="lmc-cancel" style="border:1px solid #ddd6cb; background:#fff; border-radius:8px; padding:8px 14px; cursor:pointer;">Zrušit</button>' +
                    '<button id="lmc-go" style="border:none; background:#9a5b22; color:#fff; border-radius:8px; padding:8px 14px; cursor:pointer; font-weight:600;">Připravit e-mail</button>' +
                '</div>' +
            '</div>');
        document.body.appendChild(overlay);
        var $ = function (s) { return overlay.querySelector(s); };
        var setStatus = function (m) { var el = $('#lmc-status'); if (el) el.textContent = m || ''; };

        $('#lmc-client').addEventListener('change', function () {
            var c = contacts.find(function (x) { return String(x.id) === String($('#lmc-client').value); }) || {};
            var d = draftFor(c);
            $('#lmc-subject').value = d.subject;
            $('#lmc-body').value = d.body;
        });

        $('#lmc-cancel').onclick = function () { closeOverlay(overlay); };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(overlay); });

        $('#lmc-go').onclick = async function () {
            var client = contacts.find(function (x) { return String(x.id) === String($('#lmc-client').value); }) || {};
            var to = String(client.email || '').trim();
            if (!to) { setStatus('Vyberte klienta s vyplněným e-mailem.'); return; }
            var subject = $('#lmc-subject').value.trim();
            var body = $('#lmc-body').value;
            var attach = $('#lmc-attach').checked;

            var attachmentsB64 = [];
            if (attach) {
                setStatus('Generuji PDF přílohu…');
                try {
                    var pdf = await api().renderPdfBase64(doc.html, doc.css, doc.headerHtml, doc.footerHtml);
                    if (pdf && pdf.success) attachmentsB64 = [{ name: attName, base64: pdf.base64 }];
                    else setStatus('⚠️ PDF se nepodařilo vytvořit, pokračuji bez přílohy.');
                } catch (e) { setStatus('⚠️ Chyba PDF: ' + e.message + ' — pokračuji bez přílohy.'); }
            }

            setStatus('Otevírám okno pošty…');
            var opened = false;
            try {
                if (api() && api().composeEmailAttach) {
                    var res = await api().composeEmailAttach({ to: to, subject: subject, body: body, attachmentsB64: attachmentsB64 });
                    opened = !!(res && res.success);
                    if (!opened && res && res.error) setStatus('Pošta: ' + res.error + ' — zkouším mailto…');
                }
            } catch (e) { /* fallback níže */ }

            if (!opened) {
                var href = window.LexisMailDraft.mailtoHref(to, subject, body);
                if (api() && api().openExternalUrl) api().openExternalUrl(href);
                else { try { window.location.href = href; } catch (e2) { window.open(href); } }
                if (attachmentsB64.length) toast('Otevřel jsem e-mail bez přílohy (mailto neumí přílohy). PDF přiložte ručně, nebo použijte Apple Mail / Outlook.');
            }

            logToCase({
                caseNumber: refs.spzn || '', cj: refs.cj || '',
                clientName: client.jmeno || '', recipientEmail: to,
                subject: subject, docTitle: doc.title, direction: 'outbound-client'
            });

            closeOverlay(overlay);
            toast('📧 E-mail připraven ke kontrole a odeslání.');
        };
    }

    window.LexisMailClient = { open: open };
    // Vstupní bod pro tlačítko v ribbonu (onclick="openMailToClient()").
    window.openMailToClient = open;
})();
