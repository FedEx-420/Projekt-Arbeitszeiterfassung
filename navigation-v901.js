/* Presentation only. Existing route permissions, identities and data stay authoritative. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const definitions = [
    ['home', 'Übersicht', 'Dein Arbeitstag auf einen Blick', 'home', ['home']],
    ['work', 'Aufträge & Zeiten', 'Arbeitsscheine, Zeiten und Belege', 'work', ['orders', 'time', 'receipts']],
    ['customers', 'Kunden', 'Kontaktdaten und Kundenaufträge', 'customers', ['customers']],
    ['planning', 'Planung & Kalender', 'Termine, Urlaub und Krankheit', 'calendar', ['planning', 'calendar']],
    ['office', 'Büro', 'Abrechnung, Angebote und Postfach', 'office', ['invoices', 'invoices-paid', 'offers', 'materials', 'datev', 'mailbox']],
    ['legal', 'Unterlagen & Freigaben', 'Dokumente und verständliche Hilfen', 'legal', ['legal']],
    ['account', 'Mein Konto', 'Einstellungen, Team und Geräte', 'account', ['settings']],
    ['platform', 'Anbieteradministration', 'Preise und Geschäftskonten', 'platform', ['platform']]
  ];
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    work: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h6"/>',
    customers: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/>',
    office: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',
    legal: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    platform: '<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.legal}</svg>`;
  function groups(items) {
    // Group only links already permitted by the app. Never manufacture access.
    const remaining = new Map(items.map(([id, label]) => [id, label]));
    const result = definitions.map(([id, label, description, symbol, routes]) => {
      const links = routes.filter(route => remaining.has(route)).map(route => {
        const link = [route, remaining.get(route)]; remaining.delete(route); return link;
      });
      if (!links.length) return null;
      if (id === 'office' && links.length === 1 && links[0][0] === 'mailbox') {
        label = 'Postfach'; description = 'Nachrichten und Anhänge';
      }
      return {id, label, description, symbol, links};
    }).filter(Boolean);
    for (const [id, label] of remaining) result.push({id, label, description:'', symbol:'legal', links:[[id, label]]});
    return result;
  }
  function routeButton(id, label, current) {
    return `<button type="button" data-action="nav" data-view="${escape(id)}" class="nav-destination ${id === current ? 'active' : ''}"${id === current ? ' aria-current="page"' : ''}><span>${escape(label)}</span><span class="nav-chevron" aria-hidden="true">›</span></button>`;
  }
  function currentLabel(items, current) { return items.find(([id]) => id === current)?.[1] || 'Übersicht'; }
  function markup({items, current, open = false}) {
    const list = groups(items).map(group => {
      const active = group.links.some(([id]) => id === current);
      const heading = `<span class="nav-symbol">${icon(group.symbol)}</span><span class="nav-copy"><strong>${escape(group.label)}</strong><small>${escape(group.description)}</small></span>`;
      if (group.links.length === 1) {
        const [id] = group.links[0];
        return `<button type="button" class="nav-category ${active ? 'active' : ''}" data-action="nav" data-view="${escape(id)}"${active ? ' aria-current="page"' : ''}>${heading}<span class="nav-chevron" aria-hidden="true">›</span></button>`;
      }
      return `<details class="nav-category-group ${active ? 'current' : ''}"${active ? ' open' : ''}><summary>${heading}<span class="nav-chevron" aria-hidden="true">⌄</span></summary><div class="nav-destinations">${group.links.map(([id, label]) => routeButton(id, label, current)).join('')}</div></details>`;
    }).join('');
    return `<div class="navigation-dropdown"><button id="app-menu-toggle" type="button" class="menu-toggle" data-action="menu" aria-expanded="${open}" aria-controls="app-menu-panel">${icon('menu')}<span>Menü</span><span aria-hidden="true">⌄</span></button><section id="app-menu-panel" class="app-menu-sheet nav-v901"${open ? '' : ' hidden'}><header><div><small>Du bist hier</small><b>${escape(currentLabel(items, current))}</b></div><button type="button" class="nav-close" data-action="menu" aria-label="Menü schließen">×</button></header><nav aria-label="Hauptmenü">${list}</nav><footer><button type="button" data-action="logout">Abmelden <span aria-hidden="true">↗</span></button></footer></section></div>`;
  }
  function create({root, getOpen, setOpen}) {
    const document = root.ownerDocument;
    const window = document.defaultView;
    const panel = () => root.querySelector('#app-menu-panel');
    const toggleButton = () => root.querySelector('#app-menu-toggle');
    function fit() {
      const sheet = panel(); if (!sheet || sheet.hidden) return;
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      sheet.style.maxHeight = `${Math.max(0, bottom - sheet.getBoundingClientRect().top - 16)}px`;
    }
    function close(returnFocus = false) {
      setOpen(false);
      const sheet = panel(); if (sheet) sheet.hidden = true;
      toggleButton()?.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggleButton()?.focus();
    }
    function toggle() {
      const sheet = panel(); if (!sheet) return;
      if (getOpen()) return close(true);
      setOpen(true); sheet.hidden = false;
      toggleButton()?.setAttribute('aria-expanded', 'true'); fit();
      sheet.querySelector('[aria-current="page"], summary, [data-action="nav"]')?.focus();
    }
    function afterRender() { if (getOpen()) fit(); }
    document.addEventListener('click', event => {
      if (getOpen() && !event.target.closest?.('.navigation-dropdown')) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && getOpen()) { event.preventDefault(); close(true); }
    });
    document.addEventListener('focusin', event => {
      if (getOpen() && !event.target.closest?.('.navigation-dropdown')) close();
    });
    // Keep long menus compact: one expanded area at a time, using native details.
    root.addEventListener('toggle', event => {
      const group = event.target;
      if (!group.matches?.('.nav-category-group') || !group.open) return;
      root.querySelectorAll('.nav-category-group').forEach(other => { if (other !== group) other.open = false; });
      fit();
    }, true);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return {toggle, close, afterRender};
  }
  window.WorktimeNavigation = {groups, markup, currentLabel, create};
})();
