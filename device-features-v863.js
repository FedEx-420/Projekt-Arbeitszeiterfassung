/* Device features stay separate from time booking and material registration. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => value == null || value === '' ? '' : Number(value).toFixed(2);
  function amount(value) {
    if (String(value ?? '').trim() === '') return null;
    const number = Number(String(value).replace(/\s|€/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
  }
  function parseReceipt(text) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const result = {items:[],gross:null,net:null,vatRate:null,raw:String(text || '')};
    const rates = [...new Set([...result.raw.matchAll(/\b(19|7)[,.]?(?:00)?\s*%/g)].map(match => Number(match[1])))];
    if (rates.length === 1) result.vatRate = rates[0];
    for (const line of lines) {
      const numbers = [...line.matchAll(/(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}(?!\d)/g)];
      if (!numbers.length) continue;
      const last = numbers.at(-1), value = amount(last[0]);
      if (/\b(netto|net\b|nettobetrag)/i.test(line)) { result.net=value; continue; }
      if (/\b(brutto|gesamt|summe|zu zahlen|endbetrag|total|eur\s+betrag)/i.test(line) && !/steuer|mwst|ust/i.test(line)) { result.gross=value; continue; }
      if (/steuer|mwst|ust\b|bar\b|karte|rückgeld|gegeben|zahlung|rabatt|\bdatum\b|tel[.:]|\biban\b|\bbon\b/i.test(line)) continue;
      const name = line.slice(0,last.index).replace(/\s+\d+[,.]\d{2}\s*$/,'').replace(/\s+[AB]\s*$/,'').trim();
      if (/[a-zäöüß]/i.test(name) && name.length > 1) result.items.push({name,gross:value,net:null});
    }
    // A printed, single tax rate permits a proposed conversion. Mixed/absent
    // rates stay blank: never invent a 19% rate or overwrite printed totals.
    if (result.vatRate != null) {
      for (const item of result.items) item.net=Math.round(item.gross/(1+result.vatRate/100)*100)/100;
      if (result.net == null && result.gross != null) result.net=Math.round(result.gross/(1+result.vatRate/100)*100)/100;
    }
    return result;
  }
  function markField(field, message) {
    field.classList.add('field-error');field.setAttribute('aria-invalid','true');
    let note=field.parentElement.querySelector(':scope > .field-error-note');
    if(!note){note=document.createElement('small');note.className='field-error-note';field.after(note);}
    note.textContent=message;
  }
  function clearField(field) {
    field.classList.remove('field-error');field.removeAttribute('aria-invalid');
    field.parentElement?.querySelector(':scope > .field-error-note')?.remove();
  }
  function validateForm(form) {
    if (!form || form.noValidate) return true;
    const missing=[];
    for (const field of form.querySelectorAll('input,select,textarea')) {
      if (!field.willValidate) continue;
      if ((field.required && !['checkbox','radio','file'].includes(field.type) && !field.value.trim()) || !field.validity.valid) {
        markField(field,field.validity.valueMissing || !field.value.trim() ? 'Bitte ausfüllen.' : 'Bitte die Eingabe prüfen.');missing.push(field);
      } else clearField(field);
    }
    const signature=form.querySelector('.signature-pad'), data=form.elements.signature_data?.value;
    if(signature && (!data?.startsWith('data:image/png;base64,') || data.length<200)) {markField(signature,'Bitte unterschreiben.');missing.push(signature);}
    else if(signature)clearField(signature);
    form.querySelector(':scope > .form-error-summary')?.remove();
    if(missing.length){const summary=document.createElement('p');summary.className='form-error-summary';summary.setAttribute('role','alert');summary.textContent='Bitte die rot markierten Felder vervollständigen oder korrigieren.';form.prepend(summary);missing[0].scrollIntoView({block:'center'});missing[0].focus({preventScroll:true});}
    return !missing.length;
  }
  function initValidation(root) {
    root.addEventListener('invalid',event=>{const form=event.target.closest('form');if(form)validateForm(form);},true);
    root.addEventListener('click',event=>{const button=event.target.closest('button,input[type="submit"]');if(button&&button.form&&!button.disabled&&(button.type==='submit'||button.hasAttribute('data-signature-submit'))&&!validateForm(button.form)){event.preventDefault();event.stopImmediatePropagation();}},true);
    root.addEventListener('submit',event=>{if(!validateForm(event.target)){event.preventDefault();event.stopImmediatePropagation();}},true);
    root.addEventListener('input',event=>{const field=event.target;if(field.classList?.contains('field-error')&&field.validity?.valid&&(!field.required||field.value.trim()))clearField(field);});
    root.addEventListener('change',event=>{const field=event.target;if(field.classList?.contains('field-error')&&field.validity?.valid)clearField(field);});
  }
  function create(ctx) {
    const {root,state,api,write,allRows,upload,remove,download,render,businessId,workerId,isManager,isAdmin,orderForEmployee,orderHours,dateText,timeText,h,planningMeta,planEmployeeIds,logout}=ctx;
    let scans=[],settings=[],reminders=[],remindersReady=false,loading=null,loadedUser='',ocr=null,dialog=null,scanForm=null,scanFile=null,scanPath='',scanId='',savedScan=null;
    let pushActive=false,pushDeviceId='',pushSubscription=null,pushRegistration=null,pushKey='',pushReadyUser='',pushIssue='',deviceBusy=false,ocrPrefix='';
    let locations=[],arrivals=[],watchId=null,watchOrder='',gpsSaving=false,gpsPausedOrder='',locationAllowed=false,locationPermission='prompt',locationPermissionHandle=null;
    let workContext=null,workContextReady=false,workDeviceId='';
    const workAccount=()=>isAdmin()?state.rows.people.find(p=>same(p.id,workContext?.employee_id)&&['employee','business'].includes(p.role)&&same(p.role==='business'?p.id:p.business_id,workContext.business_id)):state.profile;
    const workCompany=()=>{const p=workAccount();return p?.role==='business'?p.id:p?.business_id||'';};
    const metres=(a,b)=>{const rad=value=>value*Math.PI/180;const q=Math.sin(rad(a.latitude-b.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(a.longitude-b.longitude)/2)**2;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(q)));};
    const arrivalTimer=window.WorktimeArrivalTimer?.create({...ctx,workAccount,workCompany,workDevice:()=>isAdmin()?workContext?.id||'':'',metres,locations:()=>locations,locationAllowed:()=>locationAllowed,pushDevice:()=>pushActive?pushDeviceId:''});
    function stopGps(){if(watchId!=null)navigator.geolocation?.clearWatch(watchId);watchId=null;watchOrder='';}
    initValidation(root);
    const same=(a,b)=>String(a||'')===String(b||'');
    const announce=(target,text)=>{if(target){target.textContent=text;target.setAttribute('role','status');}};
    const locationConsentKey=user=>'worktime-v864-location.'+user+(isAdmin()?'.'+(workContext?.employee_id||'none'):'');
    async function loadWorkContext(user){
      workContextReady=false;workContext=null;workDeviceId='';
      if(!isAdmin()){workContextReady=true;return;}
      try{
        const key='worktime-v866-device.'+user;workDeviceId=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,workDeviceId);
        const rows=await allRows('work_device_contexts',`select=*&id=eq.${workDeviceId}&owner_id=eq.${user}`);
        if(!same(state.profile?.id,user))return;
        workContext=rows.find(row=>same(row.owner_id,user)&&same(row.id,workDeviceId))||null;
        if(workContext&&!workAccount())workContext=null;
        workContextReady=true;
      }catch{workContext=null;}
    }
    async function saveWorkContext(form){
      if(!isAdmin()||!workContextReady||!workDeviceId)throw Error('Die Geräteverknüpfung konnte nicht geladen werden. Bitte aktualisieren.');
      const actor=state.profile.id,employee=form.elements.work_employee.value||null,previous=workContext?.employee_id;
      const saved=await api('/rest/v1/rpc/set_work_device_context',{method:'POST',body:{p_device:workDeviceId,p_employee:employee,p_subscription:pushActive?pushDeviceId:null}});
      if(!same(actor,state.profile?.id))throw Error('Die Anmeldung wurde geändert.');
      if(employee&&(!saved?.id||!same(saved.employee_id,employee)||!same(saved.owner_id,actor)))throw Error('Die Verknüpfung wurde nicht bestätigt.');
      stopGps();arrivalTimer?.reset();if(!same(previous,employee))setLocationConsent(false);workContext=saved;
      if(!same(previous,employee))setLocationConsent(false);
      await arrivalTimer?.load();render();
      return employee?'Persönliches Arbeitskonto für dieses Gerät gespeichert. Push bitte erlauben; Standort bei Bedarf separat freigeben.':'Persönliches Arbeitskonto getrennt. Standortprüfung ausgeschaltet; vorhandene Timer bleiben gespeichert.';
    }
    async function bindWorkPush(user){
      if(!isAdmin()||!workAccount()||!pushActive||same(workContext.subscription_id,pushDeviceId))return;
      const device=workContext.id,employee=workContext.employee_id;
      const saved=await api('/rest/v1/rpc/set_work_device_context',{method:'POST',body:{p_device:device,p_employee:employee,p_subscription:pushDeviceId}});
      if(!same(user,state.profile?.id)||!same(device,workContext?.id)||!same(employee,workContext?.employee_id))return;
      if(!same(saved?.subscription_id,pushDeviceId))throw Error('Die Erinnerungen konnten nicht mit dem persönlichen Arbeitskonto verknüpft werden.');
      workContext=saved;
    }
    function workContextHtml(){
      if(!isAdmin())return '';
      const people=state.rows.people.filter(p=>['employee','business'].includes(p.role)),company=p=>state.rows.people.find(b=>same(b.id,p.role==='business'?p.id:p.business_id))?.company_name||state.rows.people.find(b=>same(b.id,p.role==='business'?p.id:p.business_id))?.username||'Firma';
      return `<div class="device-permission-card"><h4>Mein Arbeitskonto auf diesem Gerät</h4><p class="device-help">Du bleibst Administrator mit allen bisherigen Einsichten. Wähle einmal dein eigenes Arbeitskonto für persönliche Terminerinnerungen und GPS-Timer. Die Mitarbeiterauswahl oben ändert diese Zuordnung nicht. Nur dieses Gerät wird verknüpft. Bei Änderung muss Standort erneut freigegeben werden; vorhandene Timer werden nicht gelöscht.</p>${workContextReady?`<form data-form="work-device-context" class="entry-form"><label class="wide">Persönliches Arbeitskonto<select name="work_employee"><option value="">Kein Arbeitskonto verknüpft</option>${people.sort((a,b)=>(company(a)+a.username).localeCompare(company(b)+b.username,'de')).map(p=>`<option value="${esc(p.id)}" ${same(p.id,workContext?.employee_id)?'selected':''}>${esc(company(p))} · ${esc(p.display_name||p.username)}</option>`).join('')}</select></label><button class="primary wide">Arbeitskonto auf diesem Gerät speichern</button></form>`:'<p role="alert">Verknüpfung konnte nicht geladen werden. Bitte Verbindung und Browser-Speicher prüfen und die App aktualisieren.</p>'}<p class="work-context-status" role="status"></p></div>`;
    }
    function readLocationConsent(user){try{return localStorage.getItem(locationConsentKey(user))==='allowed';}catch{return false;}}
    function setLocationConsent(allowed){if(!allowed){locationAllowed=false;stopGps();}try{if(allowed)localStorage.setItem(locationConsentKey(state.profile.id),'allowed');else localStorage.removeItem(locationConsentKey(state.profile.id));}catch{if(allowed)throw Error('Die Freigabe kann auf diesem Gerät nicht gespeichert werden. Bitte den Browser-Speicher erlauben.');}locationAllowed=allowed;arrivalTimer?.refresh();}
    async function loadLocationPermission(user){
      locationAllowed=readLocationConsent(user);locationPermission='prompt';
      if(locationPermissionHandle)locationPermissionHandle.onchange=null;locationPermissionHandle=null;
      try{const handle=await navigator.permissions?.query({name:'geolocation'});if(!same(state.profile?.id,user))return;
        if(handle){locationPermissionHandle=handle;locationPermission=handle.state;const changed=()=>{if(!same(state.profile?.id,user))return;locationPermission=handle.state;if(handle.state==='denied')setLocationConsent(false);refreshDeviceSettings();};handle.onchange=changed;if(handle.state==='denied')setLocationConsent(false);}
      }catch{} // Safari may not expose geolocation through the Permissions API.
    }
    async function preparePush(user=state.profile?.id){
      pushActive=false;pushDeviceId='';pushIssue='';
      if(!user||!navigator.serviceWorker||!window.PushManager||!window.Notification)return;
      try{
        const registration=await navigator.serviceWorker.getRegistration();
        if(!registration?.active){pushRegistration=null;pushSubscription=null;return;}
        const data=pushReadyUser===user&&pushKey?{publicKey:pushKey}:await api('/functions/v1/appointment-reminders?action=public-key');
        if(!same(state.profile?.id,user))return;
        pushKey=data?.publicKey||'';pushReadyUser=user;pushRegistration=registration?.active?registration:null;
        pushSubscription=await pushRegistration?.pushManager.getSubscription()||null;
        if(pushSubscription){const rows=await allRows('push_subscriptions',`select=*&user_id=eq.${user}&endpoint=eq.${encodeURIComponent(pushSubscription.endpoint)}`);if(!same(state.profile?.id,user))return;const registered=rows.find(row=>same(row.user_id,user));if(!registered||!registered.enabled){await pushSubscription.unsubscribe();pushSubscription=null;}else{pushDeviceId=registered.id;pushActive=Notification.permission==='granted';}}
        await bindWorkPush(user);
        if(!pushKey)pushIssue='Push ist auf dem Server noch nicht eingerichtet.';
      }catch{if(same(state.profile?.id,user))pushIssue='Die Gerätefreigabe konnte nicht geprüft werden. Bitte Verbindung prüfen und erneut versuchen.';}
    }
    function refreshDeviceSettings(){const panel=root.querySelector('[data-device-settings]');if(panel)panel.outerHTML=deviceSettings();}
    async function openPersonalDeviceView(view){
      const user=state.profile?.id,device=workContext?.id,employee=workAccount()?.id;if(!user)return;
      if(isAdmin()&&workAccount()){state.businessId=workCompany();state.employeeId=employee;await ctx.loadTeamContext?.();if(!same(user,state.profile?.id)||!same(device,workContext?.id)||!same(employee,workAccount()?.id))return;}
      state.view=view==='home'?'home':'planning';state.menu=false;render();
    }
    async function load() {
      const user=state.profile?.id;if(!user){scans=[];settings=[];reminders=[];remindersReady=false;locations=[];arrivals=[];stopGps();arrivalTimer?.reset();locationAllowed=false;pushActive=false;pushDeviceId='';pushReadyUser='';loadedUser='';workContext=null;workContextReady=false;workDeviceId='';return;}
      if(loading)return loading;
      const task=(async()=>{
        const results=await Promise.allSettled([allRows('receipt_scans','select=*&order=receipt_date.desc,id.asc'),allRows('company_notification_settings'),allRows('customer_locations'),allRows('order_arrivals'),allRows('appointment_reminders')]);
        if(!same(state.profile?.id,user))return;
        if(!same(loadedUser,user)){scans=[];settings=[];reminders=[];remindersReady=false;locations=[];arrivals=[];stopGps();gpsPausedOrder='';pushSubscription=null;pushRegistration=null;}loadedUser=user;
        if(results[0].status==='fulfilled')scans=results[0].value;
        if(results[1].status==='fulfilled')settings=results[1].value;
        if(results[2].status==='fulfilled')locations=results[2].value;
        if(results[3].status==='fulfilled')arrivals=results[3].value;
        remindersReady=results[4].status==='fulfilled';reminders=remindersReady?results[4].value:[];
        await loadWorkContext(user);
        await Promise.all([preparePush(user),loadLocationPermission(user),arrivalTimer?.load()]);
      })();loading=task;try{await task;}finally{if(loading===task)loading=null;}
    }
    function customerOrders(customer) {
      return state.rows.orders.filter(order=>{
        const matches=order.customer_id?same(order.customer_id,customer.id):String(order.customer_name||'').trim().toLocaleLowerCase('de-DE')===String(customer.name).trim().toLocaleLowerCase('de-DE');
        if(!matches)return false;
        if(!isManager())return orderForEmployee(order,state.profile.id);
        const owner=state.rows.people.find(person=>same(person.id,order.employee_id));
        return same(owner?.role==='business'?owner.id:owner?.business_id,businessId());
      }).sort((a,b)=>String(b.work_date).localeCompare(String(a.work_date))||String(a.id).localeCompare(String(b.id)));
    }
    function customerOrdersHtml(customer) {
      const orders=customerOrders(customer);
      return `<section class="customer-order-list"><h3>Arbeitsscheine dieses Kunden (${orders.length})</h3><p class="device-help">${isManager()?'Alle Arbeitsscheine dieser Firma.':'Alle Arbeitsscheine, an denen du beteiligt bist.'}</p>${orders.map(order=>`<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${esc(order.id)}"><b>${dateText(order.work_date)} · ${esc(order.title||'Arbeitsschein')}</b><span>${esc(order.customer_name)} · ${timeText(order.start_time)} – ${timeText(order.end_time)} · ${h(orderHours(order,isManager()?order.employee_id:state.profile.id))}</span></button></article>`).join('')||'<p class="empty">Keine zugänglichen Arbeitsscheine vorhanden.</p>'}</section>`;
    }
    function scannerButton(order='') {return `<div class="device-tools"><button type="button" class="secondary" data-device-action="scan" data-order="${esc(order)}">📷 Beleg scannen</button></div>`;}
    function scansHtml(list) {
      return list.map(scan=>`<details class="receipt-detail"><summary>${dateText(scan.receipt_date)} · ${esc(scan.title||'Beleg')} · ${scan.gross_total==null?'Brutto offen':Number(scan.gross_total).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</summary><p>${esc(scan.category==='fuel'?'Tankbeleg':'Quittung')} · Netto: ${scan.net_total==null?'nicht erfasst':money(scan.net_total)+' €'}</p>${(scan.items||[]).map(item=>`<p>${esc(item.name)} · Brutto ${item.gross==null?'offen':money(item.gross)+' €'} · Netto ${item.net==null?'offen':money(item.net)+' €'}</p>`).join('')}<div class="device-tools">${scan.file_path?`<button type="button" class="secondary small" data-device-action="receipt-download" data-id="${esc(scan.id)}">Original herunterladen</button>`:''}<button type="button" class="danger small" data-device-action="receipt-delete" data-id="${esc(scan.id)}">Beleg löschen</button></div></details>`).join('');
    }
    function deviceSettings() {
      const supported=!!(navigator.serviceWorker&&window.PushManager&&window.Notification),permission=window.Notification?.permission;
      const pushText=!supported?'Hier nicht verfügbar. Auf iPhone/iPad die App zum Home-Bildschirm hinzufügen und von dort öffnen.':permission==='denied'?'Im Gerät/Browser blockiert. Bitte Mitteilungen in den System- oder Website-Einstellungen erlauben.':pushActive?'Erlaubt und für dieses Konto auf dem Server registriert.':permission==='granted'?'Vom Gerät erlaubt; bitte die Registrierung für dieses Konto aktivieren.':'Noch nicht erlaubt. Die Freigabe wird auf diesem Gerät gespeichert.';
      return `<section class="panel" data-device-settings><h3>Gerätefreigaben · mein Konto</h3><p class="device-help">${isAdmin()?'Admin-Zugang bleibt bestehen. Persönliche Erinnerungen und Timer gelten für das ausdrücklich verknüpfte Arbeitskonto auf diesem Gerät, nicht für die Mitarbeiterauswahl oben.':'Diese Freigaben betreffen nur dein eigenes angemeldetes Konto und dieses Gerät, nicht den ausgewählten Mitarbeiter.'}</p>${workContextHtml()}
        <div class="device-permission-card"><h4>Push-Mitteilungen</h4><p class="device-help">Einmal erlauben: Terminerinnerungen können danach auch bei geschlossener App erscheinen. Auf iPhone/iPad ab iOS 16.4: in Safari „Zum Home-Bildschirm“ hinzufügen und die App über dieses Symbol öffnen. Fokus-/Stumm-Einstellungen können die Anzeige unterdrücken. Keine Kundendaten auf dem Sperrbildschirm.</p>
        <p class="device-badge ${pushActive?'is-enabled':''}">${esc(pushText)}</p><div class="device-tools"><button type="button" class="secondary" data-device-action="push-enable">${pushActive?'Gerätefreigabe prüfen':'Push-Mitteilungen erlauben'}</button>${pushActive?'<button type="button" class="secondary" data-device-action="push-test">Testnachricht an dieses Gerät</button>':''}${pushSubscription?'<button type="button" class="secondary" data-device-action="push-disable">Push ausschalten</button>':''}</div><p class="device-status" role="status">${esc(pushIssue)}</p>
        <p class="device-help">Die Geschäftsleitung legt die Erinnerungszeit für jeden Termin direkt in der Planungsübersicht fest.</p></div>
        <div class="device-permission-card"><h4>Standort / Ankunftserkennung</h4><p class="device-help">Einmal freiwillig erlauben. Die Freigabeprüfung hier speichert keinen Standort. Bei zugeordneten heutigen Planungen oder einem geöffneten Kunden startet am hinterlegten Kundenstandort dein Baustellen-Timer. Bei vorhandenen heutigen Arbeitsscheinen kann außerdem die Ankunft erfasst werden. Nur bei sichtbarer App, keine dauerhafte Hintergrundverfolgung, kein Bewegungsverlauf und keine automatische Stundenbuchung. Mit „Standort ausschalten“ sofort beenden.</p><p class="device-badge ${locationAllowed?'is-enabled':''}">${locationAllowed?'Für mein Konto auf diesem Gerät erlaubt.':locationPermission==='denied'?'Im Gerät/Browser blockiert. Bitte dort die Standortfreigabe ändern.':'Standortprüfung ist ausgeschaltet.'}</p><div class="device-tools"><button type="button" class="secondary" data-device-action="location-enable">${locationAllowed?'Standortfreigabe prüfen':'Standort erlauben'}</button>${locationAllowed?'<button type="button" class="secondary" data-device-action="location-disable">Standort ausschalten</button>':''}</div><p class="location-permission-status" role="status"></p></div></section>`;
    }
    function afterRender() {
      for(const form of root.querySelectorAll('form')){
        for(const field of form.querySelectorAll('[name="start"],[data-team-time="start"]'))field.required=true;
        if(['self','employee-credentials','business-update'].includes(form.dataset.form)){
          if(form.elements.username)form.elements.username.required=true;
          if(form.elements.company)form.elements.company.required=true;
        }
      }
      if(!state.profile)return;
      if(['planning','home'].includes(new URL(location.href).searchParams.get('open'))){const url=new URL(location.href),view=url.searchParams.get('open');url.searchParams.delete('open');history.replaceState(null,'',url);openPersonalDeviceView(view).catch(()=>{});return;}
      if(watchId!=null&&!same(state.orderId,watchOrder))stopGps();
      if(state.view==='customers'&&state.customerId){const customer=state.rows.customers.find(row=>same(row.id,state.customerId));if(customer)root.querySelector('#customer-profile')?.insertAdjacentHTML('beforeend',customerOrdersHtml(customer));}
      for(const form of root.querySelectorAll('form[data-form="order"],form[data-form="order-edit"]')){
        const order=form.elements.id?.value||'';form.insertAdjacentHTML('beforebegin',scannerButton(order));
        if(order)form.insertAdjacentHTML('afterend',scansHtml(scans.filter(scan=>same(scan.work_order_id,order))));
        if(order){const current=state.rows.orders.find(row=>same(row.id,order));form.insertAdjacentHTML('afterend',gpsHtml(current));if(locationAllowed&&gpsEligible(current)&&!same(gpsPausedOrder,order)&&!same(watchOrder,order)&&document.visibilityState==='visible')startGps(root.querySelector(`[data-device-action="gps-watch"][data-order="${order}"]`));}
      }
      if(state.view==='receipts'){
        const panel=root.querySelector('.content .panel');if(panel){panel.insertAdjacentHTML('beforeend',scannerButton());
          if(!['vacations','sick','training'].includes(state.receiptSection)){const list=scans.filter(scan=>same(scan.employee_id,workerId())&&scan.category==='fuel');if(list.length){panel.querySelector('.empty')?.remove();panel.insertAdjacentHTML('beforeend',scansHtml(list));}}
          panel.insertAdjacentHTML('beforeend',`<h3>Weitere gescannte Belege</h3>${scansHtml(scans.filter(scan=>same(scan.employee_id,workerId())&&scan.category!=='fuel'))||'<p class="empty">Noch keine weiteren Belege.</p>'}`);
        }
      }
      if(state.view==='settings')root.querySelector('.content')?.insertAdjacentHTML('beforeend',deviceSettings());
      if(state.view==='planning'){
        const plan=state.rows.appointments?.find(row=>same(row.id,state.planId));
        if(plan&&isManager())root.querySelector('#planning-detail')?.insertAdjacentHTML('beforeend',reminderHtml(plan));
        else if(root.querySelector('form[data-form="planning"]')&&isManager())root.querySelector('form[data-form="planning"]')?.insertAdjacentHTML('afterend','<p class="device-help">Nach dem Anlegen den Termin anklicken, um seine Push-Erinnerung in Minuten, Stunden oder als Uhrzeit einzustellen.</p>');
      }
      if(state.view==='customers'&&state.customerId&&isManager())root.querySelector('#customer-profile')?.insertAdjacentHTML('beforeend',locationHtml(state.customerId));
      if(!root.querySelector('.device-status')&&['receipts','orders','order-detail'].includes(state.view))root.querySelector('.content')?.insertAdjacentHTML('beforeend','<p class="device-status" role="status"></p>');
      root.querySelectorAll('form[data-form="appointment-reminder"]').forEach(updateReminderForm);
      arrivalTimer?.afterRender();
    }
    function lineHtml(item={}) {return `<div class="scan-line"><label>Artikel<input name="scan_name" maxlength="300" required value="${esc(item.name||'')}"></label><label>Brutto (€)<input name="scan_gross" inputmode="decimal" value="${money(item.gross)}"></label><label>Netto (€)<input name="scan_net" inputmode="decimal" value="${money(item.net)}"></label><button type="button" class="danger small" data-device-action="scan-remove-line" aria-label="Position entfernen">×</button></div>`;}
    function openScanner(button) {
      if(dialog)return;scanForm=button.parentElement.nextElementSibling?.matches('form')?button.parentElement.nextElementSibling:null;
      const order=button.dataset.order||'';scanFile=null;scanPath='';savedScan=null;scanId=crypto.randomUUID();
      dialog=document.createElement('dialog');dialog.className='device-dialog';dialog.dataset.order=order;
      dialog.innerHTML=`<header><h2>Beleg scannen</h2><button type="button" class="secondary small" data-device-action="scan-close">Schließen</button></header><p class="device-help">Fotografiere den Beleg oder füge eine PDF vom Gerät ein. Auch gescannte PDF-Seiten werden auf deinem Gerät gelesen. Alle Vorschläge bitte prüfen; nichts wird in die Materialliste übernommen.</p><form data-form="receipt-scan"><label>Foto aufnehmen oder auswählen<input name="scan_photo" type="file" accept="image/*" capture="environment"></label><label>PDF vom Gerät einfügen<input name="scan_pdf" type="file" accept="application/pdf,.pdf"></label><p class="device-help">Fotos bis 12 MB · PDF bis 20 MB und 20 Seiten. Mehrseitige PDFs werden vollständig geprüft.</p><img class="scan-preview" hidden alt="Vorschau des ausgewählten Belegs"><p class="scan-file-info" role="status"></p><label class="scan-pdf-options" hidden><input name="scan_force_ocr" type="checkbox"> PDF vollständig per Texterkennung prüfen (langsamer)</label><div class="device-tools"><button type="button" class="secondary" data-device-action="scan-recognize">Text erkennen</button></div><p class="scan-status" role="status"></p><label>Bezeichnung<input name="title" maxlength="160" required placeholder="z. B. Tankbeleg"></label><label>Datum<input name="receipt_date" type="date" required value="${esc(state.date)}"></label><label>Kategorie<select name="category"><option value="fuel">Tankbeleg</option><option value="receipt" ${order?'selected':''}>Quittung</option><option value="training">Schulung</option></select></label><div data-scan-lines>${lineHtml()}</div><button type="button" class="secondary" data-device-action="scan-add-line">Position hinzufügen</button><div class="scan-totals"><label>Brutto gesamt (€)<input name="gross_total" inputmode="decimal"></label><label>Netto gesamt (€)<input name="net_total" inputmode="decimal"></label></div><details><summary>Erkannten Text prüfen</summary><label>Text<textarea name="ocr_text" rows="6" maxlength="30000"></textarea></label></details><p class="device-help">Beim Speichern wird das Originalfoto oder die Original-PDF als privater Beleg hochgeladen. Artikel und Beträge bleiben ausschließlich bei diesem Beleg.${order?' Zugeordnet zum geöffneten Arbeitsschein.':' Neue Arbeitsscheine: Der Beleg wird beim Abschließen mit diesem Formular verbunden.'}</p><button class="primary" type="submit">Geprüften Beleg speichern</button></form>`;
      document.body.append(dialog);dialog.showModal();
      dialog.addEventListener('click',handleClick);dialog.addEventListener('submit',handleSubmit);
      dialog.addEventListener('cancel',()=>closeScanner());dialog.addEventListener('change',handlePhoto);
      initValidation(dialog);
    }
    function closeScanner(){if(deviceBusy)return;const img=dialog?.querySelector('img');if(img?.dataset.blob)URL.revokeObjectURL(img.dataset.blob);dialog?.close();dialog?.remove();dialog=null;scanFile=null;scanForm=null;}
    function scanIsPdf(file){return file?.type==='application/pdf'||/\.pdf$/i.test(file?.name||'');}
    function checkScanFile(file){
      if(!file)throw Error('Bitte zuerst ein Foto oder eine PDF-Datei auswählen.');
      const pdf=scanIsPdf(file);
      if(!pdf&&!file.type?.startsWith('image/'))throw Error('Bitte ein Foto oder eine PDF-Datei auswählen.');
      if(file.size>(pdf?20:12)*1024*1024)throw Error(pdf?'Die PDF darf höchstens 20 MB groß sein.':'Das Foto darf höchstens 12 MB groß sein.');
    }
    function handlePhoto(event){
      if(!['scan_photo','scan_pdf'].includes(event.target.name)||deviceBusy)return;
      const file=event.target.files?.[0];if(!file)return;
      const img=dialog.querySelector('img'),status=dialog.querySelector('.scan-status'),form=dialog.querySelector('form');
      if(img.dataset.blob)URL.revokeObjectURL(img.dataset.blob);delete img.dataset.blob;img.removeAttribute('src');img.hidden=true;
      scanFile=null;scanPath='';form.elements.ocr_text.value='';form.elements.gross_total.value='';form.elements.net_total.value='';form.querySelector('[data-scan-lines]').innerHTML=lineHtml();
      form.elements[event.target.name==='scan_pdf'?'scan_photo':'scan_pdf'].value='';
      try{checkScanFile(file);}catch(error){event.target.value='';announce(status,error.message);return;}
      scanFile=file;scanId=crypto.randomUUID();const pdf=scanIsPdf(file);
      dialog.querySelector('.scan-file-info').textContent=file.name;
      dialog.querySelector('.scan-pdf-options').hidden=!pdf;form.elements.scan_force_ocr.checked=false;
      if(!pdf){img.src=URL.createObjectURL(file);img.dataset.blob=img.src;img.hidden=false;}
      announce(status,pdf?'PDF ausgewählt. Mit „Text erkennen“ werden alle Seiten geprüft.':'Foto ausgewählt. Mit „Text erkennen“ kannst du die Angaben übernehmen.');
    }
    async function getReceiptPdf(){
      if(!window.WorktimeReceiptPdf)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./receipt-pdf-v863-1.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Die PDF-Verarbeitung konnte nicht geladen werden. Bitte die Verbindung prüfen.'));};document.head.append(script);});
      return window.WorktimeReceiptPdf;
    }
    async function getOcr(status){
      if(!window.Tesseract){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/ocr/tesseract-6.0.1.min.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Die Texterkennung konnte nicht geladen werden. Bitte die Verbindung prüfen.'));};document.head.append(script);});}
      if(!ocr)ocr=await window.Tesseract.createWorker(['deu','eng'],1,{workerPath:new URL('./vendor/ocr/worker-6.0.1.min.js',location.href).href,corePath:new URL('./vendor/ocr/core/',location.href).href,langPath:new URL('./vendor/ocr/languages/',location.href).href,logger:message=>{if(message.progress!=null)announce(status,ocrPrefix+'Text erkennen: '+Math.round(message.progress*100)+' %');}});
      return ocr;
    }
    async function recognize() {
      checkScanFile(scanFile);
      const status=dialog.querySelector('.scan-status');announce(status,'Beleg wird gelesen …');
      let text='',pdfResult;
      try{
        if(scanIsPdf(scanFile)){
          const reader=await getReceiptPdf();
          pdfResult=await reader.read(scanFile,{forceOcr:dialog.querySelector('[name="scan_force_ocr"]').checked,onProgress:message=>announce(status,message),onPreview:(canvas,pages)=>{const img=dialog.querySelector('img');img.src=canvas.toDataURL('image/jpeg',.85);img.hidden=false;dialog.querySelector('.scan-file-info').textContent=scanFile.name+' · '+pages+' Seite'+(pages===1?'':'n')+' · Vorschau der ersten Seite';},recognizeImage:async(canvas,page,total)=>{ocrPrefix='PDF '+page+'/'+total+' · ';const worker=await getOcr(status);return (await worker.recognize(canvas)).data.text;}});
          text=pdfResult.text;
        }else{const worker=await getOcr(status);text=(await worker.recognize(scanFile)).data.text;}
      }finally{ocrPrefix='';}
      const parsed=parseReceipt(text);
      if(parsed.items.length>150)throw Error('Es wurden zu viele Positionen erkannt. Bitte den Beleg in kleinere PDF-Dateien aufteilen.');
      const form=dialog.querySelector('form');form.elements.ocr_text.value=parsed.raw.slice(0,30000);form.elements.gross_total.value=money(parsed.gross);form.elements.net_total.value=money(parsed.net);
      form.querySelector('[data-scan-lines]').innerHTML=(parsed.items.length?parsed.items:[{}]).map(lineHtml).join('');
      const prefix=pdfResult?'PDF: alle '+pdfResult.pages+' Seiten gelesen'+(pdfResult.ocrPages?' ('+pdfResult.ocrPages+' per Texterkennung)':'')+'. ':'';
      announce(status,prefix+(parsed.items.length?parsed.items.length+' Positionsvorschläge gefunden. Bitte Namen und Netto-/Bruttobeträge prüfen'+(parsed.vatRate!=null?' (Netto teilweise aus gedruckten '+parsed.vatRate+' % berechnet)':'')+'.':'Keine sicheren Positionen gefunden. Du kannst die Angaben unten manuell ergänzen.'));
    }
    async function saveScan(form) {
      if(scanFile)checkScanFile(scanFile);
      const items=[...form.querySelectorAll('.scan-line')].map(line=>({name:line.querySelector('[name="scan_name"]').value.trim(),gross:amount(line.querySelector('[name="scan_gross"]').value),net:amount(line.querySelector('[name="scan_net"]').value)}));
      const numeric=[...form.querySelectorAll('[name="scan_gross"],[name="scan_net"],[name="gross_total"],[name="net_total"]')];
      for(const field of numeric)if(field.value.trim()&&amount(field.value)==null){markField(field,'Bitte einen gültigen Betrag eingeben.');throw Error('Bitte die rot markierten Beträge korrigieren.');}
      const actor=state.profile.id,employee=workerId(),order=dialog.dataset.order||null;
      if(!scanPath&&scanFile){const path=`${actor}/receipt-${scanId}-${scanFile.name.replace(/[^a-z0-9._-]/gi,'_')}`;await upload('work-order-documents',path,scanFile);scanPath=path;}
      const payload={id:scanId,business_id:businessId(),employee_id:employee,work_order_id:order,title:form.elements.title.value.trim(),receipt_date:form.elements.receipt_date.value,category:form.elements.category.value,items,gross_total:amount(form.elements.gross_total.value),net_total:amount(form.elements.net_total.value),ocr_text:form.elements.ocr_text.value.slice(0,30000),file_path:scanPath||null,file_name:scanFile?.name||null};
      let record;
      try{record=(await write('receipt_scans',payload))?.[0];}
      catch(error){if(error.code!=='23505')throw error;record=(await allRows('receipt_scans',`select=*&id=eq.${scanId}`))[0];}
      if(!record?.id)throw Error('Der Beleg konnte nicht bestätigt werden. Bitte nochmals speichern.');
      savedScan=record;scans=[record,...scans.filter(row=>!same(row.id,record.id))];
      if(scanForm&&!order)scanForm.dataset.receiptScans=JSON.stringify([...(JSON.parse(scanForm.dataset.receiptScans||'[]')),record.id]);
      const status=dialog.querySelector('.scan-status');announce(status,'Beleg gespeichert. Keine Materialien wurden angelegt.');
      form.querySelectorAll('input,select,textarea,button').forEach(field=>field.disabled=true);
      dialog.querySelector('[data-device-action="scan-close"]').disabled=false;
    }
    async function attachReceipts(form,order) {
      const ids=JSON.parse(form?.dataset.receiptScans||'[]');
      for(const id of ids)await write('receipt_scans',{work_order_id:order.id},'PATCH',`id=eq.${encodeURIComponent(id)}`);
      if(form)form.dataset.receiptScans='[]';
    }
    const publicKeyBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),char=>char.charCodeAt(0));
    async function enablePush() {
      if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Dieses Gerät unterstützt hier kein Web-Push. Auf iPhone/iPad bitte über Safari zum Home-Bildschirm hinzufügen und dort öffnen.');
      const user=state.profile.id;
      // Fetch the public key/worker BEFORE the permission click, not between
      // the gesture and subscribe (important for installed iOS web apps).
      if(pushReadyUser!==user||!pushKey||!pushRegistration){await preparePush(user);refreshDeviceSettings();if(!pushKey||!pushRegistration)throw Error(pushIssue||'Die App wird noch vorbereitet. Bitte kurz warten und die Gerätefreigabe erneut wählen.');return 'Vorbereitung abgeschlossen. Bitte nochmals auf „Push-Mitteilungen erlauben“ tippen.';}
      if(Notification.permission==='denied')throw Error('Mitteilungen sind im Gerät/Browser blockiert. Bitte dort erlauben und danach erneut prüfen.');
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted')throw Error('Mitteilungen wurden nicht erlaubt. Du kannst dies in den Geräte-/Browsereinstellungen ändern.');
      if(!same(user,state.profile?.id))throw Error('Die Anmeldung wurde geändert.');
      const subscription=pushSubscription||await pushRegistration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(pushKey)});
      pushSubscription=subscription;
      const existing=await allRows('push_subscriptions',`select=*&user_id=eq.${user}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`),json=subscription.toJSON();
      if(!same(user,state.profile?.id))throw Error('Die Anmeldung wurde geändert.');
      const row={user_id:user,endpoint:json.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth,enabled:true};
      const saved=(existing[0]?await write('push_subscriptions',row,'PATCH',`id=eq.${existing[0].id}`):await write('push_subscriptions',row))?.[0];
      if(!saved?.id||!saved.enabled||!same(saved.user_id,user))throw Error('Die Serverregistrierung konnte nicht bestätigt werden. Bitte erneut versuchen.');
      pushDeviceId=saved.id;pushActive=true;await bindWorkPush(user);refreshDeviceSettings();
      return 'Push ist für dieses Konto auf diesem Gerät aktiviert. Du kannst jetzt eine Testnachricht senden.';
    }
    async function disablePush(onLogout=false) {
      const user=state.profile?.id,registration=await navigator.serviceWorker?.getRegistration(),subscription=await registration?.pushManager.getSubscription();
      // Disable the server first. If it is offline, never falsely claim all
      // devices are switched off; a retry will retain the current endpoint.
      if(subscription&&user){if(onLogout)await subscription.unsubscribe();await remove('push_subscriptions',`user_id=eq.${user}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`);if(!onLogout)await subscription.unsubscribe();}
      if(same(state.profile?.id,user)){pushActive=false;pushDeviceId='';pushSubscription=null;refreshDeviceSettings();}return 'Push-Mitteilungen auf diesem Gerät ausgeschaltet.';
    }
    async function testPush(){
      if(!pushActive||!pushDeviceId)throw Error('Bitte zuerst die Gerätefreigabe aktivieren.');
      const result=await api('/functions/v1/appointment-reminders?action=test',{method:'POST',body:{subscription_id:pushDeviceId}});
      if(result?.sent)return 'Der Push-Dienst hat die Testnachricht angenommen. Prüfe die Mitteilungszentrale dieses Geräts. Bei fehlender Anzeige bitte Fokus-/Stumm-Einstellungen prüfen.';
      if(['device_expired','device_not_registered'].includes(result?.code)){pushActive=false;pushDeviceId='';if(result.code==='device_expired'){await pushSubscription?.unsubscribe();pushSubscription=null;}refreshDeviceSettings();throw Error('Die Gerätefreigabe ist abgelaufen. Bitte „Push-Mitteilungen erlauben“ erneut wählen.');}
      throw Error(result?.code==='push_auth_rejected'?'Der Push-Dienst lehnt den Serverversand ab. Bitte der Verwaltung melden.':result?.code==='push_rate_limited'?'Der Push-Dienst ist ausgelastet. Bitte später erneut testen.':'Die Testnachricht konnte gerade nicht versendet werden. Bitte Verbindung prüfen und erneut versuchen.');
    }
    async function enableLocation(){if(isAdmin()&&!workAccount())throw Error('Bitte zuerst dein persönliches Arbeitskonto auf diesem Gerät verknüpfen.');const user=state.profile.id;try{await positionOnce();}catch(error){if(error.code===1&&same(user,state.profile?.id)){locationPermission='denied';setLocationConsent(false);refreshDeviceSettings();}throw error;}if(!same(user,state.profile?.id))throw Error('Die Anmeldung wurde geändert.');locationPermission='granted';setLocationConsent(true);gpsPausedOrder='';refreshDeviceSettings();return 'Standortfreigabe gespeichert. Bei heutiger Planung oder geöffnetem Kunden ist die Ankunftserkennung möglich. Hier wurde kein Standort hochgeladen.';}
    function reminderConfig(plan){return reminders.find(row=>same(row.appointment_id,plan.id))||settings.find(row=>same(row.business_id,businessId()))||{enabled:false,reminder_minutes:30,notification_time:null};}
    function reminderHtml(plan){
      if(!remindersReady)return '<p class="device-help">Die Terminerinnerung konnte nicht geladen werden. Bitte erneut aktualisieren.</p>';
      const config=reminderConfig(plan),meta=planningMeta(plan),unit=config.reminder_minutes>=60&&config.reminder_minutes%15===0?'hours':'minutes',value=unit==='hours'?config.reminder_minutes/60:config.reminder_minutes;
      return `<section class="customer-order-list" data-plan-reminder><h3>Push-Erinnerung für diesen Termin</h3><p class="device-help">${dateText(plan.event_date)} · ${esc(meta.start)} Uhr · ${esc(plan.customer_name)}. Gilt für den zugeordneten Mitarbeiter und alle Mitwirkenden mit Push-Freigabe. Geänderte Termindaten bitte zuerst oben speichern.</p><form data-form="appointment-reminder" class="entry-form"><input name="appointment_id" type="hidden" value="${esc(plan.id)}"><label class="wide device-check"><input type="checkbox" name="enabled" ${config.enabled?'checked':''}> Mitarbeiter an diesen Termin erinnern</label><label>Erinnerungsart<select name="reminder_mode"><option value="before" ${!config.notification_time?'selected':''}>Vor dem Termin</option><option value="clock" ${config.notification_time?'selected':''}>Uhrzeit am Termintag</option></select></label><div data-reminder-before class="reminder-before"><label>Vorlauf<input name="reminder_amount" type="number" min="0" max="${unit==='hours'?168:10080}" step="${unit==='hours'?0.25:1}" required value="${value}"></label><label>Einheit<select name="reminder_unit"><option value="minutes" ${unit==='minutes'?'selected':''}>Minuten</option><option value="hours" ${unit==='hours'?'selected':''}>Stunden</option></select></label></div><label data-reminder-clock>Uhrzeit<input name="notification_time" type="time" step="60" required value="${esc(config.notification_time?.slice(0,5)||'')}"></label><p class="wide device-help">Zeitzone: Europe/Berlin. Die Uhrzeit muss vor oder zum Beginn liegen. Erledigte und abgesagte Termine senden keine Erinnerung. Änderungen gelten nur für diese Planung.</p><button class="primary wide">Erinnerung speichern</button></form><p class="reminder-status" role="status"></p></section>`;
    }
    function updateReminderForm(form){const enabled=form.elements.enabled.checked,clock=form.elements.reminder_mode.value==='clock',hours=form.elements.reminder_unit.value==='hours';form.querySelector('[data-reminder-before]').hidden=clock;form.querySelector('[data-reminder-clock]').hidden=!clock;form.elements.reminder_amount.disabled=!enabled||clock;form.elements.reminder_unit.disabled=!enabled||clock;form.elements.notification_time.disabled=!enabled||!clock;form.elements.reminder_amount.max=hours?168:10080;form.elements.reminder_amount.step=hours?'any':1;}
    async function saveReminder(form){
      if(!isManager())throw Error('Nur die Geschäftsleitung darf eine Terminerinnerung festlegen.');
      const id=form.elements.appointment_id.value,plan=state.rows.appointments.find(row=>same(row.id,id));if(!plan)throw Error('Die Planung wurde gelöscht. Bitte aktualisieren.');
      const clock=form.elements.reminder_mode.value==='clock',enabled=form.elements.enabled.checked,minutes=clock?30:Number(form.elements.reminder_amount.value)*(form.elements.reminder_unit.value==='hours'?60:1),time=clock?form.elements.notification_time.value:null;
      if(enabled&&(!clock&&(!Number.isInteger(minutes)||minutes<0||minutes>10080)||clock&&(!time||time>planningMeta(plan).start))){const field=clock?form.elements.notification_time:form.elements.reminder_amount;markField(field,clock?'Bitte eine Uhrzeit vor oder zum Terminbeginn wählen.':'Bitte einen Vorlauf zwischen 0 Minuten und 7 Tagen eingeben.');throw Error('Bitte die rot markierte Erinnerungszeit korrigieren.');}
      const old=reminders.find(row=>same(row.appointment_id,id)),payload={appointment_id:id,business_id:businessId(),enabled,reminder_minutes:Number.isInteger(minutes)&&minutes>=0&&minutes<=10080?minutes:30,notification_time:time||null};
      const saved=(old?await write('appointment_reminders',payload,'PATCH',`appointment_id=eq.${encodeURIComponent(id)}`):await write('appointment_reminders',payload))?.[0];if(!saved?.appointment_id)throw Error('Die Erinnerung wurde nicht bestätigt. Bitte erneut speichern.');
      reminders=[saved,...reminders.filter(row=>!same(row.appointment_id,id))];return enabled?'Erinnerung für diesen Termin gespeichert.':'Erinnerung für diesen Termin ausgeschaltet.';
    }
    async function run(button,task,target) {
      if(deviceBusy)return;deviceBusy=true;button.disabled=true;
      const fileInputs=dialog?[...dialog.querySelectorAll('[name="scan_photo"],[name="scan_pdf"],[name="scan_force_ocr"]')]:[];fileInputs.forEach(field=>field.disabled=true);
      const selector=target?.classList.contains('work-context-status')?'.work-context-status':target?.classList.contains('location-permission-status')?'.location-permission-status':target?.classList.contains('device-status')?'.device-status':null;
      try{const message=await task();if(target&&!target.closest('dialog'))announce(selector?root.querySelector(selector):target,typeof message==='string'?message:'Gespeichert.');}
      catch(error){announce(selector?root.querySelector(selector):target,error.message||'Die Aktion konnte nicht ausgeführt werden.');}
      finally{deviceBusy=false;if(!savedScan)fileInputs.forEach(field=>field.disabled=false);if(button.isConnected&&!(savedScan&&button.closest('form[data-form="receipt-scan"]')))button.disabled=false;}
    }
    function handleClick(event) {
      const button=event.target.closest('[data-device-action]');if(!button)return;
      event.preventDefault();const action=button.dataset.deviceAction;
      if(action==='scan'){openScanner(button);return;}
      if(action==='scan-close'){const refresh=savedScan&&!scanForm;closeScanner();if(refresh)render();return;}
      if(action==='scan-add-line'){dialog.querySelector('[data-scan-lines]').insertAdjacentHTML('beforeend',lineHtml());return;}
      if(action==='scan-remove-line'){button.closest('.scan-line').remove();return;}
      const status=dialog?.querySelector('.scan-status')||root.querySelector('.device-status');
      if(action==='scan-recognize')return run(button,recognize,status);
      if(action==='push-enable')return run(button,enablePush,status);
      if(action==='push-disable')return run(button,disablePush,status);
      if(action==='push-test')return run(button,testPush,status);
      if(action==='location-enable')return run(button,enableLocation,root.querySelector('.location-permission-status'));
      if(action==='location-disable'){setLocationConsent(false);refreshDeviceSettings();announce(root.querySelector('.location-permission-status'),'Standortprüfung ausgeschaltet. Es werden keine weiteren Ankünfte erfasst.');return;}
      if(action==='location-settings'){state.view='settings';state.menu=false;render();root.querySelector('[data-device-settings]')?.scrollIntoView({block:'start'});return;}
      if(action==='gps-watch')return startGps(button);
      if(action==='gps-stop'){gpsPausedOrder=watchOrder||state.orderId;stopGps();announce(root.querySelector('.gps-status'),'Ankunftserkennung beendet.');return;}
      if(action==='gps-manual')return run(button,async()=>{await captureArrival(button.dataset.order,'manual');return root.querySelector('.gps-status')?.textContent;},root.querySelector('.gps-status'));
      if(action==='customer-location-here')return run(button,async()=>{const position=await positionOnce(),form=button.closest('form');form.elements.latitude.value=position.coords.latitude.toFixed(7);form.elements.longitude.value=position.coords.longitude.toFixed(7);return 'Position übernommen. Bitte als Kundenstandort speichern.';},root.querySelector('.location-status'));
      const scan=scans.find(row=>same(row.id,button.dataset.id));
      if(action==='receipt-download'&&scan?.file_path)return run(button,()=>download('work-order-documents',scan.file_path,scan.file_name||'Beleg'),status);
      if(action==='receipt-delete'&&scan&&confirm('Diesen Beleg wirklich löschen?'))return run(button,async()=>{await remove('receipt_scans',`id=eq.${scan.id}`);scans=scans.filter(row=>!same(row.id,scan.id));render();},status);
    }
    function handleSubmit(event) {
      const form=event.target,name=form.dataset.form;
      if(!['receipt-scan','appointment-reminder','customer-location','work-device-context'].includes(name))return;
      event.preventDefault();event.stopImmediatePropagation();if(!validateForm(form))return;
      const button=event.submitter||form.querySelector('button[type="submit"],button.primary');
      run(button,()=>name==='work-device-context'?saveWorkContext(form):name==='receipt-scan'?saveScan(form):name==='customer-location'?saveLocation(form):saveReminder(form),dialog?.querySelector('.scan-status')||form.parentElement.querySelector(name==='work-device-context'?'.work-context-status':name==='customer-location'?'.location-status':name==='appointment-reminder'?'.reminder-status':'.device-status'));
    }
    root.addEventListener('click',handleClick);
    root.addEventListener('submit',handleSubmit,true);
    root.addEventListener('change',event=>{const form=event.target.closest('form[data-form="appointment-reminder"]');if(form){if(event.target.name==='reminder_unit'){const amount=form.elements.reminder_amount;amount.value=Number(amount.value)*(event.target.value==='hours'?1/60:60);}updateReminderForm(form);}});
    root.addEventListener('click',event=>{
      if(event.target.closest('[data-action="logout"]')){
        event.preventDefault();event.stopImmediatePropagation();if(deviceBusy)return;
        stopGps();arrivalTimer?.reset();locationAllowed=false;deviceBusy=true;Promise.race([Promise.resolve(disablePush(true)).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]).finally(()=>{deviceBusy=false;scans=[];settings=[];reminders=[];remindersReady=false;locations=[];arrivals=[];loadedUser='';pushActive=false;pushDeviceId='';pushReadyUser='';closeScanner();logout();});
      }
    },true);
    function locationHtml(customerId){const loc=locations.find(row=>same(row.customer_id,customerId));return `<section class="customer-order-list"><h3>Standort für Ankunftserkennung</h3><p class="device-help">Dieser Standort muss tatsächlich zur Kundenadresse gehören. Nach einer Adressänderung bitte prüfen. Keine Adresse wird an einen externen Kartendienst gesendet.</p><form data-form="customer-location" class="entry-form"><input type="hidden" name="customer_id" value="${esc(customerId)}"><label>Breitengrad<input name="latitude" type="number" step="any" min="-90" max="90" required value="${loc?.latitude??''}"></label><label>Längengrad<input name="longitude" type="number" step="any" min="-180" max="180" required value="${loc?.longitude??''}"></label><label>Umkreis (Meter)<input name="radius_m" type="number" min="50" max="500" required value="${loc?.radius_m??150}"></label><button type="button" class="secondary" data-device-action="customer-location-here">Meine aktuelle Position übernehmen</button><button class="primary">Kundenstandort speichern</button></form><p class="location-status" role="status"></p></section>`;}
    async function saveLocation(form){const customer=form.elements.customer_id.value,payload={customer_id:customer,business_id:businessId(),latitude:Number(form.elements.latitude.value),longitude:Number(form.elements.longitude.value),radius_m:Number(form.elements.radius_m.value)},old=locations.find(row=>same(row.customer_id,customer));const saved=(old?await write('customer_locations',payload,'PATCH',`customer_id=eq.${customer}`):await write('customer_locations',payload))?.[0];if(!saved)throw Error('Der Standort konnte nicht bestätigt werden.');locations=[saved,...locations.filter(row=>!same(row.customer_id,customer))];}
    const gpsError=error=>Object.assign(Error(error.code===1?'Standortfreigabe wurde nicht erteilt.':error.code===3?'Standort konnte nicht rechtzeitig bestimmt werden. Bitte nochmals versuchen.':'Standort ist auf diesem Gerät gerade nicht verfügbar.'),{code:error.code});
    function positionOnce(){if(!navigator.geolocation)throw Error('Dieses Gerät stellt hier keinen Standort bereit.');return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,error=>reject(gpsError(error)),{enableHighAccuracy:true,timeout:20000,maximumAge:0}));}
    function gpsEligible(order){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return !!workAccount()&&!!order&&orderForEmployee(order,workAccount().id)&&order.work_date===today&&!arrivals.some(row=>same(row.work_order_id,order.id)&&same(row.employee_id,workAccount().id));}
    function gpsHtml(order){if(!order)return '';const rows=arrivals.filter(row=>same(row.work_order_id,order.id));return `<section class="customer-order-list"><h3>Ankunft beim Kunden</h3>${rows.map(row=>`<p>${esc(state.rows.people.find(person=>same(person.id,row.employee_id))?.display_name||state.rows.people.find(person=>same(person.id,row.employee_id))?.username||'Mitarbeiter')}: ${new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'}).format(new Date(row.arrived_at))} · GPS-Genauigkeit ±${Math.round(row.accuracy_m)} m</p>`).join('')||'<p>Noch keine Ankunft erfasst.</p>'}${gpsEligible(order)?`<p class="device-help">Freiwillig: Nur bei geöffnetem Auftrag und sichtbarer App. Gespeichert wird nur die erste Ankunft, kein Bewegungsverlauf. Arbeitszeiten bleiben unverändert. Browser-GPS ist kein manipulationssicherer Anwesenheitsnachweis.</p><div class="device-tools">${locationAllowed?`<button type="button" class="secondary" data-device-action="gps-watch" data-order="${esc(order.id)}">GPS-Ankunftserkennung starten</button><button type="button" class="secondary" data-device-action="gps-manual" data-order="${esc(order.id)}">Ankunft jetzt mit GPS erfassen</button><button type="button" class="secondary" data-device-action="gps-stop">Erkennung stoppen</button>`:'<button type="button" class="secondary" data-device-action="location-settings">Standort in meinen Einstellungen erlauben</button>'}</div>`:''}<p class="gps-status" role="status">${watchId==null?'Standortprüfung ist aus.':'Standortprüfung läuft nur bei sichtbarer App.'}</p></section>`;}
    async function captureArrival(orderId,source,position){
      const user=state.profile.id,employee=workAccount()?.id,device=isAdmin()?workContext?.id:'',order=state.rows.orders.find(row=>same(row.id,orderId));
      if(!locationAllowed||!gpsEligible(order)||!same(state.orderId,orderId)||document.visibilityState!=='visible')throw Error('Bitte Standort in den eigenen Einstellungen erlauben und den heutigen eigenen Auftrag öffnen.');
      position=position||await positionOnce();
      if(!same(user,state.profile?.id)||!same(employee,workAccount()?.id)||!locationAllowed||!same(state.orderId,orderId)||document.visibilityState!=='visible')throw Error('Die Standortprüfung wurde beendet.');
      const coord=position.coords,payload={work_order_id:orderId,employee_id:employee,business_id:workCompany(),latitude:coord.latitude,longitude:coord.longitude,accuracy_m:coord.accuracy,source};let saved;
      try{saved=device?await api('/rest/v1/rpc/record_order_arrival_for_device',{method:'POST',body:{p_device:device,p_order:orderId,p_position:{latitude:coord.latitude,longitude:coord.longitude,accuracy:coord.accuracy},p_source:source}}):(await write('order_arrivals',payload))?.[0];}catch(error){if(error.code!=='23505')throw error;saved=(await allRows('order_arrivals',`select=*&work_order_id=eq.${orderId}&employee_id=eq.${employee}`))[0];}
      if(!saved)throw Error('Die Ankunft konnte nicht bestätigt werden.');
      if(!same(user,state.profile?.id))return;
      arrivals=[saved,...arrivals.filter(row=>!(same(row.work_order_id,orderId)&&same(row.employee_id,employee)))];stopGps();
      announce(root.querySelector('.gps-status'),'Ankunft gespeichert: '+new Intl.DateTimeFormat('de-DE',{timeStyle:'short'}).format(new Date(saved.arrived_at))+' Uhr. Arbeitsstunden unverändert.');
    }
    function startGps(button){
      if(!button)return;const status=root.querySelector('.gps-status'),order=state.rows.orders.find(row=>same(row.id,button.dataset.order)),target=locations.find(row=>same(row.customer_id,order?.customer_id)),user=state.profile.id;
      if(!locationAllowed||!gpsEligible(order)||document.visibilityState!=='visible'){announce(status,'Bitte Standort in deinen Einstellungen erlauben. Nur eigene Aufträge von heute sind möglich.');return;}
      if(!target){announce(status,'Der Kundenstandort fehlt. Bitte die Geschäftsverwaltung bitten, ihn beim Kunden festzulegen.');return;}
      if(!navigator.geolocation){announce(status,'Standort ist hier nicht verfügbar.');return;}
      stopGps();gpsPausedOrder='';watchOrder=order.id;announce(status,'Standortprüfung läuft nur bei sichtbarer App.');
      watchId=navigator.geolocation.watchPosition(async position=>{
        if(!same(state.profile?.id,user))return;
        if(document.visibilityState!=='visible'||!locationAllowed||!same(state.orderId,order.id)){stopGps();return;}
        const currentStatus=root.querySelector('.gps-status'),distance=metres(position.coords,target);
        if(position.coords.accuracy>100||distance>target.radius_m){announce(currentStatus,`Noch keine sichere Ankunft: ${Math.round(distance)} m zum Kunden; Genauigkeit ±${Math.round(position.coords.accuracy)} m.`);return;}
        if(gpsSaving)return;gpsSaving=true;
        try{await captureArrival(order.id,'proximity',position);}catch(error){stopGps();announce(currentStatus,error.message);}finally{gpsSaving=false;}
      },error=>{if(!same(state.profile?.id,user))return;stopGps();if(error.code===1){locationPermission='denied';setLocationConsent(false);}announce(root.querySelector('.gps-status'),gpsError(error).message);},{enableHighAccuracy:true,timeout:20000,maximumAge:10000});
    }
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){stopGps();const status=root.querySelector('.gps-status');if(status)announce(status,'Standortprüfung beendet: App wurde in den Hintergrund gelegt.');}});
    navigator.serviceWorker?.addEventListener('message',event=>{if(state.profile&&(event.data?.type==='WORKTIME_OPEN_PLANNING'||event.data?.type==='WORKTIME_OPEN_VIEW'))openPersonalDeviceView(event.data.view).catch(()=>{});});
    return {load,afterRender,attachReceipts,customerOrders,customerOrdersHtml,timerSaved:id=>arrivalTimer?.saved(id)};
  }
  window.WorktimeDeviceFeatures={create,parseReceipt,validateForm};
})();
