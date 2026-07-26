// lexis-mail-draft.js — čistá logika pro sestavení konceptu e-mailu klientovi.
// Bez DOM a bez IPC → plně testovatelné (jest). Nic neodesílá: jen připraví
// adresáta, předmět a tělo, které advokát před odesláním potvrdí.
(function () {
    'use strict';

    function clientName(contact) {
        return String((contact && (contact.jmeno || contact.name)) || '').trim();
    }

    // Referenci na spis určíme přednostně ze spisové značky, jinak z čísla jednacího.
    function docRef(opts) {
        const spzn = String(opts.spzn || '').trim();
        const cj = String(opts.cj || '').trim();
        if (spzn) return { label: 'sp. zn. ' + spzn, spzn, cj };
        if (cj) return { label: 'č. j. ' + cj, spzn, cj };
        return { label: '', spzn, cj };
    }

    // Sestaví koncept e-mailu klientovi. Vrací { to, subject, body }.
    function buildClientDraft(opts) {
        opts = opts || {};
        const contact = opts.contact || {};
        const lawyer = opts.lawyer || {};
        const docTitle = (String(opts.docTitle || '').trim()) || 'dokument';
        const ref = docRef(opts);
        const attachmentName = String(opts.attachmentName || '').trim();

        const to = String(contact.email || '').trim();

        let subject = docTitle;
        if (ref.label) subject = docTitle + ' – ' + ref.label;

        const name = clientName(contact);
        const L = [];
        L.push(name ? ('Vážený/á ' + name + ',') : 'Vážená paní, vážený pane,');
        L.push('');
        const inMatter = ref.label ? (' ve věci ' + ref.label) : '';
        L.push('v příloze Vám' + inMatter + ' zasílám ' + docTitle + '.');
        if (attachmentName) {
            L.push('');
            L.push('Příloha: ' + attachmentName);
        }
        L.push('');
        L.push('V případě jakýchkoli dotazů jsem Vám k dispozici.');
        L.push('');
        L.push('S pozdravem');
        const lname = String((lawyer.name || lawyer.jmeno) || '').trim();
        const lfirm = String((lawyer.firm || lawyer.kancelar) || '').trim();
        if (lname) L.push(lname);
        if (lfirm) L.push(lfirm);

        return { to: to, subject: subject, body: L.join('\n') };
    }

    function mailtoHref(to, subject, body) {
        return 'mailto:' + encodeURIComponent(to || '')
            + '?subject=' + encodeURIComponent(subject || '')
            + '&body=' + encodeURIComponent(body || '');
    }

    const api = { buildClientDraft: buildClientDraft, mailtoHref: mailtoHref };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LexisMailDraft = api;
})();
