/* DATEV EXTF 700 / Buchungsstapel 13. Column labels from DATEV's official v2.2.3.0 validator XML (125 fields). */
(()=>{
 'use strict';
 const columns=["Umsatz (ohne Soll/Haben-Kz)","Soll/Haben-Kennzeichen","WKZ Umsatz","Kurs","Basis-Umsatz","WKZ Basis-Umsatz","Kontonummer","Gegenkonto (ohne BU-Schlüssel)","BU-Schlüssel","Belegdatum","Belegfeld 1","Belegfeld 2","Skonto","Buchungstext","Postensperre","Diverse Adressnummer","Geschäftspartnerbank","Sachverhalt","Zinssperre","Beleglink","Beleginfo - Art 1","Beleginfo - Inhalt 1","Beleginfo - Art 2","Beleginfo - Inhalt 2","Beleginfo - Art 3","Beleginfo - Inhalt 3","Beleginfo - Art 4","Beleginfo - Inhalt 4","Beleginfo - Art 5","Beleginfo - Inhalt 5","Beleginfo - Art 6","Beleginfo - Inhalt 6","Beleginfo - Art 7","Beleginfo - Inhalt 7","Beleginfo - Art 8","Beleginfo - Inhalt 8","Kost 1 - Kostenstelle","Kost 2 - Kostenstelle","Kost-Menge","EU-Land u. UStID (Bestimmung)","EU-Steuersatz (Bestimmung)","Abw. Versteuerungsart","Sachverhalt L+L","Funktionsergänzung L+L","BU 49 Hauptfunktionstyp","BU 49 Hauptfunktionsnummer","BU 49 Funktionsergänzung","Zusatzinformation - Art 1","Zusatzinformation- Inhalt 1","Zusatzinformation - Art 2","Zusatzinformation- Inhalt 2","Zusatzinformation - Art 3","Zusatzinformation- Inhalt 3","Zusatzinformation - Art 4","Zusatzinformation- Inhalt 4","Zusatzinformation - Art 5","Zusatzinformation- Inhalt 5","Zusatzinformation - Art 6","Zusatzinformation- Inhalt 6","Zusatzinformation - Art 7","Zusatzinformation- Inhalt 7","Zusatzinformation - Art 8","Zusatzinformation- Inhalt 8","Zusatzinformation - Art 9","Zusatzinformation- Inhalt 9","Zusatzinformation - Art 10","Zusatzinformation- Inhalt 10","Zusatzinformation - Art 11","Zusatzinformation- Inhalt 11","Zusatzinformation - Art 12","Zusatzinformation- Inhalt 12","Zusatzinformation - Art 13","Zusatzinformation- Inhalt 13","Zusatzinformation - Art 14","Zusatzinformation- Inhalt 14","Zusatzinformation - Art 15","Zusatzinformation- Inhalt 15","Zusatzinformation - Art 16","Zusatzinformation- Inhalt 16","Zusatzinformation - Art 17","Zusatzinformation- Inhalt 17","Zusatzinformation - Art 18","Zusatzinformation- Inhalt 18","Zusatzinformation - Art 19","Zusatzinformation- Inhalt 19","Zusatzinformation - Art 20","Zusatzinformation- Inhalt 20","Stück","Gewicht","Zahlweise","Forderungsart","Veranlagungsjahr","Zugeordnete Fälligkeit","Skontotyp","Auftragsnummer","Buchungstyp (Anzahlungen)","USt-Schlüssel (Anzahlungen)","EU-Land (Anzahlungen)","Sachverhalt L+L (Anzahlungen)","EU-Steuersatz (Anzahlungen)","Erlöskonto (Anzahlungen)","Herkunft-Kz","Buchungs GUID","Kost-Datum","SEPA-Mandatsreferenz","Skontosperre","Gesellschaftername","Beteiligtennummer","Identifikationsnummer","Zeichnernummer","Postensperre bis","Bezeichnung SoBil-Sachverhalt","Kennzeichen SoBil-Buchung","Festschreibung","Leistungsdatum","Datum Zuord. Steuerperiode","Fälligkeit","Generalumkehr (GU)","Steuersatz","Land","Abrechnungsreferenz","BVV-Position","EU-Land u. UStID (Ursprung)","EU-Steuersatz (Ursprung)","Abw. Skontokonto"];
 const failure=(field,message)=>{const error=new Error(message);error.field=field;throw error;};
 const date=(value,field='fiscal_start')=>{let valid=false;try{valid=/^20\d{2}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}catch{}if(!valid)failure(field,'Bitte ein gültiges Datum zwischen 2000 und 2099 angeben.');return value;};
 const digits=(value,min,max,field,label)=>{const v=String(value??'').trim();if(!new RegExp('^[0-9]{'+min+','+max+'}$').test(v)||/^0+$/.test(v))failure(field,label+' bitte mit '+min+' bis '+max+' Ziffern angeben.');return v;};
 function plain(value,max,field){const text=String(value??'').trim();if(!text||text.length>max||/[\x00-\x1f\x7f-\x9f]/.test(text))failure(field,'Bitte einen Text mit höchstens '+max+' Zeichen ohne Steuerzeichen angeben.');if(/^[=+@-]/.test(text))failure(field,'Tabellenformeln sind im Export nicht erlaubt. Bitte den Text nicht mit =, +, - oder @ beginnen.');cp1252(text);return text;}
 const specials='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ',codes=[128,130,131,132,133,134,135,136,137,138,139,140,142,145,146,147,148,149,150,151,152,153,154,155,156,158,159];
 function cp1252(text){const bytes=[];for(const c of String(text)){const n=c.codePointAt(0),i=specials.indexOf(c);if(n<=127||n>=160&&n<=255)bytes.push(n);else if(i>=0)bytes.push(codes[i]);else failure('encoding','Das Zeichen „'+c+'“ lässt sich nicht verlustfrei im DATEV-Zeichensatz Windows-1252 darstellen. Bitte nur für diese Übergabe eine passende Schreibweise wählen.');}return new Uint8Array(bytes);}
 function profile(input){
  if(!input)failure('settings','Bitte die Export-Einrichtung speichern.');
  const p={...input,consultant:digits(input.consultant,4,7,'consultant','Beraternummer'),client:digits(input.client,1,5,'client','Mandantennummer'),fiscal_start:date(input.fiscal_start),account_length:Number(input.account_length),chart:String(input.chart||''),posting:String(input.posting??'')};
  if(Number(p.consultant)<1001||Number(p.consultant)>9999999)failure('consultant','Beraternummer: gültiger Bereich 1001 bis 9999999.');
  if(Number(p.client)<1)failure('client','Bitte eine gültige Mandantennummer angeben.');
  if(!Number.isInteger(p.account_length)||p.account_length<4||p.account_length>8)failure('account_length','Sachkontenlänge: 4 bis 8 Stellen.');
  if(!/^\d{2}(?:\d{2})?$/.test(p.chart))failure('chart','Bitte den mit der Kanzlei abgestimmten Kontenrahmen mit 2 oder 4 Ziffern angeben.');
  if(!['0','1'].includes(p.posting))failure('posting','Bitte die Festschreibung bewusst auswählen.');
  return p;
 }
 function amount(value){const text=String(value??'').trim();if(!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(text))failure('amount','Bitte einen positiven Betrag ohne Tausendertrennzeichen und mit höchstens zwei Nachkommastellen angeben.');const [whole,fraction='']=text.replace(',','.').split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents<=0||cents>999999999999)failure('amount','Der Betrag muss größer als null sein und im DATEV-Betragsbereich liegen.');return cents;}
 function booking(input,settings){
  const p=profile(settings),b={...input};
  b.document_number=plain(input.document_number,100,'document_number');b.reference=String(input.reference||'').trim();
  if(!/^[A-Za-z0-9_$&%*+\/-]{1,36}$/.test(b.reference)||/^[=+@-]/.test(b.reference))failure('reference','DATEV-Belegschlüssel: 1 bis 36 Zeichen (A–Z, 0–9, _, $, &, %, *, +, - oder /), keine Leerzeichen, Punkte oder Umlaute. Die Originalnummer bleibt separat erhalten.');
  b.document_date=date(input.document_date,'document_date');
  if(!Number.isSafeInteger(input.amount_cents)||input.amount_cents<=0||input.amount_cents>999999999999)failure('amount','Bitte einen positiven Centbetrag im gültigen Bereich angeben.');
  if(!['S','H'].includes(input.direction))failure('direction','Bitte Soll oder Haben auswählen.');
  b.account=digits(input.account,1,p.account_length+1,'account','Konto');b.contra=digits(input.contra,1,p.account_length+1,'contra','Gegenkonto');
  if(b.account===b.contra)failure('contra','Konto und Gegenkonto müssen verschieden sein.');
  b.booking_key=String(input.booking_key||'').trim();
  if(b.booking_key&&!/^\d{4}$/.test(b.booking_key))failure('booking_key','Den abgestimmten BU-Schlüssel bitte vierstellig eingeben, z. B. mit führenden Nullen. Bei Kontenautomatik leer lassen.');
  if(['0049','0100','0400'].includes(b.booking_key))failure('booking_key','Dieser BU-Schlüssel benötigt zusätzliche Steuerfelder, die der Basisexport nicht unterstützt. Bitte dafür die zuständige Buchhaltung verwenden.');
  if(input.tax_confirmed!==true)failure('tax_confirmed','Bitte die Kontierung und den BU-Schlüssel bzw. die Kontenautomatik fachlich prüfen und bestätigen.');
  b.text=plain(input.text,60,'text');return b;
 }
 const quote=text=>'"'+String(text??'').replace(/"/g,'""')+'"';
 const compact=d=>d.replaceAll('-',''),ddmm=d=>d.slice(8,10)+d.slice(5,7);
 function financialEnd(start){const d=new Date(start+'T12:00:00Z'),target=d.getUTCFullYear()+1,month=d.getUTCMonth(),day=d.getUTCDate();d.setUTCFullYear(target,month,1);d.setUTCDate(Math.min(day,new Date(Date.UTC(target,month+1,0)).getUTCDate()));d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
 function period(month,p){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||''))failure('month','Bitte einen gültigen Buchungsmonat wählen.');const from=month+'-01',to=month+'-'+new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();if(from<p.fiscal_start||to>financialEnd(p.fiscal_start))failure('month','Der gesamte Exportmonat muss im eingerichteten Wirtschaftsjahr liegen.');return {from,to};}
 function build(batch){
  const p=profile(batch.settings),{from,to}=period(batch.period,p),rows=batch.entries;
  if(!Array.isArray(rows)||!rows.length||rows.length>99999)failure('selection','Bitte 1 bis 99.999 Buchungen auswählen.');
  const ids=new Set();for(const b of rows){if(!b.id||ids.has(b.id))failure('selection','Doppelte oder fehlende Buchungs-ID.');ids.add(b.id);}
  const created=new Date(batch.created_at);if(!Number.isFinite(+created)||created.getUTCFullYear()<2000||created.getUTCFullYear()>2099)failure('created_at','Ungültiger Exportzeitpunkt.');
  const stamp=created.toISOString().replace(/[-:TZ.]/g,'');
  const head=[quote('EXTF'),'700','21',quote('Buchungsstapel'),'13',stamp,'',quote('RE'),quote('ArbeitszeitApp'),quote(''),p.consultant,p.client,compact(p.fiscal_start),String(p.account_length),compact(from),compact(to),quote('Arbeitszeit '+batch.period),quote(''),'1','0',p.posting,quote('EUR'),'',quote(''),'','',quote(p.chart),'','',quote(''),quote('Arbeitszeit907')];
  const data=rows.map(value=>{
   const b=booking(value,p);if(b.document_date<from||b.document_date>to)failure('selection','Ein ausgewählter Beleg liegt außerhalb des Exportmonats.');
   const line=Array(125).fill('');line[0]=(b.amount_cents/100).toFixed(2).replace('.',',');line[1]=quote(b.direction);line[2]=quote('EUR');line[6]=b.account;line[7]=b.contra;line[8]=b.booking_key?quote(b.booking_key):'';line[9]=ddmm(b.document_date);line[10]=quote(b.reference);line[13]=quote(b.text);
   line[20]=quote('Originalbelegnummer');line[21]=quote(b.document_number);line[113]=p.posting;
   return line.join(';');
  });
  const text=[head.join(';'),columns.map(quote).join(';'),...data].join('\r\n')+'\r\n';
  const total=rows.reduce((sum,b)=>sum+b.amount_cents*(b.direction==='S'?1:-1),0);if(!Number.isSafeInteger(total))failure('selection','Die Gesamtbeträge überschreiten den sicher darstellbaren Bereich. Bitte mehrere kleinere Exporte erstellen.');
  return {text,bytes:cp1252(text),filename:'EXTF_Arbeitszeit_'+batch.period+'_'+String(batch.id||'Vorschau').replace(/[^a-z0-9-]/gi,'').slice(0,40)+'.csv',count:rows.length,total_cents:total};
 }
 const api={columns,cp1252,profile,booking,amount,period,build,financialEnd};
 if(typeof window!=='undefined')window.WorktimeDatevFormat=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(typeof window==='undefined'&&typeof module==='undefined')globalThis.WorktimeDatevFormat=api;
})();
