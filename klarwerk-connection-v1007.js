/* Company-scoped access to the operational records used by Klarwerk. */
(() => {
  'use strict';
  window.WorktimeKlarwerkConnection = {create({root, state, businessId, isManager, api, escape: esc}) {
    let scope = '', loaded = false, pending = false, links = [], pair = null, error = '';
    const identity = () => isManager() && businessId() ? state.profile.id + ':' + businessId() : '';
    const call = (action, data = {}) => api('/functions/v1/klarwerk-bridge-v1007', {
      method: 'POST', body: {action, company: businessId(), data}
    });

    function sync() {
      const next = identity();
      if (scope === next) return;
      scope = next;
      loaded = pending = false;
      links = [];
      pair = null;
      error = '';
    }

    function settings() {
      sync();
      if (!scope) return '';
      return `<section class="panel" data-klarwerk-settings><h3>Klarwerk verknüpfen</h3>
        <p>Die Verbindung gibt Klarwerk Zugriff auf Kunden und Arbeitsscheine samt Material und Arbeitsstunden.</p>
        <button type="button" class="primary" data-klarwerk-action="pair">Freigabecode erzeugen</button>
        <p role="status" data-klarwerk-status></p><div data-klarwerk-pair></div><div data-klarwerk-links></div></section>`;
    }

    function paint() {
      const panel = root.querySelector('[data-klarwerk-settings]');
      if (!panel) return;
      panel.querySelector('[data-klarwerk-status]').textContent = pending ? 'Bitte warten …' : error;
      panel.querySelector('[data-klarwerk-pair]').innerHTML = pair ? `<p>Einmalcode für Klarwerk → Einstellungen</p>
        <textarea rows="2" readonly aria-label="Freigabecode">${esc(pair.code)}</textarea>
        <button type="button" data-klarwerk-action="copy">Kopieren</button>` : '';
      panel.querySelector('[data-klarwerk-links]').innerHTML = links.map(link => `<article class="row-card">
        <b>${esc(link.account_label || 'Klarwerk')}</b><span>${link.claimed_at ? 'Verbunden' : 'Freigabe ausstehend'}</span>
        <button type="button" data-klarwerk-action="revoke" data-id="${esc(link.id)}">Freigabe widerrufen</button></article>`).join('');
      for (const button of panel.querySelectorAll('button')) button.disabled = pending;
    }

    async function run(action, data) {
      sync();
      if (!scope || pending) return;
      const stamp = scope;
      pending = true;
      error = '';
      paint();
      try {
        if (action !== 'links') {
          const result = await call(action, data);
          if (scope !== stamp || identity() !== stamp) return;
          if (action === 'pair') pair = result;
          if (action === 'revoke' && pair?.id === data.id) pair = null;
        }
        const rows = await call('links');
        if (scope !== stamp || identity() !== stamp) return;
        if (!Array.isArray(rows)) throw Error('Die Freigaben konnten nicht bestätigt werden.');
        links = rows;
        loaded = true;
      } catch (e) {
        if (scope === stamp) error = e.message;
      } finally {
        if (scope === stamp) { pending = false; paint(); }
      }
    }

    function afterRender() {
      sync();
      if (!root.querySelector('[data-klarwerk-settings]')) return;
      paint();
      if (!loaded && !pending) run('links');
    }

    root.addEventListener('click', async event => {
      const button = event.target.closest('[data-klarwerk-action]');
      if (!button) return;
      const action = button.dataset.klarwerkAction;
      if (action === 'copy') {
        try { await navigator.clipboard.writeText(pair?.code || ''); }
        catch { root.querySelector('[data-klarwerk-pair] textarea')?.select(); }
      }
      if (action === 'pair') await run('pair', {label: 'Klarwerk'});
      if (action === 'revoke') await run('revoke', {id: button.dataset.id});
    });
    return {settings, afterRender};
  }};
})();
