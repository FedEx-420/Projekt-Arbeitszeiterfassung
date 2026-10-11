// Disposable database; synthetic people, keys and locations only.
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./team-db-fixture.cjs');
const migration='20261011023813_iphone_shortcut_arrivals_v870.sql';
async function iphoneFixture(){
 const f=await fixture({legacyRecords:true,offers:true,units:true,catalog:true});
 await f.db.exec("create role service_role bypassrls; grant usage on schema public,auth,app_private to service_role; create or replace function pg_catalog.now() returns timestamptz language sql stable as $$select coalesce(nullif(current_setting('worktime.test_now',true),''),'2026-10-13T08:00:00Z')::timestamptz$$");
 for(const name of ['20261008211721_device_features_v863.sql','20261009100224_appointment_reminders_v865.sql','20261009101042_arrival_timers_v865.sql','20261010095629_admin_device_work_context_v866.sql','20261010190525_planning_sync_v867.sql','20261010214321_customer_address_geocoding_v869.sql'])await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8'));
 await f.db.query('insert into customer_locations(customer_id,business_id,latitude,longitude) values($1,$2,51.5,7),($3,$4,52,8)',[f.ids.customer,f.ids.business,f.ids.otherCustomer,f.ids.otherBusiness]);
 const snapshot=async()=>JSON.stringify((await f.db.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(t) order by id) from profiles t),'customers',(select jsonb_agg(to_jsonb(t) order by id) from customers t),'orders',(select jsonb_agg(to_jsonb(t) order by id) from work_orders t),'times',(select jsonb_agg(to_jsonb(t) order by id) from time_entries t),'locations',(select jsonb_agg(to_jsonb(t) order by customer_id) from customer_locations t)) data")).rows[0].data);
 const before=await snapshot();await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8'));
 const plan=async(who='anna',date='2026-10-13',status='confirmed',customer=f.ids.customer,team=[])=>{await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[who==='felix'?f.ids.otherBusiness:f.ids.business]);return (await f.db.query("insert into appointments(employee_id,event_date,customer_id,title,notes,team_employee_ids) values($1,$2,$3,'Synthetic plan',$4,$5) returning id",[f.ids[who],date,customer,'ZE-PLAN-1:'+JSON.stringify({status,start:'10:00'}),team])).rows[0].id;};
 const service=()=>f.db.exec('reset role;set role service_role');
 return {...f,snapshot,before,plan,service};
}
module.exports={iphoneFixture,migration};
