/* iPhone setup guide + narrow opt-in arrival capability. No location polling. */
(() => {
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 function create({root,state,api,workAccount,workDevice,isAdmin}){
  let identity='',device='',data=null,opened=false,busy=false,secret='',chosen='',expires='',notice='';
  const endpoint=()=>new URL('/functions/v1/iphone-arrival',window.WORKTIME_CONFIG.supabaseUrl).href;
  function reset(){identity='';device='';data=null;opened=false;secret='';chosen='';expires='';notice='';}
  function scope(){
   const owner=state.profile?.id,worker=workAccount()?.id;
   if(!owner||!worker)return '';
   if(isAdmin())device=workDevice()||'';
   else {const key='worktime-v870-iphone.'+owner;device=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,device);}
   return owner+':'+worker+':'+device;
  }
  const date=value=>new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeZone:'Europe/Berlin'}).format(new Date(value));
  function instructions(){
   if(!secret)return '';
   const customer=data?.customers.find(c=>c.id===chosen);
   return `<section class="iphone-guide"><h4>Einrichtung für ${esc(customer?.name)}</h4><p>${esc(customer?.address)}</p><p class="device-help">Dieser Code erlaubt ausschließlich den Timerstart bei diesem Kunden für dein persönliches Arbeitskonto. Nicht weitergeben. Kein Passwort und kein Zugriff auf Kunden-, Mitarbeiter- oder Rechnungsdaten. Gültig bis ${date(expires)}. Wird er verloren, neu erstellen; der alte Code wird dabei ungültig.</p>
    <label>Server-Adresse<input readonly data-iphone-value="url" value="${esc(endpoint())}"></label><button type="button" class="secondary small" data-iphone-action="copy-url">Adresse kopieren</button>
    <label>Persönlicher Code<input readonly type="password" autocomplete="off" data-iphone-value="code" value="${esc(secret)}"></label><button type="button" class="secondary small" data-iphone-action="copy-code">Code kopieren</button>
    <button type="button" class="secondary" data-iphone-action="test">Verbindung prüfen · startet keinen Timer</button>
    <ol><li>Auf dem iPhone <b>Kurzbefehle → Automation → + → Ankunft</b> öffnen. Die obige Kundenadresse auswählen, den Bereich passend zum bestätigten Standort einstellen und <b>Sofort ausführen</b> wählen. Für jeden gewünschten Kunden ist eine eigene Automation nötig.</li>
    <li>Eine neue leere Automation erstellen. Aktion <b>URL</b> hinzufügen und die kopierte Server-Adresse einsetzen.</li>
    <li>Aktion <b>Inhalte von URL abrufen</b> hinzufügen. Methode <b>POST</b>. Unter <b>Header</b> einen Eintrag hinzufügen: Schlüssel <b>X-Worktime-Arrival</b>, Wert: dein kopierter persönlicher Code.</li>
    <li>Unter <b>Anfragetext → JSON</b> einen Text-Eintrag ergänzen: Schlüssel <b>event</b>, Wert <b>arrival</b>.</li>
    <li>Für die Bestätigung <b>Wert aus Wörterbuch abrufen</b> mit Schlüssel <b>status</b> hinzufügen. Mit einer <b>Wenn</b>-Aktion prüfen, ob der Wert <b>started</b> ist. Nur dann <b>Mitteilung anzeigen</b>: „Dein Baustellen-Timer wurde gestartet.“</li>
    <li>Zuerst bewusst testen: eine eigene heutige Planung beim Kunden muss vorliegen, ohne Urlaub, Krankheit oder NRW-Feiertag. Danach bei der nächsten echten Ankunft mit gesperrtem iPhone prüfen, ob der Timer in der App erscheint. iOS-Freigaben, Netzwerk und Energiesparfunktionen können Ausführung oder Zustellung verzögern.</li></ol>
    <p class="device-help">Kein heutiger eigener Termin: <b>no_plan</b>. Timer läuft bereits: <b>already_running</b>. Heute schon erfasst: <b>already_recorded</b>. Es wird nie eine zweite Zeitbuchung erstellt. Der Timer endet weiterhin erst durch dich; Fahrzeit, Unterschrift und Arbeitsschein bleiben wie bisher. Die Startzeit ist der Eingang der Meldung beim Server, nicht eine rückwirkend garantierte GPS-Ankunft.</p>
    <p><a href="https://support.apple.com/de-de/guide/shortcuts/apd8ebfc4e8e/ios" target="_blank" rel="noopener noreferrer">Apple: Ankunftsautomation</a> · <a href="https://support.apple.com/de-de/guide/shortcuts/apd602971e63/ios" target="_blank" rel="noopener noreferrer">Apple: automatisch ausführen</a></p>
   </section>`;
  }
  function html(){
   const worker=workAccount();
   return `<section class="panel iphone-shortcuts" data-iphone-shortcuts><h3>iPhone · Timer über Kurzbefehle</h3><p class="device-help">Kostenlose zusätzliche Geräte-Automation, kein Hintergrund-GPS der Web-App. Freiwillig und auf deinem iPhone persönlich einzurichten. Nur dein Arbeitskonto ${esc(worker?.display_name||worker?.username||'–')} wird verwendet, niemals die Mitarbeiterauswahl oben. Für wechselnde Kunden müssen die Ankunftsorte auf dem iPhone eingerichtet werden. Ein Test am tatsächlichen Gerät ist nötig; keine garantierte sekundengenaue Ankunft.</p>
   ${!worker?'<p>Als Administrator bitte zuerst oben dein eigenes Arbeitskonto für dieses Gerät verknüpfen.</p>':`<button type="button" class="secondary" data-iphone-action="open">${opened?'Einrichtung aktualisieren':'iPhone-Einrichtung öffnen'}</button>`}
   ${opened&&data?`<form data-form="iphone-shortcut" class="entry-form"><label class="wide">Kunde<select name="shortcut_customer" required><option value="">Kunde auswählen</option>${data.customers.map(c=>`<option value="${esc(c.id)}" ${c.id===chosen?'selected':''} ${!c.ready?'disabled':''}>${esc(c.name)}${c.ready?'':' · bestätigter Standort fehlt'}</option>`).join('')}</select></label><label class="wide device-check"><input type="checkbox" name="shortcut_consent" required> Ich möchte für diesen Kunden eine persönliche iPhone-Ankunftsautomation einrichten. Sie darf nur meinen Timer starten.</label><button class="primary wide">Persönliche Freigabe erstellen</button></form><p class="device-help">Bestätigte Standorte hinterlegt die Geschäftsleitung unter Kunden. Freigaben bleiben unabhängig von der Web-Anmeldung 90 Tage gültig, bis zum Widerruf oder bis Konto, Arbeitskonto-Zuordnung, Adresse oder Standort nicht mehr passen.</p>${instructions()}<h4>Freigaben dieses Geräts</h4>${data.bindings.map(b=>`<article class="row-card"><b>${esc(b.customer_name)}</b><span>${b.valid?'Gültig bis '+date(b.expires_at):'Ungültig oder abgelaufen · neu einrichten'}</span>${b.last_fired_at?`<span>Letzter Timerstart: ${date(b.last_fired_at)}</span>`:''}<button type="button" class="danger small" data-iphone-action="revoke" data-id="${esc(b.id)}">Freigabe widerrufen</button></article>`).join('')||'<p>Noch keine persönlichen Freigaben.</p>'}`:''}
   <p class="iphone-status" role="status">${esc(notice)}</p></section>`;
  }
  function mount(){
   if(!state.profile){reset();return;}
   let next='',storageError=false;try{next=scope();}catch{storageError=true;}
   if(identity!==next){const resolvedDevice=device;reset();identity=next;device=resolvedDevice;}
   if(storageError)notice='Browser-Speicher nicht verfügbar. Einrichtung ist derzeit nicht möglich.';
   if(state.view!=='settings')return;
   const old=root.querySelector('[data-iphone-shortcuts]');if(old)old.outerHTML=html();else root.querySelector('.content')?.insertAdjacentHTML('beforeend',html());
  }
  async function load(stamp=identity){const result=await api('/rest/v1/rpc/shortcut_setup_v870',{method:'POST',body:{p_device:device}});if(stamp!==scope())return false;if(!result?.employee_id||!Array.isArray(result.customers)||!Array.isArray(result.bindings))throw Error('Die iPhone-Anbindung ist derzeit nicht verfügbar.');data=result;opened=true;return true;}
  async function action(task){if(busy)return;busy=true;const stamp=identity;notice='Bitte warten …';root.querySelector('.iphone-status').textContent=notice;try{const message=await task();if(stamp!==scope())return;notice=message||'Gespeichert.';}catch{if(stamp===scope())notice='Die Aktion wurde nicht bestätigt. Bitte Anmeldung und Verbindung prüfen oder die Freigabe neu erstellen.';}finally{busy=false;mount();}}
  async function call(event){const res=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json','X-Worktime-Arrival':secret},body:JSON.stringify({event}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await res.json();if(!res.ok)throw Error('Connection denied');return result;}
  root.addEventListener('submit',event=>{
   const form=event.target;if(form.dataset.form!=='iphone-shortcut')return;event.preventDefault();event.stopImmediatePropagation();
   if(!form.reportValidity())return;
   const customer=form.elements.shortcut_customer.value,stamp=identity;
   action(async()=>{const value=hex(crypto.getRandomValues(new Uint8Array(32))),digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));const result=await api('/rest/v1/rpc/create_shortcut_arrival_v870',{method:'POST',body:{p_device:device,p_customer:customer,p_secret_hash:digest}});if(stamp!==scope())return;if(!result?.id||!result?.expires_at)throw Error('Not confirmed');secret=value;chosen=customer;expires=result.expires_at;await load(stamp);return 'Persönliche Freigabe erstellt. Jetzt die Schritte auf deinem iPhone ausführen. Es wurde kein Timer gestartet.';});
  },true);
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-iphone-action]');if(!button)return;event.preventDefault();const name=button.dataset.iphoneAction;
   if(name==='open')return action(async()=>{await load();return 'Kundenstandort auswählen und die persönliche Freigabe bestätigen.';});
   if(name==='test')return action(async()=>{if(!secret)throw Error('Missing code');const result=await call('test');if(result.status!=='connected')throw Error('Not connected');return 'Server-Verbindung bestätigt. Kein Timer gestartet. Der Standby-Test muss auf deinem iPhone erfolgen.';});
   if(name.startsWith('copy-'))return action(async()=>{if(!secret||!navigator.clipboard?.writeText)throw Error('Clipboard not available');await navigator.clipboard.writeText(name==='copy-code'?secret:endpoint());return name==='copy-code'?'Persönlicher Code kopiert. Nur in deine eigene Kurzbefehle-Automation einsetzen.':'Server-Adresse kopiert.';});
   if(name==='revoke'&&confirm('Diese persönliche Freigabe widerrufen? Die iPhone-Automation kann danach keinen Timer mehr starten. Bestehende Zeiten bleiben erhalten.'))return action(async()=>{const id=button.dataset.id;const result=await api('/rest/v1/rpc/revoke_shortcut_arrival_v870',{method:'POST',body:{p_id:id}});if(result!==true)throw Error('Not revoked');secret='';await load();return 'Freigabe widerrufen. Bitte die zugehörige Automation auch auf dem iPhone deaktivieren.';});
  });
  return {mount,reset};
 }
 window.WorktimeIphoneShortcuts={create};
})();
