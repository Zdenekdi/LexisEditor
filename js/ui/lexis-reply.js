/* global window, document */
/**
 * LexisReply — vytvoření odpovědi na jedno kliknutí.
 * Z otevřeného dokumentu vytáhne náležitosti úředního podání (adresát/subjekt,
 * spisová značka, číslo jednací, Věc, IČO), nechá je zkontrolovat a vygeneruje
 * odpověď s hlavičkou. Když se nic nenajde, předvyplní aspoň identifikaci subjektu.
 */
(function () {
    'use strict';

    function ui() { return window.lexisUI || null; }
    function toast(m) { const u = ui(); if (u && u.customAlert) u.customAlert(m); else alert(m); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function docText() {
        const core = window.lexisCore;
        if (core && core.getText) return core.getText();
        const ed = document.querySelector('.ql-editor');
        return ed ? ed.innerText : '';
    }

    // Detekce soudu (stejná logika jako v editoru).
    function detectCourt(text) {
        if (!text || !Array.isArray(window.COURT_PATTERNS)) return null;
        const norm = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        for (const c of window.COURT_PATTERNS) {
            try { if (new RegExp(c.pattern, 'i').test(norm)) return c; } catch (e) {}
        }
        return null;
    }

    function firstMatch(text, regexes) {
        for (const re of regexes) {
            const m = text.match(re);
            if (m && m[1]) return m[1].trim().replace(/\s+/g, ' ');
        }
        return '';
    }

    // Vytáhne náležitosti z textu dokumentu (funguje na JAKÉMKOLI dokumentu
    // otevřeném v editoru, nejen na datové zprávě).
    function extract(text) {
        // Spisová značka — varianty „sp. zn.", „spis. zn.", „spisová značka",
        // „Naše/Vaše sp. zn." + samostatný vzor „12 C 34/2026".
        const spzn = firstMatch(text, [
            /(?:na[šs]e\s+|va[šs]e\s+)?sp(?:\.|is(?:\.|ov[áa]))?\s*zn(?:\.|a[čc]ka)?\s*[:.]?\s*([0-9]+\s*[A-Za-zÀ-ž]{1,6}\s*[0-9]+\s*\/\s*[0-9]{2,4})/i,
            /\b([0-9]+\s+[A-Za-zÀ-ž]{1,5}\s+[0-9]+\s*\/\s*[0-9]{2,4})\b/
        ]);
        // Číslo jednací — „č.j.", „č. j.", „čj", „Č.j.", „číslo jednací",
        // volitelně s „Naše/Vaše". Accentovaná forma je bezpečná; ASCII „c.j."
        // vyžaduje tečku, aby nechytalo prózu typu „Věc je…".
        const cj = firstMatch(text, [
            /(?:na[šs]e\s+|va[šs]e\s+)?[čČ]\.?\s*j\.?\s*[:.]?\s*([A-Za-z0-9][^\n]{1,58})/i,
            /(?:na[šs]e\s+|va[šs]e\s+)?[cC]\s*\.\s*j\.?\s*[:.]?\s*([A-Za-z0-9][^\n]{1,58})/,
            /[čcČC][íi]slo\s+jednac[íi]\s*[:.]?\s*([A-Za-z0-9][^\n]{1,58})/i
        ]);
        const ico = firstMatch(text, [/I[ČC]O?\s*[:.]?\s*([0-9]{8})\b/i, /\b([0-9]{8})\b/]);
        const vec = firstMatch(text, [/V[ěe]c\s*[:.]?\s+([^\n]{3,120})/i]);
        const court = detectCourt(text);
        // Identifikace subjektu, kterému odpovídáme: přednostně soud, jinak Věc/IČO.
        let subject = '';
        if (court) {
            subject = court.nazev;
            try {
                if (window.LexisCourtISDS && window.LexisCourtISDS.findCourtInRegistry) {
                    const reg = window.LexisCourtISDS.findCourtInRegistry(court.nazev);
                    if (reg) subject = reg.nazev + (reg.adresa ? ', ' + reg.adresa + ', ' + (reg.psc || '') + ' ' + (reg.mesto || '') : '');
                }
            } catch (e) {}
        }
        return { subject, court: court ? court.nazev : '', spzn, cj, ico, vec };
    }

    // Sestaví HTML odpovědi s hlavičkou (náležitosti + tělo).
    function buildReplyHtml(f) {
        const lines = [];
        lines.push(`<p><strong>${f.subject ? esc(f.subject) : '[Adresát – doplňte]'}</strong></p>`);
        lines.push('<p><br></p>');
        const refs = [];
        if (f.spzn) refs.push('Ke sp. zn.: ' + esc(f.spzn));
        if (f.cj) refs.push('Č. j.: ' + esc(f.cj));
        if (f.ico) refs.push('IČO: ' + esc(f.ico));
        if (refs.length) lines.push('<p>' + refs.join('<br>') + '</p>');
        lines.push(`<p><strong>Věc: ${f.vec ? 'Odpověď – ' + esc(f.vec) : 'Odpověď'}</strong></p>`);
        lines.push('<p><br></p>');
        lines.push('<p>Vážení,</p>');
        lines.push('<p><br></p>');
        lines.push('<p>[Text odpovědi]</p>');
        lines.push('<p><br></p>');
        lines.push('<p>S pozdravem,</p>');
        return lines.join('');
    }

    function overlay(inner, w) {
        const ov = document.createElement('div');
        ov.style = 'position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
        const card = document.createElement('div');
        card.style = `background:#fff; border-radius:14px; box-shadow:0 20px 40px -10px rgba(0,0,0,0.35); width:100%; max-width:${w || 520}px; max-height:88vh; overflow:auto; padding:22px;`;
        card.innerHTML = inner;
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
        return { ov, card };
    }

    // Hlavní akce — vytvoření odpovědi.
    window.createReplyFromDocument = function () {
        if (!window.lexisCore || !window.lexisCore.setContent) { toast('Editor není připraven.'); return; }
        const f = extract(docText());
        const row = (label, id, val) => `
            <label style="font-size:12px; font-weight:700; color:#334155;">${label}</label>
            <input id="${id}" value="${esc(val)}" style="width:100%; box-sizing:border-box; padding:8px; margin:3px 0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">`;
        const { ov, card } = overlay(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h2 style="margin:0; font-size:16px; color:#0f172a;">↩️ Vytvořit odpověď</h2>
                <button id="rp-close" style="border:none; background:#f1f5f9; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="font-size:11px; color:#64748b; margin-bottom:12px;">Zkontrolujte náležitosti vytažené z dokumentu. Prázdná pole se do hlavičky nedají.</div>
            ${row('Adresát / subjekt', 'rp-subject', f.subject)}
            ${row('Spisová značka', 'rp-spzn', f.spzn)}
            ${row('Číslo jednací (č. j.)', 'rp-cj', f.cj)}
            ${row('Věc', 'rp-vec', f.vec)}
            ${row('IČO', 'rp-ico', f.ico)}
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;">
                <button id="rp-cancel" style="padding:9px 14px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; font-size:12px;">Zrušit</button>
                <button id="rp-create" style="padding:9px 16px; border:none; background:#2563eb; color:#fff; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;">Vytvořit odpověď</button>
            </div>`, 520);
        card.querySelector('#rp-close').onclick = () => ov.remove();
        card.querySelector('#rp-cancel').onclick = () => ov.remove();
        card.querySelector('#rp-create').onclick = () => {
            const data = {
                subject: card.querySelector('#rp-subject').value.trim(),
                spzn: card.querySelector('#rp-spzn').value.trim(),
                cj: card.querySelector('#rp-cj').value.trim(),
                vec: card.querySelector('#rp-vec').value.trim(),
                ico: card.querySelector('#rp-ico').value.trim()
            };
            if (!window.confirm('Vytvoření odpovědi nahradí aktuální obsah editoru. Doporučujeme původní dokument nejdřív uložit. Pokračovat?')) return;
            window.lexisCore.setContent(buildReplyHtml(data));
            ov.remove();
            toast('↩️ Odpověď vytvořena — doplňte text a odešlete datovkou.');
        };
    };
})();
