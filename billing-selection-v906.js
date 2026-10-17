/* In-memory selection only. No booking, transmission or storage on PDF preview. */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const hours=n=>Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' h';
 const orderHours=row=>Array.isArray(row.team_periods)&&row.team_periods.length?row.team_periods.reduce((sum,period)=>sum+Number(period.executed_hours||0),0):Number(row.executed_hours||0);
 function select(group,ids){
  if(!group||!Array.isArray(group.orders)||!Array.isArray(ids)||!ids.length)throw Error('Bitte mindestens einen offenen Arbeitsschein auswählen.');
  const unique=new Set(ids.map(String));
  const orders=group.orders.filter(row=>unique.has(String(row.id))&&!row.invoiced);
  if(orders.length!==unique.size)throw Error('Die Auswahl ist nicht mehr aktuell. Bitte die offenen Arbeitsscheine neu laden.');
  return {...group,orders,hours:orders.reduce((sum,row)=>sum+orderHours(row),0)};
 }
 function choose({group,initialIds,people=[],resolve=()=>group,purpose='invoice'}){
  if(!group?.orders?.length)return Promise.reject(Error('Keine offenen Arbeitsscheine verfügbar.'));
  document.querySelector('[data-billing-selection]')?.dispatchEvent(new Event('cancel'));
  return new Promise(resolveResult=>{
   const previous=document.activeElement,dialog=document.createElement('dialog');
   dialog.className='billing-selection';dialog.dataset.billingSelection='';
   dialog.setAttribute('aria-label','Arbeitsscheine auswählen');
   const initial=new Set((initialIds||group.orders.map(row=>row.id)).map(String)),mark=purpose==='mark';
   dialog.innerHTML=`<form novalidate><header><span class="eyebrow">${mark?'Abschluss bestätigen':'Rechnung vorbereiten'}</span><h2>Arbeitsscheine auswählen</h2><p>${esc(group.customerName)}</p><button type="button" data-close aria-label="Auswahl schließen">×</button></header><div class="billing-selection-body"><p>${mark?'Nur die ausgewählten Arbeitsscheine werden als abgerechnet markiert. Bitte erst nach endgültigem Rechnungsabschluss bestätigen.':'Nur die ausgewählten Arbeitsscheine erscheinen auf der Rechnung. Alle anderen bleiben offen.'}</p><div class="billing-selection-tools"><button type="button" class="secondary small" data-toggle="all">Alle auswählen</button><button type="button" class="secondary small" data-toggle="none">Auswahl aufheben</button></div><fieldset><legend>Offene Arbeitsscheine</legend>${[...group.orders].sort((a,b)=>String(a.work_date).localeCompare(String(b.work_date))||String(a.id).localeCompare(String(b.id))).map(row=>{
    const names=[...new Set([row.employee_id,...(row.team_periods||[]).map(p=>p.employee_id)].filter(Boolean))].map(id=>people.find(p=>String(p.id)===String(id))).filter(Boolean).map(p=>p.display_name||p.username).join(', ');
    return `<label class="billing-selection-row"><input type="checkbox" name="order" value="${esc(row.id)}" ${initial.has(String(row.id))?'checked':''}><span><b>${esc(new Date(row.work_date+'T12:00:00').toLocaleDateString('de-DE'))} · ${esc(row.title||'Arbeitsschein')}</b><small>${esc(names)} · ${hours(orderHours(row))}</small></span></label>`;
   }).join('')}</fieldset>${mark?'<label class="billing-final-confirm"><input type="checkbox" name="finished"> Die Rechnung ist endgültig abgeschlossen. Nur diese Auswahl als abgerechnet markieren.</label>':'<p class="device-help">Es wird zunächst eine bearbeitbare Vorschau erstellt. Das Öffnen, Herunterladen oder Drucken markiert nichts als abgerechnet.</p>'}<p class="billing-selection-error" role="alert"></p></div><footer><b data-total aria-live="polite"></b><div class="actions"><button type="button" class="secondary" data-close>Abbrechen</button><button class="${mark?'danger':'primary'}">${mark?'Auswahl als abgerechnet markieren':'Weiter zu Steuerangaben'}</button></div></footer></form>`;
   document.body.append(dialog);
   let ended=false;const close=value=>{if(ended)return;ended=true;dialog.close?.();dialog.remove();if(previous?.isConnected)previous.focus();resolveResult(value);};
   const ids=()=>[...dialog.querySelectorAll('[name="order"]:checked')].map(el=>el.value);
   const update=()=>{const values=ids(),orders=group.orders.filter(row=>values.includes(String(row.id)));dialog.querySelector('[data-total]').textContent=`${orders.length} von ${group.orders.length} ausgewählt · ${hours(orders.reduce((s,row)=>s+orderHours(row),0))}`;dialog.querySelector('.billing-selection-error').textContent='';};
   dialog.addEventListener('cancel',event=>{event.preventDefault();close(null);});
   dialog.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-close'))close(null);if(b.dataset.toggle){dialog.querySelectorAll('[name="order"]').forEach(el=>el.checked=b.dataset.toggle==='all');update();}});
   dialog.addEventListener('change',update);
   dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();try{const fresh=resolve();if(!fresh)throw Error('Konto oder Firma wurde gewechselt. Bitte die Auswahl neu öffnen.');const result=select(fresh,ids());if(mark&&!dialog.querySelector('[name="finished"]').checked)throw Error('Bitte zuerst den endgültigen Rechnungsabschluss bestätigen.');close(result);}catch(error){dialog.querySelector('.billing-selection-error').textContent=error.message;dialog.querySelector('[name="order"]')?.focus();}});
   update();dialog.showModal();dialog.querySelector('[name="order"]')?.focus();
  });
 }
 window.WorktimeBillingSelection={select,choose};
})();
