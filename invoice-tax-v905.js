/* German invoice tax choices: explicit operator decision, never inferred from a customer name. */
(() => {
  'use strict';
  const LAW='https://www.gesetze-im-internet.de/ustg_1980/';
  const rules={
    standard:{label:'19 % Umsatzsteuer',rate:19,law:'§ 12 Abs. 1 UStG',url:LAW+'__12.html',help:'Regelsteuersatz, üblicherweise für Elektroarbeiten. Prüfe die konkrete Leistung.'},
    reduced:{label:'7 % Umsatzsteuer',rate:7,law:'§ 12 Abs. 2 UStG',url:LAW+'__12.html',help:'Nur für die dort ausdrücklich begünstigten Umsätze, nicht allgemein für Elektroarbeiten. Bitte den passenden Tatbestand angeben.'},
    pv:{label:'0 % - begünstigte Photovoltaik',rate:0,law:'§ 12 Abs. 3 UStG',url:LAW+'__12.html',help:'Nullsteuersatz, keine Steuerbefreiung. Nur begünstigte PV-Komponenten und Installation; Betreiber, Gebäude und Voraussetzungen prüfen. Bis 30 kWp laut MaStR gelten die Gebäudevoraussetzungen als erfüllt. Nicht jede Reparatur oder Wartung ist begünstigt; Förderung allein reicht nicht.'},
    small:{label:'Kleinunternehmer - steuerfrei',rate:0,law:'§ 19 Abs. 1 UStG',url:LAW+'__19.html',help:'Nur bei tatsächlich angewendeter Kleinunternehmerregelung. Inländische Umsatzgrenzen: Vorjahr höchstens 25.000 €, laufendes Jahr höchstens 100.000 €; ein Verzicht kann binden.'},
    reverse:{label:'Steuer schuldet der Kunde - Bauleistung',rate:0,law:'§ 13b Abs. 2 Nr. 4 und Abs. 5 UStG; § 14a Abs. 5 UStG',url:LAW+'__13b.html',help:'Kein 0-%-Steuersatz. Nur bei erfüllten Voraussetzungen für die Steuerschuldnerschaft des Leistungsempfängers, insbesondere einem nachhaltig Bauleistungen erbringenden Empfänger. Geeigneten Nachweis prüfen, ggf. USt 1 TG.'},
    exempt:{label:'Andere Steuerbefreiung / Sonderfall',rate:0,law:'Individuelle Rechtsgrundlage erforderlich',url:LAW+'__4.html',help:'Keine pauschale Befreiung. Den genauen Paragraphen, Absatz, gegebenenfalls Nummer und den tatsächlichen Grund mit Steuerberatung klären und unten angeben.'}
  };
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const euro=value=>(value/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  function calculate(items,choice){
    if(!choice||!['net','gross'].includes(choice.basis)||!rules[choice.mode]||choice.confirmed!==true)throw Error('Bitte Preisbasis, Steuerbehandlung und Bestätigung vollständig angeben.');
    const groups=new Map(),notes=new Map();
    const lines=items.map((item,index)=>{
      const code=choice.overrides?.[index]||choice.mode,rule=rules[code];if(!rule)throw Error('Ungültige Steuerbehandlung.');
      const detail=String(choice.reasons?.[code]||'').trim();
      if(code!=='standard'&&!detail)throw Error('Bitte die Voraussetzungen / Rechtsgrundlage für '+rule.label+' erläutern.');
      const quantity=Number(item.quantity),price=Number(item.price);if(!Number.isFinite(quantity)||!Number.isFinite(price)||quantity<0||price<0)throw Error('Ungültiger Positionspreis.');
      const amount=Math.round((quantity*price+Number.EPSILON)*100);if(!Number.isSafeInteger(amount)||amount>1e12)throw Error('Positionsbetrag ist zu groß.');
      const net=choice.basis==='gross'?Math.round(amount*100/(100+rule.rate)):amount,vat=choice.basis==='gross'?amount-net:Math.round(net*rule.rate/100),gross=net+vat;
      const group=groups.get(code)||{code,label:rule.label,rate:rule.rate,net:0,vat:0,gross:0};group.net+=net;group.vat+=vat;group.gross+=gross;groups.set(code,group);
      if(code!=='standard')notes.set(code,{code,law:code==='exempt'?detail:rule.law,detail,text:code==='reverse'?'Steuerschuldnerschaft des Leistungsempfängers.':code==='small'?'Steuerbefreiung für Kleinunternehmer gemäß § 19 Abs. 1 UStG.':code==='pv'?'Nullsteuersatz gemäß § 12 Abs. 3 UStG.':code==='reduced'?'Ermäßigter Steuersatz gemäß § 12 Abs. 2 UStG.':'Steuerbefreiung / Sonderfall: '+detail});
      return {index,code,rate:rule.rate,net,vat,gross};
    });
    return {version:905,checkedAt:'2026-10-16',basis:choice.basis,lines,groups:[...groups.values()],notes:[...notes.values()],net:lines.reduce((s,l)=>s+l.net,0),vat:lines.reduce((s,l)=>s+l.vat,0),gross:lines.reduce((s,l)=>s+l.gross,0)};
  }
  function ask(data,accept){
    const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='invoice-tax-dialog';dialog.setAttribute('aria-label','Umsatzsteuer für die Rechnung');
    const options=Object.entries(rules).map(([key,rule])=>`<option value="${key}">${esc(rule.label)}</option>`).join('');
    dialog.innerHTML=`<form novalidate><header><h2>Umsatzsteuer prüfen</h2><p>${esc(data.customer)} · ${data.items.length} Position(en)</p></header><p>Vor jeder neuen Rechnung bitte bewusst auswählen. Die App entscheidet nicht, ob eine Steuervergünstigung rechtlich zutrifft.</p><label>Preise in der Materialliste sind …<select name="basis" required><option value="">Bitte auswählen</option><option value="net">Nettopreise - Umsatzsteuer ggf. zusätzlich</option><option value="gross">Bruttopreise - Umsatzsteuer ggf. enthalten</option></select></label><label>Steuerbehandlung für die Rechnung<select name="mode" required><option value="">Bitte auswählen</option>${options}</select></label><details><summary>Abweichende Steuer je Position (gemischte Rechnung)</summary>${data.items.map((item,i)=>`<label>${i+1}. ${esc(item.name)}<select data-tax-line="${i}"><option value="">Wie Rechnung</option>${options}</select></label>`).join('')}</details><section data-tax-help></section><div class="tax-reasons">${Object.entries(rules).filter(([key])=>key!=='standard').map(([key,rule])=>`<label data-reason-box="${key}" hidden>${key==='exempt'?'Genauer Paragraph und Grund':esc(rule.label)+' - Voraussetzungen / Nachweis'}<textarea data-tax-reason="${key}" maxlength="1800" rows="3"></textarea></label>`).join('')}</div><p class="tax-confirm"><label><input type="checkbox" name="confirmed" required> Ich habe die steuerliche Einordnung und die Preisbasis geprüft. Bei Zweifeln kläre ich sie mit meiner Steuerberatung.</label></p><output data-tax-total></output><p class="tax-status" role="alert"></p><footer><button type="button" data-tax-cancel>Abbrechen</button><button type="submit" class="primary">PDF mit diesen Steuerangaben erstellen</button></footer><small>Hinweise recherchiert am 16.10.2026. Keine Steuerberatung und keine Rechtskonformitätsgarantie. Eine PDF allein ist keine strukturierte E-Rechnung; zusätzliche Rechnungspflichten bleiben zu prüfen.</small></form>`;
    const form=dialog.querySelector('form'),status=dialog.querySelector('.tax-status');
    const close=()=>{dialog.close();dialog.remove();previous?.focus?.();};
    const values=()=>({basis:form.elements.basis.value,mode:form.elements.mode.value,confirmed:form.elements.confirmed.checked,overrides:Object.fromEntries([...form.querySelectorAll('[data-tax-line]')].map(el=>[el.dataset.taxLine,el.value])),reasons:Object.fromEntries([...form.querySelectorAll('[data-tax-reason]')].map(el=>[el.dataset.taxReason,el.value]))});
    const update=()=>{
      const value=values(),used=new Set(data.items.map((_,i)=>value.overrides[i]||value.mode));
      const openHelp=new Set([...dialog.querySelectorAll('[data-tax-help-code][open]')].map(el=>el.dataset.taxHelpCode));dialog.querySelector('[data-tax-help]').innerHTML=[...used].filter(code=>rules[code]).map(code=>`<details class="tax-help" data-tax-help-code="${code}" ${openHelp.has(code)?'open':''}><summary>ⓘ ${esc(rules[code].label)} - Hilfe</summary><p>${esc(rules[code].help)}</p><p><a href="${rules[code].url}" target="_blank" rel="noopener">${esc(rules[code].law)} öffnen</a></p>${code==='pv'?'<a href="https://www.bundesfinanzministerium.de/Content/DE/FAQ/foerderung-photovoltaikanlagen" target="_blank" rel="noopener">BMF: Photovoltaik-Fragen und Antworten</a>':''}</details>`).join('');
      for(const box of dialog.querySelectorAll('[data-reason-box]')){box.hidden=!used.has(box.dataset.reasonBox);box.querySelector('textarea').required=!box.hidden;}
      for(const el of form.querySelectorAll('[aria-invalid]'))if(el.checkValidity()){el.removeAttribute('aria-invalid');el.classList.remove('field-error');}if(form.checkValidity())status.textContent='';
      try{const totals=calculate(data.items,{...value,confirmed:true});dialog.querySelector('[data-tax-total]').textContent='Netto '+euro(totals.net)+' · Umsatzsteuer '+euro(totals.vat)+' · Gesamt '+euro(totals.gross);}catch{dialog.querySelector('[data-tax-total]').textContent='Bitte die Steuerangaben vervollständigen.';}
    };
    form.addEventListener('change',update);form.addEventListener('input',event=>{if(event.target.matches('[data-tax-reason]')){event.target.classList.remove('field-error');event.target.removeAttribute('aria-invalid');}});
    form.addEventListener('submit',event=>{event.preventDefault();const invalid=[...form.elements].filter(el=>el.willValidate&&!el.checkValidity());if(invalid.length){invalid.forEach(el=>{el.classList.add('field-error');el.setAttribute('aria-invalid','true');});invalid[0].focus();status.textContent='Bitte die rot markierten Pflichtfelder ergänzen.';return;}
      try{const tax=calculate(data.items,values());accept(tax);close();}catch(error){status.textContent=error.message;}
    });
    dialog.querySelector('[data-tax-cancel]').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();form.elements.basis.focus();
    return {actualPdf:true,setNote(){},close};
  }
  window.WorktimeInvoiceTax={rules,calculate,ask};
})();
