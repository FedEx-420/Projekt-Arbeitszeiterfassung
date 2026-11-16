(() => {
  'use strict';

  window.WorktimeServicePad = { create({ root, state, businessId, isManager, api, escape }) {
    const scope = () => isManager() && businessId() ? state.profile.id + ':' + businessId() : '';
    let active;

    function settings() {
      if (!scope()) return '';
      return `<details id="juprowa-settings" class="panel"${active?.key === scope() && active.expanded ? ' open' : ''}>
        <summary>Juprowa ServicePad</summary>
        <div id="juprowa-servicepad"><p role="status">Verbindung wird geprüft …</p></div>
      </details>`;
    }

    function paint(current) {
      const panel = root.querySelector('#juprowa-servicepad');
      if (!panel || active !== current || scope() !== current.key) return;
      const info = current.message
        ? `<p class="notice error" role="alert">${escape(current.message)}</p>` : '';
      const account = current.connection
        ? `<p>Verknüpfter Mandant <strong>${escape(current.connection.label)}</strong></p>` : '';
      const muted = current.busy ? ' disabled' : '';
      const buttons = current.connection && !current.form
        ? `<button type="button" data-sp="refresh"${muted}>Arbeitsscheine aktualisieren</button>
          <button type="button" data-sp="form"${muted}>Neu anmelden</button>
          <button type="button" data-sp="disconnect"${muted}>Verbindung trennen</button>` : '';
      const form = current.loaded && (current.form || !current.connection)
        ? `<form id="juprowa-connect" method="post" autocomplete="off">
            <p>Verwende den Portalzugang des Betriebs, den du hier verknüpfen möchtest.</p>
            <div class="form-grid">
              <div><span id="juprowa-serial-label">Kundennummer</span>
                <input name="serial" required maxlength="80" aria-labelledby="juprowa-serial-label" aria-describedby="juprowa-serial-note">
                <details><summary aria-label="Hilfe zur Kundennummer">Info</summary>
                  <p id="juprowa-serial-note">Die Kundennummer aus dem Anmeldeformular der Juprowa Cloud. Gib sie mit allen Stellen ein.</p></details></div>
              <div><span id="juprowa-user-label">Benutzer</span>
                <input name="username" required maxlength="120" aria-labelledby="juprowa-user-label" aria-describedby="juprowa-user-note">
                <details><summary aria-label="Hilfe zum Benutzernamen">Info</summary>
                  <p id="juprowa-user-note">Der Benutzername, mit dem du ServicePad öffnest.</p></details></div>
              <div><span id="juprowa-password-label">Passwort</span>
                <input name="password" type="password" required maxlength="512" aria-labelledby="juprowa-password-label" aria-describedby="juprowa-password-note">
                <details><summary aria-label="Hilfe zum Passwort">Info</summary>
                  <p id="juprowa-password-note">Das Passwort für ServicePad. Die Arbeitszeiterfassung speichert die Zugangsdaten für weitere Abrufe verschlüsselt.</p></details></div>
            </div>
            <p><button type="submit"${muted}>Mit ServicePad verbinden</button>
              ${current.connection ? '<button type="button" data-sp="cancel">Abbrechen</button>' : ''}</p>
          </form>` : '';
      const worksheets = Array.isArray(current.worksheets) ? current.worksheets : null;
      const list = worksheets
        ? `<h3>Offene Arbeitsscheine (${worksheets.length})</h3>
          ${worksheets.length ? `<ul class="servicepad-worksheets">${worksheets.map(sheet => `<li><details>
            <summary>${escape([sheet.number, sheet.customer, sheet.date?.split('-').reverse().join('.')].filter(Boolean).join(' · '))}</summary>
            ${sheet.location ? `<p>Einsatzort <strong>${escape(sheet.location)}</strong></p>` : ''}
            ${sheet.technician ? `<p>Monteur <strong>${escape(sheet.technician)}</strong></p>` : ''}
            ${sheet.description ? `<p style="white-space: pre-wrap">${escape(sheet.description)}</p>` : ''}
          </details></li>`).join('')}</ul>` : '<p>Im verknüpften Mandanten sind keine offenen Arbeitsscheine verfügbar.</p>'}` : '';
      panel.innerHTML = account + info
        + (current.busy ? '<p role="status">ServicePad wird abgefragt …</p>' : '')
        + (current.loaded ? '' : `<button type="button" data-sp="refresh"${muted}>Verbindung prüfen</button>`)
        + buttons + form + list;
    }

    const call = (current, action, fields = {}) => api('/functions/v1/juprowa-servicepad', {
      method: 'POST', body: { action, businessId: current.business, revision: current.connection?.revision, ...fields },
    });

    async function run(current, action, fields, form) {
      if (current.busy) return;
      current.busy = true;
      current.message = '';
      current.worksheets = null;
      if (form) form.querySelector('[type="submit"]').disabled = true;
      else paint(current);
      try {
        let result = await call(current, action, fields);
        if (active !== current || scope() !== current.key) return;
        if (result.mandants) {
          if (!form?.isConnected) return;
          form.querySelector('[data-sp-mandant]')?.remove();
          const label = document.createElement('label');
          label.dataset.spMandant = 'true';
          label.textContent = 'ServicePad-Mandant ';
          const select = document.createElement('select');
          select.name = 'mandantId';
          select.required = true;
          select.append(new Option('Mandant auswählen', ''));
          for (const mandant of result.mandants) select.append(new Option(mandant.label, mandant.id));
          label.append(select);
          form.querySelector('.form-grid').append(label);
          select.reportValidity();
          select.focus();
          return;
        }
        current.connection = result.connection;
        current.loaded = true;
        current.form = false;
        if (action === 'status' && result.connection) result = await call(current, 'list');
        if (active === current && scope() === current.key) current.worksheets = result.worksheets ?? null;
      } catch (error) {
        if (error.code === 'connection_changed') {
          current.loaded = false;
          current.connection = null;
        }
        current.message = error.message || 'ServicePad konnte nicht abgefragt werden.';
      } finally {
        current.busy = false;
        if (form?.querySelector('[data-sp-mandant]') && !current.message && !current.worksheets) {
          form.querySelector('[type="submit"]').disabled = false;
        } else {
          form?.reset();
          paint(current);
        }
      }
    }

    function afterRender() {
      const key = scope();
      if (active?.key !== key) active = null;
      const section = root.querySelector('#juprowa-settings');
      if (!key || !section) {
        active = null;
        return;
      }
      active ??= { key, business: businessId(), expanded: false };
      const current = active;
      section.addEventListener('toggle', () => {
        if (!section.isConnected || active !== current || scope() !== current.key) return;
        current.expanded = section.open;
        if (section.open && !current.loaded && !current.busy) void run(current, 'status');
      });
      if (current.expanded) paint(current);
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('#juprowa-servicepad button[data-sp]');
      const current = active;
      if (!button || !current || scope() !== current.key) return;
      if (button.dataset.sp === 'form' || button.dataset.sp === 'cancel') {
        current.form = button.dataset.sp === 'form';
        paint(current);
      } else if (button.dataset.sp === 'refresh') {
        void run(current, current.connection ? 'list' : 'status');
      } else if (button.dataset.sp === 'disconnect') {
        if (window.confirm('ServicePad von diesem Geschäftskonto trennen?')) void run(current, 'disconnect');
      }
    });
    root.addEventListener('submit', event => {
      const form = event.target;
      if (form.id !== 'juprowa-connect') return;
      event.preventDefault();
      event.stopPropagation();
      if (!active || scope() !== active.key) return;
      const fields = Object.fromEntries(new FormData(form));
      void run(active, 'connect', fields, form);
    }, true);

    return { settings, afterRender };
  } };
})();
