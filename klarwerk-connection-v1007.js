/* Company-scoped Klarwerk connection for customers, work sheets, material and time. */
(() => {
  'use strict';
  window.WorktimeKlarwerkConnection = {create({root,state,businessId,isManager,api,escape:esc}) {
    let scope = '', generation = 0, links = [], loaded = false, pending = false, error = '', pair = null;
    const identity = () => state.profile?.id && businessId() ? state.profile.id + ':' + businessId() : '';
    const call = (action, data = {}) => api('/functions/v1/klarwerk-bridge-v1007', {
      method:'POST', body:{action, company:businessId(), data}
    });

    function sync() {
      const current = identity();
      if (scope === current) return;
      scope = current;
      generation++;
      links = [];
      loaded = pending = false;
      error = '';
      pair = null;
    }

    function settings() {
      sync();
      if (!scope || !isManager()) return '';
      return `<section class="panel" data-klarwerk-settings><h3>Klarwerk verknüpfen</h3>
        <p>Der verbundene Betrieb stellt Klarwerk Kundendaten und Arbeitsscheine mit Material und Arbeitsstunden bereit. Rechnungen werden in Klarwerk erstellt.</p>
        <form data-klarwerk-form class="entry-form">
          <label class="wide">Name der Verbindung<input name="label" maxlength="80" value="Meine Buchhaltung" required></label>
          <label class="wide"><input name="klarwerk_consent" type="checkbox" required> Ich gebe diese Arbeitsschein- und Kundendaten für Klarwerk frei.</label>
          <button class="primary">Freigabecode erzeugen</button>
        </form><div data-klarwerk-pair></div><p data-klarwerk-status role="status"></p><div data-klarwerk-links></div>
        <button type="button" class="secondary" data-klarwerk-action="refresh">Verbindungen aktualisieren</button>
      </section>`;
    }

    function paint() {
      const panel = root.querySelector('[data-klarwerk-settings]');
      if (!panel) return;
      panel.querySelector('[data-klarwerk-status]').textContent = pending ? 'Bitte warten …' : error;
      panel.querySelector('[data-klarwerk-pair]').innerHTML = pair ? `<div class="notice">
        <b>Einmaliger Freigabecode · gültig bis ${esc(new Date(pair.expires).toLocaleTimeString('de-DE'))}</b>
        <p>In Klarwerk unter „Einstellungen → Verbindung zur Arbeitszeiterfassung“ im gewünschten Konto einfügen.</p>
        <textarea readonly aria-label="Klarwerk-Freigabecode">${esc(pair.code)}</textarea>
        <button type="button" data-klarwerk-action="copy">Code kopieren</button></div>` : '';
      panel.querySelector('[data-klarwerk-links]').innerHTML = links.map(link => {
        const status = link.revoked_at ? 'Widerrufen' : link.claimed_at ? 'Verknüpft' :
          new Date(link.pair_expires) < new Date() ? 'Code abgelaufen' : 'Code wartet auf Verknüpfung';
        const revoke = link.revoked_at ? '' :
          `<button type="button" class="danger" data-klarwerk-action="revoke" data-id="${esc(link.id)}">Widerrufen</button>`;
        return `<article class="row-card"><div><b>${esc(link.label)}</b>
          <span>${esc(link.account_label || 'Noch nicht verknüpft')} · ${status}</span></div>${revoke}</article>`;
      }).join('') || (loaded ? '<p>Noch keine Verbindungen.</p>' : '');
      window.WorktimeKlarwerkTheme?.afterRender(root);
    }

    async function perform(action, data, accept) {
      sync();
      if (pending || !scope || !isManager()) return;
      const stamp = generation;
      const current = () => stamp === generation && scope === identity() && isManager();
      pending = true;
      error = '';
      paint();
      try {
        const result = await call(action, data);
        if (current()) accept(result);
      } catch (e) {
        if (current()) error = e.message;
      } finally {
        if (current()) {
          pending = false;
          paint();
          if (action !== 'links' && !loaded) afterRender();
        }
      }
    }

    function load() {
      loaded = true;
      return perform('links', {}, result => {
        if (!Array.isArray(result)) throw Error('Verbindungen konnten nicht bestätigt werden.');
        links = result;
      });
    }

    function afterRender() {
      sync();
      if (!root.querySelector('[data-klarwerk-settings]')) return;
      paint();
      if (!loaded && !pending) load();
    }

    root.addEventListener('submit', event => {
      const form = event.target.closest('[data-klarwerk-form]');
      if (!form) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!form.reportValidity()) return;
      return perform('pair', {label:new FormData(form).get('label')}, result => {
        pair = result;
        loaded = false;
      });
    }, true);

    root.addEventListener('click', async event => {
      const button = event.target.closest('[data-klarwerk-action]');
      if (!button) return;
      event.preventDefault();
      switch (button.dataset.klarwerkAction) {
        case 'copy':
          try { await navigator.clipboard.writeText(pair?.code || ''); }
          catch { root.querySelector('[data-klarwerk-pair] textarea')?.select(); }
          break;
        case 'refresh':
          await load();
          break;
        case 'revoke':
          await perform('revoke', {id:button.dataset.id}, () => {
            if (pair?.id === button.dataset.id) pair = null;
            loaded = false;
          });
          break;
      }
    });

    return {settings, afterRender};
  }};
})();
