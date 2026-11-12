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
  window.WorktimeInvoiceTax={rules,calculate};
})();
