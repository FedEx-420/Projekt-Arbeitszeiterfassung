/* Actual report and PDF modules in a VM, not browser automation. Synthetic RLS fixture only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {fixture}=require('./team-db-fixture.cjs');
async function main(){
 const {db,ids,actor,admin}=await fixture({legacyRecords:true});let passed=0;
 const root={addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
 const scope={window:{WORKTIME_CONFIG:{},addEventListener(){},setInterval(){}},document:{getElementById:()=>root,addEventListener(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},setTimeout,clearTimeout,console,Intl,Date,Map,Set,URL,AbortController,structuredClone};
 let source=fs.readFileSync(path.resolve(__dirname,'../../app-v800.js'),'utf8').replace('if (state.session?.access_token) loadApp(); else render();','/* Pure report test: no startup, network or render. */').replace(/\}\)\(\);\s*$/, 'window.modelQA={state,timeAccountReport,reportDateValid,recordedPeriods};})();');
 vm.runInNewContext(source,scope);const app=scope.window.modelQA;
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 async function role(name,employee=name,date='2026-10-05'){
  await actor(name);const rows=app.state.rows;
  for(const [key,table]of [['people','profiles'],['entries','time_entries'],['orders','work_orders'],['days','work_days'],['vacations','vacation_requests']])rows[key]=JSON.parse(JSON.stringify((await db.query('select * from '+table)).rows,(key,value)=>['work_date','start_date','end_date'].includes(key)&&typeof value==='string'?value.slice(0,10):value));
  app.state.people=rows.people;Object.assign(app.state,{profile:rows.people.find(p=>p.id===ids[name]),employeeId:ids[employee],businessId:ids.business,date});
 }
 const year=(report,y)=>report.years.find(row=>row.year===y),day=(report,d)=>year(report,d.slice(0,4))?.months.flatMap(row=>row.days).find(row=>row.date===d);
 try{
  await admin();
  for(const [person,date,sick,vacation]of [['anna','2026-10-07',1,0],['anna','2026-10-08',0.5,0],['anna','2026-10-09',0,0.5],['anna','2024-02-29',1,0],['anna','2026-01-01',1,0],['max','2026-10-13',1,0]])await db.query('insert into work_days(employee_id,work_date,sick,vacation) values($1,$2,$3,$4)',[ids[person],date,sick,vacation]);
  for(const [person,from,to,status]of [['anna','2026-10-08','2026-10-12','approved'],['anna','2026-10-14','2026-10-16','requested'],['anna','2026-10-20','2026-10-21','rejected'],['anna','2025-12-31','2026-01-02','approved'],['anna','2026-04-03','2026-04-06','approved'],['max','2026-10-22','2026-10-23','approved']])await db.query('insert into vacation_requests(employee_id,start_date,end_date,status) values($1,$2,$3,$4)',[ids[person],from,to,status]);
  await role('anna');let report=app.timeAccountReport();
  await check('Report is chronologically grouped across absence-only years and leap days',async()=>{assert.deepEqual(Array.from(report.years,row=>row.year),['2024','2025','2026']);assert.equal(day(report,'2024-02-29').sickDays,1);assert.equal(year(report,'2024').hours,0);});
  await check('All eleven NRW holidays remain visible; eight fall on default working days',async()=>{assert.equal(year(report,'2026').calendarHolidays,11);assert.equal(year(report,'2026').holidays,8);assert.equal(day(report,'2026-04-03').holiday,'Karfreitag');assert.equal(day(report,'2026-06-04').holiday,'Fronleichnam');assert.equal(day(report,'2026-12-25').entries.length,0);});
  await check('Sickness wins over leave; approved, requested and rejected leave stay distinct',async()=>{assert.equal(year(report,'2026').sickDays,2.5);assert.equal(day(report,'2026-10-08').approvedDays,0);assert.equal(year(report,'2026').approvedDays,2.5);assert.equal(year(report,'2026').requestedDays,3);assert.equal(day(report,'2026-10-20'),undefined);});
  await check('Manual and synchronized work hours are counted once, with no minus hours from empty days',async()=>{assert.equal(report.totalHours,3.75);assert.equal(year(report,'2026').overtime,-12.25);assert.equal(year(report,'2024').overtime,0);assert.equal(year(report,'2025').approvedDays,1);});
  await role('business','anna');const chief=JSON.stringify(app.timeAccountReport());await role('admin','anna');await check('Business and founder produce the same selected employee report',async()=>assert.equal(JSON.stringify(app.timeAccountReport()),chief));
  await role('max');await check('RLS prevents mixing foreign and coworker absence records',async()=>{const result=app.timeAccountReport();assert.equal(year(result,'2026').sickDays,1);assert.equal(year(result,'2026').approvedDays,2);assert.equal(day(result,'2026-10-07'),undefined);});
  await check('Invalid dates are rejected while actual leap days remain valid',async()=>assert.deepEqual(Array.from(['2024-02-29','2026-02-29','2026-13-10','not-a-date'],value=>app.reportDateValid(value)),[true,false,false,false]));
  await role('anna','anna','2027-02-02');await check('Empty selected year has holidays but no fictitious work or overtime',async()=>{const result=app.timeAccountReport();assert.equal(year(result,'2027').calendarHolidays,11);assert.equal(year(result,'2027').holidays,7);assert.equal(year(result,'2027').hours,0);assert.equal(year(result,'2027').overtime,0);});
  await check('Previous v875 frontend still reads identical work hours and sickness with additive schemas',async()=>{
   await admin();await db.exec('alter function app_private.fixture_manager(uuid) set search_path=public,pg_temp');
   for(const file of ['20261013232648_creator_account_policy_v900.sql','20261014085106_company_documents_v900.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',file),'utf8'));
   await role('anna');const original=execFileSync('git',['show','0159beaff0b56ede36407d225104b2de9aecfb4d:app-v800.js'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}).replace('if (state.session?.access_token) loadApp(); else render();','/* Rollback compatibility: no startup/network. */').replace(/\}\)\(\);\s*$/,'window.modelQA={state,timeAccountReport};})();');
   const restored={...scope,window:{WORKTIME_CONFIG:{},addEventListener(){},setInterval(){}}};vm.runInNewContext(original,restored);Object.assign(restored.window.modelQA.state,structuredClone(app.state));
   const oldReport=restored.window.modelQA.timeAccountReport(),newReport=app.timeAccountReport();assert.equal(oldReport.totalHours,newReport.totalHours);for(const oldYear of oldReport.years){const current=newReport.years.find(row=>row.year===oldYear.year);assert.equal(JSON.stringify(oldYear.entries),JSON.stringify(current.entries));assert.equal(oldYear.hours,current.hours);assert.equal(oldYear.overtime,current.overtime);assert.equal(oldYear.sickDays,current.sickDays);assert.equal(oldYear.approvedDays,current.approvedDays);assert.equal(oldYear.requestedDays,current.requestedDays);}
  });
  if(process.env.PDF_QA_OUTPUT_DIR){
   const PDFLib=require('pdf-lib'),output=process.env.PDF_QA_OUTPUT_DIR;fs.mkdirSync(output,{recursive:true});globalThis.window={PDFLib};
   // pdf-lib uses instanceof Array; run its client wrappers in the same JS realm.
   vm.runInThisContext(fs.readFileSync(path.resolve(__dirname,'../../documents-pdf-v857.js'),'utf8'));
   vm.runInThisContext(fs.readFileSync(path.resolve(__dirname,'../../planning-pdf.js'),'utf8'));
   await role('anna');report=app.timeAccountReport();
   fs.writeFileSync(path.join(output,'Jahresuebersicht_Originalmodell.pdf'),await window.DevicePdf.createTimeAccount({year:year(report,'2026'),person:'Anna Muster',company:'Wattwerk Elektrotechnik'}));
   const longYear=structuredClone(year(report,'2026'));longYear.months=longYear.months.filter(row=>row.month==='2026-10');
   const entries=Array.from({length:60},(_,index)=>({customer_name:'Auftrag '+(index+1)+' - Gebäudetechnik & ausführliche Kundenbeschreibung',start_time:'08:00',end_time:'09:00',pause_hours:0,executed_hours:1}));
   longYear.months[0].days=[{date:'2026-10-05',entries,labels:[]}];longYear.hours=60;longYear.months[0].hours=60;
   const bytes=await window.DevicePdf.createTimeAccount({year:longYear,person:'Anna Muster',company:'Wattwerk Elektrotechnik'});assert.ok((await PDFLib.PDFDocument.load(bytes)).getPageCount()>1);fs.writeFileSync(path.join(output,'Jahresuebersicht_Langer_Tag.pdf'),bytes);
   const days=Array.from({length:6},(_,index)=>({monthLabel:'Oktober 2026',label:(12+index)+'. Oktober 2026',holiday:'',absences:[],orders:Array.from({length:3},(_,n)=>({time:'08:00 - 12:00 Uhr',customer:'Kunde '+(n+1),title:'Installation & Prüfung',people:'Anna Muster, Max Beispiel',status:'Bestätigt',priority:'Normal',address:'Musterstraße 12, 44135 Dortmund',details:'Bitte den vorhandenen Termin bearbeiten, keinen doppelten Arbeitsschein erstellen.',actual:''}))}));
   const planning=await window.PlanningPdf.create({company:'Wattwerk Elektrotechnik',rangeLabel:'12. bis 17. Oktober 2026',generatedLabel:'14. Oktober 2026',summary:'18 veröffentlichte Aufträge',peopleLabel:'Team: Anna Muster und Max Beispiel',days});assert.ok((await PDFLib.PDFDocument.load(planning)).getPageCount()>1);fs.writeFileSync(path.join(output,'Planung_Mehrseitig.pdf'),planning);
   console.log('PASS Actual PDF modules: annual report, long day and multipage planning');passed++;
  }
  console.log(JSON.stringify({passed,productionWrites:0,browserAutomation:false}));
 }finally{await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
