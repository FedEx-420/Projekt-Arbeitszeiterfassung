/* Pure business rules shared by the interface and isolated tests. */
((global)=>{
 'use strict';
 const reasons=Object.freeze([
  {id:'vehicle_cleanup',label:'Aufräumen Firmenfahrzeug',text:'Aufräumen des Firmenfahrzeugs'},
  {id:'warehouse_cleanup',label:'Aufräumen Firmenlager',text:'Aufräumen des Firmenlagers'},
  {id:'office',label:'Bürotätigkeiten',text:'Bürotätigkeiten'},
  {id:'nonbillable',label:'Nicht abrechnungsfähiger Auftrag',text:'Nicht abrechnungsfähiger Auftrag'},
  {id:'complaint',label:'Reklamation',text:'Reklamation'},
  {id:'other',label:'Sonstiger Grund',text:''}
 ]);
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const day=date=>new Date(date+'T12:00:00Z').getUTCDay()||7;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const at=(rows,employee,date)=>(rows||[]).filter(row=>row.employee_id===employee&&row.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0]||null;
 function validateHours(hours){if(!Array.isArray(hours)||hours.length!==7||hours.some(h=>typeof h!=='number'||!Number.isFinite(h)||h<0||h>24||h*4%1))throw Error('Bitte für Mo–So Stunden zwischen 0 und 24 in Viertelstunden eingeben.');return hours.slice();}
 function mode(rules,employee,date){return at(rules,employee,date)?.targets_enabled!==false;}
 function target({rules,employee,date,working=true,holiday=false}){if(!working||holiday||!mode(rules,employee,date))return 0;const rule=at(rules,employee,date);return rule?Number(rule.target_hours[day(date)-1]):day(date)===5?5:8;}
 function overtime({entries,rules,employee,working=()=>true,holiday=()=>false}){const totals=new Map();for(const e of entries||[])if(validDate(e.work_date))totals.set(e.work_date,(totals.get(e.work_date)||0)+Number(e.executed_hours||0));let sum=0;for(const [date,hours] of totals)if(mode(rules,employee,date))sum+=hours-target({rules,employee,date,working:working(date),holiday:holiday(date)});return Math.round(sum*100)/100;}
 function schoolEntries({schedules,employee,from,to,today:limit=today(),holiday=()=>false,absent=()=>false}){
  if(!validDate(from)||!validDate(to)||!validDate(limit)||to<from)return [];
  const result=[],end=to<limit?to:limit,cursor=new Date(from+'T12:00:00Z');let count=0;
  for(;cursor.toISOString().slice(0,10)<=end;cursor.setUTCDate(cursor.getUTCDate()+1)){
   if(++count>3661)throw Error('Bitte höchstens zehn Jahre auf einmal anzeigen.');
   const date=cursor.toISOString().slice(0,10),rule=at(schedules,employee,date),hours=Number(rule?.school_hours?.[day(date)-1]||0);
   if(!hours||holiday(date)||absent(date))continue;
   result.push({id:'school:'+employee+':'+date,employee_id:employee,work_date:date,customer_name:'Berufsschule',executed_hours:hours,start_time:null,end_time:null,pause_hours:0,school_credit:true,custom_fields:{notes:'Berufsschule · Stunden laut gültigem Schulplan',school_schedule_from:rule.effective_from}});
  }return result;
 }
 function kind(value){const id=String(value||'customer');if(id!=='customer'&&!reasons.some(r=>r.id===id))throw Error('Bitte eine gültige Auftragsart auswählen.');return id;}
 function documentation(reason,text){const id=kind(reason),note=String(text||'').trim();if(id==='other'&&!note)throw Error('Bitte unter Notiz / Dokumentation den sonstigen Grund angeben.');const preset=reasons.find(r=>r.id===id)?.text;return preset&&!note.includes(preset)?[preset,note].filter(Boolean).join('\n'):note;}
 function billable(order){return kind(order?.work_kind)==='customer';}
 const api={reasons,validDate,day,today,at,validateHours,mode,target,overtime,schoolEntries,kind,documentation,billable};
 if(typeof module==='object'&&module.exports)module.exports=api;else global.WorktimeBusinessRules=api;
})(typeof window==='object'?window:globalThis);
