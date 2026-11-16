(() => {
  'use strict';

  const addressFields = {name:'Name',name2:'Namenszusatz',name3:'Weiterer Namenszusatz',street:'Straße und Hausnummer',postalCode:'Postleitzahl',city:'Ort',country:'Land'};
  const timeValue = value => String(value ?? '').replace(/^(\d):/,'0$1:').slice(0,5);

  window.WorktimeServicePad = { create({ root, state, businessId, isManager, api, escape }) {
    const scope = () => isManager() && businessId() ? state.profile.id + ':' + businessId() : '';
    let active, editDialog;

    function section(mode, heading) {
      if (!scope()) return '';
      return `<details id="juprowa-settings" data-juprowa-mode="${mode}" class="panel"${active?.key === scope() && active.mode===mode && active.expanded ? ' open' : ''}>
        <summary>${heading}</summary>
        <div id="juprowa-servicepad"><p role="status">Verbindung wird geprüft …</p></div>
      </details>`;
    }

    function customerReview(current, disabled) {
      if (!current.connection || current.form) return '';
      const review = current.customerReview;
      const formatCustomer = row => [row.name,[row.street,row.house_no].filter(Boolean).join(' '),
        [row.postal_code,row.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      return `<section aria-labelledby="juprowa-customer-heading">
        <h3 id="juprowa-customer-heading">Kunden aus Juprowa übernehmen</h3>
        <p>Ergänzt leere Felder bei eindeutig passenden Kunden. Neue Kunden kannst du einzeln wählen. Unklare Zuordnungen bleiben zur Prüfung offen.</p>
        <button type="button" data-sp="customers-preview"${disabled}>Kundenvorschau laden</button>
        ${review ? `<p role="status">${review.applied ? 'Kundendaten ergänzt. Neu angelegt: '+Number(review.counts.added||0)+'. Manuell zugeordnet: '+Number(review.counts.assigned||0)+'. ' : ''}Mögliche Neukunden ${review.counts.new} · Eindeutig zugeordnet ${review.counts.linked} · Zu prüfen ${review.counts.review}</p>
          ${!review.applied&&review.review?.length ? `<details><summary>Unklare Zuordnungen einzeln prüfen</summary><ul>${review.review.map(row =>
            `<li>${row.matches?.length?`<label>${escape(formatCustomer(row))}<select data-juprowa-assignment="${escape(row.id)}"${disabled}>
              <option value="">Überspringen</option>${row.matches.map(match=>`<option value="${escape(match.id)}"${current.assignments?.get(row.id)===match.id?' selected':''}>${escape(formatCustomer(match))}</option>`).join('')}</select></label>`:
              `${escape(formatCustomer(row))} · Kein verfügbarer Treffer`}</li>`).join('')}</ul></details>` : ''}
          ${!review.applied&&review.new_candidates?.length?`<details><summary>Neukunden auswählen</summary>
            <button type="button" data-sp="customers-select-all"${disabled}>Alle auswählen</button>
            <button type="button" data-sp="customers-select-none"${disabled}>Auswahl aufheben</button>
            ${review.next?'<p>Die Auswahl gilt für die aktuell geladene Kundenseite.</p>':''}
            <ul>${review.new_candidates.map(row=>`<li><label><input type="checkbox" data-juprowa-new value="${escape(row.id)}"${current.newCustomers?.has(row.id)?' checked':''}${disabled}> ${escape(formatCustomer(row))}</label></li>`).join('')}</ul></details>`:''}
          ${!review.applied && (review.counts.new + review.counts.linked > 0 || review.review?.some(row=>row.matches?.length)) ? `<button type="button" class="primary" data-sp="customers-import"${disabled}>Fehlende Daten ergänzen und Auswahl übernehmen</button>
            <div class="notice" data-customer-confirm hidden><p role="status"></p><button type="button" class="primary" data-sp="customers-confirm">Kundenübernahme bestätigen</button>
              <button type="button" data-sp="customers-cancel-confirm">Auswahl weiter bearbeiten</button></div>` : ''}
          ${review.next ? `<button type="button" data-sp="customers-next"${disabled}>Nächste Kundenseite prüfen</button>` : ''}` : ''}
      </section>`;
    }

    function sheetDetail(sheet) {
      if (!sheet) return '';
      const definition = [
        ['Projekt', sheet.project], ['Einsatzort', sheet.service], ['Rechnungsanschrift', sheet.billing],
        ['Auszuführen', sheet.requested], ['Ausgeführt', sheet.completed], ['Notizen', sheet.notes],
      ].filter(([, value]) => value);
      return `<section class="panel" id="juprowa-worksheet-detail" tabindex="-1"><h3>Arbeitsschein ${escape(sheet.number)}</h3>
        <button type="button" class="primary" data-sp="worksheet-edit">In der Arbeitszeiterfassung bearbeiten</button>
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

    function addressInputs(label, key, address) {
      return `<details class="wide"><summary>${label} bearbeiten</summary><div class="form-grid">${Object.entries(addressFields).map(([name,title])=>
        `<label>${title}<input name="${key}-${name}" maxlength="${name==='postalCode'?16:100}" value="${escape(address?.[name] || '')}"></label>`).join('')}</div></details>`;
    }

    function timeRow(sheet, row={}, originalIndex) {
      const workers = sheet.workers || [];
      const current = row.workerId || '';
      const previous = current && !workers.some(worker=>worker.id===current)
        ? `<option value="${escape(current)}" selected>${escape(row.worker || current)}</option>` : '';
      const timeInput = (label, key) => `<label>${label}<input type="time" name="${key}" value="${escape(timeValue(row[key]))}"${originalIndex==null&&['start','end'].includes(key)?' required':''}></label>`;
      return `<fieldset class="form-grid" data-sp-row="time" data-original="${originalIndex ?? ''}"><legend>Zeitabschnitt</legend>
        <label>Datum<input type="date" name="day" value="${escape(row.day || (originalIndex==null && sheet.times.at(-1)?.day) || '')}"${originalIndex==null?' required':''}></label>
        <label>Monteur<select name="workerId"${originalIndex==null?' required':''}><option value="">Monteur auswählen</option>${previous}${workers.map(worker=>
          `<option value="${escape(worker.id)}"${worker.id===current?' selected':''}>${escape(worker.name)}</option>`).join('')}</select></label>
        ${timeInput('Arbeitsbeginn','start')}${timeInput('Arbeitsende','end')}
        ${timeInput('Pausenbeginn','breakStart')}
        <label>Pause in Minuten<input name="breakMinutes" type="number" min="0" max="720" step="1" value="${escape(row.breakMinutes || '')}"></label>
        ${timeInput('Anfahrt von','travelStart')}${timeInput('Anfahrt bis','travelEnd')}
        <label>Anfahrtskilometer<input name="travelKm" type="number" min="0" max="99999" step="1" value="${escape(row.travelKm || '')}"></label>
        <div class="wide"><button type="button" data-sp-remove>Zeitabschnitt entfernen</button></div>
      </fieldset>`;
    }

    function materialRow(row={}, originalIndex) {
      const editable = row.editableIdentity !== false;
      return `<fieldset class="form-grid" data-sp-row="material" data-original="${originalIndex ?? ''}"><legend>Materialposition</legend>
        ${editable ? `<label>Artikelnummer<input name="article" maxlength="26" value="${escape(row.article || '')}"></label>
          <label>Lieferantenkürzel<input name="supplier" maxlength="5" value="${escape(row.supplier || '')}"></label>
          <label class="wide">Bezeichnung<textarea name="description" rows="2" maxlength="4000">${escape(row.description || row.name || '')}</textarea></label>` :
          `<p class="wide">${escape(row.name || row.article || 'Verknüpfte Position')}</p>`}
        <label>Menge<input name="quantity" inputmode="decimal" value="${escape(row.quantity || '')}"${originalIndex==null?' required':''}></label>
        <label>Einheit<input name="unit" maxlength="4" value="${escape(row.unit || '')}"></label>
        ${editable?'<div class="wide"><button type="button" data-sp-remove>Materialposition entfernen</button></div>':''}
      </fieldset>`;
    }

    function collectRows(form, type) {
      return [...form.querySelectorAll(`[data-sp-row="${type}"]`)].map(row=>{
        const originalIndex = row.dataset.original === '' ? null : Number(row.dataset.original);
        const patch = { originalIndex };
        for (const field of row.querySelectorAll('[name]')) {
          if (originalIndex === null || field.dataset.originalValue !== field.value) patch[field.name] = field.value;
        }
        return patch;
      });
    }

    function openSheetEditor(current) {
      const sheet=current.sheetDetail;
      if(!sheet||current.busy||!current.connection)return;
      editDialog?.close();
      const dialog=document.createElement('dialog');
      editDialog=dialog;
      dialog.className='panel';
      dialog.setAttribute('aria-labelledby','sp-edit-title');
      dialog.style.maxWidth='min(780px,96vw)';
      dialog.innerHTML=`<form method="dialog" class="entry-form">
        <h2 class="wide" id="sp-edit-title">Juprowa-Arbeitsschein ${escape(sheet.number)}</h2>
        ${sheet.project?`<p class="wide">Projekt ${escape(sheet.project)}</p>`:''}
        ${addressInputs('Einsatzort','service',sheet.addresses?.service)}
        ${addressInputs('Rechnungsanschrift','billing',sheet.addresses?.billing)}
        <label class="wide">Auszuführen<textarea name="requested" rows="3" maxlength="12000">${escape(sheet.requested)}</textarea></label>
        <label class="wide">Ausgeführt<textarea name="completed" rows="3" maxlength="12000">${escape(sheet.completed)}</textarea></label>
        <label class="wide">Notizen<textarea name="notes" rows="3" maxlength="12000">${escape(sheet.notes)}</textarea></label>
        <fieldset class="wide"><legend>Arbeitszeiten</legend><div data-sp-rows="time">${sheet.times.map((row,i)=>timeRow(sheet,row,i)).join('')}</div>
          <button type="button" data-sp-add="time"${sheet.workers?.length?'':' disabled'}>Zeitabschnitt hinzufügen</button>
          ${sheet.workers?.length?'':'<p>Juprowa hat keine verfügbaren Monteure für neue Zeitabschnitte geliefert.</p>'}
        </fieldset>
        <fieldset class="wide"><legend>Material</legend><div data-sp-rows="material">${sheet.materials.map((row,i)=>materialRow(row,i)).join('')}</div>
          <button type="button" data-sp-add="material">Materialposition hinzufügen</button>
        </fieldset>
        ${sheet.attachmentCount||sheet.formCount?`<p class="wide">Vorhanden in Juprowa: ${Number(sheet.attachmentCount)||0} Anhänge · ${Number(sheet.formCount)||0} Formulare</p>`:''}
        <details class="wide"><summary>Unterschrift für den Abschluss</summary>
          <label>Name der unterschreibenden Person<input name="signer" maxlength="150"></label>
          <canvas width="760" height="230" aria-label="Unterschriftenfeld" style="width:100%;touch-action:none;border:1px solid #b5c9bc;background:#fff"></canvas>
          <button type="button" data-sp-clear>Unterschrift löschen</button>
        </details>
        <div class="wide notice" data-sp-confirm-panel hidden><p data-sp-confirm-text></p>
          <button type="submit" class="primary" value="confirm">Übertragung bestätigen</button>
          <button type="button" data-sp-return>Weiter bearbeiten</button></div>
        <p class="wide" role="status" data-sp-editor-status></p>
        <div class="wide actions"><button type="submit" value="save">Änderungen speichern</button>
          <button type="submit" value="close" class="primary">Arbeitsschein abschließen</button>
          <button type="button" data-sp-cancel>Abbrechen</button></div>
      </form>`;
      const form=dialog.querySelector('form'),canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');
      const confirmation=dialog.querySelector('[data-sp-confirm-panel]');
      for (const field of form.querySelectorAll('[name]')) field.dataset.originalValue=field.value;
      let strokes=[],pointer=null,drawing=null,pending=null;
      const resetConfirmation=()=>{pending=null;confirmation.hidden=true;};
      form.addEventListener('input',resetConfirmation);
      form.addEventListener('click',event=>{
        const control=event.target.closest('[data-sp-add],[data-sp-remove]');
        if (!control || current.busy) return;
        resetConfirmation();
        if (control.hasAttribute('data-sp-remove')) {
          control.closest('[data-sp-row]').remove();
          return;
        }
        const type=control.dataset.spAdd;
        const rows=form.querySelector(`[data-sp-rows="${type}"]`);
        rows.insertAdjacentHTML('beforeend',type==='time'?timeRow(sheet):materialRow());
        rows.lastElementChild.querySelector('input')?.focus();
      });
      dialog.querySelector('[data-sp-return]').onclick=resetConfirmation;
      ctx.strokeStyle='#143a31';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';
      const point=e=>{
        const box=canvas.getBoundingClientRect();
        return [Math.min(canvas.width,Math.max(0,Math.round((e.clientX-box.left)*canvas.width/box.width))),
          Math.min(canvas.height,Math.max(0,Math.round((e.clientY-box.top)*canvas.height/box.height)))];
      };
      canvas.addEventListener('pointerdown',e=>{
        if(pointer!==null||e.button!==0)return;
        resetConfirmation();
        pointer=e.pointerId;canvas.setPointerCapture(pointer);
        drawing=[point(e)];strokes.push(drawing);
      });
      canvas.addEventListener('pointermove',e=>{
        if(pointer!==e.pointerId||drawing.length>=12000)return;
        const next=point(e), previous=drawing.at(-1);
        if(next[0]===previous[0]&&next[1]===previous[1])return;
        drawing.push(next);ctx.beginPath();ctx.moveTo(...previous);ctx.lineTo(...next);ctx.stroke();
      });
      for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
        if(pointer===e.pointerId){pointer=null;drawing=null;}
      });
      dialog.querySelector('[data-sp-clear]').onclick=()=>{resetConfirmation();strokes=[];pointer=null;drawing=null;ctx.clearRect(0,0,canvas.width,canvas.height);};
      dialog.querySelector('[data-sp-cancel]').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{if(editDialog===dialog)editDialog=null;dialog.remove();});
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(active!==current||scope()!==current.key||current.busy)return;
        const status=dialog.querySelector('[data-sp-editor-status]');
        const choice=event.submitter?.value;
        if(choice!=='confirm') {
          const closing=choice==='close',values=new FormData(form);
          const signature={name:String(values.get('signer')||'').trim(),strokes:structuredClone(strokes)};
          if(closing&&(!signature.name||!strokes.some(stroke=>stroke.length>1))){
            status.textContent='Bitte Namen und Unterschrift für den Abschluss erfassen.';return;
          }
          pending={closing,payload:{
            confirmed:true,worksheetId:sheet.id,sheetRevision:sheet.revision,signature:closing?signature:undefined,
            edits:{rowFormat:2,requested:values.get('requested'),completed:values.get('completed'),notes:values.get('notes'),
              addresses:Object.fromEntries(['service','billing'].map(key=>[key,Object.fromEntries(Object.keys(addressFields).flatMap(name=>{
                const field=form.elements.namedItem(`${key}-${name}`);
                return field.value===field.dataset.originalValue?[]:[[name,field.value]];
              }))])),
              times:collectRows(form,'time'),materials:collectRows(form,'material')},
          }};
          confirmation.querySelector('[data-sp-confirm-text]').textContent=closing?
            `Arbeitsschein ${sheet.number} unterschrieben in Juprowa abschließen?`:
            `Änderungen an Arbeitsschein ${sheet.number} in Juprowa speichern?`;
          confirmation.hidden=false;
          confirmation.querySelector('button').focus();
          return;
        }
        if(!pending)return;
        const {closing,payload}=pending;
        resetConfirmation();
        current.busy=true;
        const controls=[...form.querySelectorAll('input, select, textarea, button')].filter(control=>!control.disabled);
        controls.forEach(control=>{control.disabled=true;});
        status.textContent='Juprowa speichert den Arbeitsschein und bestätigt den Stand …';
        try{
          const result=await call(current,closing?'worksheet-close':'worksheet-save',payload);
          if(active!==current||scope()!==current.key)return;
          current.busy=false;dialog.close();
          current.outcome=result.closed?'Juprowa hat den Abschluss bestätigt.':'Juprowa hat die Änderungen bestätigt.';
          await run(current,'list');
        }catch(error){status.textContent=error.message||'Juprowa hat das Speichern nicht bestätigt.';}
        finally{current.busy=false;controls.forEach(control=>{control.disabled=false;});}
      });
      document.body.append(dialog);dialog.showModal();
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
        ? `${current.mode==='customers'?'':`<button type="button" data-sp="refresh"${muted}>Arbeitsscheine aktualisieren</button>`}
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
      const worksheets = current.mode!=='customers'&&Array.isArray(current.worksheets) ? current.worksheets : null;
      const list = worksheets
        ? `<h3>Offene Arbeitsscheine (${worksheets.length})</h3>
          ${worksheets.length ? `<label>Juprowa-Arbeitsschein suchen<input type="search" data-sp-filter value="${escape(current.sheetFilter||'')}" placeholder="Schein-, Projektnummer oder Kunde"></label>
          <ul class="servicepad-worksheets">${worksheets.map(sheet => `<li data-sp-search="${escape([sheet.number,sheet.project,sheet.customer,sheet.location].filter(Boolean).join(' ').toLowerCase())}"><details>
            <summary>${escape([sheet.number, sheet.project?'Projekt '+sheet.project:'', sheet.customer, sheet.date?.split('-').reverse().join('.')].filter(Boolean).join(' · '))}</summary>
            ${sheet.location ? `<p>Einsatzort <strong>${escape(sheet.location)}</strong></p>` : ''}
            ${sheet.technician ? `<p>Monteur <strong>${escape(sheet.technician)}</strong></p>` : ''}
            ${sheet.description ? `<p style="white-space: pre-wrap">${escape(sheet.description)}</p>` : ''}
            <button type="button" data-sp="worksheet-detail" data-sheet="${escape(sheet.id)}"${muted}>Details öffnen</button>
            <button type="button" class="primary" data-sp="worksheet-detail" data-sheet="${escape(sheet.id)}" data-sp-open-editor${muted}>Arbeitsschein bearbeiten</button>
          </details></li>`).join('')}</ul>` : '<p>Im verknüpften Mandanten sind keine offenen Arbeitsscheine verfügbar.</p>'}` : '';
      panel.innerHTML = account + info
        + (current.outcome?`<p role="status">${escape(current.outcome)}</p>`:'')
        + (current.busy ? '<p role="status">ServicePad wird abgefragt …</p>' : '')
        + (current.loaded ? '' : `<button type="button" data-sp="refresh"${muted}>Verbindung prüfen</button>`)
        + buttons + form + (current.mode==='orders'?'':customerReview(current, muted)) + sheetDetail(current.sheetDetail) + list;
      filterSheets(panel,current.sheetFilter||'');
    }

    function filterSheets(panel,value) {
      const query=value.toLowerCase().trim();
      for(const item of panel.querySelectorAll('[data-sp-search]'))item.hidden=!item.dataset.spSearch.includes(query);
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
        if (action === 'status' && result.connection && current.mode!=='customers') result = await call(current, 'list');
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

    async function reviewOrDetail(current, command, sheetId, openEditor) {
      if (current.busy || !current.connection) return;
      const previous = current.customerReview;
      const importing = command === 'customers-confirm';
      const newCustomers=importing?[...(current.newCustomers ?? [])]:[];
      const customerAssignments=importing?Object.fromEntries(current.assignments ?? []):{};
      if (importing && !previous?.fingerprint) return;
      const detail = command === 'worksheet-detail';
      const cursor = importing ? previous.cursor : command === 'customers-next' ? previous?.next : '0';
      current.busy = true;
      current.message = '';
      if (detail) current.sheetDetail = null;
      paint(current);
      try {
        const result = await call(current, detail ? command : importing ? 'customers-import' : 'customers-preview',
          detail ? { worksheetId: sheetId } : { cursor, fingerprint: importing ? previous.fingerprint : undefined, newCustomers, customerAssignments });
        if (active !== current || scope() !== current.key) return;
        if (detail) current.sheetDetail = result.detail;
        else {
          current.customerReview = { ...result, cursor, review: result.review ?? [] };
          current.newCustomers=new Set();
          current.assignments=new Map();
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
          if (openEditor) openSheetEditor(current);
          else root.querySelector('#juprowa-worksheet-detail')?.focus();
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
        editDialog?.close();
        return;
      }
      const mode=section.dataset.juprowaMode;
      if(active?.mode!==mode)active=null;
      if(!active)editDialog?.close();
      active ??= { key, business: businessId(), mode, expanded: false };
      const current = active;
      section.addEventListener('toggle', () => {
        if (!section.isConnected || active !== current || scope() !== current.key) return;
        current.expanded = section.open;
        if (section.open && !current.loaded && !current.busy) void run(current, 'status');
      });
      if (current.expanded) paint(current);
    }

    root.addEventListener('input',event=>{
      if(!event.target.matches('[data-sp-filter]')||!active||scope()!==active.key)return;
      active.sheetFilter=event.target.value;
      filterSheets(event.target.closest('#juprowa-servicepad'),active.sheetFilter);
    });

    root.addEventListener('change',event=>{
      const field=event.target, current=active;
      if (!current || current.busy || scope()!==current.key || !field.matches('[data-juprowa-new],[data-juprowa-assignment]')) return;
      const confirmation=field.closest('#juprowa-servicepad').querySelector('[data-customer-confirm]');
      if (confirmation) confirmation.hidden=true;
      if (field.hasAttribute('data-juprowa-new')) {
        if (field.checked) current.newCustomers.add(field.value);
        else current.newCustomers.delete(field.value);
      } else if (field.value) current.assignments.set(field.dataset.juprowaAssignment,field.value);
      else current.assignments.delete(field.dataset.juprowaAssignment);
    });

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
      } else if (button.dataset.sp==='worksheet-edit') {
        openSheetEditor(current);
      } else if (button.dataset.sp==='customers-select-all'||button.dataset.sp==='customers-select-none') {
        const panel=button.closest('#juprowa-servicepad'), all=button.dataset.sp==='customers-select-all';
        const checkboxes=[...panel.querySelectorAll('[data-juprowa-new]')];
        for (const checkbox of checkboxes) checkbox.checked=all;
        current.newCustomers=new Set(all?checkboxes.map(checkbox=>checkbox.value):[]);
        const confirmation=panel.querySelector('[data-customer-confirm]');
        if (confirmation) confirmation.hidden=true;
      } else if (button.dataset.sp==='customers-import'||button.dataset.sp==='customers-cancel-confirm') {
        const panel=button.closest('#juprowa-servicepad').querySelector('[data-customer-confirm]');
        panel.hidden=button.dataset.sp==='customers-cancel-confirm';
        if (!panel.hidden) {
          const added=current.newCustomers?.size||0, manual=current.assignments?.size||0;
          const count=Number(current.customerReview?.counts.linked||0)+added+manual;
          panel.querySelector('[role=status]').textContent=count?`${added} Neukunden anlegen, ${manual} Kunden manuell zuordnen und fehlende Angaben ergänzen?`:'Wähle zuerst mindestens einen Kunden oder eine Zuordnung aus.';
          panel.querySelector('[data-sp="customers-confirm"]').disabled=!count;
        }
      } else {
        void reviewOrDetail(current, button.dataset.sp, button.dataset.sheet, button.hasAttribute('data-sp-open-editor'));
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

    return { settings:()=>section('settings','Juprowa ServicePad'),customers:()=>section('customers','Juprowa-Kundendaten ergänzen'),
      orders:()=>section('orders','Offene Juprowa-Arbeitsscheine'),afterRender };
  } };
})();
