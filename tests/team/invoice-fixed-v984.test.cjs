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
 const fixed={description:'Fiktive Elektroinstallation zum Festpreis',price:1234.56};
 const prepareFixed=async(orderIds,config=fixed)=>(await db.query('select prepare_invoice_fixed_v984($1,$2,$3) d',[ids.business,JSON.stringify(orderIds),JSON.stringify(config)])).rows[0].d;
 const finishFixed=async(p,config=fixed,id=uuid(984),tax=taxFor(p.document))=>(await db.query('select to_jsonb(issue_invoice_fixed_auto_v984($1,$2,$3,$4,$5,$6,$7)) d',[id,ids.business,'2026-10-17',JSON.stringify(p.selection),JSON.stringify(tax),JSON.stringify(parties),JSON.stringify(config)])).rows[0].d;
 await f.actor('business');const order=await f.save(),p=await prepareFixed([order.id]);
 await test('fixed preview replaces public line prices, keeps internal sources and writes nothing',async()=>{
  assert.equal(p.document.items.length,1);assert.equal(p.document.items[0].price,1234.56);assert.equal(p.document.items[0].quantity,1);assert.equal(p.document.invoice_fixed_version,984);assert.equal(p.document.days.length,0);assert.ok(p.source_snapshot.orders[0].items.length>0);
  assert.equal((await db.query('select count(*) n from invoice_batches_v908')).rows[0].n,0);
 });
 await test('blank descriptions, negative prices and sub-cent prices are rejected',async()=>{
  for(const config of [{...fixed,price:-1},{...fixed,price:1.001},{...fixed,description:''},{...fixed,price:'100'},{...fixed,extra:true}])await assert.rejects(prepareFixed([order.id],config));
 });
 await test('tampered tax cannot issue the invoice',async()=>{const tax=taxFor(p.document);tax.gross++;await assert.rejects(finishFixed(p,fixed,uuid(983),tax));});
 await test('changing the fixed price changes the reviewed revision',async()=>{assert.notDeepEqual((await prepareFixed([order.id],{...fixed,price:100})).selection,p.selection);});
 await test('valid gross-basis tax is refused because the fixed price is explicitly net',async()=>{const tax=JSON.parse(JSON.stringify(taxVm.window.WorktimeInvoiceTax.calculate(p.document.items,{basis:'gross',mode:'standard',confirmed:true})));await assert.rejects(finishFixed(p,fixed,uuid(982),tax),/netto/);});
 const timesBefore=(await db.query('select * from time_entries order by id')).rows;let saved;
 await test('fixed invoice freezes total and auto number, locks orders and preserves hours',async()=>{
  saved=await finishFixed(p);assert.equal(saved.document.tax.net,123456);assert.equal(saved.document.tax.gross,146913);assert.equal(saved.invoice_number,'RE-2026-000001');assert.deepEqual(saved.source_snapshot.invoice_fixed_v984,fixed);
  assert.deepEqual((await db.query('select * from time_entries order by id')).rows,timesBefore);assert.equal((await db.query('select invoiced from work_orders where id=$1',[order.id])).rows[0].invoiced,true);
 });
 await test('retry returns exact original, changed fixed price or description is refused',async()=>{
  assert.equal((await finishFixed(p)).id,saved.id);await assert.rejects(finishFixed(p,{...fixed,price:10}),/Festpreis/);await assert.rejects(finishFixed(p,{...fixed,description:'Anderer Text'}),/Festpreis/);
 });
 await test('employee and foreign company cannot prepare fixed invoices',async()=>{await f.actor('anna');await assert.rejects(prepareFixed([order.id]));await f.actor('otherBusiness');await assert.rejects(prepareFixed([order.id]));});
 await f.actor('business');
 await test('cancellation reverses the fixed amount without changing original document',async()=>{
  const c=await cancel(saved.id,'FIXED-STORNO',true);assert.equal(c.document.tax.gross,-saved.document.tax.gross);assert.equal(c.document.invoice_fixed_version,984);assert.deepEqual((await db.query('select document from invoice_batches_v908 where id=$1',[saved.id])).rows[0].document,saved.document);
 });
 console.log(JSON.stringify({passed,productionWrites:0}));await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
