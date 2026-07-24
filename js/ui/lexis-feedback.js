/* global window, document, navigator */
/**
 * LexisFeedback — nahlášení chyby / zpětná vazba pro beta testery.
 * Posbírá verzi aplikace, OS a posledních pár zachycených chyb a připojí popis
 * od uživatele. Bez serveru: uživatel report zkopíruje nebo pošle e-mailem.
 * Cílová e-mailová adresa se bere z konfigurace edice (supportEmail) nebo z
 * window.LEXIS_SUPPORT_EMAIL — není natvrdo v kódu.
 */
(function () {
    'use strict';

    // Cílová adresa pro chybové reporty. Není natvrdo — bere se (v tomto pořadí):
    //  1) window.LEXIS_SUPPORT_EMAIL (přepis z buildu/nasazení),
    //  2) supportEmail z konfigurace edice (js/core/lexis-edition.js — brand = config),
    //  3) fallback placeholder.
    function reportEmail() {
        return window.LEXIS_SUPPORT_EMAIL
            || (window.Edition && window.Edition.supportEmail)
            || 'podpora@lexiseditor.cz';
    }

    // Kruhový buffer posledních chyb (zachytává window.onerror a nezachycené promise).
    const _errors = [];
    function pushErr(msg) {
        _errors.push(new Date().toISOString().slice(11, 19) + ' ' + String(msg).slice(0, 300));
        if (_errors.length > 15) _errors.shift();
    }
    window.addEventListener('error', (e) => pushErr((e && e.message) || 'error'));
    window.addEventListener('unhandledrejection', (e) => pushErr('promise: ' + ((e && e.reason && e.reason.message) || e.reason || 'rejection')));

    function appVersion() {
        const el = document.getElementById('app-version') || document.querySelector('[data-app-version]');
        if (el) return (el.textContent || el.getAttribute('data-app-version') || '').trim();
        return (window.LEXIS_VERSION || '?');
    }

    function buildReport(desc) {
        return [
            'LexisEditor — hlášení chyby',
            '----------------------------',
            'Verze: ' + appVersion(),
            'Systém: ' + (navigator.platform || '?') + ' | ' + (navigator.userAgent || ''),
            'Čas: ' + new Date().toISOString(),
            '',
            'Popis od uživatele:',
            (desc || '(nevyplněno)'),
            '',
            'Poslední zachycené chyby:',
            (_errors.length ? _errors.join('\n') : '(žádné)')
        ].join('\n');
    }

    window.openFeedback = function () {
        const ov = document.createElement('div');
        ov.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        const card = document.createElement('div');
        card.style = 'background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:480px; padding:24px; font-family:Inter,sans-serif;';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <h2 style="margin:0; font-size:17px; color:#0f172a;">🐞 Nahlásit chybu / zpětná vazba</h2>
                <button id="fb-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <p style="margin:0 0 12px; font-size:12px; color:#64748b;">Popište, co se stalo (co jste dělal/a, co jste čekal/a a co se stalo místo toho). Verzi a systém přidáme automaticky.</p>
            <textarea id="fb-desc" rows="6" placeholder="Popis chyby…" style="width:100%; box-sizing:border-box; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; resize:vertical;"></textarea>
            <div id="fb-result" style="font-size:12px; margin:10px 0; min-height:16px;"></div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button id="fb-copy" style="padding:10px 14px; border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:8px; cursor:pointer; font-size:13px;">Zkopírovat report</button>
                <button id="fb-send" style="padding:10px 16px; border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;">Odeslat e-mailem</button>
            </div>`;
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);

        const setResult = (html, ok) => { card.querySelector('#fb-result').innerHTML = `<span style="color:${ok ? '#16a34a' : '#dc2626'};">${html}</span>`; };
        card.querySelector('#fb-close').onclick = () => ov.remove();

        card.querySelector('#fb-copy').onclick = async () => {
            const report = buildReport(card.querySelector('#fb-desc').value.trim());
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(report);
                else { const ta = document.createElement('textarea'); ta.value = report; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
                setResult('✅ Report zkopírován do schránky — vložte ho do e-mailu nebo zprávy.', true);
            } catch (e) { setResult('❌ Kopírování selhalo: ' + e.message, false); }
        };

        card.querySelector('#fb-send').onclick = () => {
            const report = buildReport(card.querySelector('#fb-desc').value.trim());
            const url = 'mailto:' + encodeURIComponent(reportEmail())
                + '?subject=' + encodeURIComponent('LexisEditor — hlášení chyby (v' + appVersion() + ')')
                + '&body=' + encodeURIComponent(report);
            // V Electronu spolehlivě přes shell.openExternal (nové okno pošty),
            // v prohlížeči fallback na window.open.
            if (window.electronAPI && window.electronAPI.openExternalUrl) window.electronAPI.openExternalUrl(url);
            else window.open(url, '_blank');
            setResult('✅ Otevírám e-mailový klient. Kdyby se neotevřel, použijte „Zkopírovat report".', true);
        };
    };
})();
