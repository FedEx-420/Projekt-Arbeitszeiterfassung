/* Disposable PGlite tests. No production service, invoice or real person is used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture}=require('./team-db-fixture.cjs');
const uuid=number=>'10000000-0000-4000-8000-'+String(number).padStart(12,'0');
let passed=0;
function test(name,fn){return Promise.resolve().then(fn).then(()=>{passed++;console.log('PASS '+name);});}
async function main(){
 const f=await fixture({legacyRecords:true,offers:true,units:true}),{db,ids}=f;
 await db.exec(`create role service_role bypassrls;grant usage on schema app_private to service_role;alter table profiles add column vacation_allowance numeric default 30;alter table vacation_requests add column requested_days numeric default 0;
 alter function app_private.fixture_manager(uuid) set search_path=public,pg_temp;
 create function app_private.can_access_profile(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select p=auth.uid() or app_private.fixture_manager(p)$$;
 grant execute on function app_private.can_access_profile(uuid) to authenticated;
 create function app_private.bump_planning_sync_v867() returns trigger language plpgsql as $$begin if tg_op='DELETE' then return old;else return new;end if;end;$$;
 create function app_private.require_work_order_signature() returns trigger language plpgsql as $$begin return new;end;$$;
 create trigger require_signature_before_work_order_insert before insert on work_orders for each row execute function app_private.require_work_order_signature();`);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261016195754_employee_workweek_v905.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261017153757_business_workflow_core_v908.sql'),'utf8'));
 await db.exec(`alter table profiles add column company_name text;alter table work_orders add column updated_at timestamptz default now();
  create or replace function app_private.fixture_manager(p_person uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from profiles actor where actor.id=auth.uid() and (actor.role='administrator' or (actor.role='business' and exists(select 1 from profiles p where p.id=p_person and (p.business_id=actor.id or p.id=actor.id)))))$$;
  create function app_private.customer_labor_price_v868(p_customer uuid,p_name text,p_price numeric) returns numeric language sql stable set search_path='' as $$select p_price$$;
  update profiles set company_name='Fiktiver Testbetrieb' where role='business';
  update work_orders set invoiced=true where id='${ids.order}';`);
 const before=(await db.query('select to_jsonb(w) data from work_orders w')).rows;
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261017212459_invoice_ledger_v908.sql'),'utf8'));
 const taxVm={window:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../invoice-tax-v905.js'),'utf8'),taxVm);
 const taxFor=(d,mode='standard')=>JSON.parse(JSON.stringify(taxVm.window.WorktimeInvoiceTax.calculate(d.items,{basis:'net',mode,confirmed:true,reasons:mode==='standard'?{}:{[mode]:'Fiktiver dokumentierter Testnachweis'}})));
 const prepare=async orderIds=>(await db.query('select public.prepare_invoice_batch_v908($1,$2::jsonb) data',[ids.business,JSON.stringify(orderIds)])).rows[0].data;
 const parties={issuer:{name:'Fiktiver Testbetrieb',address:['Teststraße 1','12345 Teststadt'],taxNumber:'Test-Nummer 123'},customer:{name:'Fiktiver Kunde',address:['Kundenstraße 2','12345 Teststadt']}};
 const issue=async (prepared,number,id=uuid(1),tax=taxFor(prepared.document),partiesValue=parties)=>(await db.query('select to_jsonb(public.issue_invoice_batch_v908($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)) data',[id,ids.business,number,'2026-10-17',JSON.stringify(prepared.selection),JSON.stringify(tax),JSON.stringify(partiesValue)])).rows[0].data;
 const cancel=async(invoice,number,reopen,id=uuid(100),reason='Fiktive Korrektur')=>(await db.query('select to_jsonb(public.cancel_invoice_batch_v908($1,$2,$3,$4,$5,$6)) data',[id,invoice,number,'2026-10-17',reason,reopen])).rows[0].data;
 const times=async()=>{await f.admin();return (await db.query('select to_jsonb(t) data from time_entries t order by id')).rows;};

 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261017212505_catalog_prices_v908.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261027044754_invoice_material_prices_v919.sql'),'utf8'));

 for(const file of ['20261025172307_catalog_vk1_default_v911.sql','20261027050822_catalog_supplier_variants_v921.sql','20261027060443_invoice_supplier_selection_v922.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',file),'utf8'));
 const preview=async(orderIds,prices={},sources={})=>(await db.query('select prepare_invoice_batch_v922($1,$2,$3,$4) d',[ids.business,JSON.stringify(orderIds),JSON.stringify(prices),JSON.stringify(sources)])).rows[0].d;
 const finish=async(p,prices={},sources={},id=uuid(921))=>(await db.query('select to_jsonb(issue_invoice_batch_v922($1,$2,$3,$4,$5,$6,$7,$8,$9)) d',[id,ids.business,'TEST-922-'+id.slice(-3),'2026-10-17',JSON.stringify(p.selection),JSON.stringify(taxFor(p.document)),JSON.stringify(parties),JSON.stringify(prices),JSON.stringify(sources)])).rows[0].d;

 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261029013732_automatic_invoice_numbers_v934.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261104235149_invoice_fixed_price_v984.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261105000441_invoice_fixed_net_basis_v984.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261105174500_fixed_invoice_article_list.sql'),'utf8'));
 const fixed={description:'Fiktive Elektroinstallation zum Festpreis',price:1234.56};
 const prepareFixed=async(orderIds,config=fixed)=>(await db.query('select prepare_invoice_fixed_v984($1,$2,$3) d',[ids.business,JSON.stringify(orderIds),JSON.stringify(config)])).rows[0].d;
 const finishFixed=async(p,config=fixed,id=uuid(984),tax=taxFor(p.document))=>(await db.query('select to_jsonb(issue_invoice_fixed_auto_v984($1,$2,$3,$4,$5,$6,$7)) d',[id,ids.business,'2026-10-17',JSON.stringify(p.selection),JSON.stringify(tax),JSON.stringify(parties),JSON.stringify(config)])).rows[0].d;
 await f.actor('business');const order=await f.save(),p=await prepareFixed([order.id]);

 await f.admin();
 await db.exec(`create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);insert into auth.users(id) select id from profiles;alter table profiles add column if not exists company_logo_path text;alter table customers add column if not exists updated_at timestamptz default now();create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table company_legal_info_v900(company_id uuid primary key,details jsonb);grant usage on schema storage to service_role;`);
 const migration=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).find(n=>n.endsWith('_klarwerk_bridge_v1007.sql'));
 await db.exec(fs.readFileSync(migration?path.resolve(__dirname,'../../supabase/migrations',migration):path.resolve(__dirname,'../../../klarwerk-bridge.sql'),'utf8'));
 const manage=async(actor,company,op,body={})=>(await db.query('select klarwerk_manage_v1007($1,$2,$3,$4) d',[actor,company,op,JSON.stringify(body)])).rows[0].d;
 const dispatch=async(hash,op,body={})=>(await db.query('select klarwerk_dispatch_v1007($1,$2,$3) d',[hash,op,JSON.stringify(body)])).rows[0].d;
 const H='a'.repeat(64),T='b'.repeat(64),U='c'.repeat(64);
 await test('employees and other businesses cannot grant a connection',async()=>{await assert.rejects(manage(ids.anna,ids.business,'pair',{pair_hash:H}));await assert.rejects(manage(ids.business,ids.otherBusiness,'pair',{pair_hash:H}));});
 const link=await manage(ids.business,ids.business,'pair',{pair_hash:H,label:'Synthetic Klarwerk'});
 await test('one-use exchange and current-authority checks',async()=>{const c=await dispatch(H,'exchange',{token_hash:T,account_label:'Synthetic A'});assert.equal(c.company.id,ids.business);await assert.rejects(dispatch(H,'exchange',{token_hash:U}));await assert.rejects(dispatch(U,'company'));});
 await test('company data stays scoped even when payload requests another company',async()=>{const company=await dispatch(T,'company',{company:ids.otherBusiness});assert.equal(company.company.id,ids.business);const customers=await dispatch(T,'list',{entity:'customers'});assert.ok(customers.every(x=>x.id!==ids.otherCustomer));const orders=await dispatch(T,'list',{entity:'orders'});assert.ok(orders.some(x=>x.id===order.id));});
 let prepared=await dispatch(T,'rpc',{name:'prepare_invoice_batch_v922',args:{p_company:ids.otherBusiness,p_order_ids:[order.id],p_prices:{},p_sources:{}}});
 const args={p_id:uuid(1007),p_company:ids.otherBusiness,p_issued:'2026-10-17',p_selection:prepared.selection,p_tax:taxFor(prepared.document),p_parties:parties,p_prices:{},p_sources:{},p_engine:922};let saved;
 await test('native finalization keeps source prices, numbering and invoice locks, with exact retries',async()=>{saved=await dispatch(T,'rpc',{name:'issue_invoice_auto_v934',args});assert.equal(saved.company_id,ids.business);assert.equal((await dispatch(T,'rpc',{name:'issue_invoice_auto_v934',args})).id,saved.id);await assert.rejects(dispatch(T,'rpc',{name:'issue_invoice_auto_v934',args:{...args,p_id:uuid(1008)}}));assert.equal((await db.query('select invoiced from work_orders where id=$1',[order.id])).rows[0].invoiced,true);});
 await test('employee receipt keeps its owner and company and is unreadable before original upload',async()=>{const r=await manage(ids.anna,ids.business,'receipt-create',{id:uuid(1100),supplier:'Synthetic Supplier',date:'2026-11-08',extension:'pdf',mime:'application/pdf',name:'invoice.pdf'});await assert.rejects(manage(ids.anna,ids.business,'receipt-complete',{id:r.id}));await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['purchase-receipts-v1007',r.path]);await manage(ids.anna,ids.business,'receipt-complete',{id:r.id});assert.equal((await dispatch(T,'receipt-file',{id:r.id})).path,r.path);const other=await manage(ids.felix,ids.otherBusiness,'receipt-create',{id:uuid(1101),supplier:'Other Supplier',date:'2026-11-08',extension:'pdf',mime:'application/pdf',name:'other.pdf'});await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['purchase-receipts-v1007',other.path]);await manage(ids.felix,ids.otherBusiness,'receipt-complete',{id:other.id});await assert.rejects(dispatch(T,'receipt-file',{id:other.id}));assert.equal((await dispatch(T,'list',{entity:'receipts'})).length,1);});
 await test('RPC is not callable with ordinary user credentials and role changes revoke existing access',async()=>{await f.actor('anna');await assert.rejects(dispatch(T,'company'));await f.admin();await db.query("update profiles set role='employee' where id=$1",[ids.business]);await assert.rejects(dispatch(T,'company'));await db.query("update profiles set role='business' where id=$1",[ids.business]);});
 await test('revocation immediately blocks reads and writes',async()=>{await manage(ids.business,ids.business,'revoke',{id:link.id});await assert.rejects(dispatch(T,'company'));await assert.rejects(dispatch(T,'rpc',{name:'issue_invoice_auto_v934',args}));});
 console.log(JSON.stringify({passed,productionWrites:0}));await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1});
