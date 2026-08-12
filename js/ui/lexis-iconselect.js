/* global window, document */
/**
 * lexis-iconselect.js — vylepšení nativního <select> o ikony.
 * Nativní <select> zůstává zdrojem pravdy (hodnota + change), jen se skryje;
 * navrch se vykreslí vlastní dropdown s tahovými ikonami. Ostatní kód, který
 * čte `select.value`, funguje beze změny.
 *
 * Plně ovladatelné klávesnicí: Šipky/Home/End (výběr), Enter/Mezerník (otevřít/
 * potvrdit), Esc (zavřít), Tab (zavřít). Používá role=listbox/option +
 * aria-activedescendant, aby fungovaly odečítače obrazovky.
 */
(function () {
  'use strict';

  var uid = 0;

  function iconSvg(id, px) {
    if (!id || !window.LexisIcons) return '';
    var svg = window.LexisIcons.get(id);
    if (!svg) return '';
    return window.LexisIcons.sizeSvg(svg, px || 14)
      .replace('display:block', 'display:inline-block;vertical-align:-2px;margin-right:7px');
  }

  function labelOf(opt) {
    var t = (opt.textContent || '').replace(/^[^\p{L}\d]+/u, '').trim();
    return t || (opt.textContent || '').trim();
  }

  function enhance(select, iconMap) {
    if (!select || select.__iconEnhanced) return;
    select.__iconEnhanced = true;
    iconMap = iconMap || {};
    var base = 'icsel-' + (++uid);

    var wrap = document.createElement('div');
    wrap.className = 'icon-select';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-select-btn combo-box';
    btn.id = base + '-btn';
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', select.getAttribute('aria-label') || 'Výběr možnosti');

    var menu = document.createElement('div');
    menu.className = 'icon-select-menu';
    menu.id = base + '-menu';
    menu.setAttribute('role', 'listbox');
    menu.style.display = 'none';
    btn.setAttribute('aria-controls', menu.id);

    var rows = [];
    var highlight = -1;

    function currentIndex() { return select.selectedIndex < 0 ? 0 : select.selectedIndex; }

    function updateBtn() {
      var opt = select.options[currentIndex()];
      if (!opt) { btn.innerHTML = ''; return; }
      btn.innerHTML = iconSvg(iconMap[opt.value], 14) +
        '<span class="icon-select-label">' + labelOf(opt) + '</span>' +
        '<span class="icon-select-caret" aria-hidden="true">▾</span>';
    }

    function setHighlight(i) {
      if (i < 0) i = 0; if (i > rows.length - 1) i = rows.length - 1;
      rows.forEach(function (r) { r.classList.remove('highlighted'); r.setAttribute('aria-selected', 'false'); });
      highlight = i;
      if (rows[i]) {
        rows[i].classList.add('highlighted');
        rows[i].setAttribute('aria-selected', 'true');
        btn.setAttribute('aria-activedescendant', rows[i].id);
        rows[i].scrollIntoView({ block: 'nearest' });
      }
    }

    function isOpen() { return menu.style.display !== 'none'; }

    function open() {
      menu.style.display = '';
      btn.setAttribute('aria-expanded', 'true');
      setHighlight(currentIndex());
      setTimeout(function () { document.addEventListener('click', onDocClick); }, 0);
    }
    function close() {
      menu.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-activedescendant');
      document.removeEventListener('click', onDocClick);
    }
    function onDocClick(e) { if (!wrap.contains(e.target)) close(); }

    function choose(i) {
      var opt = select.options[i];
      if (!opt) return;
      if (select.value !== opt.value) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      updateBtn();
    }

    Array.prototype.forEach.call(select.options, function (opt, i) {
      var row = document.createElement('div');
      row.className = 'icon-select-item';
      row.id = base + '-opt-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.dataset.value = opt.value;
      row.innerHTML = iconSvg(iconMap[opt.value], 14) +
        '<span class="icon-select-label">' + labelOf(opt) + '</span>';
      row.addEventListener('mousemove', function () { setHighlight(i); });
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        choose(i); close(); btn.focus();
      });
      rows.push(row);
      menu.appendChild(row);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) close(); else open();
    });

    btn.addEventListener('keydown', function (e) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen()) open(); else setHighlight(highlight + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen()) open(); else setHighlight(highlight - 1);
          break;
        case 'Home':
          if (isOpen()) { e.preventDefault(); setHighlight(0); }
          break;
        case 'End':
          if (isOpen()) { e.preventDefault(); setHighlight(rows.length - 1); }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!isOpen()) { open(); }
          else { choose(highlight); close(); }
          break;
        case 'Escape':
          if (isOpen()) { e.preventDefault(); close(); }
          break;
        case 'Tab':
          if (isOpen()) close();
          break;
        default:
          break;
      }
    });

    // Když hodnotu změní jiný kód, promítni to do tlačítka.
    select.addEventListener('change', updateBtn);

    select.style.display = 'none';
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    select.parentNode.insertBefore(wrap, select.nextSibling);
    updateBtn();
  }

  window.LexisIconSelect = { enhance: enhance };

  function init() {
    enhance(document.getElementById('lexislocal-agent'), {
      resersnik: 'knihy',
      spisovatel: 'psat',
      stylista: 'motivy',
      kontrolor: 'vahy',
      sekretarka: 'lhutnik'
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
