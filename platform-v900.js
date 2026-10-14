/* Uses the existing authenticated API; never creates a demo identity or stores passwords. */
(() => {
 'use strict';
 const parsePrice=value=>{const text=String(value??'').trim();if(!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(text))throw new Error('Bitte einen Eurobetrag wie 39,00 oder 0,00 eingeben.');const cents=Math.round(Number(text.replace(',','.'))*100);if(!Number.isSafeInteger(cents)||cents>10000000)throw new Error('Bitte einen Betrag von 0 bis 100.000 Euro wählen.');return cents;};
 function create({root,state,api,render,escape,isAdmin,businessId}){
  let policy=null,plans=[],identity='',status='',failed=false,busy=false,serial=0;
  const money=cents=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(cents||0)/100);
  async function load(){
   const user=state.profile?.id;if(!user){policy=null;plans=[];identity='';return;}
   const request=++serial;
   try{
    const [settings,entitlements]=await Promise.all([api('/rest/v1/platform_policy_v900?select=*'),api('/rest/v1/company_entitlements_v900?select=*')]);
    if(request!==serial||state.profile?.id!==user)return;
    policy=Array.isArray(settings)?settings[0]||null:null;plans=Array.isArray(entitlements)?entitlements:[];identity=user;failed=false;
   }catch{if(request===serial&&state.profile?.id===user){policy=null;plans=[];identity=user;failed=true;}}
  }
  const creator=()=>identity===state.profile?.id&&policy?.founder_profile_id===state.profile?.id&&isAdmin();
  function view(){
   if(!creator())return `<section class="panel"><h2>Preise & Konten</h2><p>${failed?'Die Kontorichtlinie konnte nicht geladen werden. Bitte erneut versuchen.':'Diese Verwaltung ist ausschließlich für das Erfinderkonto verfügbar.'}</p><button type="button" data-platform-action="reload">Erneut laden</button></section>`;
   return `<section class="page-head"><div><span class="eyebrow">Erfinderkonto</span><h2>Preise & Konten</h2></div></section>
    <section class="panel founder-card"><h3>Dein dauerhaft kostenloser Zugang</h3><p>Das bestehende Administrator-Konto bleibt dein Erfinderkonto mit vollständiger Firmen- und Mitarbeiterverwaltung. Es wurde kein neues Konto und kein neues Passwort angelegt.</p><strong>0,00 € · dauerhaft kostenlos</strong></section>
    <section class="panel"><h3>Preis für künftig angelegte Geschäftskonten</h3><p>Eine Änderung gilt nur für neue Firmen. Bestehende Firmen und deren Mitarbeiter bleiben kostenlos. Bereits zugeordnete Preise werden nicht nachträglich überschrieben.</p><form data-form="platform-price" class="entry-form"><label class="wide">Tarifname<input name="plan_name" required maxlength="80" value="${escape(policy.future_plan_name)}"></label><label>Monatlicher Gesamtpreis in Euro<input name="monthly_price" required inputmode="decimal" value="${escape((policy.future_monthly_cents/100).toFixed(2).replace('.',','))}"></label><button class="primary" ${busy?'disabled':''}>${busy?'Wird gespeichert …':'Preis speichern'}</button></form><p class="platform-status" role="status">${escape(status)}</p><p class="device-help">Preiseinstellung, keine Zahlung: Ein Zahlungsdienst und automatische Abbuchungen sind nicht aktiviert. Steuerliche und vertragliche Preisangaben vor einem Verkauf prüfen lassen.</p></section>
    <section class="list-section"><h3>Bestehende und neue Firmen</h3>${plans.map(plan=>{const company=state.rows.people.find(p=>p.id===plan.company_id);return `<article class="row-card"><div><b>${escape(company?.company_name||company?.username||'Geschäftskonto')}</b><span>${plan.account_policy==='existing_free'?'Kostenloser Bestandsschutz':'Fester Preis bei Kontoerstellung · '+escape(plan.plan_name)}</span></div><strong>${money(plan.monthly_cents)} / Monat</strong></article>`;}).join('')||'<p>Keine Geschäftskonten vorhanden.</p>'}</section>`;
  }
  function settingsPanel(){
   if(creator())return `<section class="panel"><h3>Erfinderkonto · dauerhaft kostenlos</h3><p>Vollständige Verwaltung aller Geschäftskonten und Mitarbeiter. Bestehende Firmen bleiben kostenlos.</p><button type="button" data-action="nav" data-view="platform">Preise & Konten öffnen</button></section>`;
   const plan=identity===state.profile?.id&&plans.find(p=>p.company_id===businessId());
   return plan?`<section class="panel"><h3>Kontostatus</h3><p>${plan.account_policy==='existing_free'?'Diese Firma und ihre Mitarbeiter behalten den kostenlosen Bestandszugang.':'Bei Kontoerstellung festgehaltener Tarif: '+escape(plan.plan_name)}</p><strong>${money(plan.monthly_cents)} / Monat</strong></section>`:'';
  }
  root.addEventListener('submit',async event=>{
   const form=event.target;if(form.dataset.form!=='platform-price')return;event.preventDefault();event.stopImmediatePropagation();if(busy)return;
   const output=root.querySelector('.platform-status'),price=form.elements.monthly_price,label=form.elements.plan_name;
   try{
    if(!creator())throw new Error('Nur das Erfinderkonto darf Preise ändern.');
    price.setCustomValidity('');const cents=parsePrice(price.value),name=label.value.trim();if(!name||name.length>80){label.setCustomValidity('Bitte einen Tarifnamen mit höchstens 80 Zeichen eintragen.');label.reportValidity();return;}label.setCustomValidity('');
    busy=true;form.querySelector('button').disabled=true;output.textContent='Preis wird gespeichert …';
    const result=await api('/rest/v1/rpc/save_future_price_v900',{method:'POST',body:{p_revision:policy.revision,p_plan_name:name,p_monthly_cents:cents}});
    const saved=Array.isArray(result)?result[0]:result;
    if(!saved||saved.founder_profile_id!==state.profile?.id)throw new Error('Speicherung konnte nicht bestätigt werden. Bitte neu laden.');
    policy=saved;status='Preis gespeichert. Der kostenlose Bestandsschutz bleibt unverändert.';render();
   }catch(error){status=error.message||'Preis konnte nicht gespeichert werden.';if(output?.isConnected)output.textContent=status;try{parsePrice(price.value);}catch{price.setCustomValidity(status);price.reportValidity();}}
   finally{busy=false;if(form.isConnected)form.querySelector('button').disabled=false;else if(state.view==='platform')render();}
  },true);
  root.addEventListener('input',event=>{if(event.target.closest('[data-form="platform-price"]'))event.target.setCustomValidity('');});
  root.addEventListener('click',event=>{if(event.target.closest('[data-platform-action="reload"]'))load().then(()=>render());});
  return {load,view,settingsPanel,creator};
 }
 window.WorktimePlatform={create,parsePrice};
})();
