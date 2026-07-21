// --- LexisForward — přiřazení příchozí datové zprávy klientovi + přeposlání e-mailem ---
// Když do datové schránky přijde zpráva, advokát ji tímto přiřadí konkrétnímu
// klientovi (kontakt z adresáře) a přepošle mu ji e-mailem s náležitostmi
// (odesílatel, předmět, sp. zn./č.j., doručeno, přílohy). E-mail se otevře přes
// mailto v poštovním klientu — nic se neodesílá „naoko", odeslání má advokát pod
// kontrolou. Přílohu (mailto ji neumí) přiloží ručně; z dialogu jde otevřít.
//
// Automatizace: vazba (sp. zn. / odesílatel → klient) se ukládá do IndexedDB
// (settings/'datovka-client-map'). Příště se u zprávy se stejnou sp. zn. nebo od
// stejného odesílatele klient rovnou předvybere.

'use strict';

(function () {
    const MAP_KEY = 'datovka-client-map';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    // ---- Čisté funkce (testovatelné bez DOM) ------------------------------

    function normSpzn(s) {
        return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    // Návrh klienta podle zapamatované vazby: nejdřív sp. zn., pak odesílatel.
    function suggestClient(map, spzn, senderId) {
        map = map || {};
        const bySpzn = map.bySpzn || {};
        const bySender = map.bySender || {};
        const key = normSpzn(spzn);
        if (key && bySpzn[key] != null) return bySpzn[key];
        if (senderId != null && bySender[String(senderId)] != null) return bySender[String(senderId)];
        return null;
    }

    // Zapamatuje vazbu (sp. zn. i odesílatel → klient), vrací nový map.
    function updateMap(map, spzn, senderId, clientId) {
        const m = {
            bySpzn: Object.assign({}, (map && map.bySpzn) || {}),
            bySender: Object.assign({}, (map && map.bySender) || {})
        };
        const key = normSpzn(spzn);
        if (key) m.bySpzn[key] = clientId;
        if (senderId != null && senderId !== '') m.bySender[String(senderId)] = clientId;
        return m;
    }

    // Sestaví předmět + tělo + mailto z metadat zprávy a klienta.
    function buildEmail(opts) {
        const item = opts.item || {};
        const client = opts.client || {};
        const spzn = opts.spzn || '';
        const cj = opts.cj || '';
        const lawyer = opts.lawyer || {};
        const sender = item.sender || item.senderId || 'Neznámý odesílatel';
        const subjectLine = item.annotation || '(bez předmětu)';
        const delivered = item.deliveryTime ? String(item.deliveryTime).replace('T', ' ').slice(0, 16) : '';
        const files = (item.files || []).map(f => f && f.name).filter(Boolean);

        const emailSubject = `Datová zpráva k přeposlání – ${subjectLine}`;
        const L = [];
        L.push('Dobrý den,');
        L.push('');
        L.push('přeposílám Vám datovou zprávu doručenou do naší advokátní kanceláře ve Vaší věci.');
        L.push('');
        L.push('Odesílatel: ' + sender);
        L.push('Předmět: ' + subjectLine);
        if (spzn) L.push('Spisová značka: ' + spzn);
        if (cj) L.push('Číslo jednací: ' + cj);
        if (delivered) L.push('Doručeno: ' + delivered);
        if (files.length) L.push('Přílohy: ' + files.join(', ') + ' (přikládám k tomuto e-mailu)');
        L.push('');
        L.push('S pozdravem,');
        if (lawyer.name) L.push(lawyer.name);
        if (lawyer.firm) L.push(lawyer.firm);
        const body = L.join('\n');
        const to = client.email || '';
        return { to, subject: emailSubject, body };
    }

    function toMailto(to, subject, body) {
        return 'mailto:' + encodeURIComponent(to || '')
            + '?subject=' + encodeURIComponent(subject || '')
            + '&body=' + encodeURIComponent(body || '');
    }

    // Otevře e-mail v systémovém poštovním klientu. V Electronu přes IPC
    // (shell.openExternal → nové okno pošty), v prohlížeči přes location.href.
    function openMail(href) {
        if (window.electronAPI && window.electronAPI.openExternalUrl) {
            window.electronAPI.openExternalUrl(href);
        } else {
            try { window.location.href = href; } catch (e) { window.open(href); }
        }
    }

    // Payload pro zápis do spisu v LexisLocalu (aby byl v timeline vidět odeslaný
    // e-mail). caseNumber = spisová značka; když chybí, backend to zaznamená
    // bez navázání na konkrétní spis.
    function caseLogPayload(item, client, spzn, cj, subject) {
        return {
            caseNumber: spzn || '',
            cj: cj || '',
            clientName: (client && client.jmeno) || '',
            recipientEmail: (client && client.email) || '',
            subject: subject || (item && item.annotation) || '',
            sender: (item && (item.sender || item.senderId)) || '',
            dmID: (item && item.dmID) || ''
        };
    }

    // ---- DOM / integrace --------------------------------------------------

    function storage() {
        return (window.lexisCore && window.lexisCore.storage) || null;
    }
    function toast(msg) {
        const u = window.lexisUI;
        if (u && typeof u.customAlert === 'function') u.customAlert(msg);
        else console.log('[LexisForward]', msg);
    }

    async function loadContacts() {
        try {
            if (window.LexisContacts && storage()) {
                return (await new window.LexisContacts(storage()).getAll()) || [];
            }
        } catch (e) { /* ignore */ }
        return [];
    }
    async function loadMap() {
        try {
            const rec = storage() && await storage().get('settings', MAP_KEY);
            return (rec && rec.map) || { bySpzn: {}, bySender: {} };
        } catch (e) { return { bySpzn: {}, bySender: {} }; }
    }
    async function saveMap(map) {
        try { if (storage()) await storage().set('settings', { key: MAP_KEY, map }); }
        catch (e) { /* ignore */ }
    }
    async function loadLawyer() {
        try {
            if (window.lexisUI && window.lexisUI.readLawyerProfile) {
                return await window.lexisUI.readLawyerProfile();
            }
        } catch (e) { /* ignore */ }
        return {};
    }

    // Zapíše do LexisLocalu (auditní log → timeline spisu), že e-mail byl odeslán.
    // Vrací { ok, linkedToCase } nebo { ok:false, reason }. Voláno až po potvrzení
    // advokáta — netvrdíme „odesláno", dokud to advokát nepotvrdí.
    async function logToCase(payload) {
        try {
            const conn = window.lexisUI && window.lexisUI.getLexisLocalConnection
                ? window.lexisUI.getLexisLocalConnection() : null;
            if (!conn || !conn.baseUrl) return { ok: false, reason: 'no-conn' };
            const res = await fetch(`${conn.baseUrl}/api/case/email-logged`, {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, conn.headers || {}),
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok && data.success, linkedToCase: !!(data && data.linkedToCase) };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    // Odešle e-mail přes LexisLocal (SMTP, i s přílohou). Server po úspěchu sám
    // zapíše do spisu, takže tady už netřeba potvrzovací krok.
    async function smtpSend(payload) {
        try {
            const conn = window.lexisUI && window.lexisUI.getLexisLocalConnection
                ? window.lexisUI.getLexisLocalConnection() : null;
            if (!conn || !conn.baseUrl) return { ok: false, reason: 'no-conn' };
            const res = await fetch(`${conn.baseUrl}/api/email/send`, {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, conn.headers || {}),
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            return {
                ok: res.ok && data.success,
                linkedToCase: !!(data && data.linkedToCase),
                error: data && data.error,
                code: data && data.code
            };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    function closeModal() {
        const el = document.getElementById('lfw-overlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    async function open(item) {
        item = item || {};
        const contacts = await loadContacts();
        const map = await loadMap();
        const lawyer = await loadLawyer();

        // sp. zn. / č.j. z předmětu zprávy (jeden zdroj extrakce)
        let spzn = '', cj = '';
        try {
            if (window.LexisReply && window.LexisReply.extract) {
                const ex = window.LexisReply.extract((item.annotation || '') + '\n' + (item.sender || ''));
                spzn = ex.spzn || ''; cj = ex.cj || '';
            }
        } catch (e) { /* ignore */ }

        const senderId = item.senderId || item.sender || '';
        const suggestedId = suggestClient(map, spzn, senderId);

        // seznam kontaktů (klientů) do <select>
        const options = contacts.map(c => {
            const label = (c.jmeno || '(bez jména)') + (c.email ? ` — ${c.email}` : ' — (bez e-mailu)');
            const sel = String(c.id) === String(suggestedId) ? ' selected' : '';
            return `<option value="${esc(c.id)}"${sel}>${esc(label)}</option>`;
        }).join('');

        const files = (item.files || []).filter(f => f && f.name);
        const attachPaths = files.map(f => f.path).filter(Boolean); // jen stažené (s cestou)
        const hasAttach = attachPaths.length > 0;
        const suggestedClient = contacts.find(c => String(c.id) === String(suggestedId)) || null;
        const first = buildEmail({ item, client: suggestedClient || {}, spzn, cj, lawyer });
        // „Kompletně automatický návrh" = klient je rozpoznaný z historie A má e-mail.
        // Pak advokát jen potvrdí. Jinak musí klienta vybrat (a příště se zapamatuje).
        const autoReady = !!(suggestedClient && suggestedClient.email);
        const readyBanner = autoReady
            ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:9px 12px;font-size:12px;color:#065f46;margin-bottom:12px;">✓ <b>Návrh je hotový.</b> Klient <b>${esc(suggestedClient.jmeno || '')}</b> (${esc(suggestedClient.email)}) rozpoznán podle historie, e-mail je předvyplněný — jen zkontroluj a odešli.</div>`
            : '';

        const overlay = document.createElement('div');
        overlay.id = 'lfw-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:100001;display:flex;align-items:center;justify-content:center;';
        const inp = 'width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:560px;max-width:94vw;max-height:90vh;overflow:auto;padding:18px 20px;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,0.25);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <strong style="font-size:15px;color:#0f172a;">📨 Přeposlat datovou zprávu klientovi</strong>
                    <button id="lfw-x" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">×</button>
                </div>
                ${readyBanner}
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:12px;color:#334155;margin-bottom:14px;line-height:1.6;">
                    <div><b>Odesílatel:</b> ${esc(item.sender || item.senderId || '—')}</div>
                    <div><b>Předmět:</b> ${esc(item.annotation || '(bez předmětu)')}</div>
                    ${spzn ? `<div><b>Sp. zn.:</b> ${esc(spzn)}</div>` : ''}
                    ${cj ? `<div><b>Č.j.:</b> ${esc(cj)}</div>` : ''}
                    <div><b>Doručeno:</b> ${esc(item.deliveryTime ? String(item.deliveryTime).replace('T', ' ').slice(0, 16) : '—')}</div>
                    ${files.length ? `<div><b>Přílohy:</b> ${files.map(f => esc(f.name)).join(', ')}</div>` : '<div style="color:#94a3b8;">Bez stažené přílohy (zpráva zatím není stažená).</div>'}
                </div>

                <label style="font-size:12px;font-weight:700;color:#334155;">Klient (z adresáře)${suggestedId ? ' · <span style="color:#2563eb;">navrženo podle historie</span>' : ''}</label>
                <select id="lfw-client" style="${inp}margin:4px 0 12px;">
                    <option value="">— vyber klienta —</option>
                    ${options}
                </select>

                <label style="font-size:12px;font-weight:700;color:#334155;">Předmět e-mailu</label>
                <input id="lfw-subject" type="text" style="${inp}margin:4px 0 12px;" value="${esc(first.subject)}">

                <label style="font-size:12px;font-weight:700;color:#334155;">Text e-mailu</label>
                <textarea id="lfw-body" rows="9" style="${inp}margin:4px 0 6px;resize:vertical;font-family:inherit;">${esc(first.body)}</textarea>

                <label style="font-size:12px;font-weight:700;color:#334155;">Způsob odeslání</label>
                <div style="margin:4px 0 12px;font-size:12.5px;color:#334155;line-height:1.5;">
                    <label style="display:block;margin-bottom:4px;cursor:pointer;"><input type="radio" name="lfw-method" value="mailto" checked> Otevřít v poště <span style="color:#94a3b8;">(bez přílohy — přiložíš ručně; funguje všude)</span></label>
                    <label style="display:block;margin-bottom:4px;cursor:pointer;"><input type="radio" name="lfw-method" value="native"${hasAttach ? '' : ' disabled'}> Nové okno pošty <b>s přílohou</b> <span style="color:#94a3b8;">(Apple Mail / Outlook)</span></label>
                    <label style="display:block;cursor:pointer;"><input type="radio" name="lfw-method" value="smtp"${hasAttach ? '' : ' disabled'}> Odeslat přes LexisLocal <b>s přílohou</b> <span style="color:#94a3b8;">(SMTP, odešle server)</span></label>
                    ${!hasAttach ? '<div style="color:#f59e0b;font-size:11px;margin-top:5px;">Zpráva zatím není stažená — přílohu nelze připojit. Nejdřív ji stáhni v „Přijaté", pak půjde i s přílohou.</div>'
                        : `<div style="font-size:11px;color:#64748b;margin-top:5px;">📎 ${esc(files.map(f => f.name).join(', '))} <button id="lfw-openfile" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;margin-left:4px;">Otevřít soubor</button></div>`}
                </div>
                <div style="font-size:11px;color:#94a3b8;margin-bottom:14px;">Pozn.: e-mail není tak chráněný jako datová schránka — zvaž, co klientovi posíláš.</div>

                <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button id="lfw-cancel" style="padding:9px 14px;border:1px solid #cbd5e1;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:13px;color:#475569;">Zrušit</button>
                    <button id="lfw-send" style="padding:9px 16px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">${autoReady ? '✓ Potvrdit a otevřít v poště →' : 'Otevřít v poště →'}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const $ = s => overlay.querySelector(s);
        const clientSel = $('#lfw-client');
        const subjectEl = $('#lfw-subject');
        const bodyEl = $('#lfw-body');

        // při změně klienta přegeneruj předmět/tělo (jen pokud je uživatel neupravil ručně — pro jednoduchost regenerujeme vždy)
        clientSel.onchange = () => {
            const c = contacts.find(x => String(x.id) === clientSel.value) || {};
            const e = buildEmail({ item, client: c, spzn, cj, lawyer });
            subjectEl.value = e.subject;
            bodyEl.value = e.body;
        };

        if (files.length && $('#lfw-openfile')) {
            $('#lfw-openfile').onclick = async () => {
                const f = files[0];
                if (f && f.path && window.electronAPI && window.electronAPI.isdsInboxOpenFile) {
                    await window.electronAPI.isdsInboxOpenFile(f.path);
                } else {
                    toast('Soubor není uložen na disku — nejdřív zprávu stáhni.');
                }
            };
        }

        $('#lfw-x').onclick = closeModal;
        $('#lfw-cancel').onclick = closeModal;
        $('#lfw-send').onclick = async () => {
            const clientId = clientSel.value;
            if (!clientId) { toast('Vyber klienta, kterému se má zpráva přeposlat.'); return; }
            const client = contacts.find(x => String(x.id) === String(clientId)) || {};
            if (!client.email) {
                toast('Vybraný klient nemá v adresáři e-mail. Doplň mu ho v kontaktech a zkus to znovu.');
                return;
            }
            const methodEl = overlay.querySelector('input[name="lfw-method"]:checked');
            const method = (methodEl && methodEl.value) || 'mailto';
            const subject = subjectEl.value;
            const body = bodyEl.value;
            const payload = caseLogPayload(item, client, spzn, cj, subject);

            // zapamatuj vazbu pro příště
            await saveMap(updateMap(map, spzn, senderId, clientId));

            if (method === 'smtp') {
                // Odešle SERVER (LexisLocal) i s přílohou → do spisu zapíše sám (pravdivě).
                const btn = $('#lfw-send'); btn.disabled = true; btn.textContent = 'Odesílám…';
                const r = await smtpSend(Object.assign({}, payload, {
                    to: client.email, subject, body, attachmentPaths: attachPaths
                }));
                closeModal();
                if (r.ok) {
                    toast(r.linkedToCase
                        ? '✅ Odesláno klientovi (i s přílohou) a zapsáno do timeline spisu.'
                        : '✅ Odesláno klientovi (i s přílohou). Bez sp. zn. se to nenavázalo na konkrétní spis.');
                } else if (r.code === 'SMTP_CONFIG') {
                    toast('⚠️ ' + (r.error || 'SMTP není nastavené.') + ' Zvol „Otevřít v poště" nebo doplň SMTP v LexisLocalu.');
                } else if (r.reason === 'no-conn') {
                    toast('⚠️ LexisLocal neběží — přes SMTP nelze odeslat. Zvol „Otevřít v poště".');
                } else {
                    toast('⚠️ Odeslání přes SMTP selhalo: ' + (r.error || r.reason || 'neznámá chyba'));
                }
                return;
            }

            if (method === 'native') {
                // Nové okno pošty s přílohou (Apple Mail / Outlook). Advokát pak odešle
                // ručně → do spisu zapíšeme až po jeho potvrzení.
                let opened = false;
                if (window.electronAPI && window.electronAPI.composeEmailAttach) {
                    const r = await window.electronAPI.composeEmailAttach({
                        to: client.email, subject, body, attachmentPaths: attachPaths
                    });
                    opened = !!(r && r.success);
                    if (!opened) toast('Nepodařilo se otevřít poštu s přílohou (' + ((r && r.error) || 'není Apple Mail/Outlook') + ') — otevírám přes mailto (přílohu přilož ručně).');
                }
                if (!opened) openMail(toMailto(client.email, subject, body)); // fallback
                showConfirmStep(overlay, payload, spzn);
                return;
            }

            // method === 'mailto' — otevře poštu bez přílohy; zápis až po potvrzení.
            openMail(toMailto(client.email, subject, body));
            showConfirmStep(overlay, payload, spzn);
        };
    }

    // Nahradí obsah modalu potvrzovacím krokem (po otevření pošty).
    function showConfirmStep(overlay, payload, spzn) {
        const card = overlay.firstElementChild;
        if (!card) { closeModal(); return; }
        const spisTxt = spzn ? `spisu <b>${esc(spzn)}</b>` : 'záznamů (bez sp. zn. — nenaváže se na konkrétní spis)';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <strong style="font-size:15px;color:#0f172a;">📨 Otevřeno v poště</strong>
                <button id="lfw-x2" style="border:none;background:none;font-size:20px;color:#94a3b8;cursor:pointer;">×</button>
            </div>
            <div style="font-size:13px;color:#334155;line-height:1.6;margin-bottom:16px;">
                E-mail pro <b>${esc(payload.recipientEmail)}</b> je připravený v tvém poštovním klientu.<br><br>
                Až ho tam <b>skutečně odešleš</b>, potvrď to — zapíšu do ${spisTxt} v LexisLocalu, že byl klientovi odeslán.
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="lfw-notyet" style="padding:9px 14px;border:1px solid #cbd5e1;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:13px;color:#475569;">Ještě neodesláno</button>
                <button id="lfw-confirm" style="padding:9px 16px;border:1px solid #16a34a;background:#16a34a;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">✓ Odesláno — zapiš do spisu</button>
            </div>`;
        const q = s => card.querySelector(s);
        q('#lfw-x2').onclick = closeModal;
        q('#lfw-notyet').onclick = closeModal;
        q('#lfw-confirm').onclick = async () => {
            const btn = q('#lfw-confirm');
            btn.disabled = true; btn.textContent = 'Zapisuji…';
            const r = await logToCase(payload);
            closeModal();
            if (r.ok) {
                toast(r.linkedToCase
                    ? '✅ Zapsáno do spisu — odeslání e-mailu klientovi je v timeline spisu.'
                    : '✅ Zapsáno do auditu (bez sp. zn. se to nenavázalo na konkrétní spis).');
            } else if (r.reason === 'no-conn') {
                toast('⚠️ LexisLocal neběží nebo není nastavený — e-mail se do spisu nezapsal. (E-mail v poště tím není dotčen.)');
            } else {
                toast('⚠️ Zápis do spisu se nepodařil: ' + (r.reason || 'neznámá chyba') + '. E-mail v poště tím není dotčen.');
            }
        };
    }

    window.LexisForward = {
        open,
        // vystaveno pro testy:
        _suggestClient: suggestClient,
        _updateMap: updateMap,
        _buildEmail: buildEmail,
        _toMailto: toMailto,
        _normSpzn: normSpzn,
        _caseLogPayload: caseLogPayload
    };
})();
