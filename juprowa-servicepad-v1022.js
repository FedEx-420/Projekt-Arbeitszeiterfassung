(() => {
  'use strict';

  window.WorktimeServicePad = { create({ root, state, businessId, isManager, api, escape }) {
    const scope = () => isManager() && businessId() ? state.profile.id + ':' + businessId() : '';
    let active;

    function settings() {
      if (!scope()) return '';
      return `<section class="panel" aria-labelledby="juprowa-heading">
        <h2 id="juprowa-heading">Juprowa ServicePad</h2>
        <div id="juprowa-servicepad"><p role="status">Verbindung wird geprüft …</p></div>
      </section>`;
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
        ? `<form id="juprowa-connect" autocomplete="off">
            <p>Verwende den Portalzugang des Betriebs, den du hier verknüpfen möchtest.</p>
            <div class="form-grid">
              <div><label>Seriennummer<input name="serial" required maxlength="80" aria-describedby="juprowa-serial-note"></label>
                <details><summary aria-label="Hilfe zur Seriennummer">Info</summary>
                  <p id="juprowa-serial-note">Seriennummer des Betriebs aus der ServicePad-Anmeldung.</p></details></div>
              <div><label>Benutzer<input name="username" required maxlength="120" aria-describedby="juprowa-user-note"></label>
                <details><summary aria-label="Hilfe zum Benutzernamen">Info</summary>
                  <p id="juprowa-user-note">Der Benutzername, mit dem du ServicePad öffnest.</p></details></div>
              <div><label>Passwort<input name="password" type="password" required maxlength="512" aria-describedby="juprowa-password-note"></label>
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
      if (!key || !root.querySelector('#juprowa-servicepad')) {
        active = null;
        return;
      }
      if (active) {
        paint(active);
        return;
      }
      active = { key, business: businessId() };
      void run(active, 'status');
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
      if (form.id !== 'juprowa-connect' || !active || scope() !== active.key) return;
      event.preventDefault();
      event.stopPropagation();
      const fields = Object.fromEntries(new FormData(form));
      void run(active, 'connect', fields, form);
    }, true);

    return { settings, afterRender };
  } };
})();
