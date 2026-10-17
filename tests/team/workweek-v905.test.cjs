const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./team-db-fixture.cjs');
async function main(){
 const {db,ids,actor,admin}=await fixture({legacyRecords:true});let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 try{
  await db.exec(`create role service_role bypassrls; grant usage on schema app_private to service_role; alter table profiles add column vacation_allowance numeric default 30; alter table vacation_requests add column requested_days numeric default 0;
   create function app_private.can_access_profile(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select p=auth.uid() or app_private.fixture_manager(p)$$;
   grant execute on function app_private.can_access_profile(uuid) to authenticated;
   create function app_private.bump_planning_sync_v867() returns trigger language plpgsql as $$begin if tg_op='DELETE' then return old; else return new; end if; end;$$;
  `);
  const snapshot=async()=>JSON.stringify((await db.query('select * from profiles order by id')).rows),before=await snapshot();
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261016195754_employee_workweek_v905.sql'),'utf8'));
  await test('Additive migration does not rewrite an existing profile',async()=>assert.equal(await snapshot(),before));
  const summary=async(start,end,employee=ids.anna)=>(await db.query('select vacation_summary_v905($1,$2,$3) value',[employee,start,end])).rows[0].value;
  await actor('anna');
  await test('Default Monday-Friday excludes weekends and NRW holidays in every year',async()=>{assert.equal((await summary('2026-10-16','2026-10-19')).requested_days,2);assert.equal((await summary('2027-03-26','2027-03-29')).requested_days,0);});
  await actor('business');
  await test('Only the responsible business can store an effective-dated workweek',async()=>{await db.query('insert into employee_workweeks_v905(employee_id,effective_from,weekdays) values($1,$2,$3)',[ids.anna,'2026-10-19',[1,2,3,4,5,6]]);assert.equal((await db.query('select count(*)::int n from employee_workweeks_v905')).rows[0].n,1);});
  await actor('anna');
  await test('A later schedule does not change earlier weekends; Saturday can be a working day',async()=>{assert.equal((await summary('2026-10-17','2026-10-17')).requested_days,0);assert.equal((await summary('2026-10-24','2026-10-24')).requested_days,1);});
  await test('Employees cannot change schedules and cannot inspect a foreign employee summary',async()=>{await assert.rejects(()=>db.query('insert into employee_workweeks_v905 values($1,$2,$3,now())',[ids.anna,'2026-11-01',[1]]));await assert.rejects(()=>summary('2026-10-19','2026-10-19',ids.felix));});
  await actor('admin');
  await test('Administrator sees schedules read-only, matching the business-only setting',async()=>{assert.equal((await db.query('select count(*)::int n from employee_workweeks_v905')).rows[0].n,1);await assert.rejects(()=>db.query('insert into employee_workweeks_v905 values($1,$2,$3,now())',[ids.anna,'2026-11-01',[1]]));});
  await actor('otherBusiness');
  await test('A foreign business sees no schedule and cannot change one',async()=>{assert.equal((await db.query('select count(*)::int n from employee_workweeks_v905')).rows[0].n,0);await assert.rejects(()=>db.query('insert into employee_workweeks_v905 values($1,$2,$3,now())',[ids.anna,'2026-11-01',[1]]));});
  await admin();
  await db.query("insert into vacation_requests(employee_id,start_date,end_date,status) values($1,'2026-10-19','2026-10-25','approved'),($1,'2026-10-20','2026-10-21','approved'),($1,'2027-01-04','2027-01-04','approved')",[ids.anna]);
  await db.query("insert into work_days values($1,'2026-10-20',1,0)",[ids.anna]);
  await actor('anna');
  await test('Overlapping requests, sick days and year boundaries do not double deduct leave',async()=>{const s=await summary('2026-10-19','2026-10-25');assert.equal(s.requested_days,5);assert.equal(s.used,5);assert.equal(s.remaining,25);assert.equal((await summary('2027-01-01','2027-01-05')).used,1);});
  await admin();
  await test('New request counts are calculated by PostgreSQL, not a stale frontend estimate',async()=>{const result=await db.query("insert into vacation_requests(employee_id,start_date,end_date,status,requested_days) values($1,'2026-10-24','2026-10-25','requested',999) returning requested_days",[ids.anna]);assert.equal(Number(result.rows[0].requested_days),1);});
  await test('Vacation does not block nonworking Sunday but still blocks scheduled Saturday',async()=>{await db.query('select app_private.team_check_day($1,$2)',[ids.anna,'2026-10-25']);await assert.rejects(()=>db.query('select app_private.team_check_day($1,$2)',[ids.anna,'2026-10-24']));});
  await db.exec("set role anon");await test('Signed-out users have no table or summary access',async()=>{await assert.rejects(()=>db.query('select * from employee_workweeks_v905'));await assert.rejects(()=>summary('2026-01-01','2026-01-02'));});await admin();
  const root={addEventListener(){},querySelector(){return null;},querySelectorAll(){return []}},scope={window:{WORKTIME_CONFIG:{},addEventListener(){},setInterval(){}},document:{getElementById:()=>root,addEventListener(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},setTimeout,clearTimeout,console,Intl,Date,Map,Set,URL,AbortController,structuredClone};
  const source=fs.readFileSync(path.resolve(__dirname,'../../app-v800.js'),'utf8').replace('if (state.session?.access_token) loadApp(); else render();','/* No startup in synthetic test. */').replace(/\}\)\(\);\s*$/,'window.qa905={state,isWorkingDay,vacation,vacationLeft,requestedVacation,timeAccountReport,settingsView};})();');vm.runInNewContext(source,scope);const app=scope.window.qa905;
  await actor('business');for(const [name,table]of [['people','profiles'],['workweeks','employee_workweeks_v905'],['days','work_days'],['vacations','vacation_requests']])app.state.rows[name]=JSON.parse(JSON.stringify((await db.query('select * from '+table)).rows,(key,value)=>['effective_from','work_date','start_date','end_date'].includes(key)&&typeof value==='string'?value.slice(0,10):value));app.state.people=app.state.rows.people;Object.assign(app.state,{profile:app.state.people.find(p=>p.id===ids.business),employeeId:ids.anna,businessId:ids.business,date:'2026-10-19'});
  await test('Actual calendar/report model matches the database, with no weekend vacation badges',async()=>{assert.ok(!app.vacation(ids.anna,'2026-10-25'));assert.ok(app.vacation(ids.anna,'2026-10-24'));assert.ok(!app.vacation(ids.anna,'2026-10-20'));assert.equal(app.vacationLeft(ids.anna),25);const report=app.timeAccountReport(ids.anna).years.find(row=>row.year==='2026');assert.equal(report.approvedDays,5);assert.equal(report.holidays,9);assert.equal(report.calendarHolidays,11);assert.match(app.settingsView(),/Arbeitstage speichern/);app.state.profile=app.state.people.find(p=>p.id===ids.admin)||{role:'administrator',id:ids.admin};assert.doesNotMatch(app.settingsView(),/data-form="employee-workweek"/);});
  await test('The effective app loader and revision sync both fetch schedules without discarding typed forms',()=>{const actual=source.slice(source.lastIndexOf('  async function reload()'),source.indexOf('  function recordedPeriods'));assert.match(actual,/load\('workweeks','employee_workweeks_v905'/);const refresh=source.slice(source.indexOf('  async function refreshPlanningData'),source.indexOf('  function revealPlanningDetail'));assert.match(refresh,/allRows\('employee_workweeks_v905'/);assert.match(refresh,/Object\.assign\(state\.rows, \{[^}]*workweeks/);const sync=source.slice(source.indexOf('  async function syncPlanningIfVisible'),source.indexOf('  window.setInterval(syncPlanningIfVisible'));assert.match(sync,/'home','calendar','settings'/);assert.match(sync,/activeElement\?\.closest\('form'\)/);});
  console.log(JSON.stringify({passed,productionWrites:0,browserAutomation:false}));
 }finally{await db.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
