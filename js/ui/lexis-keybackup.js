/* global window, document */
/**
 * LexisKeyBackup — záloha a obnova šifrovacího klíče k datům.
 * Klíč leží mimo datovou složku (~/.lexislocal/lexis.key), aby se nesynchronizoval
 * s daty do cloudu. Důsledek: bez klíče nejdou data dešifrovat. Tento dialog
 * umožní klíč zálohovat na bezpečné místo a v případě potřeby obnovit ze zálohy.
 */
(function () {
    'use strict';

    function api() { return window.electronAPI || null; }
    function toast(m) { const u = window.lexisUI; if (u && u.customAlert) u.customAlert(m); else alert(m); }

    window.openKeyBackup = async function () {
        if (!api() || !api().keyStatus) {
            toast('Záloha klíče je dostupná jen v desktopové aplikaci.');
            return;
        }
        let st = {};
        try { st = (await api().keyStatus()) || {}; } catch (e) {}

        const ov = document.createElement('div');
        ov.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        const card = document.createElement('div');
        card.style = 'background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:460px; padding:24px; font-family:Inter,sans-serif;';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <h2 style="margin:0; font-size:17px; color:#0f172a;">🔐 Záloha šifrovacího klíče</h2>
                <button id="kb-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; border-radius:10px; padding:12px; font-size:12px; line-height:1.5; margin:10px 0 16px;">
                <b>Důležité:</b> Vaše data (databáze, spisy, audit) jsou šifrovaná tímto klíčem.
                Klíč <b>neleží</b> u dat (kvůli bezpečnosti), takže se s daty nezálohuje sám.
                <b>Bez klíče nejdou data obnovit.</b> Uložte zálohu klíče na bezpečné, oddělené místo
                (např. šifrovaný USB disk nebo správce hesel), ne do stejné složky jako spisy.
            </div>
            <div style="font-size:12px; color:#334155; margin-bottom:16px;">
                Stav klíče: ${st.exists ? '✅ existuje' : '⚠️ zatím neexistuje (spusťte LexisLocal)'}
                ${st.fingerprint ? `<br><span style="color:#64748b;">otisk: ${st.fingerprint}</span>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button id="kb-backup" style="padding:11px 16px; border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;">Zálohovat klíč do souboru…</button>
                <button id="kb-restore" style="padding:11px 16px; border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">Obnovit klíč ze zálohy…</button>
            </div>
            <div id="kb-result" style="font-size:12px; margin-top:12px; min-height:16px;"></div>`;
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);

        const setResult = (html, ok) => { card.querySelector('#kb-result').innerHTML = `<span style="color:${ok ? '#16a34a' : '#dc2626'};">${html}</span>`; };
        card.querySelector('#kb-close').onclick = () => ov.remove();

        card.querySelector('#kb-backup').onclick = async () => {
            try {
                const r = await api().keyBackup();
                if (r && r.success) setResult('✅ Klíč zálohován. Uložte soubor na bezpečné místo.', true);
                else if (!r || !r.canceled) setResult('❌ ' + ((r && r.error) || 'Záloha selhala.'), false);
            } catch (e) { setResult('❌ ' + e.message, false); }
        };

        card.querySelector('#kb-restore').onclick = async () => {
            if (!window.confirm('Obnovení přepíše stávající klíč. Data zašifrovaná jiným klíčem pak nepůjdou přečíst. Pokračovat?')) return;
            try {
                const r = await api().keyRestore();
                if (r && r.success) setResult('✅ Klíč obnoven (otisk: ' + (r.fingerprint || '?') + '). Restartujte LexisLocal.', true);
                else if (!r || !r.canceled) setResult('❌ ' + ((r && r.error) || 'Obnova selhala.'), false);
            } catch (e) { setResult('❌ ' + e.message, false); }
        };
    };
})();
