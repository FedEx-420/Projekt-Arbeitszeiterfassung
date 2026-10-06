/* Quotations are separate from work orders, bookings and invoices. */
(() => {
  'use strict';
  function create(app){
    const {state,root,escape,n,same,lower,isManager,businessId,managerBusiness,api,allRows,render,chooseSimilar}=app;
    const ui={draft:null,saving:false,loading:false,error:'',generation:0,context:'',recovered:false,backup:false};
    // Tab-local, account/company-isolated recovery. Never stores credentials.
    const draftKey=()=>state.profile?.id&&businessId()?'zeiterfassung-offer-draft-v859:'+state.profile.id+':'+businessId():'';
    function activateDraft(){
      const context=draftKey();if(context===ui.context)return;
      ui.context=context;ui.draft=null;ui.recovered=false;ui.backup=false;
      try{const data=JSON.parse(sessionStorage.getItem(context)||'null');if(context&&data&&same(data.business_id,businessId())&&Array.isArray(data.items)&&data.items.length<=100){ui.draft=data;ui.recovered=true;ui.backup=true;state.offerId=data.id||'new';}}catch{/* The form still works if tab storage is unavailable. */}
    }
    function remember(data){ui.backup=false;const context=draftKey();if(!context)return;try{sessionStorage.setItem(context,JSON.stringify(data));ui.backup=true;}catch{/* Keep the in-memory form on storage failure. */}}
    function forget(context=draftKey()){if(context)try{sessionStorage.removeItem(context);}catch{}if(context===draftKey()){ui.recovered=false;ui.backup=false;}}
    const fields=[['first_name','Vorname'],['street','Straße'],['house_no','Hausnummer'],['postal_code','Postleitzahl'],['city','Ort'],['email','E-Mail-Adresse']];
    const money=value=>n(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
    const customers=()=>app.customers();
    const materials=kind=>(state.rows.materials||[]).filter(row=>same(row.business_id,businessId())&&row.active!==false&&(['Monteurstunde','Meisterstunde','Aushilfsstunde'].includes(row.name)===(kind==='labor')));
    const list=()=>(state.rows.offers||[]).filter(row=>same(row.business_id,businessId()));
    const lineCents=row=>Math.round(Math.round(n(row.quantity)*100)*Math.round(n(row.unit_price)*100)/100);
    const totals=(items,rate)=>{const cents=items.reduce((sum,row)=>sum+lineCents(row),0),taxCents=Math.round(cents*Math.round(n(rate)*100)/10000);return {subtotal:cents/100,tax:taxCents/100,total:(cents+taxCents)/100};};
    function blank(){return {id:'',business_id:businessId(),customer_id:null,customer_name:'',customer_snapshot:{},offer_date:app.today(),valid_until:'',title:'',notes:'',status:'draft',vat_rate:0,items:[{kind:'material',name:'',material_id:null,quantity:1,unit_price:0}]};}
    async function load(){
      if(!isManager()){state.rows.offers=[];state.offersReady=false;ui.draft=null;return;}
      activateDraft();
      const company=businessId(),generation=++ui.generation;if(!company)return;
      ui.loading=true;
      try{const rows=await allRows('offers','select=*&business_id=eq.'+encodeURIComponent(company)+'&order=offer_date.desc,created_at.desc,id');if(generation!==ui.generation||!same(company,businessId())||!isManager())return;state.rows.offers=rows;state.offersReady=true;ui.error='';}
      catch{if(generation===ui.generation){state.offersReady=false;ui.error='Angebote konnten gerade nicht synchronisiert werden. Bitte erneut aktualisieren.';}}
      finally{if(generation===ui.generation)ui.loading=false;}
    }
    function line(item={kind:'material',name:'',quantity:1,unit_price:0}){
      const labor=item.kind==='labor';
      return `<section class="offer-line" data-offer-line data-kind="${labor?'labor':'material'}" data-material-id="${escape(item.material_id||'')}" data-matched-name="${escape(item.name||'')}"><label class="offer-position">${labor?'Arbeitsleistung':'Material'}<input data-offer-name required maxlength="200" list="offer-${labor?'labor':'materials'}" value="${escape(item.name||'')}" placeholder="${labor?'Monteurstunde, Meisterstunde …':'Artikel eingeben'}"></label><label>${labor?'Stunden':'Menge'}<input data-offer-quantity type="number" required min="${labor?'0.25':'0.01'}" max="100000" step="${labor?'0.25':'0.01'}" value="${escape(item.quantity??1)}"></label><label>${labor?'Preis je Stunde (€)':'Einzelpreis (€)'}<input data-offer-price type="number" required min="0" max="1000000" step="0.01" value="${escape(item.unit_price??0)}"></label><div class="offer-line-total"><span>Gesamt</span><b data-offer-line-total>${money(n(item.quantity)*n(item.unit_price))}</b></div><button type="button" class="danger small" data-action="offer-remove-line" aria-label="Position entfernen">Entfernen</button></section>`;
    }
    function form(model){
      const snapshot=model.customer_snapshot||{};
      return `<section class="panel" id="offer-editor"><div class="page-head"><div><span class="eyebrow">${model.id?escape(model.offer_number):'Neues Angebot'}</span><h3>${model.id?'Angebot bearbeiten':'Angebot erstellen'}</h3></div><button type="button" class="secondary small" data-action="offer-close">Zurück zur Liste</button></div><p>Materialpreise werden beim Auswählen übernommen. Änderungen im Angebot verändern weder die Materialliste noch gespeicherte Arbeitszeiten.</p><form data-form="offer" class="entry-form" data-company="${escape(model.business_id)}"><input type="hidden" name="id" value="${escape(model.id||'')}"><input type="hidden" name="revision" value="${escape(model.revision||'')}"><input type="hidden" name="customer_id" value="${escape(model.customer_id||'')}"><label class="wide">Kunde<input name="customer_name" required maxlength="200" list="offer-customers" autocomplete="off" value="${escape(model.customer_name||'')}"></label><details class="wide offer-address" ${Object.values(snapshot).some(Boolean)?'open':''}><summary>Kundenadresse und E-Mail</summary><div class="entry-form">${fields.map(([key,label])=>`<label>${label}<input name="customer_${key}" maxlength="500" ${key==='email'?'type="email"':''} value="${escape(snapshot[key]||'')}"></label>`).join('')}</div></details><label>Datum<input name="offer_date" type="date" required value="${escape(model.offer_date)}"></label><label>Gültig bis<input name="valid_until" type="date" min="${escape(model.offer_date)}" value="${escape(model.valid_until||'')}"></label><label class="wide">Leistungsbeschreibung<textarea name="title" rows="3" required maxlength="4000">${escape(model.title||'')}</textarea></label><div class="wide" data-offer-lines>${model.items.map(line).join('')}</div><div class="actions wide"><button type="button" class="secondary" data-action="offer-add-material">+ Material</button><button type="button" class="secondary" data-action="offer-add-labor">+ Arbeitsstunden</button></div><label>MwSt. (%)<input name="vat_rate" type="number" required min="0" max="100" step="0.01" value="${escape(model.vat_rate??0)}"></label><label>Status<select name="status"><option value="draft" ${model.status==='draft'?'selected':''}>Entwurf</option><option value="ready" ${model.status==='ready'?'selected':''}>Angebot fertig</option></select></label><label class="wide">Hinweise<textarea name="notes" rows="3" maxlength="10000">${escape(model.notes||'')}</textarea></label><section class="wide offer-totals"><div><span>Zwischensumme (netto)</span><b data-offer-subtotal></b></div><div><span>MwSt.</span><b data-offer-tax></b></div><div class="offer-grand-total"><span>Gesamtbetrag</span><b data-offer-total></b></div></section><p class="wide" data-offer-status role="status"></p><button class="primary wide" ${ui.saving?'disabled':''}>Angebot speichern</button></form><datalist id="offer-customers">${customers().map(row=>`<option value="${escape(row.name)}"></option>`).join('')}</datalist><datalist id="offer-materials">${materials('material').map(row=>`<option value="${escape(row.name)}"></option>`).join('')}</datalist><datalist id="offer-labor">${materials('labor').map(row=>`<option value="${escape(row.name)}"></option>`).join('')}</datalist>${model.id?`<div class="actions"><button type="button" class="secondary" data-action="offer-pdf" data-id="${escape(model.id)}">PDF auf Gerät herunterladen</button><button type="button" class="danger" data-action="offer-delete" data-id="${escape(model.id)}">Angebot löschen</button></div><p class="offer-hint">Die PDF enthält den zuletzt gespeicherten Stand. Änderungen bitte zuerst speichern.</p>`:''}</section>`;
    }
    function listHtml(){
      return list().map(offer=>`<article class="row-card"><button type="button" class="row-main" data-action="offer-open" data-id="${escape(offer.id)}"><b>${escape(offer.customer_name)}</b><span>${escape(offer.offer_number)} · ${app.dateText(offer.offer_date)}</span><small>${escape(offer.title)} · ${offer.status==='ready'?'Angebot fertig':'Entwurf'} · ${money(offer.total)}</small></button><button type="button" class="secondary small" data-action="offer-pdf" data-id="${escape(offer.id)}">PDF herunterladen</button></article>`).join('')||`<p class="empty">${ui.loading?'Angebote werden geladen …':'Noch keine Angebote für diese Firma vorhanden.'}</p>`;
    }
    function view(){
      if(!isManager())return '<section class="panel"><h2>Angebote</h2><p>Dieser Bereich ist nur für Geschäfts- und Administratorkonten verfügbar.</p></section>';
      if(!businessId())return '<section class="panel"><h2>Angebote</h2><p>Bitte zuerst ein Geschäftskonto auswählen.</p></section>';
      activateDraft();
      const selected=list().find(row=>same(row.id,state.offerId)),draft=ui.draft&&same(ui.draft.business_id,businessId())&&same(ui.draft.id||'new',state.offerId)?ui.draft:null,model=draft||selected||(state.offerId==='new'?blank():null);
      return `<section class="page-head"><div><span class="eyebrow">${escape(managerBusiness()?.company_name||'Geschäftskonto')}</span><h2>Angebote</h2><p>Kundenangebote mit Materialien und Arbeitsstunden</p></div><div class="actions"><button type="button" class="primary" data-action="offer-new">+ Angebot erstellen</button><button type="button" class="secondary" data-action="offer-refresh">Aktualisieren</button></div></section>${ui.error?`<p class="notice error">${escape(ui.error)}</p>`:''}${ui.recovered&&model?'<p class="notice">Ungespeicherte Angebotseingaben aus diesem Browser-Tab wurden wiederhergestellt. Bitte prüfen und speichern.</p>':''}${model?form(model):''}<section class="list-section"><h3>Gespeicherte Angebote</h3><div id="offer-list">${listHtml()}</div></section>`;
    }
    function snapshot(form){
      return {id:form.elements.id.value,offer_number:list().find(row=>same(row.id,form.elements.id.value))?.offer_number||'',business_id:form.dataset.company,revision:n(form.elements.revision.value)||null,customer_id:form.elements.customer_id.value||null,customer_name:form.elements.customer_name.value,resolved_customer_name:form.dataset.resolvedCustomerName||'',customer_snapshot:Object.fromEntries(fields.map(([key])=>[key,form.elements['customer_'+key].value])),offer_date:form.elements.offer_date.value,valid_until:form.elements.valid_until.value,title:form.elements.title.value,notes:form.elements.notes.value,status:form.elements.status.value,vat_rate:form.elements.vat_rate.value,items:[...form.querySelectorAll('[data-offer-line]')].map(row=>({kind:row.dataset.kind,material_id:row.dataset.materialId||null,name:row.querySelector('[data-offer-name]').value,resolved_name:row.dataset.resolvedName||'',quantity:row.querySelector('[data-offer-quantity]').value,unit_price:row.querySelector('[data-offer-price]').value}))};
    }
    function update(form,persist=true){
      if(!form)return;
      const data=snapshot(form),sum=totals(data.items,data.vat_rate);
      form.querySelectorAll('[data-offer-line]').forEach((row,index)=>{row.querySelector('[data-offer-line-total]').textContent=money(lineCents(data.items[index])/100);});
      for(const [selector,value] of [['subtotal',sum.subtotal],['tax',sum.tax],['total',sum.total]])form.querySelector('[data-offer-'+selector+']').textContent=money(value);
      ui.draft=data;
      if(persist)remember(data);
    }
    function fillCustomer(form,customer){
      form.elements.customer_id.value=customer.id;form.elements.customer_name.value=customer.name;
      for(const [key] of fields)form.elements['customer_'+key].value=customer.custom_fields?.[key]||'';
      form.querySelector('.offer-address').open=true;
    }
    function input(event){
      const form=event.target.closest('form[data-form="offer"]');if(!form)return;
      if(event.target.name==='customer_name'){
        if(lower(form.dataset.resolvedCustomerName)!==lower(event.target.value))form.dataset.resolvedCustomerName='';
        const selected=customers().find(row=>lower(row.name)===lower(event.target.value));
        if(selected&&!same(form.elements.customer_id.value,selected.id))fillCustomer(form,selected);
        else if(!selected){if(form.elements.customer_id.value)for(const [key] of fields)form.elements['customer_'+key].value='';form.elements.customer_id.value='';}
      }
      if(event.target.matches('[data-offer-name]')){
        const row=event.target.closest('[data-offer-line]'),selected=materials(row.dataset.kind).find(item=>lower(item.name)===lower(event.target.value));
        if(lower(row.dataset.resolvedName)!==lower(event.target.value))row.dataset.resolvedName='';
        if(selected){if(lower(row.dataset.matchedName)!==lower(selected.name))row.querySelector('[data-offer-price]').value=n(selected.unit_price);row.dataset.materialId=selected.id;row.dataset.matchedName=selected.name;}
        else{row.dataset.materialId='';row.dataset.matchedName='';}
      }
      if(event.target.name==='offer_date')form.elements.valid_until.min=event.target.value;
      update(form);
    }
    function status(form,message,error=false){let node=form?.querySelector('[data-offer-status]')||root.querySelector('[data-offer-page-status]');if(!node&&state.view==='offers'){node=document.createElement('p');node.dataset.offerPageStatus='';node.setAttribute('role','status');root.querySelector('#offer-list')?.before(node);}if(node){node.textContent=message;node.className=error?'wide notice error':'wide notice';}}
    async function save(form){
      if(ui.saving||!isManager())return;if(!same(form.dataset.company,businessId()))throw new Error('Bitte das Angebot in seiner ursprünglichen Firma erneut öffnen.');
      update(form);const data=snapshot(form);
      if(!data.items.length){status(form,'Bitte mindestens eine Position hinzufügen.',true);return;}
      const context=draftKey(),controls=[...form.querySelectorAll('input,select,textarea,button')].map(node=>[node,node.disabled]);
      ui.generation++;ui.loading=false;ui.saving=true;controls.forEach(([node])=>node.disabled=true);status(form,'Angebot wird gespeichert …');
      try{
        let customer=customers().find(row=>lower(row.name)===lower(data.customer_name));
        if(!customer&&lower(data.resolved_customer_name)!==lower(data.customer_name))customer=chooseSimilar(data.customer_name,customers(),'Kunden');
        if(customer&&!same(data.customer_id,customer.id)){fillCustomer(form,customer);Object.assign(data,{customer_id:customer.id,customer_name:customer.name,customer_snapshot:snapshot(form).customer_snapshot});}
        form.dataset.resolvedCustomerName=data.customer_name;update(form);
        data.items=data.items.map((item,index)=>{
          const records=materials(item.kind);let material=records.find(row=>lower(row.name)===lower(item.name));
          if(!material&&lower(item.resolved_name)!==lower(item.name))material=chooseSimilar(item.name,records,'Artikel');
          if(material&&!same(item.material_id,material.id)){const row=form.querySelectorAll('[data-offer-line]')[index];row.querySelector('[data-offer-name]').value=material.name;row.querySelector('[data-offer-price]').value=n(material.unit_price);row.dataset.materialId=material.id;row.dataset.matchedName=material.name;item={...item,name:material.name,unit_price:n(material.unit_price),material_id:material.id};}
          form.querySelectorAll('[data-offer-line]')[index].dataset.resolvedName=item.name;update(form);
          return {kind:item.kind,material_id:item.material_id,name:item.name.trim(),quantity:n(item.quantity),unit_price:n(item.unit_price)};
        });
        data.customer_name=data.customer_name.trim();data.title=data.title.trim();data.vat_rate=n(data.vat_rate);
        const result=await api('/rest/v1/rpc/save_offer_v857',{method:'POST',body:{p_data:data,p_revision:data.revision}}),saved=Array.isArray(result)?result[0]:result;
        if(!saved?.id)throw new Error('Das Angebot konnte nicht gespeichert werden.');
        forget(context);
        if(context!==draftKey()||!isManager())return;
        state.rows.offers=[saved,...(state.rows.offers||[]).filter(row=>!same(row.id,saved.id))];state.offerId=saved.id;ui.draft=null;ui.saving=false;render();reveal();status(root.querySelector('form[data-form="offer"]'),'Angebot wurde gespeichert.');
      }catch(error){if(context===draftKey()){update(form);status(form,(error.message||'Das Angebot konnte nicht gespeichert werden.')+' '+(ui.backup?'Die Eingaben sind in diesem Browser-Tab zwischengesichert. Nach erneuter Anmeldung unter „Angebote“ fortsetzen.':'Die Eingaben bleiben im Formular erhalten. Bitte diese Seite nicht schließen.'),true);}}
      finally{ui.saving=false;controls.forEach(([node,disabled])=>node.disabled=disabled);}
    }
    async function pdf(id,button){
      const offer=list().find(row=>same(row.id,id));if(!offer||!isManager())return;
      button.disabled=true;
      try{const company=managerBusiness(),bytes=await window.DevicePdf.createOffer({offer:structuredClone(offer),company:company?.company_name||'Zeiterfassung',logoBytes:await app.logoBytes(company)});window.DevicePdf.download(bytes,offer.offer_number+'.pdf');}
      catch(error){status(root.querySelector('form[data-form="offer"]'),error.message||'PDF konnte nicht heruntergeladen werden.',true);}
      finally{button.disabled=false;}
    }
    async function removeOffer(id){
      const offer=list().find(row=>same(row.id,id));if(!offer||!isManager()||ui.saving||!confirm('Angebot '+offer.offer_number+' wirklich löschen?'))return;
      ui.generation++;ui.loading=false;ui.saving=true;
      try{await api('/rest/v1/rpc/delete_offer_v857',{method:'POST',body:{p_id:offer.id,p_revision:offer.revision}});forget();state.rows.offers=state.rows.offers.filter(row=>!same(row.id,id));state.offerId='';ui.draft=null;render();}
      catch(error){status(root.querySelector('form[data-form="offer"]'),error.message||'Angebot konnte nicht gelöscht werden.',true);}
      finally{ui.saving=false;}
    }
    const reveal=()=>root.querySelector('#offer-editor')?.scrollIntoView({block:'start',behavior:'auto'});
    function bind(){
      root.addEventListener('input',input);root.addEventListener('change',input);
      root.addEventListener('submit',event=>{const form=event.target;if(form.dataset.form!=='offer')return;event.preventDefault();event.stopImmediatePropagation();save(form).catch(error=>status(form,error.message,true));},true);
      root.addEventListener('click',event=>{
        const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(!action.startsWith('offer-'))return;event.stopImmediatePropagation();if(!isManager()||ui.saving)return;
        if(action==='offer-new'){forget();state.offerId='new';ui.draft=blank();render();reveal();}
        if(action==='offer-open'){const offer=list().find(row=>same(row.id,button.dataset.id));if(!offer)return;state.offerId=offer.id;ui.draft=structuredClone(offer);render();reveal();}
        if(action==='offer-close'){forget();state.offerId='';ui.draft=null;render();}
        if(action==='offer-add-material'||action==='offer-add-labor'){const form=button.closest('form');if(form.querySelectorAll('[data-offer-line]').length>=100){status(form,'Höchstens 100 Positionen pro Angebot.',true);return;}const material=action==='offer-add-labor'?materials('labor').find(row=>row.name==='Monteurstunde')||materials('labor')[0]:null;form.querySelector('[data-offer-lines]').insertAdjacentHTML('beforeend',line({kind:action==='offer-add-labor'?'labor':'material',name:material?.name||'',material_id:material?.id||null,quantity:1,unit_price:n(material?.unit_price)}));update(form);form.querySelector('[data-offer-lines]').lastElementChild.querySelector('input').focus({preventScroll:true});}
        if(action==='offer-remove-line'){const form=button.closest('form');button.closest('[data-offer-line]').remove();update(form);}
        if(action==='offer-pdf')pdf(button.dataset.id,button);
        if(action==='offer-delete')removeOffer(button.dataset.id);
        if(action==='offer-refresh'){button.disabled=true;load().then(()=>{const section=root.querySelector('#offer-list');if(section)section.innerHTML=listHtml();if(ui.error)status(root.querySelector('form[data-form="offer"]'),ui.error,true);}).finally(()=>button.disabled=false);}
      },true);
      root.addEventListener('click',event=>{const button=event.target.closest('[data-action="nav"]');if(button?.dataset.view==='offers')load().then(()=>{if(state.view==='offers')render();});});
      root.addEventListener('change',event=>{if(event.target.matches('[data-select="business"]')){state.offerId='';ui.draft=null;load().then(()=>{if(state.view==='offers')render();});}});
    }
    function setup(){
      const form=root.querySelector('form[data-form="offer"]');if(!form)return;
      form.dataset.resolvedCustomerName=ui.draft?.resolved_customer_name||'';
      form.querySelectorAll('[data-offer-line]').forEach((row,index)=>{const item=ui.draft?.items[index];if(item&&lower(item.name)===lower(row.querySelector('[data-offer-name]').value))row.dataset.resolvedName=item.resolved_name||'';});
      update(form,false);
    }
    return {load,view,bind,setup,totals};
  }
  window.OffersFeature={create};
})();
