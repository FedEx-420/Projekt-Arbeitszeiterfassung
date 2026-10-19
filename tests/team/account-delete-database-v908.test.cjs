/* Disposable account deletion integration tests. No real auth/HR records or service calls. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture}=require('./team-db-fixture.cjs');
const uuid=number=>'20000000-0000-4000-8000-'+String(number).padStart(12,'0');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function main(){
 const f=await fixture({offers:true,units:true}),{db,ids}=f;
 await db.exec(`create role service_role bypassrls;grant usage on schema public,auth,app_private to service_role;
 alter table profiles add column vacation_allowance numeric default 30;alter table vacation_requests add column requested_days numeric default 0;
 alter function app_private.fixture_manager(uuid) set search_path=public,pg_temp;
 create function app_private.can_access_profile(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select p=auth.uid() or app_private.fixture_manager(p)$$;
 grant execute on function app_private.can_access_profile(uuid) to authenticated;
 create function app_private.bump_planning_sync_v867() returns trigger language plpgsql as $$begin if tg_op='DELETE' then return old;else return new;end if;end;$$;
 create function app_private.require_work_order_signature() returns trigger language plpgsql as $$begin return new;end;$$;
 create trigger require_signature_before_work_order_insert before insert on work_orders for each row execute function app_private.require_work_order_signature();
 create table auth.users(id uuid primary key,email text unique not null);
 insert into auth.users(id,email) select id,username||'@synthetic.test' from public.profiles;
 alter table public.profiles add constraint profiles_auth_user_fk foreign key(id) references auth.users(id) on delete cascade;
 alter table work_orders drop constraint work_orders_employee_id_fkey;
 alter table work_orders add constraint work_orders_employee_id_fkey foreign key(employee_id) references profiles(id) on delete cascade;
 alter table customers drop constraint customers_employee_id_fkey;
 alter table customers add constraint customers_employee_id_fkey foreign key(employee_id) references profiles(id) on delete cascade;
 alter table time_entries drop constraint time_entries_employee_id_fkey;
 alter table time_entries add constraint time_entries_employee_fk foreign key(employee_id) references profiles(id) on delete cascade;`);
 for(const filename of ['20261016195754_employee_workweek_v905.sql','20261017153757_business_workflow_core_v908.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',filename),'utf8'));
 await db.exec(`alter table profiles add column company_name text;alter table work_orders add column updated_at timestamptz default now();
 create function app_private.customer_labor_price_v868(p_customer uuid,p_name text,p_price numeric) returns numeric language sql stable set search_path='' as $$select p_price$$;
 update profiles set company_name='Fiktiver Testbetrieb' where role='business';`);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261017212459_invoice_ledger_v908.sql'),'utf8'));
 const migrations=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).filter(name=>/^\d+_account_deletion_atomic_v908\.sql$/.test(name));
 assert.equal(migrations.length,1,'exactly one CLI-created account_deletion_atomic_v908 migration is required');
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migrations[0]),'utf8'));
 const superuser=()=>db.exec('reset role');
 const service=async()=>{await superuser();await db.exec('set role service_role');};
 const remove=async(actor,target,kind)=>{await service();return db.query('select public.delete_account_v908($1,$2,$3) result',[actor,target,kind]);};
 const snapshot=async()=>{await superuser();return {users:(await db.query('select id,email from auth.users order by id')).rows,profiles:(await db.query('select to_jsonb(p) data from public.profiles p order by id')).rows,orders:(await db.query('select to_jsonb(w) data from public.work_orders w order by id')).rows,times:(await db.query('select to_jsonb(t) data from public.time_entries t order by id')).rows};};
 const add=async(id,name,role='employee',company=ids.business)=>{await superuser();await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@synthetic.test']);await db.query('insert into public.profiles(id,username,role,business_id,company_name) values($1,$2,$3,$4,$5)',[id,name,role,role==='business'?null:company,role==='business'?'Fiktiv '+name:null]);};
 await test('only service_role can execute the public deletion wrapper',async()=>{
  await superuser();const grants=(await db.query("select has_function_privilege('service_role','public.delete_account_v908(uuid,uuid,text)','EXECUTE') service,has_function_privilege('authenticated','public.delete_account_v908(uuid,uuid,text)','EXECUTE') app,has_function_privilege('anon','public.delete_account_v908(uuid,uuid,text)','EXECUTE') anon")).rows[0];
  assert.equal(grants.service,true);assert.equal(grants.app,false);assert.equal(grants.anon,false);
  for(const role of ['authenticated','anon']){await superuser();await db.exec('set role '+role);await assert.rejects(db.query('select public.delete_account_v908($1,$2,$3)',[ids.admin,ids.anna,'employee']));}
 });
 await test('service wrapper checks current actor, target role, company scope and never deletes the founder',async()=>{
  const before=await snapshot();for(const args of [[ids.anna,ids.max,'employee'],[ids.business,ids.felix,'employee'],[ids.business,ids.otherBusiness,'business'],[ids.admin,ids.admin,'business'],[ids.admin,ids.admin,'employee'],[uuid(999),ids.anna,'employee'],[ids.admin,ids.business,'employee'],[ids.admin,ids.anna,'business']])await assert.rejects(remove(...args));
  assert.deepEqual(await snapshot(),before);
 });
 await test('deleting an empty employee removes both identity and profile in one operation',async()=>{
  const target=uuid(10);await add(target,'empty-worker');await remove(ids.business,target,'employee');await superuser();
  assert.equal((await db.query('select count(*) n from auth.users where id=$1',[target])).rows[0].n,0);assert.equal((await db.query('select count(*) n from profiles where id=$1',[target])).rows[0].n,0);
 });
 await test('the same login name can be created again as a fresh identity after deletion',async()=>{
  const replacement=uuid(11);await add(replacement,'empty-worker');await superuser();const rows=(await db.query('select id from profiles where username=$1',['empty-worker'])).rows;assert.deepEqual(rows,[{id:replacement}]);
  await remove(ids.admin,replacement,'employee');
 });
 await test('unbilled shared-order deletion removes dependent time rows without leaving partial identities',async()=>{
  const target=uuid(12);await add(target,'unbilled-worker');await f.actor('business');const order=await f.save({...f.order,employee_id:target},[{key:uuid(13),employee_id:target,start_time:'08:00',end_time:'10:00',pause_hours:0}]);
  await remove(ids.business,target,'employee');await superuser();assert.equal((await db.query('select count(*) n from auth.users where id=$1',[target])).rows[0].n,0);assert.equal((await db.query('select count(*) n from work_orders where id=$1',[order.id])).rows[0].n,0);assert.equal((await db.query('select count(*) n from time_entries where employee_id=$1 or team_work_order_id=$2',[target,order.id])).rows[0].n,0);
 });
 let issued;
 await test('a real synthetic invoice protects both source employee and another billed team participant',async()=>{
  await f.actor('business');const order=await f.save();const prepared=(await db.query('select public.prepare_invoice_batch_v908($1,$2::jsonb) data',[ids.business,JSON.stringify([order.id])])).rows[0].data;
  const taxVm={window:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../invoice-tax-v905.js'),'utf8'),taxVm);
  const tax=taxVm.window.WorktimeInvoiceTax.calculate(prepared.document.items,{basis:'net',mode:'standard',confirmed:true}),parties={issuer:{name:'Fiktiver Testbetrieb',address:['Teststraße 1','12345 Teststadt'],taxNumber:'Fiktive Steuernummer'},customer:{name:'Fiktiver Kunde',address:['Kundenstraße 2','12345 Teststadt']}};
  issued=(await db.query('select to_jsonb(public.issue_invoice_batch_v908($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)) data',[uuid(20),ids.business,'TEST-DELETE-001','2026-10-18',JSON.stringify(prepared.selection),JSON.stringify(tax),JSON.stringify(parties)])).rows[0].data;
  const before=await snapshot();await assert.rejects(remove(ids.business,ids.anna,'employee'));assert.deepEqual(await snapshot(),before);
  await assert.rejects(remove(ids.admin,ids.max,'employee'));assert.deepEqual(await snapshot(),before);
 });
 await test('company with any issued invoice is blocked before deleting any employee',async()=>{
  const before=await snapshot();await assert.rejects(remove(ids.admin,ids.business,'business'));assert.deepEqual(await snapshot(),before);
  await superuser();assert.equal((await db.query('select invoice_number from invoice_batches_v908 where id=$1',[issued.id])).rows[0].invoice_number,'TEST-DELETE-001');
 });
 await test('an injected auth/FK failure rolls the entire multi-account company deletion back',async()=>{
  const company=uuid(30),first=uuid(31),second=uuid(32);await add(company,'rollback-company','business');await add(first,'rollback-first','employee',company);await add(second,'rollback-second','employee',company);
  await superuser();await db.exec(`create function app_private.fixture_refuse_auth_delete_v908() returns trigger language plpgsql set search_path='' as $$begin if old.id='${second}'::uuid then raise exception 'Synthetic provider failure';end if;return old;end;$$;create trigger refuse_auth_delete_v908 before delete on auth.users for each row execute function app_private.fixture_refuse_auth_delete_v908();`);
  const before=await snapshot();await assert.rejects(remove(ids.admin,company,'business'),/Synthetic provider failure/);assert.deepEqual(await snapshot(),before);
  await superuser();await db.exec('drop trigger refuse_auth_delete_v908 on auth.users;drop function app_private.fixture_refuse_auth_delete_v908();');
 });
 await test('a permitted company deletion removes all its identities atomically and not a foreign company',async()=>{
  const company=uuid(30),first=uuid(31),second=uuid(32);await remove(ids.admin,company,'business');await superuser();
  assert.equal((await db.query('select count(*) n from auth.users where id=any($1::uuid[])',[[company,first,second]])).rows[0].n,0);assert.equal((await db.query('select count(*) n from profiles where id=any($1::uuid[])',[[company,first,second]])).rows[0].n,0);assert.equal((await db.query('select count(*) n from auth.users where id=$1',[ids.otherBusiness])).rows[0].n,1);
 });
 await test('nonexistent target, invalid kind and null actor cannot trigger a broad deletion',async()=>{
  const before=await snapshot();for(const args of [[ids.admin,uuid(800),'employee'],[ids.admin,null,'business'],[null,ids.felix,'employee'],[ids.admin,ids.felix,'all'],[ids.admin,ids.felix,null]])await assert.rejects(remove(...args));assert.deepEqual(await snapshot(),before);
 });
 await db.close();console.log(passed+' account deletion database tests passed.');
}
main().catch(error=>{console.error(error);process.exit(1);});
