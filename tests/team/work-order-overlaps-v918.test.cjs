const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fixture}=require('./team-db-fixture.cjs'),R=require('../../business-rules-v908.js');
async function main(){const f=await fixture({legacyRecords:true,units:true,offers:true}),{db,ids,actor,admin}=f;let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 await db.exec(`create role service_role bypassrls;grant usage on schema app_private to service_role;alter table profiles add column vacation_allowance numeric default 30;alter table vacation_requests add column requested_days numeric default 0;
 alter function app_private.fixture_manager(uuid) set search_path=public,pg_temp;
 create function app_private.can_access_profile(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select p=auth.uid() or app_private.fixture_manager(p)$$;
 grant execute on function app_private.can_access_profile(uuid) to authenticated;
 create function app_private.bump_planning_sync_v867() returns trigger language plpgsql as $$begin if tg_op='DELETE' then return old;else return new;end if;end;$$;
 create function app_private.require_work_order_signature() returns trigger language plpgsql as $$begin return new;end;$$;
 create trigger require_signature_before_work_order_insert before insert on work_orders for each row execute function app_private.require_work_order_signature();`);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261016195754_employee_workweek_v905.sql'),'utf8'));
 const before=JSON.stringify((await db.query('select to_jsonb(w) r from work_orders w order by id')).rows);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261017153757_business_workflow_core_v908.sql'),'utf8'));

 const root={addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
 const scope={window:{WORKTIME_CONFIG:{},addEventListener(){},setInterval(){}},document:{getElementById:()=>root,addEventListener(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},setTimeout,clearTimeout,console,Intl,Date,Map,Set,URL,AbortController,structuredClone};
 let source=fs.readFileSync(path.resolve(__dirname,'../../app-v800.js'),'utf8').replace('if (state.session?.access_token) loadApp(); else render();','/* No startup. */');const end=source.lastIndexOf('})();');source=source.slice(0,end)+'window.overlapQA={state,dayHours};'+source.slice(end);vm.runInNewContext(source,scope);
 async function clientHours(){const model=scope.window.overlapQA;model.state.rows.entries=JSON.parse(JSON.stringify((await db.query('select * from time_entries')).rows));model.state.rows.orders=JSON.parse(JSON.stringify((await db.query('select * from work_orders')).rows));for(const row of [...model.state.rows.entries,...model.state.rows.orders])row.work_date=String(row.work_date).slice(0,10);return model.dayHours(ids.anna,f.order.work_date);}
 const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261027044506_single_worker_order_overlaps_v918.sql'),'utf8');
 const counts=async()=>JSON.stringify((await db.query("select 'orders' k,jsonb_agg(to_jsonb(w) order by id) d from work_orders w union all select 'times',jsonb_agg(to_jsonb(t) order by id) from time_entries t union all select 'items',jsonb_agg(to_jsonb(i) order by id) from work_order_items i")).rows);
 await test('overlap migration preserves every existing work/time/item record and security metadata',async()=>{const before=await counts(),security=(await db.query("select proowner,proacl,prosecdef,proconfig from pg_proc where oid='public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure")).rows;const result=await db.exec(migration);assert.equal(result.at(-1).rows[0].installation.single_worker_overlap_enabled,true);assert.equal(await counts(),before);assert.deepEqual((await db.query("select proowner,proacl,prosecdef,proconfig from pg_proc where oid='public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure")).rows,security);await db.exec(migration);assert.equal(await counts(),before);});
 const period=(employee,start='08:00',end='10:00')=>[{employee_id:employee,start_time:start,end_time:end,pause_hours:0}];
 const save=async(employee,periods,extra={})=>f.save({...f.order,employee_id:employee,...extra},periods);
 let a,b;
 await actor('anna');
 await test('employee creates two silently overlapping own work orders and both full durations count',async()=>{a=await save(ids.anna,period(ids.anna));b=await save(ids.anna,period(ids.anna,'09:00','11:00'));const sum=(await db.query('select sum(executed_hours)::numeric h from time_entries where work_order_id=any($1::uuid[])',[[a.id,b.id]])).rows[0].h;assert.equal(Number(sum),4);assert.equal(await clientHours(),4);});
 await test('editing an overlapping own work order replaces its time without duplicating the old duration',async()=>{b=await save(ids.anna,period(ids.anna,'09:00','12:00'),{id:b.id});b=await save(ids.anna,b.team_periods,{id:b.id});assert.equal(Number((await db.query('select sum(executed_hours) h from time_entries where work_order_id=any($1::uuid[])',[[a.id,b.id]])).rows[0].h),5);});
 await actor('admin');await save(ids.max,period(ids.max));await actor('anna');
 await test('a multi-employee work order still rejects a conflict atomically, even if owner is free',async()=>{const before=await counts();await assert.rejects(save(ids.anna,[...period(ids.anna,'13:00','14:00'),...period(ids.max,'08:30','09:30')]),/Zeitraum/);assert.equal(await counts(),before);});

 await actor('admin');
 await test('founder can create and edit overlapping single-worker orders for an employee',async()=>{const x=await save(ids.max,period(ids.max,'09:00','11:00'));await save(ids.max,period(ids.max,'08:00','12:00'),{id:x.id});assert.equal(Number((await db.query('select executed_hours h from work_orders where id=$1',[x.id])).rows[0].h),4);});
 await actor('business');
 await test('an own business working account can record overlapping own orders',async()=>{await save(ids.business,period(ids.business));await save(ids.business,period(ids.business,'09:00','11:00'));});
 await actor('admin');
 await test('founder retains the same overlap check for multi-worker orders',async()=>{await assert.rejects(save(ids.anna,[...period(ids.anna),...period(ids.max)]),/Zeitraum/);});
 await actor('felix');
 await test('overlap relaxation grants no access to another company or employee work',async()=>{await assert.rejects(save(ids.anna,period(ids.anna)),/eigene|zugewiesene|Firma/);await assert.rejects(save(ids.anna,period(ids.anna),{id:a.id}),/gehört nicht/);});
 await admin();await db.query('update work_orders set invoiced=true where id=$1',[a.id]);await actor('anna');
 await test('billed work orders remain locked',async()=>{await assert.rejects(save(ids.anna,period(ids.anna),{id:a.id}),/abgerechneter/);});
 await test('overlapping shifts inside one work order remain an invalid input',async()=>{await assert.rejects(save(ids.anna,[...period(ids.anna,'14:00','16:00'),...period(ids.anna,'15:00','17:00')]),/überschneiden/);});
 await test('even identical times on distinct work orders remain separately counted in the actual client model',async()=>{await save(ids.anna,period(ids.anna));assert.equal(await clientHours(),7);});
 console.log(JSON.stringify({passed,productionWrites:0}));
}finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
