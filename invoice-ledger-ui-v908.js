/* Immutable invoice register. A preview never finalizes an order. */
(()=>{
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const billable=order=>!!order&&!order.invoiced&&(!order.work_kind||order.work_kind==='customer');
 const text=value=>typeof value==='string'?value.trim():'';
 function prefillParties(prepared,info=null,previous={}){
  const company=prepared.source_snapshot?.company||prepared.document.companyProfile||{},fields=prepared.source_snapshot?.customer?.custom_fields||{};
  const legal=info&&String(info.company_id)===String(prepared.company_id)?info.details||{}:null;
  const known=(key,fallback)=>legal&&Object.prototype.hasOwnProperty.call(legal,key)?text(legal[key]):text(fallback);
  const legalAddress=legal&&['street','house_no','postcode','city'].some(key=>Object.prototype.hasOwnProperty.call(legal,key));
  const address=legalAddress?[[text(legal.street),text(legal.house_no)].filter(Boolean).join(' '),[text(legal.postcode),text(legal.city)].filter(Boolean).join(' ')]:clone(previous.address||['','']);
  return {issuer:{name:known('name',previous.name||company.company_name||prepared.document.company),address,
   taxNumber:legal?text(legal.taxId):'',vatId:legal?text(legal.vatId):'',email:known('email',previous.email),phone:known('phone',previous.phone),iban:known('iban',previous.iban)},
   customer:{name:prepared.document.customer,address:[fields.street||fields.house_no?[text(fields.street),text(fields.house_no)].filter(Boolean).join(' '):text(fields.address),[text(fields.postal_code),text(fields.city)].filter(Boolean).join(' ')]}};
 }
 function smallAmountEligible(tax){return !!tax&&Number.isSafeInteger(tax.gross)&&tax.gross>=0&&tax.gross<=25000&&Array.isArray(tax.groups)&&tax.groups.length>0&&tax.groups.every(group=>['standard','reduced','pv','small'].includes(group.code));}
 function invoiceParties(parties,small=false){
  const result=clone(parties);result.issuer.taxNumber=text(result.issuer.taxNumber);result.issuer.vatId=text(result.issuer.vatId);
  if(small){result.issuer.taxNumber='';result.issuer.vatId='';result.smallAmountConfirmed=true;}
  else if(result.issuer.vatId)result.issuer.taxNumber='';
  return result;
 }
 function folders(batches,cancellations){
  const map=new Map(),cancelled=new Map(cancellations.map(row=>[row.invoice_id,row]));
  for(const batch of batches){const group=map.get(batch.customer_key)||{key:batch.customer_key,name:batch.customer_name,invoices:[]};group.invoices.push({...batch,cancellation:cancelled.get(batch.id)||null});map.set(group.key,group);}
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'de')).map(g=>({...g,invoices:g.invoices.sort((a,b)=>String(b.issued_on).localeCompare(String(a.issued_on))||String(b.created_at).localeCompare(String(a.created_at)))}));
 }
 function create({root,state,api,allRows,render,reload,isManager,businessId,today,escape:esc,askTax,openPdf,scopeOrder,getCompanyDetails=()=>null}){
  let scope='',serial=0,batches=[],cancellations=[],links=[],loaded=false,error='',busy=false,draft=null,folder='',expanded='',cancelDraft=null;
  const money=cents=>(Number(cents||0)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const current=()=>state.profile&&isManager()&&businessId()?state.profile.id+':'+businessId():'';
  function ensure(){if(scope!==current()){scope=current();serial++;batches=[];cancellations=[];links=[];loaded=false;error='';busy=false;draft=null;folder='';expanded='';cancelDraft=null;}return !!scope;}
  function result(value){const row=Array.isArray(value)?value[0]:value;if(!row||!row.id)throw Error('Der Server hat das Speichern noch nicht bestätigt. Bitte erneut versuchen; derselbe Vorgang wird nicht doppelt erfasst.');return row;}
  async function load(){
   if(!ensure())return;const request=++serial,stamp=scope,query='select=*&company_id=eq.'+encodeURIComponent(businessId());
   try{const data=await Promise.all([allRows('invoice_batches_v908',query+'&order=issued_on.desc,created_at.desc'),allRows('invoice_cancellations_v908',query+'&order=created_at.desc'),allRows('invoice_order_links_v908',query)]);if(scope!==stamp||current()!==stamp||request!==serial)return;[batches,cancellations,links]=data;loaded=true;error='';}
   catch(cause){if(scope===stamp&&current()===stamp&&request===serial)error='Rechnungsregister konnte nicht aktualisiert werden. Bereits geladene Originale bleiben erhalten. '+(cause.message||'Bitte erneut laden.');}
  }
  async function perform(task){
   if(busy)return;busy=true;const stamp=current();const controls=[...root.querySelectorAll('[data-ledger-action], [data-ledger-form] button, [data-ledger-form] input, [data-ledger-form] textarea, [data-ledger-form] select')].filter(el=>!el.disabled);controls.forEach(el=>el.disabled=true);
   try{await task();if(stamp!==current())return;await reload();}
   catch(cause){if(stamp===current())error=cause.message||'Vorgang nicht bestätigt. Bitte erneut laden, nicht doppelt erfassen.';}
   finally{if(stamp===current()){busy=false;render();}else controls.forEach(el=>{if(el.isConnected)el.disabled=false;});}
  }
  async function start(orders){
   if(!ensure())throw Error('Nur Geschäftsführung und Administrator können Rechnungen erstellen.');
   const ids=orders.filter(billable).map(order=>order.id);if(!ids.length||ids.length!==orders.length)throw Error('Bitte ausschließlich offene Kunden-Arbeitsscheine auswählen.');
   const stamp=current();let prepared;
   try{prepared=await api('/rest/v1/rpc/prepare_invoice_batch_v908',{method:'POST',body:{p_company:businessId(),p_order_ids:ids}});}
   catch(cause){
    if(/permission denied for function customer_labor_price_v868/i.test(cause?.message||''))throw Error('Die Rechnungsvorschau ist durch eine fehlende Serverberechtigung für die kundenspezifischen Stundenpreise blockiert. Die Datenbankkorrektur v909 ist erforderlich. Es wurde keine Rechnung erstellt und kein Arbeitsschein als abgerechnet markiert.');
    throw cause;
   }
   if(stamp!==current())return;
   if(!prepared?.document||!prepared.selection?.length||String(prepared.company_id)!==String(businessId()))throw Error('Die Rechnungsvorbereitung für diesen Betrieb wurde nicht bestätigt.');
   const lastIssuer=batches.find(batch=>String(batch.company_id)===String(businessId())&&batch.document?.issuer)?.document.issuer;
   const parties=prefillParties(prepared,getCompanyDetails(),lastIssuer||{});
   return askTax(prepared.document,tax=>{if(stamp!==current())return;draft={...clone(prepared),parties,tax:clone(tax),requestId:crypto.randomUUID(),number:'',issued:today(),confirmed:false,smallAmountConfirmed:false};error='';state.view='invoice-draft';render();},{basis:'net',allowedBasis:['net']});
  }
  function print(data,cancellation=false){return openPdf(clone(data),cancellation?'Stornorechnung':'Rechnung','Rechnung_'+String(data.number||'Entwurf').replace(/[^\p{L}\p{N}_. -]/gu,'_')+'.pdf','createInvoice',data.finalized?'Unveränderlicher gespeicherter Rechnungsstand.':'Entwurf – noch keine endgültige Rechnung oder Abrechnung.');}
  function partiesFields(){
   const derived=(draft.document.items||[]).filter(item=>item.derived_from_work_time);
   const notice=derived.length?`<div class="wide invoice-ledger-note"><b>Alter Arbeitsschein ohne gespeicherte Positionen</b><p>Die folgenden Positionen stammen nur für diese Rechnung aus den gespeicherten Arbeitszeiten. Es wurden keine zusätzlichen Zeiten oder Materialbuchungen angelegt. Stundenart und aktueller Preis müssen vor Abschluss geprüft werden.</p><ul>${derived.map(item=>`<li>${esc(item.employee_name)} · ${esc(item.name)} · ${esc(Number(item.quantity).toLocaleString('de-DE'))} H · ${money(Math.round(Number(item.price)*100))} netto/H</li>`).join('')}</ul></div>`:'';
   const field=(name,label,value,required=true)=>`${name==='issuer_name'?notice:''}<label>${esc(label)}<input name="${name}" ${required?'required minlength="2"':''} maxlength="${name.includes('name')?200:160}" value="${esc(value||'')}"></label>`,a=draft.parties.issuer,b=draft.parties.customer;
   const small=draft.document.invoice_rules_version>=909&&smallAmountEligible(draft.tax);
   return `<fieldset class="wide entry-form"><legend>Aussteller · vorhandene Firmenangaben übernommen</legend>${field('issuer_name','Vollständiger Firmen-/Inhabername',a.name)}${field('issuer_street','Straße und Hausnummer',a.address?.[0])}${field('issuer_city','Postleitzahl und Ort',a.address?.[1])}${field('issuer_tax','Steuernummer (falls keine USt-IdNr. vorhanden)',a.taxNumber,false)}${field('issuer_vat','Umsatzsteuer-ID (wird bevorzugt ausgegeben)',a.vatId,false)}${field('issuer_email','E-Mail (optional)',a.email,false)}${field('issuer_phone','Telefon (optional)',a.phone,false)}${field('issuer_iban','IBAN (optional)',a.iban,false)}<p class="wide device-help">Die PDF enthält nur die USt-IdNr., wenn sie vorhanden ist; andernfalls die Steuernummer. Nicht die persönliche Steuer-ID eintragen. Fehlende Stammdaten kannst du unter „Unterlagen & Freigaben → Firmenangaben“ ergänzen. Änderungen hier gelten nur für diese neue Rechnung.</p><details class="wide"><summary>ⓘ Wann muss eine Steuerkennung auf die Rechnung?</summary><p>Reguläre Rechnungen benötigen Steuernummer oder USt-IdNr. (§ 14 Abs. 4 Satz 1 Nr. 2 UStG). Kleinunternehmer sind nicht pauschal davon befreit (§ 34a UStDV). Auch 0 % Umsatzsteuer allein erlaubt kein Weglassen. Bei Kleinbeträgen bis 250 € brutto kann die Kennung entfallen; nicht bei § 3c, § 6a oder § 13b UStG.</p><a href="https://www.gesetze-im-internet.de/ustdv_1980/__33.html" target="_blank" rel="noopener">§ 33 UStDV – Kleinbetragsrechnungen</a></details>${small?`<label class="wide invoice-ledger-check"><input name="small_amount_confirmed" type="checkbox" ${draft.smallAmountConfirmed?'checked':''}> Steuerkennung weglassen: Ich bestätige eine inländische Kleinbetragsrechnung bis 250 € brutto, ohne Leistungen nach § 3c, § 6a oder § 13b UStG.</label>`:''}<p class="wide device-help">Angaben vor Ausgabe prüfen; keine behördliche Prüfung oder Rechtskonformitätsgarantie.</p></fieldset><fieldset class="wide entry-form"><legend>Rechnungsempfänger · vorhandene Kundendaten übernommen</legend>${field('customer_name','Vollständiger Empfängername',b.name)}${field('customer_street','Straße und Hausnummer',b.address?.[0])}${field('customer_city','Postleitzahl und Ort',b.address?.[1])}</fieldset>`;
  }
  function draftView(){
   if(!ensure()||!draft)return '<section class="panel"><h2>Rechnungsentwurf</h2><p>Kein Entwurf für diesen Betrieb geöffnet.</p><button class="secondary" data-ledger-action="back-open">Noch offene Arbeitsscheine</button></section>';
   return `<section class="page-head"><div><span class="eyebrow">Noch nicht abgeschlossen</span><h2>Rechnung prüfen</h2><p>${esc(draft.customer_name)} · ${draft.selection.length} ausgewählte Arbeitsschein(e)</p></div></section>${status()}<section class="panel invoice-ledger-note"><p>Vorschau und Download buchen nichts ab. Erst „Rechnung verbindlich abschließen“ speichert den unveränderlichen Rechnungsstand und markiert genau diese Arbeitsscheine als abgerechnet. Eine Nummer bitte aus deinem eigenen eindeutigen Nummernkreis vergeben; die App erfindet keine bereits existierende Rechnungsnummer.</p></section><section class="panel"><form data-ledger-form="issue" class="entry-form"><label>Rechnungsnummer<input name="invoice_number" required maxlength="100" value="${esc(draft.number)}" autocomplete="off"></label><label>Rechnungsdatum<input type="date" name="issued_on" required value="${esc(draft.issued)}"></label>${partiesFields()}<div class="wide invoice-ledger-totals"><span>Netto <b>${money(draft.tax.net)}</b></span><span>Umsatzsteuer <b>${money(draft.tax.vat)}</b></span><span>Gesamt <b>${money(draft.tax.gross)}</b></span></div><label class="wide invoice-ledger-check"><input type="checkbox" name="confirmed" required ${draft.confirmed?'checked':''}> Ich habe Nummer, Empfänger, Leistungen, Preise und Steuerangaben geprüft. Diesen Stand verbindlich als Rechnung speichern.</label><div class="wide actions"><button type="button" class="secondary" data-ledger-action="preview-draft">PDF-Vorschau</button><button class="primary" ${busy?'disabled':''}>Rechnung verbindlich abschließen</button><button type="button" class="secondary" data-ledger-action="back-open">Zurück ohne Abschluss</button></div></form><p class="device-help">Keine Garantie vollständiger Rechnungs-, Archiv- oder E-Rechnungskonformität. Rechnungspflichtangaben und steuerliche Einordnung bleiben vom ausstellenden Betrieb zu prüfen. Eine PDF allein ist keine strukturierte E-Rechnung.</p></section>`;
  }
  function status(){return error?`<p class="invoice-ledger-status" role="alert">${esc(error)}</p>`:'';}
  function legacy(){
   const covered=new Set(links.map(l=>l.order_id)),rows=(state.rows.orders||[]).filter(order=>order.invoiced&&(!order.work_kind||order.work_kind==='customer')&&!covered.has(order.id)&&scopeOrder(order)),groups=new Map();
   for(const order of rows){const key=order.customer_id||'name:'+String(order.customer_name||'').toLowerCase(),g=groups.get(key)||{name:order.customer_name||'Kunde',orders:[]};g.orders.push(order);groups.set(key,g);}
   return groups.size?`<section class="panel invoice-ledger-legacy"><h3>Historischer Bestand · nur als abgerechnet markiert</h3><p>Diese älteren Arbeitsscheine hatten noch keinen gespeicherten Rechnungsabschluss. Sie werden nicht nachträglich mit einer erfundenen Rechnungsnummer als offizielle Rechnung ausgegeben. Die ursprünglichen Arbeitsdaten bleiben erhalten. Für eine nachträgliche Registerübernahme müssen tatsächliche Originalnummer, Datum und Originalrechnung ausdrücklich geprüft werden.</p>${[...groups.values()].map(g=>`<details><summary>${esc(g.name)} · ${g.orders.length} Arbeitsschein(e)</summary>${g.orders.map(o=>`<button type="button" class="secondary" data-action="open-order" data-id="${esc(o.id)}">${esc(o.work_date)} · ${esc(o.title||'Arbeitsschein')} ansehen</button>`).join('')}</details>`).join('')}</section>`:'';
  }
  function cancelForm(batch){
   const d=cancelDraft;if(!d||d.invoice!==batch.id)return '';
   return `<form data-ledger-form="cancel" class="entry-form invoice-ledger-cancel"><h4 class="wide">${d.reopen?'Rechnung stornieren und zugehörige Arbeitsscheine einzeln zur Änderung öffnen':'Rechnung vollständig stornieren'}</h4><p class="wide">Das Original bleibt erhalten. ${d.reopen?'Genau diese Arbeitsscheine werden ohne Kopieren ihrer Arbeitszeiten wieder geöffnet und gekennzeichnet.':'Die zugehörigen Aufträge bleiben gesperrt und werden nicht versehentlich erneut abgerechnet.'}</p><label>Stornonummer<input name="cancellation_number" required maxlength="100" value="${esc(d.number)}"></label><label>Stornodatum<input name="issued_on" type="date" min="${esc(batch.issued_on)}" required value="${esc(d.issued)}"></label><label class="wide">Grund<textarea name="reason" required minlength="3" maxlength="2000">${esc(d.reason)}</textarea></label><label class="wide invoice-ledger-check"><input name="confirmed" type="checkbox" required> ${d.reopen?'Original stornieren und nur die enthaltenen Arbeitsscheine wieder öffnen.':'Storno verbindlich speichern, ohne die Aufträge erneut abrechenbar zu machen.'}</label><div class="wide actions"><button class="danger" ${busy?'disabled':''}>${d.reopen?'Stornieren und zur Änderung öffnen':'Storno abschließen'}</button><button type="button" class="secondary" data-ledger-action="cancel-close">Abbrechen</button></div></form>`;
  }
  function invoiceCard(batch){
   const c=batch.cancellation,open=expanded===batch.id,orders=batch.source_snapshot?.orders||[];
   return `<article class="invoice-ledger-card"><button type="button" class="invoice-ledger-card-head" data-ledger-action="expand" data-id="${esc(batch.id)}" aria-expanded="${open}"><span><b>${esc(batch.invoice_number)}</b><small>${esc(batch.issued_on)} · ${batch.selection.length} zusammengefasste Arbeitsschein(e)</small></span><span>${money(batch.document.tax.gross)}<small>${c?'Storniert'+(c.reopen_orders?' · zur Änderung geöffnet':''):'Abgeschlossen'}</small></span></button>${open?`<div class="invoice-ledger-details"><p>Leistungszeitraum ${esc(batch.document.from)} bis ${esc(batch.document.to)} · ${esc(batch.created_at.slice(0,10))} gespeichert</p><div class="actions"><button class="primary" data-ledger-action="pdf" data-id="${esc(batch.id)}">Rechnung als PDF</button>${c?`<button class="secondary" data-ledger-action="cancel-pdf" data-id="${esc(c.id)}">Storno als PDF</button>`:`<button class="danger" data-ledger-action="cancel-start" data-id="${esc(batch.id)}">Stornieren</button><button class="secondary" data-ledger-action="reopen-start" data-id="${esc(batch.id)}">Ändern</button>`}</div>${c?`<p class="invoice-ledger-note">Storno ${esc(c.cancellation_number)} vom ${esc(c.issued_on)} · ${money(c.document.tax.gross)}<br>${esc(c.reason)}</p>`:''}${orders.map(s=>`<details><summary>${esc(s.order.work_date)} · ${esc(s.order.title||'Arbeitsschein')}</summary><p>${esc(s.order.documentation||'')}</p>${(s.people||[]).map(p=>`<span class="badge">${esc(p.display_name||p.username)}</span>`).join('')}<ul>${(s.items||[]).map(i=>`<li>${esc(i.resolved.name)} · ${esc(i.resolved.quantity)} ${esc(i.resolved.unit)} · ${money(Math.round(i.resolved.price*100))}</li>`).join('')}</ul></details>`).join('')}${cancelForm(batch)}</div>`:''}</article>`;
  }
  function view(){
   if(!ensure())return '<section class="panel"><h2>Erstellte Rechnungen</h2><p>Nur Geschäftsführung und Administrator können das Rechnungsregister öffnen.</p></section>';
   const groups=folders(batches,cancellations),selected=groups.find(g=>g.key===folder);
   return `<section class="page-head"><div><span class="eyebrow">Unveränderliche Originale und verknüpfte Stornos</span><h2>Erstellte Rechnungen</h2></div></section>${status()}<div class="actions">${selected?'<button class="secondary" data-ledger-action="folders">Alle Kundenordner</button>':''}<button class="secondary" data-ledger-action="reload">Aktualisieren</button></div>${!loaded?'<section class="panel"><p>Rechnungsregister noch nicht geladen. Bitte aktualisieren.</p></section>':selected?`<section class="panel"><h3>${esc(selected.name)}</h3>${selected.invoices.map(invoiceCard).join('')}</section>`:`<section class="invoice-ledger-folders">${groups.map(g=>`<button class="invoice-ledger-folder" data-ledger-action="folder" data-key="${esc(g.key)}"><b>▱ ${esc(g.name)}</b><span>${g.invoices.length} Rechnung(en) · ${g.invoices.filter(i=>i.cancellation).length} storniert</span></button>`).join('')||'<p class="empty">Noch keine verbindlich abgeschlossenen Rechnungen.</p>'}</section>`}${legacy()}`;
  }
  function readIssue(form){draft.number=form.elements.invoice_number.value;draft.issued=form.elements.issued_on.value;draft.confirmed=form.elements.confirmed.checked;draft.smallAmountConfirmed=draft.document.invoice_rules_version>=909&&smallAmountEligible(draft.tax)&&form.elements.small_amount_confirmed?.checked===true;draft.parties={issuer:{name:form.elements.issuer_name.value,address:[form.elements.issuer_street.value,form.elements.issuer_city.value],taxNumber:form.elements.issuer_tax.value,vatId:form.elements.issuer_vat.value,email:form.elements.issuer_email.value,phone:form.elements.issuer_phone.value,iban:form.elements.issuer_iban.value},customer:{name:form.elements.customer_name.value,address:[form.elements.customer_street.value,form.elements.customer_city.value]}};}
  function readCancel(form){cancelDraft.number=form.elements.cancellation_number.value;cancelDraft.issued=form.elements.issued_on.value;cancelDraft.reason=form.elements.reason.value;}
  root.addEventListener('input',event=>{const form=event.target.closest('[data-ledger-form]');if(!form)return;event.target.removeAttribute('aria-invalid');if(form.dataset.ledgerForm==='issue'&&draft)readIssue(form);else if(cancelDraft)readCancel(form);});
  root.addEventListener('invalid',event=>{if(event.target.closest('[data-ledger-form]'))event.target.setAttribute('aria-invalid','true');},true);
  root.addEventListener('submit',event=>{
   const form=event.target.closest('[data-ledger-form]');if(!form)return;event.preventDefault();if(!ensure()||busy)return;if(!form.reportValidity())return;
   if(form.dataset.ledgerForm==='issue'){
    if(!draft)return;readIssue(form);const request=clone(draft),company=businessId(),identity=current();request.parties=invoiceParties(request.parties,request.smallAmountConfirmed);
    return perform(async()=>{const saved=result(await api('/rest/v1/rpc/issue_invoice_batch_v908',{method:'POST',body:{p_id:request.requestId,p_company:company,p_number:request.number.trim(),p_issued:request.issued,p_selection:request.selection,p_tax:request.tax,p_parties:request.parties}}));if(current()!==identity)return;draft=null;folder=saved.customer_key;expanded=saved.id;state.view='invoices-paid';});
   }
   if(!cancelDraft)return;readCancel(form);const request=clone(cancelDraft),identity=current();
   return perform(async()=>{result(await api('/rest/v1/rpc/cancel_invoice_batch_v908',{method:'POST',body:{p_id:request.requestId,p_invoice:request.invoice,p_number:request.number.trim(),p_issued:request.issued,p_reason:request.reason.trim(),p_reopen:request.reopen}}));if(current()!==identity)return;cancelDraft=null;if(request.reopen){state.view='invoices';state.billingKey='';}});
  });
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-ledger-action]');if(!button||!ensure()||busy)return;const id=button.dataset.id,action=button.dataset.ledgerAction;
   if(action==='reload')return perform(async()=>load());
   if(action==='folder'){folder=button.dataset.key;expanded='';cancelDraft=null;}
   else if(action==='folders'){folder='';expanded='';cancelDraft=null;}
   else if(action==='expand'){expanded=expanded===id?'':id;cancelDraft=null;}
   else if(action==='cancel-close')cancelDraft=null;
   else if(action==='back-open'){state.view='invoices';state.billingKey='';}
   else if(action==='preview-draft'){if(!draft)return;const form=root.querySelector('[data-ledger-form="issue"]');if(form)readIssue(form);const parties=invoiceParties(draft.parties,draft.smallAmountConfirmed);return print({...draft.document,issuer:parties.issuer,customer:parties.customer.name,address:parties.customer.address,number:draft.number.trim()||'ENTWURF',issued:draft.issued,tax:draft.tax,finalized:false});}
   else if(action==='pdf'){const batch=batches.find(b=>b.id===id);if(batch)return print(batch.document);}
   else if(action==='cancel-pdf'){const cancellation=cancellations.find(c=>c.id===id);if(cancellation)return print(cancellation.document,true);}
   else if(['cancel-start','reopen-start'].includes(action)){const batch=batches.find(b=>b.id===id);if(!batch||cancellations.some(c=>c.invoice_id===id))return;cancelDraft={requestId:crypto.randomUUID(),invoice:id,reopen:action==='reopen-start',number:'',issued:today()<batch.issued_on?batch.issued_on:today(),reason:''};expanded=id;}
   else return;
   render();
  });
  function badge(order){if(!order.invoice_reopened_from_v908||order.invoiced)return '';const old=batches.find(b=>b.id===order.invoice_reopened_from_v908);return `<span class="invoice-ledger-reopened">Zur Änderung geöffnet${old?' · '+esc(old.invoice_number):''}</span>`;}
  return {load,start,view,draftView,afterRender:ensure,badge,getBatches:()=>clone(batches)};
 }
 window.WorktimeInvoiceLedger={create,folders,billable,prefillParties,smallAmountEligible,invoiceParties};
})();
