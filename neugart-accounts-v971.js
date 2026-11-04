/* Saved Neugart credentials are used only by the server. */
(function () {
  'use strict';
  window.WorktimeNeugartAccounts = { create({root,state,api,businessId,render,escape:esc}) {
    let scope='', accounts=null, accountId='', results=[], basket=[], status='', pending=false, query='', manufacturer='', category='', cartName='', attempt=null, shared=false;
    const identity=()=>state.profile?.id&&businessId()?state.profile.id+':'+businessId():'';
    const call=(action,body={})=>api('/functions/v1/supplier-cart-v949',{method:'POST',body:{action,company:businessId(),...body}});
    function sync() {
      if(scope===identity())return;
      scope=identity();accounts=null;accountId='';results=[];basket=[];status='';pending=false;query='';manufacturer='';category='';cartName='';attempt=null;shared=false;
    }
    const feedback=()=>status?`<p role="status">${esc(status)}</p>`:'';
    async function run(task) {
      sync();
      if(!scope||pending)return;
      const actor=scope, session=state.session;
      const current=()=>actor===identity()&&actor===scope&&session?.user?.id===state.session?.user?.id;
      pending=true;status='';
      try { await task(current); }
      catch(error) { if(current()){status=error.message;if(accounts===null)accounts=[];} }
      finally { if(current()){pending=false;render();} }
    }
    async function list(current) {
      const rows=await call('accounts');
      if(!current())return;
      accounts=rows;
      if(!rows.some(a=>a.id===accountId))accountId=rows[0]?.id||'';
    }
    function settings() {
      sync();
      const people=state.people.filter(p=>p.role==='employee'&&p.business_id===businessId());
      if(!scope)return '';
      return `<section class="panel"><h3>Neugart-Zugänge</h3>${feedback()}<button type="button" class="secondary" data-ng-action="load">Zugänge anzeigen</button>
      <form data-ng-form="create" class="entry-form"><label>Name des Zugangs<input name="label" required maxlength="80"></label><label>Kundennummer<input name="customer" required maxlength="40"></label><label>Benutzername<input name="username" required maxlength="50"></label><label>Kennwort<input name="password" type="password" required maxlength="50" autocomplete="new-password"></label><button class="primary" ${pending?'disabled':''}>Neugart-Zugang speichern</button></form>
      ${(accounts||[]).map(a=>`<form data-ng-form="grant" data-id="${esc(a.id)}"><h4>${esc(a.label)}</h4><fieldset><legend>Einkaufsberechtigte Mitarbeiter</legend>${people.map(p=>`<label><input type="checkbox" name="employee" value="${esc(p.id)}" ${a.employee_ids.includes(p.id)?'checked':''}> ${esc(p.display_name||p.username)}</label>`).join('')||'<p>Keine Mitarbeiter vorhanden.</p>'}</fieldset><button class="primary" ${pending?'disabled':''}>Freigaben speichern</button><button type="button" class="danger" data-ng-action="delete" data-id="${esc(a.id)}" ${pending?'disabled':''}>Zugang löschen</button></form>`).join('')}</section>`;
    }
    function shopping() {
      sync();
      if(!scope)return '<p>Bitte zuerst einen Betrieb auswählen.</p>';
      if(accounts===null){queueMicrotask(()=>{if(accounts===null&&state.view==='shopping')run(async current=>{await list(current);if(current()&&!accounts.length)status='Dein Geschäftskonto hat noch keinen Neugart-Zugang für dich freigegeben.';});});}
      return `<section class="panel"><h2>Neugart-Einkauf</h2>${state.profile.role==='employee'?'':'<button type="button" class="secondary" data-ng-action="mode">Zur allgemeinen Einkaufssuche</button>'}${feedback()}
      ${accounts===null?'<p>Freigaben werden geladen …</p>':!accounts.length?'<button type="button" class="secondary" data-ng-action="load">Freigaben erneut prüfen</button>':`
      <label>Neugart-Zugang<select data-ng-account>${accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===accountId?'selected':''}>${esc(a.label)}</option>`).join('')}</select></label>
      <form data-ng-form="search" data-neugart-search><label>Artikelname oder Artikelnummer<input name="query" maxlength="80" value="${esc(query)}"></label><label>Hersteller<input name="manufacturer" maxlength="80" value="${esc(manufacturer)}"></label><label>Kategorie<input name="category" maxlength="80" value="${esc(category)}"></label><button class="primary" ${pending?'disabled':''}>Artikel suchen</button></form>
      ${results.map(m=>`<article class="row-card">${window.WorktimeArticleTools?.html(m)||''}<span>${esc(window.WorktimeProductDisplay?.displayName(m)||m.catalog_product_name||m.name)} · ${esc(m.catalog_article_number)} ${m.catalog_manufacturer?' · '+esc(m.catalog_manufacturer):''}</span><button type="button" class="secondary" data-ng-action="add" data-id="${esc(m.id)}">Hinzufügen</button></article>`).join('')}
      ${basket.length?`<form data-ng-form="cart"><h3>Warenkorb</h3><label>Warenkorbname<input name="cart_name" maxlength="60" value="${esc(cartName)}"></label>${basket.map(m=>`<label>${esc(m.name)} · ${esc(m.unit)}<input type="number" min="0.01" max="999999.99" step="0.01" required name="qty:${esc(m.id)}" value="${esc(m.quantity)}"></label><button type="button" class="secondary" data-ng-action="remove" data-id="${esc(m.id)}">Entfernen</button>`).join('')}<button class="primary" ${pending?'disabled':''}>Artikel übertragen und Warenkorb öffnen</button></form>`:''}`}</section>`;
    }
    function capture() {
      const form=root.querySelector('[data-ng-form="cart"]');
      if(!form)return;
      cartName=form.elements.cart_name.value;
      for(const item of basket)item.quantity=form.elements.namedItem('qty:'+item.id).value;
    }
    function openCart(data) {
      const url=new URL(data.cart_url);
      if(url.origin!=='https://efgonlineplus.de'||!/^\/p\/cart\/[A-Za-z0-9_-]{10,200}\/positions$/.test(url.pathname)||url.search||url.hash||data.handoff?.action!==url.href+'?login=true'||typeof data.handoff.token!=='string'||data.handoff.token.length>20000)throw Error('Die automatische Anmeldung im Neugart-Warenkorb ist nicht verfügbar.');
      const form=document.createElement('form'),input=document.createElement('input');
      form.method='POST';form.action=data.handoff.action;form.hidden=true;
      input.type='hidden';input.name='TOKEN';input.value=data.handoff.token;
      form.append(input);document.body.append(form);HTMLFormElement.prototype.submit.call(form);form.remove();
    }
    root.addEventListener('change',event=>{
      if(!event.target.matches('[data-ng-account]')||pending)return;
      capture();accountId=event.target.value;results=[];render();
    });
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-ng-action]');
      if(!button||pending)return;
      capture();
      const {ngAction,id}=button.dataset;
      if(ngAction==='mode'){sync();shared=!shared;render();return;}
      if(ngAction==='load')return run(list);
      if(ngAction==='delete'&&confirm('Neugart-Zugang und alle Freigaben löschen?'))return run(async current=>{await call('account-delete',{account_id:id});if(current())await list(current);});
      if(ngAction==='add'){
        const item=results.find(m=>m.id===id);
        if(!item)return;
        if(basket.length&&basket[0].catalog_supplier!==item.catalog_supplier){status='Bitte zuerst den Warenkorb für den ausgewählten Katalog abschließen.';render();return;}
        if(!basket.some(m=>m.id===id))basket.push({...item,quantity:'1'});
      } else if(ngAction==='remove')basket=basket.filter(m=>m.id!==id);
      render();
    });
    root.addEventListener('submit',event=>{
      const form=event.target,kind=form.dataset.ngForm;
      if(!kind)return;
      event.preventDefault();
      capture();
      const fields=new FormData(form);
      run(async current=>{
        if(kind==='create'){
          try{await call('account-create',Object.fromEntries(fields));}finally{form.elements.password.value='';fields.delete('password');}
          if(current()){await list(current);status='Neugart-Zugang gespeichert.';}
        } else if(kind==='grant'){
          await call('account-grant',{account_id:form.dataset.id,employee_ids:fields.getAll('employee')});
          if(current()){await list(current);status='Freigaben gespeichert.';}
        } else if(kind==='search'){
          query=String(fields.get('query')||'');
          manufacturer=String(fields.get('manufacturer')||'');category=String(fields.get('category')||'');
          if([query,manufacturer,category].every(value=>value.trim().length<2))throw Error('Bitte mindestens zwei Zeichen für Artikel, Hersteller oder Kategorie eingeben.');
          const rows=await call('search',{account_id:accountId,query,manufacturer,category});
          if(current()){results=rows;if(!rows.length)status='Keine passenden Neugart-Artikel gefunden.';}
        } else if(kind==='cart'&&basket.length){
          const body={account_id:accountId,company:businessId(),supplier:basket[0].catalog_supplier,cart_name:cartName.trim(),lines:basket.map(m=>({material_id:m.id,quantity:m.quantity})).sort((a,b)=>a.material_id.localeCompare(b.material_id))};
          const fingerprint=JSON.stringify(body),key='worktime-neugart-attempt:'+scope;
          attempt=attempt||JSON.parse(sessionStorage.getItem(key)||'null');
          if(attempt&&attempt.fingerprint!==fingerprint)throw Error('Bitte zuerst die vorherige Übertragung mit derselben Auswahl prüfen.');
          attempt=attempt||{fingerprint,id:crypto.randomUUID()};
          sessionStorage.setItem(key,JSON.stringify(attempt));
          const data=await call('transfer',{...body,request_id:attempt.id});
          if(!current())return;
          if(data.confirmed!==true||data.request_id!==attempt.id||data.company!==body.company||data.supplier!==body.supplier)throw Error(data.message||'Der Händlerwarenkorb konnte nicht bestätigt werden.');
          openCart(data);
          sessionStorage.removeItem(key);attempt=null;basket=[];status='Der bestätigte Warenkorb wird geöffnet.';
        }
      });
    });
    return {shopping,settings,isShared:()=>{sync();return shared;}};
  }};
})();
