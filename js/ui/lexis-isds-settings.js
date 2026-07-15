/* global window, document */
/**
 * LexisIsdsSettings — nastavení připojení k datové schránce (ISDS).
 * Umožní advokátovi zadat přihlašovací údaje (jméno+heslo) NEBO klientský
 * certifikát (.p12), zvolit prostředí (test czebox / produkce) a ověřit spojení
 * bez odeslání jakékoli zprávy (GetOwnerInfoFromLogin). Konfiguraci ukládá
 * bezpečně (heslo šifruje systémovým safeStorage v main procesu).
 */
(function () {
    'use strict';

    function api() { return window.electronAPI || null; }
    function toast(m) {
        const u = window.lexisUI;
        if (u && u.customAlert) u.customAlert(m); else alert(m);
    }
    function esc(v) { return String(v == null ? '' : v).replace(/"/g, '&quot;'); }

    window.openIsdsSettings = async function () {
        if (!api() || !api().getIsdsConfig) {
            toast('Nastavení datové schránky je dostupné jen v desktopové aplikaci.');
            return;
        }
        let cfg = {};
        try { cfg = (await api().getIsdsConfig()) || {}; } catch (e) {}
        const env = cfg.environment || 'production';
        let certPath = cfg.certPath || '';

        const ov = document.createElement('div');
        ov.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        const card = document.createElement('div');
        card.style = 'background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:480px; max-height:90vh; overflow:auto; padding:24px; font-family:Inter,sans-serif;';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <h2 style="margin:0; font-size:17px; color:#0f172a;">📨 Nastavení datové schránky</h2>
                <button id="is-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <p style="margin:0 0 16px; font-size:12px; color:#64748b;">Připojení k ISDS. „Ověřit spojení" nic neodesílá — jen zkontroluje přihlášení.</p>

            <label style="display:block; font-size:11px; font-weight:700; color:#334155; margin-bottom:4px;">Prostředí</label>
            <select id="is-env" style="width:100%; box-sizing:border-box; padding:9px; margin-bottom:14px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
                <option value="test" ${env === 'test' ? 'selected' : ''}>Testovací (czebox)</option>
                <option value="production" ${env === 'production' ? 'selected' : ''}>Produkce (ostrý provoz)</option>
            </select>

            <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:12px;">
                <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px;">Přihlášení jménem a heslem</div>
                <input id="is-login" placeholder="Přihlašovací jméno" value="${esc(cfg.login)}" style="width:100%; box-sizing:border-box; padding:9px; margin-bottom:8px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
                <input id="is-pass" type="password" placeholder="Heslo" value="${esc(cfg.password)}" style="width:100%; box-sizing:border-box; padding:9px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            </div>

            <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:16px;">
                <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px;">Volitelně: přihlášení certifikátem (.p12)</div>
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                    <button id="is-cert-pick" style="padding:8px 12px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600;">Vybrat .p12…</button>
                    <button id="is-cert-clear" style="padding:8px 10px; background:#fff; color:#64748b; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; font-size:12px;">Odebrat</button>
                    <span id="is-cert-path" style="font-size:11px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${certPath ? esc(certPath) : 'nevybráno'}</span>
                </div>
                <input id="is-cert-pass" type="password" placeholder="Heslo k certifikátu" style="width:100%; box-sizing:border-box; padding:9px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            </div>

            <div id="is-result" style="font-size:12px; margin-bottom:12px; min-height:16px;"></div>

            <div style="display:flex; justify-content:space-between; gap:8px;">
                <button id="is-test" style="padding:10px 14px; border:1px solid #2563eb; background:#fff; color:#2563eb; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;">Ověřit spojení</button>
                <div style="display:flex; gap:8px;">
                    <button id="is-cancel" style="padding:10px 14px; border:1px solid #cbd5e1; background:#fff; color:#475569; border-radius:8px; cursor:pointer; font-size:13px;">Zrušit</button>
                    <button id="is-save" style="padding:10px 16px; border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;">Uložit</button>
                </div>
            </div>`;
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);

        const $ = (id) => card.querySelector(id);
        const setResult = (html, ok) => { $('#is-result').innerHTML = `<span style="color:${ok ? '#16a34a' : '#dc2626'};">${html}</span>`; };

        $('#is-close').onclick = () => ov.remove();
        $('#is-cancel').onclick = () => ov.remove();

        $('#is-cert-pick').onclick = async () => {
            try {
                const r = await api().pickIsdsCert();
                if (r && !r.canceled && r.path) { certPath = r.path; $('#is-cert-path').textContent = certPath; }
            } catch (e) { setResult('Nepodařilo se vybrat certifikát.', false); }
        };
        $('#is-cert-clear').onclick = () => { certPath = ''; $('#is-cert-path').textContent = 'nevybráno'; };

        function buildCreds() {
            return {
                login: $('#is-login').value.trim(),
                pass: $('#is-pass').value,
                env: $('#is-env').value,
                certPath: certPath || undefined,
                certPass: $('#is-cert-pass').value || undefined
            };
        }

        $('#is-test').onclick = async () => {
            setResult('Ověřuji…', true);
            try {
                const res = await api().testIsdsConnection(buildCreds());
                if (res && res.success) setResult('✅ Spojení OK — schránka: <b>' + esc(res.owner) + '</b>', true);
                else setResult('❌ ' + esc((res && res.error) || 'Přihlášení selhalo.'), false);
            } catch (e) { setResult('❌ ' + esc(e.message), false); }
        };

        $('#is-save').onclick = async () => {
            try {
                const r = await api().saveIsdsConfig({
                    login: $('#is-login').value.trim(),
                    password: $('#is-pass').value,
                    environment: $('#is-env').value,
                    certPath: certPath || undefined,
                    certPassphrase: $('#is-cert-pass').value || undefined
                });
                if (r && r.success) { ov.remove(); toast('✅ Nastavení datové schránky uloženo.'); }
                else setResult('❌ Uložení selhalo: ' + esc((r && r.error) || ''), false);
            } catch (e) { setResult('❌ ' + esc(e.message), false); }
        };
    };
})();
