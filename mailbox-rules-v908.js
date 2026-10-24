/* Pure, independently testable mailbox rules; no network or credentials. */
(function(factory){if(typeof module==='object'&&module.exports)module.exports=factory();else window.WorktimeMailboxRules=factory();})(function(){
 'use strict';
 const categories=[['payroll','Lohnabrechnungen'],['vacation','Urlaubsanträge'],['sickness','Krankmeldungen'],['job_info','Informationen zu Aufträgen'],['fuel','Tankbelege'],['delivery','Lieferscheine'],['other_receipt','Sonstige Belege']];
 function category(row){if(categories.some(([id])=>id===row.category))return row.category;if(/^vacation_/.test(row.message_type||''))return 'vacation';if(row.body?.payslip_id||row.body?.category==='payroll')return 'payroll';return 'legacy';}
 const label=id=>categories.find(([key])=>key===id)?.[1]||'Nachricht (Bestand)';
 function slot(row,user,states=[]){const saved=states.find(s=>s.user_id===user&&s.message_id===row.id);return saved||{read_at:row.recipient_id===user?row.read_at:null,deleted_at:row.recipient_id===user?row.deleted_at:null};}
 function visible(row,user){return row.sender_id===user||row.recipient_id===user;}
 function matches(row,user,states,folder='received',type='',sender=''){
  if(!visible(row,user)||type&&category(row)!==type||sender&&row.sender_id!==sender)return false;
  const s=slot(row,user,states),draft=row.delivery_status==='draft';
  if(folder==='trash')return Boolean(s.deleted_at);
  if(s.deleted_at)return false;
  if(folder==='drafts')return draft&&row.sender_id===user;
  if(draft)return false;
  if(folder==='sent')return row.sender_id===user;
  if(folder==='received')return row.recipient_id===user;
  if(folder==='unread')return row.recipient_id===user&&!s.read_at;
  if(folder==='read')return row.recipient_id===user&&Boolean(s.read_at);
  return true;
 }
 function template(type,recipient='',period=''){
  const hello='Hallo'+(recipient?' '+recipient:'')+',\n\n';
  return hello+({payroll:'hiermit erhältst du deine Lohnabrechnung'+(period?' für '+period:' für den Monat [Monat/Jahr]')+'.\nDie Datei findest du im Anhang.',vacation:'hier findest du die Informationen zu deinem Urlaubsantrag.\nZeitraum: [von – bis]\nHinweis: Eine Nachricht ersetzt nicht die Genehmigung im Kalender.',sickness:'hiermit übersende ich die Informationen zur Krankmeldung.\nZeitraum: [von – bis]\nBitte keine Diagnose oder unnötigen Gesundheitsdaten eintragen.',job_info:'hier findest du Informationen zu einem Auftrag.\nKunde: [Kunde]\nTermin: [Datum/Uhrzeit]\nHinweise: ',fuel:'im Anhang findest du meinen Tankbeleg.\nHinweis: ',delivery:'im Anhang findest du den Lieferschein zur angegebenen Kommission.\nHinweis: ',other_receipt:'im Anhang findest du meinen Beleg zur angegebenen Kommission.\nHinweis: '}[type]||'');
 }
 function validate(data){if(!data.recipientId)throw Error('Bitte einen Empfänger auswählen.');if(!categories.some(([key])=>key===data.category))throw Error('Bitte eine Kategorie auswählen.');if(!String(data.title||'').trim()||String(data.title).length>160)throw Error('Bitte einen Betreff mit höchstens 160 Zeichen eintragen.');if(!String(data.message||'').trim()||String(data.message).length>10000)throw Error('Bitte eine Nachricht mit höchstens 10.000 Zeichen eintragen.');if(['delivery','other_receipt'].includes(data.category)&&!String(data.commission||'').trim())throw Error('Bitte unter Kommission den Kunden oder Grund eintragen.');}
 return {categories,category,label,slot,visible,matches,template,validate};
});
