/**
 * compare.js — „Porovnat dokumenty" (redline). Ze dvou verzí textu vytvoří
 * sloučený dokument se SLEDOVANÝMI ZMĚNAMI: co přibylo → ql-insertion,
 * co ubylo → ql-deletion. Výsledek se načte do editoru (blots je rozpoznají)
 * a exportuje se jako wordovské w:ins/w:del (viz delta-to-model / model-to-docx).
 *
 * Postup: nejdřív LCS na řádcích (odstavcích); souvislý blok „smazáno pak
 * vloženo" se považuje za ZMĚNU a porovná se ještě po slovech (inline redline).
 * Čistá funkce (bez DOM) → testovatelné; v prohlížeči se navěsí na window.
 */
(function (root) {
    'use strict';

    function _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function _escAttr(s) { return _esc(s).replace(/"/g, '&quot;'); }

    // LCS diff dvou polí → bloky {t:'='|'-'|'+', v:[...]}. Pole jsou malá (řádky
    // dokumentu nebo slova jednoho změněného odstavce), takže DP je bezpečné.
    function _lcsDiff(a, b) {
        const n = a.length, m = b.length;
        const dp = new Array(n + 1);
        for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i][j] = (a[i] === b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        const out = [];
        const push = (t, v) => {
            const last = out[out.length - 1];
            if (last && last.t === t) last.v.push(v); else out.push({ t: t, v: [v] });
        };
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) { push('=', a[i]); i++; j++; }
            else if (dp[i + 1][j] >= dp[i][j + 1]) { push('-', a[i]); i++; }
            else { push('+', b[j]); j++; }
        }
        while (i < n) { push('-', a[i]); i++; }
        while (j < m) { push('+', b[j]); j++; }
        return out;
    }

    function _tokenizeWords(text) {
        return String(text).match(/\s+|[^\s]+/g) || [];
    }

    function compareTexts(originalText, revisedText, opts) {
        opts = opts || {};
        const author = opts.author || 'Advokát';
        const date = opts.date || null; // datum doplní volající prostředí (Node/browser)
        const attr = ` data-author="${_escAttr(author)}"` + (date ? ` data-date="${_escAttr(date)}"` : '');
        const INS = (t) => `<span class="ql-insertion"${attr}>${t}</span>`;
        const DEL = (t) => `<span class="ql-deletion"${attr}>${t}</span>`;
        const para = (inner) => `<p>${inner || '<br>'}</p>`;

        const wordDiff = (delText, insText) => {
            const blocks = _lcsDiff(_tokenizeWords(delText), _tokenizeWords(insText));
            let s = '';
            blocks.forEach(b => {
                const text = _esc(b.v.join(''));
                if (b.t === '=') s += text;
                else if (b.t === '-') s += DEL(text);
                else s += INS(text);
            });
            return s;
        };

        const oLines = String(originalText == null ? '' : originalText).replace(/\r/g, '').split('\n');
        const rLines = String(revisedText == null ? '' : revisedText).replace(/\r/g, '').split('\n');
        const blocks = _lcsDiff(oLines, rLines);

        let html = '';
        for (let k = 0; k < blocks.length; k++) {
            const blk = blocks[k];
            if (blk.t === '=') {
                blk.v.forEach(line => { html += para(_esc(line)); });
            } else if (blk.t === '-') {
                const next = blocks[k + 1];
                if (next && next.t === '+') {
                    // ZMĚNA: smazaný blok následovaný vloženým → inline word-diff.
                    if (blk.v.length === next.v.length) {
                        for (let x = 0; x < blk.v.length; x++) html += para(wordDiff(blk.v[x], next.v[x]));
                    } else {
                        html += para(wordDiff(blk.v.join(' '), next.v.join(' ')));
                    }
                    k++; // spotřebuj následující '+'
                } else {
                    blk.v.forEach(line => { html += para(DEL(_esc(line))); });
                }
            } else { // '+'
                blk.v.forEach(line => { html += para(INS(_esc(line))); });
            }
        }
        return html || '<p><br></p>';
    }

    const api = { compareTexts, _lcsDiff };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LexisCompare = api;
})(typeof window !== 'undefined' ? window : null);
