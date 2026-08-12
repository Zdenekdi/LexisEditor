/* global window, document, fetch, localStorage, AbortController, setTimeout, clearTimeout */
/**
 * lexis-research.js — Externí rešerše (volitelný, opt-in).
 * -----------------------------------------------------------------------------
 * Registr poskytovatelů externí právní rešerše přes jejich veřejná rozhraní.
 * Fáze 1: dva poskytovatelé
 *   • LawGPT.cz  — veřejné REST API (CORS, bez účtu, zdarma). PLNĚ FUNKČNÍ.
 *   • DirectCase — MCP + OAuth (vlastní účet uživatele). Scaffold; přihlášení
 *                  (OAuth v Electron main procesu + SafeStorage) se doplní ve
 *                  Fázi 1b, do té doby hlásí „vyžaduje přihlášení".
 *
 * BEZPEČNOST / SOUKROMÍ:
 *   - Vše je CLOUD → napětí s „offline/datová suverenita". Proto:
 *     * výchozí stav = VYPNUTO (feature flag v localStorage, NE credentials),
 *     * první použití vyžaduje explicitní souhlas (opt-in upozornění),
 *     * u každé akce i výsledku je marker „☁ Cloud · <poskytovatel>",
 *     * do rešerše jde jen uživatelem označený text, ne celý spis; před
 *       odesláním se nabídne anonymizace (pokud je k dispozici GDPR Shield).
 *   - Žádné právní obsahy se nevymýšlejí — vrací se jen to, co poskytovatel
 *     skutečně dohledá, s odkazem na zdroj.
 * -----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var LS_ENABLED = 'lexis_research_enabled';   // '1' | '0'  (výchozí vypnuto)
  var LS_PROVIDER = 'lexis_research_provider';  // id aktivního poskytovatele
  var LS_OPTIN = 'lexis_research_optin_ack';    // '1' po odsouhlasení cloud upozornění

  // ---------------------------------------------------------------------------
  // Pomůcky pro dialogy (využijí LexisDialogs, jinak nativní fallback)
  // ---------------------------------------------------------------------------
  function alertMsg(html) {
    if (typeof window.customAlert === 'function') return window.customAlert(html);
    try { window.alert(String(html).replace(/<[^>]+>/g, '')); } catch (e) { /* noop */ }
    return Promise.resolve();
  }
  function confirmMsg(html) {
    if (typeof window.customConfirm === 'function') return Promise.resolve(window.customConfirm(html));
    try { return Promise.resolve(window.confirm(String(html).replace(/<[^>]+>/g, ''))); } catch (e) { return Promise.resolve(false); }
  }
  function promptMsg(html, def) {
    if (typeof window.customPrompt === 'function') return Promise.resolve(window.customPrompt(html, def));
    try { return Promise.resolve(window.prompt(String(html).replace(/<[^>]+>/g, ''), def || '')); } catch (e) { return Promise.resolve(null); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function openUrl(url) {
    if (!url) return;
    if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
      window.electronAPI.openExternalUrl(url);
    } else {
      try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Poskytovatel: LawGPT.cz (veřejné REST, CORS, bez autentizace)
  //   Judikatura: GET /api/judgments/search?q=&source=all|court|nalus&limit=
  //   Zákony:     GET /api/esbirka/search?q=&in=titles|content|all&limit=
  // ---------------------------------------------------------------------------
  function lawgptGet(path, params) {
    var qs = Object.keys(params)
      .filter(function (k) { return params[k] != null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    var url = 'https://lawgpt.cz' + path + (qs ? '?' + qs : '');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, { method: 'GET', signal: ctrl.signal, headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('LawGPT vrátil status ' + r.status);
        return r.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  var LawGPT = {
    id: 'lawgpt',
    nazev: 'LawGPT.cz',
    typ: 'zdarma',
    auth: 'none',
    cloud: true,
    ready: true,
    popis: 'Veřejná databáze zdarma — eSbírka (zákony) + judikatura soudů a Ústavního soudu. Bez přihlášení.',
    searchJudgments: function (q, limit) {
      return lawgptGet('/api/judgments/search', { q: q, source: 'all', limit: limit || 6 });
    },
    searchLaws: function (q, limit) {
      return lawgptGet('/api/esbirka/search', { q: q, in: 'all', limit: limit || 6 });
    }
  };

  // ---------------------------------------------------------------------------
  // Poskytovatel: DirectCase (MCP + OAuth) — scaffold, přihlášení ve Fázi 1b
  // ---------------------------------------------------------------------------
  var DirectCaseNotReady = 'DirectCase vyžaduje přihlášení vaším účtem (OAuth). '
    + 'Toto propojení se dokončuje v další fázi — zatím prosím použijte poskytovatele LawGPT.cz.';

  var DirectCase = {
    id: 'directcase',
    nazev: 'DirectCase',
    typ: 'premium',
    auth: 'oauth',
    cloud: true,
    ready: false,
    popis: 'Široká ověřená databáze (~1,39 mil. zdrojů). Vyžaduje vlastní účet DirectCase (přihlášení přes OAuth).',
    note: DirectCaseNotReady,
    // MCP endpoint pro budoucí napojení (main proces): https://mcp.directcase.ai
    endpoint: 'https://mcp.directcase.ai',
    searchJudgments: function () { return Promise.reject(new Error(DirectCaseNotReady)); },
    searchLaws: function () { return Promise.reject(new Error(DirectCaseNotReady)); }
  };

  var PROVIDERS = { lawgpt: LawGPT, directcase: DirectCase };
  var PROVIDER_ORDER = ['lawgpt', 'directcase'];

  // ---------------------------------------------------------------------------
  // Stav (feature flag — NE credentials)
  // ---------------------------------------------------------------------------
  function isEnabled() { try { return localStorage.getItem(LS_ENABLED) === '1'; } catch (e) { return false; } }
  function setEnabled(v) { try { localStorage.setItem(LS_ENABLED, v ? '1' : '0'); } catch (e) { /* noop */ } syncSettingsUI(); }
  function activeId() {
    var id;
    try { id = localStorage.getItem(LS_PROVIDER); } catch (e) { id = null; }
    return PROVIDERS[id] ? id : 'lawgpt';
  }
  function setActiveProvider(id) { if (PROVIDERS[id]) { try { localStorage.setItem(LS_PROVIDER, id); } catch (e) { /* noop */ } } syncSettingsUI(); }
  function activeProvider() { return PROVIDERS[activeId()]; }
  function optedIn() { try { return localStorage.getItem(LS_OPTIN) === '1'; } catch (e) { return false; } }
  function markOptedIn() { try { localStorage.setItem(LS_OPTIN, '1'); } catch (e) { /* noop */ } }

  // ---------------------------------------------------------------------------
  // Normalizace výsledků — pole odpovědi nejsou v dokumentaci pevně dána,
  // proto defenzivně zkoušíme běžné názvy a nikdy nepadáme.
  // ---------------------------------------------------------------------------
  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj && obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
    }
    return '';
  }
  function toArray(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    var cand = data.results || data.items || data.data || data.judgments || data.laws || data.hits || data.documents;
    if (Array.isArray(cand)) return cand;
    // jediný objekt → zabalit
    return [data];
  }
  function normalizeItem(it) {
    if (it == null) return { title: '', meta: '', snippet: '', url: '' };
    if (typeof it === 'string') return { title: '', meta: '', snippet: it, url: '' };
    var title = pick(it, ['title', 'nazev', 'name', 'heading', 'label']);
    var court = pick(it, ['court', 'soud', 'source']);
    var spzn = pick(it, ['spisova_znacka', 'spisovaZnacka', 'sp_zn', 'spzn', 'ecli', 'jednaci_cislo', 'cislo']);
    var date = pick(it, ['date', 'datum', 'rozhodnuti', 'decided', 'published']);
    var url = pick(it, ['url', 'link', 'odkaz', 'href', 'source_url', 'sourceUrl']);
    var snippet = pick(it, ['snippet', 'text', 'excerpt', 'vyrez', 'content', 'summary', 'preview', 'fragment']);
    var metaParts = [court, spzn, date].filter(function (x) { return x; });
    if (!title && spzn) title = String(spzn);
    if (!title && court) title = String(court);
    if (!title && snippet) title = String(snippet).slice(0, 80) + (String(snippet).length > 80 ? '…' : '');
    return {
      title: String(title || 'Výsledek'),
      meta: metaParts.join(' · '),
      snippet: String(snippet || ''),
      url: String(url || '')
    };
  }
  function normalizeList(data) { return toArray(data).map(normalizeItem); }

  // ---------------------------------------------------------------------------
  // Veřejné API (programové)
  // ---------------------------------------------------------------------------
  function ensureReady() {
    var p = activeProvider();
    if (!p) throw new Error('Není zvolen poskytovatel rešerše.');
    if (!p.ready) throw new Error(p.note || (p.nazev + ' není připraven.'));
    return p;
  }
  function verifyCitation(text) {
    var p = ensureReady();
    return Promise.resolve(p.searchJudgments(String(text || '').trim(), 6))
      .then(function (data) {
        return { provider: p.id, providerName: p.nazev, kind: 'citace', query: text, results: normalizeList(data) };
      });
  }
  function findCaseLaw(query) {
    var p = ensureReady();
    return Promise.resolve(p.searchJudgments(String(query || '').trim(), 8))
      .then(function (data) {
        return { provider: p.id, providerName: p.nazev, kind: 'judikatura', query: query, results: normalizeList(data) };
      });
  }
  function findLaw(query) {
    var p = ensureReady();
    return Promise.resolve(p.searchLaws(String(query || '').trim(), 6))
      .then(function (data) {
        return { provider: p.id, providerName: p.nazev, kind: 'zakon', query: query, results: normalizeList(data) };
      });
  }

  // ---------------------------------------------------------------------------
  // UI — společné části
  // ---------------------------------------------------------------------------
  function cloudBadge(providerName) {
    return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;'
      + 'color:var(--accent-text,#8a5320);background:var(--surface-2,#faf3e6);border:1px solid var(--border,#e5ddce);'
      + 'border-radius:999px;padding:2px 8px;white-space:nowrap;">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.98A6 6 0 0 0 6.2 9.3 4 4 0 0 0 6.5 19z"/></svg>'
      + 'Cloud · ' + esc(providerName) + '</span>';
  }

  function getSelectionText() {
    try {
      if (window.quill) {
        var range = window.quill.getSelection();
        if (range && range.length > 0) return window.quill.getText(range.index, range.length).trim();
      }
    } catch (e) { /* noop */ }
    return '';
  }

  // Jednorázový opt-in (cloud upozornění). Vrací Promise<boolean>.
  function ensureOptIn() {
    if (isEnabled() && optedIn()) return Promise.resolve(true);
    var p = activeProvider();
    var msg = '☁ <b>Externí rešerše je cloudová služba</b><br><br>'
      + 'Váš dotaz bude odeslán do služby <b>' + esc(p.nazev) + '</b> (servery v EU). '
      + '<b>Nejde o lokální/offline režim.</b> Neodesílejte citlivé osobní údaje klienta bez jeho souhlasu — '
      + 'před odesláním můžete text anonymizovat (GDPR Shield).<br><br>'
      + 'Zapnout externí rešerši a pokračovat?';
    return confirmMsg(msg).then(function (ok) {
      if (ok) { setEnabled(true); markOptedIn(); }
      return !!ok;
    });
  }

  // Nabídne anonymizaci, pokud je k dispozici GDPR Shield. Vrací Promise<string>.
  function maybeAnonymize(text) {
    var fn = (window.lexisUI && typeof window.lexisUI.anonymizeText === 'function')
      ? function (t) { return window.lexisUI.anonymizeText(t); }
      : (typeof window.anonymizeText === 'function' ? window.anonymizeText : null);
    if (!fn) return Promise.resolve(text);
    return confirmMsg('Chcete text před odesláním do cloudu <b>anonymizovat</b> (maskovat jména, rodná čísla, adresy)?')
      .then(function (yes) {
        if (!yes) return text;
        try { var out = fn(text); return (out && typeof out.then === 'function') ? out : Promise.resolve(out || text); }
        catch (e) { return text; }
      });
  }

  // Výsledkový modal
  function showResults(payload) {
    closeResults();
    var overlay = document.createElement('div');
    overlay.id = 'lexis-research-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Výsledky externí rešerše');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:21050;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:var(--surface,#fbf8f2);color:var(--ink,#2b2926);width:min(760px,94vw);max-height:86vh;border:1px solid var(--border,#e5ddce);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border,#e5ddce);background:var(--surface-2,#faf8f5);';
    var titleTxt = payload.kind === 'zakon' ? 'Zákony a ustanovení'
      : payload.kind === 'citace' ? 'Ověření citace' : 'Judikatura';
    head.innerHTML = '<span style="font-weight:700;font-size:13px;color:var(--ink)">' + esc(titleTxt) + '</span>' + cloudBadge(payload.providerName);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Zavřít');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;color:var(--text-muted,#77716a);cursor:pointer;line-height:1;padding:2px 6px;margin-left:6px;';
    head.appendChild(closeBtn);

    var body = document.createElement('div');
    body.style.cssText = 'padding:14px 18px;overflow-y:auto;';

    var html = '<p style="margin:0 0 12px;color:var(--text-muted,#77716a);font-size:12px">'
      + 'Dotaz: <b style="color:var(--text-2,#4a4640)">' + esc(payload.query) + '</b>'
      + ' &nbsp;•&nbsp; Vždy ověřte v primárním zdroji před citací v podání.</p>';

    if (!payload.results.length) {
      html += '<div style="padding:18px;text-align:center;color:var(--text-muted,#77716a);font-size:13px">'
        + 'Poskytovatel nevrátil žádné výsledky. Zkuste jiná klíčová slova nebo spisovou značku.</div>';
    } else {
      payload.results.forEach(function (r) {
        html += '<div style="border:1px solid var(--border,#e5ddce);border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--surface-2,#faf8f5)">'
          + '<div style="font-weight:700;font-size:13px;color:var(--ink);line-height:1.35">' + esc(r.title) + '</div>'
          + (r.meta ? '<div style="font-size:11.5px;color:var(--accent-text,#8a5320);margin-top:2px">' + esc(r.meta) + '</div>' : '')
          + (r.snippet ? '<div style="font-size:12.5px;color:var(--text-2,#4a4640);margin-top:5px;line-height:1.5">' + esc(r.snippet) + '</div>' : '')
          + (r.url ? '<div style="margin-top:7px"><a href="#" data-url="' + esc(r.url) + '" class="lexis-research-link" '
              + 'style="font-size:12px;color:var(--accent-text,#8a5320);text-decoration:underline;cursor:pointer">Otevřít zdroj →</a></div>' : '')
          + '</div>';
      });
    }
    body.innerHTML = html;

    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    body.querySelectorAll('.lexis-research-link').forEach(function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); openUrl(a.getAttribute('data-url')); });
    });
    function onKey(e) { if (e.key === 'Escape') closeResults(); }
    closeBtn.addEventListener('click', closeResults);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeResults(); });
    document.addEventListener('keydown', onKey);
    overlay._onKey = onKey;
    closeBtn.focus();
  }
  function closeResults() {
    var o = document.getElementById('lexis-research-overlay');
    if (o) {
      if (o._onKey) document.removeEventListener('keydown', o._onKey);
      if (o.parentNode) o.parentNode.removeChild(o);
    }
  }
  function showLoading(providerName, what) {
    closeResults();
    var overlay = document.createElement('div');
    overlay.id = 'lexis-research-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:21050;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    overlay.innerHTML = '<div style="background:var(--surface,#fbf8f2);color:var(--ink,#2b2926);border:1px solid var(--border,#e5ddce);'
      + 'border-radius:12px;padding:18px 22px;font-size:13px;box-shadow:0 20px 50px rgba(0,0,0,0.3);text-align:center">'
      + cloudBadge(providerName) + '<div style="margin-top:10px;color:var(--text-2,#4a4640)">Hledám ' + esc(what) + '…</div></div>';
    document.body.appendChild(overlay);
  }

  // Sdílený tok pro akce
  function runAction(kind) {
    var initial = getSelectionText();
    ensureOptIn().then(function (ok) {
      if (!ok) return;
      var promptTxt = kind === 'citace'
        ? 'Zadejte spisovou značku nebo citaci k ověření:'
        : (kind === 'zakon' ? 'Zadejte název zákona nebo klíčová slova:' : 'Zadejte právní otázku nebo klíčová slova:');
      var proceed = initial
        ? Promise.resolve(initial)
        : promptMsg(promptTxt, '');
      proceed.then(function (text) {
        text = (text || '').trim();
        if (!text) return;
        maybeAnonymize(text).then(function (finalText) {
          var p = activeProvider();
          if (!p.ready) { alertMsg('⚠️ ' + esc(p.note || (p.nazev + ' není připraven.'))); return; }
          showLoading(p.nazev, kind === 'zakon' ? 'v zákonech' : 'v judikatuře');
          var call = kind === 'citace' ? verifyCitation(finalText)
            : (kind === 'zakon' ? findLaw(finalText) : findCaseLaw(finalText));
          call.then(function (payload) { showResults(payload); })
            .catch(function (err) {
              closeResults();
              alertMsg('⚠️ <b>Rešerše selhala</b><br><br>' + esc((err && err.message) || 'Neznámá chyba spojení.')
                + '<br><br><span style="color:#a09a92;font-size:12px">Poskytovatel: ' + esc(p.nazev) + '</span>');
            });
        });
      });
    });
  }

  function uiVerifyCitation() { runAction('citace'); }
  function uiFindCaseLaw() { runAction('judikatura'); }
  function uiFindLaw() { runAction('zakon'); }

  // ---------------------------------------------------------------------------
  // Self-mount: sekce „Externí rešerše" do záložky Nastavení (#tab-settings)
  // ---------------------------------------------------------------------------
  function buildSettingsGroup() {
    var group = document.createElement('div');
    group.className = 'tool-group';
    group.id = 'research-settings-group';

    var icons = document.createElement('div');
    icons.className = 'icons';
    icons.style.gap = '15px';

    // Zapnuto (checkbox)
    var enWrap = document.createElement('div');
    enWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:11px;align-items:center;justify-content:center;';
    enWrap.innerHTML = '<span>Zapnuto (cloud):</span>';
    var en = document.createElement('input');
    en.type = 'checkbox';
    en.id = 'research-enabled';
    en.style.cssText = 'width:16px;height:16px;cursor:pointer;';
    en.checked = isEnabled();
    en.addEventListener('change', function () {
      if (en.checked && !optedIn()) {
        ensureOptIn().then(function (ok) { en.checked = !!ok; });
      } else {
        setEnabled(en.checked);
      }
    });
    enWrap.appendChild(en);

    // Poskytovatel (select)
    var provWrap = document.createElement('div');
    provWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:11px;';
    provWrap.innerHTML = '<span>Poskytovatel:</span>';
    var sel = document.createElement('select');
    sel.id = 'research-provider';
    sel.className = 'combo-box';
    PROVIDER_ORDER.forEach(function (id) {
      var p = PROVIDERS[id];
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = p.nazev + (p.typ === 'zdarma' ? ' (zdarma)' : ' (účet)');
      sel.appendChild(opt);
    });
    sel.value = activeId();
    sel.addEventListener('change', function () { setActiveProvider(sel.value); });
    provWrap.appendChild(sel);

    // Stav / popis
    var stWrap = document.createElement('div');
    stWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:11px;max-width:240px;';
    stWrap.innerHTML = '<span>Stav:</span><span id="research-status" style="color:var(--text-muted,#77716a);line-height:1.4;font-size:10.5px"></span>';

    icons.appendChild(enWrap);
    icons.appendChild(provWrap);
    icons.appendChild(stWrap);
    group.appendChild(icons);

    var label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = 'Externí rešerše';
    group.appendChild(label);

    return group;
  }

  function syncSettingsUI() {
    var en = document.getElementById('research-enabled');
    if (en) en.checked = isEnabled();
    var sel = document.getElementById('research-provider');
    if (sel) sel.value = activeId();
    var st = document.getElementById('research-status');
    if (st) {
      var p = activeProvider();
      var txt = p.popis + (p.ready ? '' : ' — ' + (p.note || 'nepřipraveno'));
      st.textContent = (isEnabled() ? '☁ Zapnuto. ' : 'Vypnuto. ') + txt;
    }
  }

  function mountSettings() {
    var host = document.getElementById('tab-settings');
    if (!host || document.getElementById('research-settings-group')) return;
    try {
      host.appendChild(buildSettingsGroup());
      syncSettingsUI();
    } catch (e) { /* self-mount je best-effort, nikdy nesmí shodit aplikaci */ }
  }

  function init() {
    mountSettings();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  window.LexisResearch = {
    PROVIDERS: PROVIDERS,
    PROVIDER_ORDER: PROVIDER_ORDER,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    activeId: activeId,
    setActiveProvider: setActiveProvider,
    activeProvider: activeProvider,
    // programové API
    verifyCitation: verifyCitation,
    findCaseLaw: findCaseLaw,
    findLaw: findLaw,
    // UI akce
    uiVerifyCitation: uiVerifyCitation,
    uiFindCaseLaw: uiFindCaseLaw,
    uiFindLaw: uiFindLaw,
    // pomocné
    mountSettings: mountSettings,
    _syncSettingsUI: syncSettingsUI
  };
  // Globální aliasy pro onclick v HTML
  window.researchVerifyCitation = uiVerifyCitation;
  window.researchFindCaseLaw = uiFindCaseLaw;
})();
