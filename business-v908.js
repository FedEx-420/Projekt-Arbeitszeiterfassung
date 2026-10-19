/* Working owner, internal work and effective-dated time/school settings. */
(()=>{
 'use strict';
 function create(app){
  const {root,state,allRows,api,perform,escape:esc,isManager,workerId,worker,workers,businessId,today,h,recordedPeriods,schoolPeriods}=app,R=window.WorktimeBusinessRules;
  const renderCurrent=()=>app.render?.();
  if(!R)return null;let scope='',serial=0,ready=false,error='',loading=false,attempted=false,pending=null,pendingKey='';
  const identity=()=>state.profile&&businessId()?state.profile.id+':'+businessId():'';
  const canManage=()=>isManager()&&['business','employee'].includes(worker()?.role);
  function ensureScope(){
   const current=identity();
   if(scope!==current){scope=current;serial++;ready=false;error='';loading=false;attempted=false;pending=null;pendingKey='';state.rows.timeRules=[];state.rows.schoolRules=[];}
   return current;
  }
  async function load(){
   const current=ensureScope();if(!current)return;
   const ids=[...new Set(workers().map(p=>p.id))].sort(),key=current+':'+ids.join(',');
   if(loading&&pendingKey===key)return pending;
   attempted=true;
   if(!ids.length){ready=false;loading=false;error='Die Arbeitskonten dieses Betriebs sind noch nicht vollständig geladen. Bitte aktualisieren.';return;}
   const stamp=++serial,query='select=*&employee_id=in.('+ids.map(encodeURIComponent).join(',')+')&order=employee_id.asc,effective_from.asc';
   ready=false;loading=true;error='';pendingKey=key;
   const task=(async()=>{
    try{const [times,schools]=await Promise.all([allRows('worker_time_rules_v908',query),allRows('worker_school_rules_v908',query)]);if(current!==identity()||stamp!==serial)return;state.rows.timeRules=times;state.rows.schoolRules=schools;ready=true;error='';}
    catch{if(current===identity()&&stamp===serial){ready=false;error='Zeit- und Schulvorgaben konnten nicht vollständig geladen werden. Bitte aktualisieren; keine neuen Vorgaben anlegen, bis die Synchronisierung wieder funktioniert.';}}
    finally{if(current===identity()&&stamp===serial){loading=false;pending=null;pendingKey='';}}
   })();pending=task;return task;
  }
  const loadingText=()=>error||(scope?'Zeit- und Schulvorgaben dieses Betriebs werden geladen …':'Bitte zuerst einen Betrieb auswählen.');
  const weekdays=['Mo','Di','Mi','Do','Fr','Sa','So'];
  function history(kind,person){if(!ready)return '<li>'+esc(loadingText())+'</li>';const rows=(kind==='school'?state.rows.schoolRules:state.rows.timeRules)||[];return rows.filter(row=>row.employee_id===person.id).map(row=>`<li>Ab ${esc(row.effective_from)} · ${kind==='school'?row.school_hours.map((hours,i)=>hours?weekdays[i]+' '+h(hours):'').filter(Boolean).join(', '):row.targets_enabled?row.target_hours.map((hours,i)=>weekdays[i]+' '+h(hours)).join(', '):'Keine Sollstunden'}${row.effective_from>today()?' · künftig':''}</li>`).join('')||'<li>Noch keine individuelle Vorgabe.</li>';}
  function ruleForm(kind,person){
   const school=kind==='school',rows=(school?state.rows.schoolRules:state.rows.timeRules)||[],rule=ready?R.at(rows,person.id,today()):null,values=ready?rule?.[school?'school_hours':'target_hours']||(school?[0,0,0,0,0,0,0]:[8,8,8,8,5,0,0]):Array(7).fill('');
   return `<section class="panel worker-rule-panel"><h3>${school?'Berufsschultage':'Sollstunden'} · ${esc(person.display_name||person.username)}</h3><p>${school?'Nur eingetretene Schultage werden gutgeschrieben; keine zukünftigen Stunden, Feiertage, Krankheits- oder genehmigten Urlaubstage. Vergangene Vorgaben bleiben erhalten.':'Ohne Sollstunden zeigt die Kontoansicht die Gesamtstunden des ausgewählten Monats statt Über-/Minusstunden. Änderungen gelten ab dem gewählten Datum.'}</p><form data-form="worker-rule" class="entry-form" data-rule-kind="${kind}" data-worker="${esc(person.id)}" data-scope="${esc(identity())}"><input type="hidden" name="revision" value="${rule?.effective_from===today()?rule.revision:0}"><label>Gültig ab<input name="effective_from" type="date" min="${today()}" required value="${today()}"></label>${school?'':`<label>Arbeitszeitkonto<select name="targets_enabled"><option value="yes" ${rule?.targets_enabled!==false?'selected':''}>Mit Sollstunden</option><option value="no" ${rule?.targets_enabled===false?'selected':''}>Keine Sollstunden</option></select></label>`}<fieldset class="wide rule-hours"><legend>${school?'Schulstunden je Wochentag · 0 = keine Schule':'Sollstunden je Wochentag'}</legend><div class="rule-hours-grid">${weekdays.map((label,i)=>`<label>${label}<input type="number" name="hours_${i}" min="0" max="24" step="0.25" required value="${values[i]}"></label>`).join('')}</div></fieldset><button class="primary wide" ${!ready?'disabled':''}>${school?'Schulplan':'Sollstunden'} speichern</button><p class="wide" role="status" data-rule-result></p></form><details><summary>Gespeicherte Vorgaben und Gültigkeit</summary><ul>${history(kind,person)}</ul></details></section>`;
  }
  function settings(content){
   ensureScope();
   const person=worker();if(!person||!['business','employee'].includes(person.role))return content;
   const hasSchool=person.labor_type==='azubi'||(state.rows.schoolRules||[]).some(row=>row.employee_id===person.id);
   if(!isManager())return content+`<section class="panel"><h3>Mein Arbeitszeitkonto</h3><p role="status">${!ready?esc(loadingText()):R.mode(state.rows.timeRules,person.id,state.date)?'Sollstunden mit Über-/Minusstunden':'Keine Sollstunden · Gesamtstunden pro Monat'}</p>${ready&&hasSchool?'<details><summary>Mein Schulplan</summary><ul>'+history('school',person)+'</ul></details>':''}</section>`;
   const schedule=R.at(state.rows.workweeks,person.id,today()),days=schedule?.weekdays||[1,2,3,4,5];
   const labor=person.role==='business'?`<section class="panel"><h3>Geschäftsführung als Arbeitskonto</h3><p>${esc(person.display_name||person.username)} nutzt denselben Login für eigene Aufträge und die Verwaltung.</p><form data-form="employee-labor-type" class="entry-form"><label>Arbeitskraft<select name="labor_type">${[['meister','Meister'],['monteur','Monteur'],['aushilfe','Aushilfe'],['azubi','Auszubildender']].map(([id,label])=>`<option value="${id}" ${person.labor_type===id?'selected':''}>${label}</option>`).join('')}</select></label><button class="primary">Arbeitskraft speichern</button></form></section>`:'';
   const html=(!ready?`<p class="notice ${error?'error':''}" role="status" data-worker-rules-loading>${esc(loadingText())}</p>`:'')+`<section class="panel"><h3>Regelmäßige Arbeitstage · ${esc(person.display_name||person.username)}</h3><form data-form="worker-workweek" class="entry-form" data-worker="${esc(person.id)}" data-scope="${esc(identity())}"><label>Gültig ab<input type="date" name="effective_from" required min="${today()}" value="${today()}"></label><fieldset class="wide"><legend>Arbeitstage · für Urlaub und Feiertage</legend><div class="workweek-options">${weekdays.map((label,i)=>`<label><input type="checkbox" name="weekday" value="${i+1}" ${days.includes(i+1)?'checked':''}>${label}</label>`).join('')}</div></fieldset><button class="primary wide">Arbeitstage speichern</button><p class="wide" role="status" data-rule-result></p></form></section>`+ruleForm('time',person)+(hasSchool?ruleForm('school',person):'');
   if(ready)return content+labor+html;
   return content+labor+html.replace(/(<(?:input|select|button)\b)([^>]*)(>)/g,(match,tag,attrs,end)=>attrs.includes('disabled')?match:tag+attrs+' disabled'+end);
  }
  function reasonFields(order={}){const kind=order.work_kind||'customer';return `<fieldset class="wide work-kind"><legend>Art des Arbeitsscheins</legend><input type="hidden" name="work_kind" value="${esc(kind)}"><div class="work-kind-options">${[{id:'customer',label:'Kundenauftrag'},...R.reasons].map(reason=>`<button type="button" data-core-action="work-kind" data-kind="${reason.id}" aria-pressed="${kind===reason.id}" class="${kind===reason.id?'primary':'secondary'} small">${reason.label}</button>`).join('')}</div><p class="device-help" data-work-kind-status></p></fieldset>`;}
  function syncKind(form){
   const kind=form.elements.work_kind?.value||'customer',internal=kind!=='customer',notes=form.elements.documentation;
   for(const button of form.querySelectorAll('[data-core-action="work-kind"]')){const selected=button.dataset.kind===kind;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('primary',selected);button.classList.toggle('secondary',!selected);}
   const signature=form.querySelector('.signature-field');if(signature)signature.hidden=internal;
   const signer=form.elements.signed_by;if(signer){signer.required=!internal;signer.disabled=internal;const label=signer.closest('label');if(label)label.hidden=internal;}
   if(notes){notes.required=kind==='other';notes.placeholder=kind==='other'?'Bitte den konkreten Grund für diese Tätigkeit angeben.':'';}
   if(form.elements.customer){form.elements.customer.required=!internal;form.elements.customer.placeholder=internal?'Optional · nur wenn ein Kunde zugeordnet werden soll':'';}
   const status=form.querySelector('[data-work-kind-status]');if(status)status.textContent=internal?'Nicht abrechnungsfähig · die Arbeitszeit wird trotzdem allen Beteiligten gutgeschrieben.':'Kundenauftrag · Unterschrift und Name sind erforderlich.';
   if(internal){signature?.classList.remove('field-error');signature?.querySelector('.signature-pad')?.classList.remove('field-error');}
  }
  function mount(){
   const current=ensureScope();
   for(const form of root.querySelectorAll('form[data-form="worker-rule"]')){if(form.elements.targets_enabled){const noTargets=form.elements.targets_enabled.value==='no',group=form.querySelector('.rule-hours');group.hidden=noTargets;for(const input of group.querySelectorAll('input'))input.disabled=!ready||noTargets;}}
   for(const input of root.querySelectorAll('input[type="password"]')){
    if(input.parentElement.querySelector('[data-core-action="password-eye"]'))continue;
    const button=document.createElement('button');button.type='button';button.className='password-eye';button.dataset.coreAction='password-eye';button.setAttribute('aria-label','Passwort anzeigen');button.setAttribute('aria-pressed','false');button.textContent='◉';input.after(button);
   }
   for(const form of root.querySelectorAll('form[data-form="order"],form[data-form="order-edit"]')){
    if(!form.elements.work_kind){const order=(state.rows.orders||[]).find(o=>o.id===form.elements.id?.value),templates=form.querySelector('.note-templates');if(templates)templates.outerHTML=reasonFields(order);else form.querySelector('[name="documentation"]')?.closest('label')?.insertAdjacentHTML('beforebegin',reasonFields(order));if(order?.work_kind&&order.work_kind!=='customer'&&!order.customer_id&&form.elements.customer)form.elements.customer.value='';}syncKind(form);
   }
   if(state.view==='home'){root.querySelector('.home-company-copy>p')?.remove();root.querySelector('.home-company-copy>.eyebrow')?.remove();}
   if(['home','calendar'].includes(state.view)&&!ready){
    const card=root.querySelector('.stat-grid article'),label=card?.querySelector('span'),value=card?.querySelector('strong');if(label)label.textContent=error?'Arbeitszeitkonto nicht geladen':'Arbeitszeitkonto wird geladen';if(value){value.textContent='—';value.classList.remove('positive','negative');}
    if(!root.querySelector('[data-worker-rules-loading]'))root.querySelector('.content')?.insertAdjacentHTML('beforeend',`<p class="notice ${error?'error':''}" role="status" data-worker-rules-loading>${esc(loadingText())}</p>`);
   }
   if(ready&&['home','calendar'].includes(state.view)&&!R.mode(state.rows.timeRules,workerId(),state.date)){
    const card=root.querySelector('.stat-grid article'),label=card?.querySelector('span'),value=card?.querySelector('strong');if(label)label.textContent='Gesamtstunden · '+state.date.slice(0,7);if(value){value.textContent=h(recordedPeriods(workerId()).filter(e=>e.work_date.startsWith(state.date.slice(0,7))).reduce((sum,e)=>sum+Number(e.executed_hours||0),0));value.classList.remove('positive','negative');}
   }
   if(ready&&['home','calendar'].includes(state.view)&&schoolPeriods(workerId(),state.date).length&&!root.querySelector('[data-school-status]')){root.querySelector('.content')?.insertAdjacentHTML('beforeend',`<section class="panel school-status" data-school-status><h3>Berufsschule</h3><p>${h(schoolPeriods(workerId(),state.date).reduce((sum,e)=>sum+e.executed_hours,0))} Arbeitszeit laut gültigem Schulplan gutgeschrieben.</p></section>`);}
   for(const node of root.querySelectorAll('[data-work-kind-badge]'))node.remove();
   if(state.view==='order-detail'){const order=(state.rows.orders||[]).find(o=>o.id===state.orderId);if(order?.work_kind&&order.work_kind!=='customer')root.querySelector('.panel h3')?.insertAdjacentHTML('afterend','<span class="nonbillable-badge" data-work-kind-badge>Nicht abrechnungsfähig</span>');}
   if(current&&!ready&&!loading&&!attempted){const token=current;load().then(()=>{if(token===identity())renderCurrent();});}
  }
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-core-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
   if(button.dataset.coreAction==='password-eye'){const input=button.previousElementSibling;if(!input||input.tagName!=='INPUT')return;const visible=input.type==='password';input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Passwort verbergen':'Passwort anzeigen');input.focus({preventScroll:true});return;}
   const form=button.closest('form');if(!form?.elements.work_kind)return;const kind=R.kind(button.dataset.kind);form.elements.work_kind.value=kind;if(form.elements.documentation){if(kind!=='other')form.elements.documentation.value=R.documentation(kind,form.elements.documentation.value);else form.elements.documentation.value=form.elements.documentation.value.split(/\r?\n/).filter(line=>!R.reasons.some(r=>r.text&&r.text===line.trim())).join('\n').trim();}syncKind(form);if(kind==='other')form.elements.documentation?.focus();
  },true);
  root.addEventListener('change',event=>{const form=event.target.closest('form[data-form="worker-rule"]');if(!form)return;
   if(event.target.name==='effective_from'){const rows=form.dataset.ruleKind==='school'?state.rows.schoolRules:state.rows.timeRules,rule=(rows||[]).find(r=>r.employee_id===form.dataset.worker&&r.effective_from===event.target.value);form.elements.revision.value=rule?.revision||0;if(rule){for(let i=0;i<7;i++)form.elements['hours_'+i].value=rule[form.dataset.ruleKind==='school'?'school_hours':'target_hours'][i];if(form.elements.targets_enabled)form.elements.targets_enabled.value=rule.targets_enabled?'yes':'no';}}
   if(form.elements.targets_enabled){const noTargets=form.elements.targets_enabled.value==='no',group=form.querySelector('.rule-hours');group.hidden=noTargets;for(const input of group.querySelectorAll('input'))input.disabled=noTargets;}
  });
  root.addEventListener('submit',event=>{
   const form=event.target;if(!['worker-rule','worker-workweek'].includes(form.dataset.form))return;event.preventDefault();event.stopImmediatePropagation();
   ensureScope();
   if(!ready){const output=form.querySelector('[data-rule-result]');if(output)output.textContent=loadingText();return;}
   if(!canManage()||form.dataset.worker!==workerId()||form.dataset.scope!==identity())return;
   if(!form.reportValidity())return;const employee=form.dataset.worker,effective=form.elements.effective_from.value;
   if(form.dataset.form==='worker-workweek'){const weekdays=[...form.querySelectorAll('[name="weekday"]:checked')].map(i=>Number(i.value));if(!weekdays.length){let output=form.querySelector('[data-rule-result]');if(!output){output=document.createElement('p');output.dataset.ruleResult='';output.setAttribute('role','alert');form.append(output);}output.textContent='Bitte mindestens einen Arbeitstag auswählen.';return;}return perform('Arbeitstage gespeichert.',()=>api('/rest/v1/employee_workweeks_v905?on_conflict=employee_id,effective_from',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{employee_id:employee,effective_from:effective,weekdays}}));}
   try{const hours=R.validateHours(weekdays.map((_,i)=>Number(form.elements['hours_'+i].value))),revision=Number(form.elements.revision.value),kind=form.dataset.ruleKind,enabled=form.elements.targets_enabled?.value!=='no';return perform('Vorgabe gespeichert. Frühere Vorgaben bleiben erhalten.',()=>api('/rest/v1/rpc/save_worker_rule_v908',{method:'POST',body:{p_employee:employee,p_kind:kind,p_effective:effective,p_revision:revision,p_hours:hours,p_enabled:enabled}}));}catch(error){const output=form.querySelector('[data-rule-result]');if(output)output.textContent=error.message;}
  },true);
  return {load,mount,settings,beforeRender:ensureScope,ensureScope};
 }
 window.WorktimeBusiness={create};
})();
