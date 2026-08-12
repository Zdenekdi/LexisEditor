/* global window, document */
/**
 * lexis-manual.js — vestavěná úplná příručka.
 * window.showFullManual() otevře velký rolovací modal s přehledem funkcí.
 * Vše je in-app (offline), laděné přes CSS proměnné → funguje i v tmavém režimu.
 */
(function () {
  'use strict';

  var SECTIONS = [
    ['Začínáme', [
      '<b>Nový dokument</b> — čistý list s právním formátováním.',
      '<b>Otevřít dokument</b> — z disku, PDF nebo datové schránky.',
      '<b>Import ZFO / PDF</b> — načtení přijaté datové zprávy (.zfo) nebo PDF.',
      'Nedávné dokumenty lze filtrovat: Vše / Rozpracované / Ke kontrole / Hotové / Bez stavu.',
      'Stav dokumentu je <b>nepovinný</b> — u názvu je tichá značka „＋ Stav".'
    ]],
    ['Psaní a formátování (Domů)', [
      'Písmo a efekty: rodina, velikost, tučné/kurzíva/podtržení, barva a zvýraznění.',
      'Odstavec: řádkování (1.0/1.5), odsazení, zarovnání (vlevo / na střed / do bloku).',
      'Schránka, Najít a nahradit, Diktování.'
    ]],
    ['Vkládání (Vložit)', [
      'Automatický Obsah (z nadpisů H1/H2), Titulní strana, Dnešní datum, Poznámka pod čarou.',
      'Tabulka, Obrázek, Ilustrace, Odkaz, Záložka, Záhlaví/Zápatí, Číslo strany, Vložit hlavičku.'
    ]],
    ['Právní nástroje', [
      '<b>Legal Linker</b> — převod paragrafů a zákonů na ověřené odkazy.',
      '<b>Judikatura</b> a <b>Rejstřík citací</b> (Table of Authorities).',
      '<b>Kalkulačky</b>: soudní poplatek, advokátní tarif (177/1996 Sb.), úrok z prodlení.',
      '<b>Lhůtník</b> — výpočet lhůt (pracovní dny, svátky, § 57 o.s.ř.) + export do kalendáře (.ics/Google/Outlook).',
      'Strany a registry: <b>ARES</b>, ISIR, hlavičky Fyzická osoba / Podnikatel / Firma, <b>Adresář</b>.'
    ]],
    ['LexisAI', [
      'Nad výběrem: Analyzovat, Přepsat, Vysvětlit, Přeložit.',
      'Nad dokumentem: Hledat rizika, Shrnutí, Dopsat AI, Nová doložka.',
      'Persona (swarm) + model. Vše přes zvoleného poskytovatele — lokálně (Ollama / Apple Intelligence) zcela offline.',
      'Zprovoznění lokální AI: Nápověda → „Návod: Lokální AI".'
    ]],
    ['Datová schránka (ISDS)', [
      '1. Nastavení DS (přihlašovací údaje / certifikát).',
      '2. Odeslání: Dopis Online / Odpovědět → zařadí k odeslání.',
      '3. Import ZFO, 4. Doručenka, 5. E-podpis před odesláním.'
    ]],
    ['Revize a verze (Revize)', [
      'Sledovat změny → Přijmout / Odmítnout (vše i jednotlivě).',
      'Srovnat verze, Historie verzí, Komentáře, Prověřit text (audit).'
    ]],
    ['Anonymizace a čištění', [
      '<b>GDPR Shield / Anonymizovat</b> — maskuje jména, rodná čísla, adresy (výběr i celý dokument). Vždy zkontrolujte výsledek.',
      '<b>Vyčistit metadata</b> — před odesláním odstraní skryté údaje (autor, historie, komentáře).'
    ]],
    ['Export a sdílení', [
      'DOCX, Export PDF, Bundle, Webový náhled, E-mail / E-mail klientovi, Dopis Online, Prohlížeč PDF.'
    ]],
    ['Zabezpečení aplikace', [
      'Zámek aplikace + Touch ID, heslo/PIN.',
      '<b>Záloha klíče — kritické:</b> data jsou šifrovaná lokálně; bez zálohy klíče je při ztrátě/reinstalaci nelze obnovit.',
      'Zamknout nyní — ruční uzamčení.'
    ]],
    ['Propojení a automatizace', [
      '<b>LexisLink Remote</b> — mobil jako skener (lokální OCR → text do dokumentu).',
      '<b>LexisConnect</b> — port 3300, POST na /api/import (Evolio, SingleCase…).',
      'Hromadné generování / Kampaň, Vykázat práci (timesheet).'
    ]],
    ['Zobrazení a přizpůsobení (Zobrazení)', [
      'Režimy: Ribbon / Jedna lišta / Papír; Čtení / Tisk / Web.',
      'Pravítko, Mřížka, panely, Tmavý režim, Motivy.',
      'Panel Rychlý přístup (QAT): pravým tlačítkem na ikonu v Ribbonu → Přidat; šipkou ▾ zapnete/vypnete výchozí tlačítka.'
    ]],
    ['Nápověda a diagnostika (Nápověda)', [
      'Kontextové návody, Průvodce (interaktivní), Self-Test, Aktualizace, O aplikaci, Nahlásit chybu.'
    ]]
  ];

  function buildHtml() {
    var out = '<h2 style="margin:0 0 4px;font-size:20px;color:var(--ink)">LexisEditor — úplná příručka</h2>' +
      '<p style="margin:0 0 18px;color:var(--text-muted);font-size:12.5px">Přehled hlavních funkcí. Vše běží lokálně (datová suverenita).</p>';
    SECTIONS.forEach(function (sec, i) {
      out += '<h3 style="margin:18px 0 6px;font-size:14px;color:var(--accent-text);border-bottom:1px solid var(--border);padding-bottom:4px">' +
        (i + 1) + '. ' + sec[0] + '</h3><ul style="margin:0 0 4px;padding-left:20px">';
      sec[1].forEach(function (li) {
        out += '<li style="margin:3px 0;color:var(--text-2);font-size:13px;line-height:1.55">' + li + '</li>';
      });
      out += '</ul>';
    });
    return out;
  }

  function showFullManual() {
    if (document.getElementById('full-manual-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'full-manual-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Úplná příručka');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:21000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:var(--surface,#fbf8f2);color:var(--ink,#2b2926);width:min(820px,94vw);max-height:86vh;border:1px solid var(--border,#e5ddce);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border,#e5ddce);background:var(--surface-2,#faf8f5);';
    head.innerHTML = '<span style="font-weight:700;font-size:13px;color:var(--ink)">Úplná příručka</span>';
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Zavřít');
    close.textContent = '✕';
    close.style.cssText = 'background:none;border:none;font-size:18px;color:var(--text-muted,#77716a);cursor:pointer;line-height:1;padding:2px 6px;';
    head.appendChild(close);

    var body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;overflow-y:auto;';
    body.innerHTML = buildHtml();

    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function done() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') done(); }
    close.addEventListener('click', done);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) done(); });
    document.addEventListener('keydown', onKey);
    close.focus();
  }

  window.showFullManual = showFullManual;
})();
