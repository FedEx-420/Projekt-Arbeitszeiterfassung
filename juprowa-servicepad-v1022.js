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

    function customerReview(current, disabled) {
      if (!current.connection || current.form) return '';
      const review = current.customerReview;
      return `<section aria-labelledby="juprowa-customer-heading">
        <h3 id="juprowa-customer-heading">Kunden aus Juprowa übernehmen</h3>
        <p>Ergänzt leere Felder und zeigt unklare Zuordnungen zur Prüfung. Das verknüpfte Klarwerk-Konto erhält die übernommenen Kunden beim nächsten Abgleich.</p>
        <button type="button" data-sp="customers-preview"${disabled}>Kundenvorschau laden</button>
        ${review ? `<p role="status">${review.applied ? 'Kunden übernommen. ' : ''}Neue Kunden ${review.counts.new} · Eindeutig zugeordnet ${review.counts.linked} · Zu prüfen ${review.counts.review}</p>
          ${review.review?.length ? `<details><summary>Unklare Zuordnungen anzeigen</summary><ul>${review.review.map(row =>
            `<li>${escape(row.name)}${row.candidates.length ? ' · mögliche Zuordnung: ' + escape(row.candidates.join(', ')) : ''}</li>`).join('')}</ul></details>` : ''}
          ${!review.applied && review.counts.new + review.counts.linked > 0 ? `<button type="button" class="primary" data-sp="customers-import"${disabled}>Kunden dieser Vorschau übernehmen</button>` : ''}
          ${review.next && (review.applied || review.counts.new + review.counts.linked === 0) ? `<button type="button" data-sp="customers-next"${disabled}>Nächste Kundenseite prüfen</button>` : ''}` : ''}
      </section>`;
    }

    function sheetDetail(sheet) {
      if (!sheet) return '';
      const definition = [
        ['Projekt', sheet.project], ['Einsatzort', sheet.service], ['Rechnungsanschrift', sheet.billing],
        ['Auszuführen', sheet.requested], ['Ausgeführt', sheet.completed], ['Notizen', sheet.notes],
      ].filter(([, value]) => value);
      return `<section class="panel" id="juprowa-worksheet-detail" tabindex="-1"><h3>Arbeitsschein ${escape(sheet.number)}</h3>
        <dl>${definition.map(([key, value]) => `<dt>${key}</dt><dd style="white-space:pre-wrap">${escape(value)}</dd>`).join('')}</dl>
        <h4>Arbeitszeiten</h4>
        ${sheet.times.length ? `<ul>${sheet.times.map(time => `<li>${escape([time.day, time.worker, [time.start, time.end].filter(Boolean).join(' – '),
          time.breakMinutes ? time.breakMinutes + ' min Pause' : '',
          time.travelStart && time.travelEnd ? 'Anfahrt ' + time.travelStart + ' – ' + time.travelEnd : ''].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '<p>Keine Zeiten im abgerufenen Arbeitsschein.</p>'}
        <h4>Material</h4>
        ${sheet.materials.length ? `<ul>${sheet.materials.map(item => `<li>${escape([item.article, item.name,
          [item.quantity, item.unit].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '<p>Kein Material im abgerufenen Arbeitsschein.</p>'}
        <p>${sheet.signed ? 'Unterschrift vorhanden' : 'Keine Unterschrift im abgerufenen Arbeitsschein'} · ${sheet.attachmentCount} Anhänge · ${sheet.formCount} Formulare laut ServicePad</p>
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
            <button type="button" data-sp="worksheet-detail" data-sheet="${escape(sheet.id)}"${muted}>Details öffnen</button>
          </details></li>`).join('')}</ul>` : '<p>Im verknüpften Mandanten sind keine offenen Arbeitsscheine verfügbar.</p>'}` : '';
      panel.innerHTML = account + info
        + (current.busy ? '<p role="status">ServicePad wird abgefragt …</p>' : '')
        + (current.loaded ? '' : `<button type="button" data-sp="refresh"${muted}>Verbindung prüfen</button>`)
        + buttons + form + customerReview(current, muted) + sheetDetail(current.sheetDetail) + list;
    }

    const call = (current, action, fields = {}) => api('/functions/v1/juprowa-servicepad', {
      method: 'POST', body: { action, businessId: current.business, revision: current.connection?.revision, ...fields },
    });

    async function run(current, action, fields, form) {
      if (current.busy) return;
      current.busy = true;
      current.message = '';
      current.worksheets = null;
      current.sheetDetail = null;
      if (action === 'connect' || action === 'disconnect') current.customerReview = null;
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

    async function reviewOrDetail(current, command, sheetId) {
      if (current.busy || !current.connection) return;
      const previous = current.customerReview;
      const importing = command === 'customers-import';
      if (importing && (!previous?.fingerprint || !window.confirm('Die eindeutigen Kunden dieser Vorschau jetzt übernehmen?'))) return;
      const detail = command === 'worksheet-detail';
      const cursor = importing ? previous.cursor : command === 'customers-next' ? previous?.next : '0';
      current.busy = true;
      current.message = '';
      if (detail) current.sheetDetail = null;
      paint(current);
      try {
        const result = await call(current, detail || importing ? command : 'customers-preview',
          detail ? { worksheetId: sheetId } : { cursor, fingerprint: importing ? previous.fingerprint : undefined });
        if (active !== current || scope() !== current.key) return;
        if (detail) current.sheetDetail = result.detail;
        else {
          current.customerReview = { ...result, cursor, review: result.review ?? previous?.review ?? [] };
          if (importing && !result.applied) current.message = 'Die Kundendaten haben sich geändert. Prüfe die neue Vorschau.';
        }
      } catch (error) {
        current.message = error.message || 'Der ServicePad-Abgleich ist fehlgeschlagen.';
        if (error.code === 'connection_changed') {
          current.loaded = false;
          current.connection = null;
          current.worksheets = null;
          current.customerReview = null;
        }
      } finally {
        current.busy = false;
        paint(current);
        if (detail && current.sheetDetail && active === current && scope() === current.key) {
          root.querySelector('#juprowa-worksheet-detail')?.focus();
        }
      }
    }

    function afterRender() {
      const profile = root.querySelector('#customer-profile');
      const customer = profile && state.rows.customers.find(row => row.id === state.customerId);
      const saved = customer?.custom_fields;
      if (saved && (saved.juprowa_number || Array.isArray(saved.juprowa_contacts))) {
        const contacts = Array.isArray(saved.juprowa_contacts) ? saved.juprowa_contacts : [];
        profile.insertAdjacentHTML('beforeend', `<details><summary>Juprowa-Kontaktdaten</summary>
          ${saved.juprowa_number ? `<p>Kundennummer ${escape(saved.juprowa_number)}</p>` : ''}
          ${contacts.filter(Boolean).map(c => `<p>${[c.name,c.email,c.phone,c.phone_2,c.phone_3,c.mobile,c.fax,c.note].filter(Boolean).map(escape).join('<br>')}</p>`).join('')}</details>`);
      }
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
      } else {
        void reviewOrDetail(current, button.dataset.sp, button.dataset.sheet);
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
