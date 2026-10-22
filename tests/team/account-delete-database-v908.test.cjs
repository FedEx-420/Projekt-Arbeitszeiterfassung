/* User-approved suspension tests. Disposable database; no real identities. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./team-db-fixture.cjs');
async function main(){
 const f=await fixture({legacyRecords:true,offers:true,units:true}),{db,ids}=f;let passed=0;
 const test=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
 const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261018074557_account_deletion_atomic_v908.sql'),'utf8');
 const owner=()=>db.exec('reset role');
 const snapshot=async()=>{await owner();const tables=(await db.query("select n.nspname s,c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','app_private','storage') and c.relkind='r' order by 1,2")).rows,out={};for(const row of tables){const name='"'+row.s.replaceAll('"','""')+'"."'+row.t.replaceAll('"','""')+'"';out[row.s+'.'+row.t]=(await db.query('select to_jsonb(r) data from '+name+' r order by to_jsonb(r)::text')).rows;}return out;};
 const remove=async(actor,target,kind,role='service_role')=>{await owner();await db.exec('set role '+role);return db.query('select public.delete_account_v908($1,$2,$3)',[actor,target,kind]);};
 const paused=error=>error.code==='55000'&&/vorübergehend pausiert/.test(error.message)&&/weiterhin verwendet/.test(error.message);
 try{
  await db.exec(`create role service_role bypassrls;grant usage on schema public,auth,app_private,storage to service_role;
   create table auth.users(id uuid primary key,email text unique not null);
   insert into auth.users select id,username||'@synthetic.test' from profiles;
   alter table profiles add constraint profile_identity foreign key(id) references auth.users(id) on delete cascade;
   create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade);
   insert into auth.sessions(user_id) select id from auth.users;
   alter table storage.objects add column owner uuid;alter table storage.objects add column owner_id text;
   insert into storage.objects(bucket_id,name,owner,owner_id) values('work-order-documents','${ids.anna}/synthetic.pdf','${ids.anna}','${ids.anna}');
   select set_config('request.jwt.claim.sub','${ids.admin}',false);
   insert into appointments(employee_id,event_date,team_employee_ids) values('${ids.max}','2026-10-22',array['${ids.anna}']::uuid[]);
   insert into mailbox_messages(recipient_id,sender_id,message_type,title) values('${ids.anna}','${ids.business}','direct','Synthetic preserved message');`);
  await f.save();
  const before=await snapshot();
  await db.exec(migration);
  await test('Installing the suspension changes no existing table rows or identities',async()=>assert.deepEqual(await snapshot(),before));
  await test('No latent destructive private implementation is installed',async()=>{
   await owner();assert.equal((await db.query("select to_regprocedure('app_private.delete_account_v908(uuid,uuid,text)') p")).rows[0].p,null);
   assert.doesNotMatch(migration,/\bdelete\s+from\b|\bupdate\s+public\.|security\s+definer|create\s+function\s+app_private\./i);
  });
  await test('Public stub is invoker, empty-search-path and service-only',async()=>{
   await owner();const r=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('service_role',p.oid,'execute') service,has_function_privilege('authenticated',p.oid,'execute') app,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p where p.oid='public.delete_account_v908(uuid,uuid,text)'::regprocedure")).rows[0];assert.equal(r.prosecdef,false);assert.ok(r.proconfig.includes('search_path=""'));assert.equal(r.service,true);assert.equal(r.app,false);assert.equal(r.anon,false);
  });
  await test('Authenticated and anonymous callers cannot execute the suspension RPC',async()=>{
   for(const role of ['authenticated','anon'])await assert.rejects(remove(ids.admin,ids.anna,'employee',role),e=>e.code==='42501');assert.deepEqual(await snapshot(),before);
  });
  await test('All privileged employee and business delete attempts fail without changing data',async()=>{
   for(const actor of [ids.admin,ids.business,ids.anna])for(const target of [ids.admin,ids.business,ids.otherBusiness,ids.anna,ids.max,ids.felix])for(const kind of ['employee','business'])await assert.rejects(remove(actor,target,kind),paused);
   assert.deepEqual(await snapshot(),before);
  });
  await test('Malformed, null and missing-target arguments do not bypass the suspension',async()=>{
   for(const args of [[null,null,null],[ids.admin,null,'business'],[ids.admin,'99999999-0000-4000-8000-000000000001','employee'],[ids.admin,ids.anna,'all'],[ids.admin,ids.anna,''],[null,ids.anna,'employee']])await assert.rejects(remove(...args),paused);assert.deepEqual(await snapshot(),before);
  });
  await test('A database-owner call and client-supplied feature flags cannot enable deletion',async()=>{
   await owner();await db.exec("select set_config('app.account_deletion_v908_enabled','yes',false)");
   await assert.rejects(db.query('select public.delete_account_v908($1,$2,$3)',[ids.admin,ids.business,'business']),paused);
   await assert.rejects(remove(ids.business,ids.anna,'employee'),paused);assert.deepEqual(await snapshot(),before);
  });
  await test('Repeated suspended calls preserve shared customers, files, planning, mail and sessions',async()=>{
   for(let i=0;i<3;i++)await assert.rejects(remove(ids.admin,ids.anna,'employee'),paused);
   const after=await snapshot();assert.deepEqual(after,before);for(const table of ['auth.users','auth.sessions','public.customers','public.work_orders','public.time_entries','public.appointments','storage.objects','public.mailbox_messages'])assert.ok(after[table].length,table+' must contain preserved test rows');
  });
  console.log(JSON.stringify({passed,productionWrites:0,scope:'suspended deletion; no successful harddelete capability claimed'}));
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
