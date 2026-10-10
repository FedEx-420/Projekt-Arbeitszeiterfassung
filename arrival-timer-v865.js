/* Voluntary foreground arrival detection. Server timestamps; no movement trail. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=(a,b)=>String(a||'')===String(b||'');
  function berlin(value=new Date()) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
    return {date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
  }
  function timeProposal(timer,drive,side='before') {
    if(!timer.finished_at)throw Error('Bitte zuerst den Timer beenden.');
    const start=berlin(timer.started_at),finish=berlin(timer.finished_at),elapsed=(Date.parse(timer.finished_at)-Date.parse(timer.started_at))/60000;
    if(start.date!==finish.date||elapsed<0||!Number.isFinite(elapsed))throw Error('Der Timer umfasst mehrere Kalendertage. Bitte die Zeiten getrennt je Tag manuell erfassen; die Messung bleibt gespeichert.');
    if(Math.abs(finish.minutes-start.minutes-elapsed)>1.01)throw Error('Der Timer umfasst eine Zeitumstellung. Bitte die gemessene Zeit manuell prüfen und erfassen; die Messung bleibt gespeichert.');
    if(!Number.isInteger(drive)||drive<0||drive>720||drive%15)throw Error('Bitte die Fahrzeit in Viertelstunden eingeben (0 bis 12 Stunden).');
    const duration=Math.max(15,Math.round(elapsed/15)*15),a=Math.round(start.minutes/15)*15-(side==='before'?drive:0),b=a+duration+drive;
    if(a<0||b>=1440)throw Error('Mit dieser Fahrzeit liegt die Zeit über Mitternacht. Bitte getrennt je Tag manuell erfassen; die Messung bleibt gespeichert.');
    const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
    return {date:start.date,start:clock(a),end:clock(b),hours:(duration+drive)/60,drive:drive/60,elapsed};
  }
  function create(ctx) {
    const {root,state,api,allRows,render,businessId,workerId,planningMeta,planEmployeeIds,canUse,locked,openPlanningOrder,teamPeriodFields,teamPersonFields}=ctx;
    let timers=[],ready=false,user='',watch=null,watchEpoch=0,targetKey='',busy=false,dialog=null,draft=null,message='',tick=null;
    const account=()=>ctx.workAccount?ctx.workAccount():state.profile;
    const workId=()=>account()?.id||'';
    const device=()=>ctx.workDevice?.()||'';
    const identity=()=>`${state.profile?.id||''}:${workId()}:${device()}`;
    const customers=()=>state.rows.customers.filter(c=>{if(!ctx.workCompany||!ctx.isAdmin?.())return true;if(same(c.employee_id,ctx.workCompany()))return true;const p=state.rows.people.find(p=>same(p.id,c.employee_id));return same(p?.role==='business'?p.id:p?.business_id,ctx.workCompany());});
    const own=()=>timers.filter(t=>same(t.employee_id,workId())&&!t.consumed_at);
    const active=()=>own().find(t=>!t.finished_at);
    const eligible=()=>state.profile&&['employee','business'].includes(account()?.role)&&canUse('orders');
    const today=()=>berlin().date;
    function stopWatch(){watchEpoch++;if(watch!=null)navigator.geolocation?.clearWatch(watch);watch=null;targetKey='';}
    function reset(){stopWatch();timers=[];ready=false;draft=null;message='';user='';if(tick)clearInterval(tick);tick=null;dialog?.remove();dialog=null;}
    async function load(){
      const id=workId(),stamp=identity();if(!id){reset();return;}
      if(!same(user,stamp)){reset();user=stamp;}
      try{const rows=await allRows('job_timers',`select=*&employee_id=eq.${id}&consumed_at=is.null&order=started_at.desc,id.asc`);if(!same(identity(),stamp))return;timers=rows;ready=true;if(draft&&!timers.some(t=>same(t.id,draft.timer.id)))draft=null;}catch{if(same(identity(),stamp))status('Timerstand konnte nicht aktualisiert werden. Die letzte Messung bleibt sichtbar; bitte Verbindung prüfen.');}
    }
    function candidates(){
      if(!eligible()||locked(workId(),today()))return [];
      const result=[];
      for(const p of state.rows.appointments||[]){
        if(p.event_date!==today()||!planEmployeeIds(p).some(id=>same(id,workId()))||!['planned','confirmed'].includes(planningMeta(p).status)||state.rows.orders.some(o=>same(o.id,p.id)))continue;
        const c=customers().find(c=>same(c.id,p.customer_id));if(c)result.push({customer:c,plan:p});
      }
      if(state.view==='customers'&&state.customerId&&same(workerId(),workId())){const c=customers().find(c=>same(c.id,state.customerId));if(c&&!result.some(t=>same(t.customer.id,c.id)))result.push({customer:c,plan:null});}
      const input=root.querySelector('form[data-form="order"] [name="customer"]');
      if(input?.value.trim()&&same(workerId(),workId())){const c=customers().find(c=>c.name.trim().toLocaleLowerCase('de-DE')===input.value.trim().toLocaleLowerCase('de-DE'));if(c&&!result.some(t=>same(t.customer.id,c.id)))result.push({customer:c,plan:null});}
      return result;
    }
    function duration(timer){const seconds=Math.max(0,Math.floor(((timer.finished_at?Date.parse(timer.finished_at):Date.now())-Date.parse(timer.started_at))/1000));return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
    function card(){
      const pending=own(),running=active(),targets=candidates();
      return `<section class="panel arrival-timer" data-arrival-timer><h3>Mein Baustellen-Timer</h3>${!ready?'<p>Timer konnte nicht geladen werden. Bitte Verbindung prüfen.</p>':running?`<button type="button" class="timer-running" data-timer-action="finish" data-id="${esc(running.id)}"><span>Timer läuft · ${esc(running.customer_name)}</span><strong data-timer-duration="${esc(running.id)}">${duration(running)}</strong><span>${esc(running.customer_address||'Kundenstandort')} · seit ${esc(new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',timeStyle:'short'}).format(new Date(running.started_at)))} Uhr</span><b>Fertig? Antippen → Fahrzeit → Arbeitsschein</b></button>`:`<p class="device-help">Bei Ankunft startet dein Timer mit freiwilliger Standortfreigabe und geöffneter App am hinterlegten Kundenstandort. Ohne GPS kannst du die Ankunft selbst bestätigen. Noch keine Stundenbuchung.</p><form data-form="timer-start"><label>Kunde<select name="timer_customer" required><option value="">Kunde auswählen</option>${customers().map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><button class="secondary" ${locked(workId(),today())?'disabled':''}>Beim Kunden angekommen</button></form>${targets.map(t=>`<button type="button" class="secondary" data-timer-action="start" data-customer="${esc(t.customer.id)}" data-plan="${esc(t.plan?.id||'')}">Angekommen: ${esc(t.customer.name)}</button>`).join('')}`}${pending.filter(t=>t.finished_at).map(t=>`<button type="button" class="secondary timer-pending" data-timer-action="finish" data-id="${esc(t.id)}">${esc(t.customer_name)} · ${duration(t)} · Arbeitsschein fortsetzen</button>`).join('')}<p class="timer-status" role="status">${esc(message)}</p></section>`;
    }
    function mount(){
      const old=root.querySelector('[data-arrival-timer]');
      if(!eligible()){old?.remove();stopWatch();return;}
      const revision=JSON.stringify([own().map(t=>[t.id,t.started_at,t.finished_at,t.customer_name,t.customer_address]),ready,candidates().map(t=>[t.customer.id,t.plan?.id]),customers().map(c=>[c.id,c.name]),locked(workId(),today())]);
      if(state.view==='home'){
        if(old?.dataset.timerRevision!==revision){const selected=old?.querySelector('[name="timer_customer"]')?.value,focused=document.activeElement?.name==='timer_customer';if(old)old.outerHTML=card();else root.querySelector('.content')?.insertAdjacentHTML('afterbegin',card());const panel=root.querySelector('[data-arrival-timer]');if(panel){panel.dataset.timerRevision=revision;if(device())panel.querySelector('h3').insertAdjacentHTML('afterend',`<p class="device-help">Persönliches Arbeitskonto: ${esc(account().display_name||account().username)}. Du bleibst als Administrator angemeldet.</p>`);const field=panel.querySelector('[name="timer_customer"]');if(field&&selected)field.value=selected;if(field&&focused)field.focus({preventScroll:true});}}
      }
      else old?.remove();
      if(!tick)tick=setInterval(()=>{for(const node of root.querySelectorAll('[data-timer-duration]')){const t=timers.find(t=>same(t.id,node.dataset.timerDuration));if(t)node.textContent=duration(t);}},1000);
    }
    function status(text){message=text;const node=root.querySelector('.timer-status');if(node)node.textContent=text;}
    async function start(customer,plan,source='manual',position=null){
      const stamp=identity(),workDevice=device();
      const data=await api('/rest/v1/rpc/'+(workDevice?'start_job_timer_for_device':'start_job_timer'),{method:'POST',body:{...(workDevice?{p_device:workDevice}:{}),p_customer:customer,p_appointment:plan||null,p_source:source,p_position:position?{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy}:null}});
      const saved=Array.isArray(data)?data[0]:data;
      if(!saved?.id)throw Error('Der Timerstart konnte nicht bestätigt werden.');
      if(!same(stamp,identity()))return;
      timers=[saved,...timers.filter(t=>!same(t.id,saved.id))];stopWatch();status('Timer gestartet. Noch keine Arbeitsstunden gebucht.');mount();
      const pushDevice=ctx.pushDevice();
      if(pushDevice){try{const sent=await api('/functions/v1/appointment-reminders?action=timer-start',{method:'POST',body:{timer_id:saved.id,subscription_id:pushDevice,...(workDevice?{device_id:workDevice}:{})}});status(sent.sent?'Timer gestartet. Push an dieses Gerät versendet.':'Timer gestartet. Push konnte nicht versendet werden; bitte in den Einstellungen prüfen.');}catch{status('Timer gestartet. Push konnte nicht versendet werden; bitte in den Einstellungen prüfen.');}}
      else status('Timer gestartet. Für eine Push-Mitteilung bitte Push auf diesem Gerät in den Einstellungen erlauben.');
    }
    function watchArrival(){
      if(!ready||!eligible()||!ctx.locationAllowed()||document.visibilityState!=='visible'||active()){stopWatch();return;}
      const targets=candidates().filter(t=>ctx.locations().some(l=>same(l.customer_id,t.customer.id))&&!timers.some(v=>same(v.customer_id,t.customer.id)&&berlin(v.started_at).date===today()));
      const key=targets.map(t=>t.customer.id+':'+(t.plan?.id||'')).sort().join('|');
      if(!key||!navigator.geolocation){stopWatch();return;}if(watch!=null&&targetKey===key)return;stopWatch();targetKey=key;const stamp=identity(),epoch=watchEpoch;
      watch=navigator.geolocation.watchPosition(async position=>{
        if(epoch!==watchEpoch)return;
        if(!same(identity(),stamp)||!ctx.locationAllowed()||document.visibilityState!=='visible'){stopWatch();return;}
        if(busy||active()||position.coords.accuracy>100)return;
        const hits=candidates().filter(t=>targets.some(old=>same(t.customer.id,old.customer.id))).filter(t=>{const l=ctx.locations().find(l=>same(l.customer_id,t.customer.id));return l&&ctx.metres(position.coords,l)<=l.radius_m;});
        if(hits.length!==1){if(hits.length>1)status('Mehrere Kunden liegen im Umkreis. Bitte die Ankunft beim richtigen Kunden selbst bestätigen.');return;}
        busy=true;try{await start(hits[0].customer.id,hits[0].plan?.id,'gps',position);}catch(e){stopWatch();status(e.message);}finally{busy=false;}
      },()=>{if(epoch!==watchEpoch)return;stopWatch();status('GPS-Ankunft nicht verfügbar. Du kannst „Beim Kunden angekommen“ auswählen.');},{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
    }
    async function finish(id){
      const row=own().find(t=>same(t.id,id)),stamp=identity(),workDevice=device();if(!row)throw Error('Der eigene Timer ist nicht mehr verfügbar.');
      const saved=await api('/rest/v1/rpc/'+(workDevice?'stop_job_timer_for_device':'stop_job_timer'),{method:'POST',body:{p_id:id,...(workDevice?{p_device:workDevice}:{})}});const timer=Array.isArray(saved)?saved[0]:saved;
      if(!timer?.finished_at)throw Error('Das Timerende konnte nicht bestätigt werden.');
      if(!same(stamp,identity()))return;
      timers=[timer,...timers.filter(t=>!same(t.id,timer.id))];mount();await ctx.refreshPlanningData?.();if(!same(stamp,identity()))return;dialog?.remove();
      dialog=document.createElement('dialog');dialog.className='device-dialog';dialog.innerHTML=`<h2>Fahrzeit ergänzen</h2><p>${esc(timer.customer_name)} · gemessen ${duration(timer)}</p><p>Der Timer ist beendet. Die Zeit wird auf Viertelstunden gerundet und bleibt vor dem Speichern bearbeitbar.</p><form><label>Fahrzeit in Stunden<input name="drive" type="number" min="0" max="12" step="0.25" value="0" required></label><label>Fahrzeit zuordnen<select name="side"><option value="before">Vor dem Arbeitsbeginn</option><option value="after">Nach dem Arbeitsende</option></select></label><p class="timer-proposal" role="status"></p><p class="timer-dialog-error" role="alert"></p><div class="actions"><button type="button" class="secondary" data-cancel>Später</button><button class="primary">In Arbeitsschein übernehmen</button></div></form>`;document.body.append(dialog);dialog.showModal();
      const form=dialog.querySelector('form'),preview=()=>{try{const p=timeProposal(timer,Number(form.elements.drive.value)*60,form.elements.side.value);dialog.querySelector('.timer-proposal').textContent=`${p.start} – ${p.end} Uhr · ${p.hours.toLocaleString('de-DE')} h inklusive Fahrzeit`;return p;}catch(e){dialog.querySelector('.timer-proposal').textContent=e.message;return null;}};preview();form.addEventListener('input',preview);form.addEventListener('change',preview);
      form.addEventListener('invalid',()=>window.WorktimeDeviceFeatures?.validateForm(form),true);
      dialog.querySelector('[data-cancel]').onclick=()=>{dialog.close();dialog.remove();dialog=null;};
      form.onsubmit=async event=>{event.preventDefault();if(window.WorktimeDeviceFeatures&&!window.WorktimeDeviceFeatures.validateForm(form))return;const proposal=preview();if(!proposal)return;const button=form.querySelector('button.primary');button.disabled=true;try{await ctx.refreshPlanningData?.();if(!same(stamp,identity()))return;await openOrder(timer,proposal);dialog?.close();dialog?.remove();dialog=null;}catch(e){if(dialog)dialog.querySelector('.timer-dialog-error').textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}};
    }
    async function openOrder(timer,p){
      const customer=state.rows.customers.find(c=>same(c.id,timer.customer_id));if(!customer)throw Error('Der Kunde fehlt inzwischen. Bitte die Geschäftsleitung kontaktieren. Die Timerzeit bleibt gespeichert.');
      if(locked(workId(),p.date))throw Error('Dieser Tag ist wegen Urlaub, Krankheit oder Feiertag gesperrt. Die Timerzeit bleibt gespeichert.');
      const stamp=identity();if(device())state.businessId=ctx.workCompany();state.employeeId=workId();await ctx.loadTeamContext?.();if(!same(stamp,identity()))throw Error('Das persönliche Arbeitskonto wurde geändert. Die Timerzeit bleibt gespeichert.');
      const plan=state.rows.appointments.find(a=>same(a.id,timer.appointment_id)),existing=plan&&state.rows.orders.find(o=>same(o.id,plan.id));
      const period={key:crypto.randomUUID(),employee_id:workId(),start_time:p.start,end_time:p.end,pause_hours:0,executed_hours:p.hours};
      draft={timer,period,existingId:existing?.id||'',date:p.date};
      state.date=p.date;state.month=p.date.slice(0,7);state.employeeId=workId();state.menu=false;
      if(existing){state.planPrefill=null;state.orderId=existing.id;state.view='order-detail';}
      else{
        if(plan)openPlanningOrder(plan);else{state.planPrefill=null;state.orderId='';state.view='orders';}
        state.employeeId=workId();
        const previous=state.planPrefill||{};
        state.planPrefill={...previous,employeeId:workId(),ownerId:plan?.employee_id||workId(),date:p.date,customerName:customer.name,customerDetails:customer,start:p.start,end:p.end,timerId:timer.id,
          timerPeriods:[period,...(planEmployeeIds(plan).filter(id=>!same(id,workId())).map(employee_id=>({employee_id,start_time:'',end_time:'',pause_hours:0})))],
          details:[previous.details,`Timer: ${duration(timer)}; Fahrzeit: ${p.drive.toLocaleString('de-DE')} h (in Arbeitszeit enthalten).`].filter(Boolean).join('\n')};
        state.orderCustomer=customer.name;
      }
      render();root.querySelector('form[data-form="order"],form[data-form="order-edit"]')?.scrollIntoView({block:'start'});
    }
    function attachDraft(){
      if(!draft||!same(draft.timer.employee_id,workId())||!own().some(t=>same(t.id,draft.timer.id)))return;
      const form=draft.existingId?root.querySelector(`form[data-form="order-edit"] input[name="id"][value="${draft.existingId}"]`)?.form:state.planPrefill?.timerId===draft.timer.id&&root.querySelector('form[data-form="order"]');
      if(!form||form.dataset.timerId)return;
      form.dataset.timerId=draft.timer.id;
      if(device())form.dataset.timerDevice=device();
      if(draft.existingId){
        const target=form.querySelector('[data-team-times]');if(!target)return;
        const existing=[...target.querySelectorAll('[data-team-employee]')].find(s=>same(s.dataset.teamEmployee,workId()));
        if(existing){const duplicate=[...existing.querySelectorAll('[data-team-period]')].some(p=>p.querySelector('[data-team-time="start"]').value===draft.period.start_time&&p.querySelector('[data-team-time="end"]').value===draft.period.end_time&&Number(p.querySelector('[data-team-time="pause"]').value)===draft.period.pause_hours);if(!duplicate)existing.querySelector('[data-person-periods]').insertAdjacentHTML('beforeend',teamPeriodFields(draft.period));}
        else{target.insertAdjacentHTML('beforeend',teamPersonFields(workId(),[draft.period]));const choice=form.querySelector(`[name="team_employee"][value="${workId()}"]`);if(choice)choice.checked=true;}
      }
      form.insertAdjacentHTML('afterbegin',`<p class="wide plan-alert">Timerzeit übernommen · ${esc(draft.timer.customer_name)}. Fahrzeit enthalten; Pause und Zeiten vor dem Speichern bitte prüfen. Erst mit Unterschrift werden die Stunden gebucht.</p>`);
    }
    function afterRender(){if(!state.profile){reset();return;}mount();attachDraft();watchArrival();}
    async function run(button,fn){if(busy)return;busy=true;if(button)button.disabled=true;try{await fn();}catch(e){status(e.message);}finally{busy=false;if(button?.isConnected)button.disabled=false;}}
    root.addEventListener('submit',e=>{if(e.target.dataset.form!=='timer-start')return;e.preventDefault();e.stopImmediatePropagation();const customer=e.target.elements.timer_customer.value;if(!customer)return;const plan=candidates().find(t=>same(t.customer.id,customer))?.plan;run(e.submitter,()=>start(customer,plan?.id));},true);
    root.addEventListener('click',e=>{const b=e.target.closest('[data-timer-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();run(b,()=>b.dataset.timerAction==='finish'?finish(b.dataset.id):start(b.dataset.customer,b.dataset.plan));},true);
    async function refresh(){if(state.view==='home')try{await ctx.refreshPlanningData?.();}catch{}await load();mount();watchArrival();}
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')stopWatch();else if(state.profile)refresh();});
    setInterval(()=>{if(state.profile&&eligible()&&document.visibilityState==='visible'&&!busy&&!dialog)refresh();},20000);
    return {load,afterRender,reset,saved:id=>{timers=timers.filter(t=>!same(t.id,id));if(same(draft?.timer.id,id))draft=null;mount();},refresh:()=>{mount();watchArrival();}};
  }
  window.WorktimeArrivalTimer={create,timeProposal,berlin};
})();
