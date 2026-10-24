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
 let a,b,c,prepared,batch,cancellation,beforeTimes;
 await test('installation preserves all legacy fields and does not fabricate an invoice',async()=>{
  const after=(await db.query('select to_jsonb(w)-array[\'invoice_reopened_from_v908\',\'invoice_reopened_at_v908\'] data from work_orders w')).rows;
  assert.deepEqual(after,before);assert.equal((await db.query('select count(*) n from invoice_batches_v908')).rows[0].n,0);
 });
 await f.actor('business');
 a=await f.save();b=await f.save({...f.order,work_date:'2026-10-06'});c=await f.save({...f.order,work_date:'2026-10-07'});
 beforeTimes=await times();await f.actor('business');
 await test('preview resolves real company, customer, people, times, materials without marking any order',async()=>{
  prepared=await prepare([a.id,b.id]);assert.equal(prepared.document.orderCount,2);assert.equal(prepared.document.company,'Fiktiver Testbetrieb');assert.equal(prepared.document.items.length,6);
  assert.equal(prepared.document.days[0].periods.length,3);assert.equal(prepared.document.days[0].periods[0].name,'anna');assert.equal(prepared.document.items[0].price>0,true);
  assert.equal(prepared.selection.length,2);assert.equal(prepared.selection[0].fingerprint.length,32);
  assert.equal((await db.query('select bool_or(invoiced) n from work_orders where id=any($1::uuid[])',[[a.id,b.id,c.id]])).rows[0].n,false);
 });
 await test('employees and another business cannot preview or issue another company invoice',async()=>{
  for(const actor of ['anna','otherBusiness']){await f.actor(actor);await assert.rejects(prepare([a.id]));await assert.rejects(issue(prepared,'WRONG'));}
  await f.actor('business');
 });
 await test('internal/nonbillable orders are rejected on the server',async()=>{
  await db.query("update work_orders set work_kind='office' where id=$1",[c.id]);await assert.rejects(prepare([c.id]),/abrechnungsfähige/);
  await db.query("update work_orders set work_kind='customer' where id=$1",[c.id]);
 });
 await test('duplicate, missing, empty, null and mixed-customer selections are rejected',async()=>{
  for(const selection of [[a.id,a.id],[uuid(999)],[],null])await assert.rejects(prepare(selection));
  const ownCustomer=uuid(800);await f.admin();await db.query('insert into customers(id,employee_id,name) values($1,$2,$3)',[ownCustomer,ids.business,'Anderer eigener Testkunde']);await f.actor('business');await f.save({...f.order,id:c.id,work_date:c.work_date,customer_id:ownCustomer});await assert.rejects(prepare([a.id,c.id]),/desselben Kunden/);await f.save({...f.order,id:c.id,work_date:c.work_date,customer_id:ids.customer});
 });
 await test('stale order or material price fingerprint prevents finalizing an outdated preview',async()=>{
  await f.admin();await db.query('update materials set unit_price=unit_price+1 where id=$1',[ids.material]);await f.actor('business');
  await assert.rejects(issue(prepared,'TEST-2026-001'),/inzwischen geändert/);prepared=await prepare([a.id,b.id]);
 });
 await test('tax manipulation, missing basis and misleading group are rejected',async()=>{
  for(const mutate of [t=>t.net++,t=>t.lines[0].gross++,t=>delete t.basis,t=>t.groups[0].rate=0]){const tax=taxFor(prepared.document);mutate(tax);await assert.rejects(issue(prepared,'TEST-BAD',uuid(400),tax));}
 });
 await test('issuing freezes exactly the selected orders, prices, VAT and identities',async()=>{
  await assert.rejects(issue(prepared,'TEST-2026-001',uuid(1),taxFor(prepared.document),null),/Aussteller/);
  await assert.rejects(issue(prepared,'TEST-2026-001',uuid(1),taxFor(prepared.document),{...parties,issuer:{...parties.issuer,taxNumber:''}}),/Steuernummer/);
  batch=await issue(prepared,'TEST-2026-001');assert.equal(batch.invoice_number,'TEST-2026-001');assert.equal(batch.document.finalized,true);
  assert.deepEqual(batch.selection,prepared.selection);assert.equal(batch.source_snapshot.orders.length,2);
  assert.equal((await db.query('select count(*) n from invoice_order_links_v908 where invoice_id=$1',[batch.id])).rows[0].n,2);
  assert.equal((await db.query('select invoiced from work_orders where id=$1',[c.id])).rows[0].invoiced,false);
 });
 await test('regular work-report item prices match the frozen invoice while quantities and work time remain unchanged',async()=>{
  const frozen=batch.source_snapshot.orders.flatMap(source=>source.items.map(line=>({source,line}))),live=(await db.query('select * from work_order_items where work_order_id=any($1::uuid[]) order by id',[[a.id,b.id]])).rows;
  assert.equal(live.length,frozen.length);
  // The normal work-report path uses i.unit_price after invoiced=true.
  // The fixture intentionally changed the catalog price without changing the old item.
  const repriced=frozen.find(({line})=>Number(line.item.unit_price)!==Number(line.resolved.price));
  assert.ok(repriced,'fixture must contain a real stale item price before finalization');
  for(const {source,line} of frozen){
   const item=live.find(row=>row.id===line.item.id);assert.ok(item);
   assert.equal(Number(item.unit_price),Number(line.resolved.price));assert.equal(item.position_name,line.resolved.name);assert.equal(item.unit,line.resolved.unit);
   assert.equal(Number(item.quantity),Number(line.item.quantity));assert.equal(item.work_order_id,source.order.id);assert.equal(item.material_id,line.item.material_id);
   const invoiceLine=batch.document.items.find(row=>row.date===source.order.work_date&&row.name===line.resolved.name&&Number(row.quantity)===Number(item.quantity));
   assert.ok(invoiceLine);assert.equal(Number(invoiceLine.price),Number(item.unit_price));
  }
  assert.equal(new Set(live.map(row=>row.id)).size,live.length,'finalization must not clone positions');
  assert.deepEqual(await times(),beforeTimes);await f.actor('business');
 });
 await test('exact retry is idempotent but changed request or reused number cannot issue twice',async()=>{
  assert.equal((await issue(prepared,'TEST-2026-001')).id,batch.id);await assert.rejects(issue(prepared,'TEST-ALTERED'));
  const other=await prepare([c.id]);await assert.rejects(issue(other,'test-2026-001',uuid(2)),/bereits verwendet/);
 });
 await test('raw inserts, overwrite and deletion of invoice or links are blocked',async()=>{
  await assert.rejects(db.query('insert into invoice_order_links_v908(invoice_id,company_id,order_id) values($1,$2,$3)',[batch.id,ids.business,c.id]),/geprüfte/);
  await assert.rejects(db.query('update invoice_batches_v908 set invoice_number=$2 where id=$1',[batch.id,'BAD']));
  await assert.rejects(db.query('delete from invoice_batches_v908 where id=$1',[batch.id]));await assert.rejects(db.query('delete from invoice_order_links_v908 where invoice_id=$1',[batch.id]));
 });
 await test('cancellation rows cannot be forged, edited, deleted or made to refer to another company',async()=>{
  await assert.rejects(db.query('insert into invoice_cancellations_v908(id,invoice_id,company_id,cancellation_number,issued_on,reason,reopen_orders,document) values($1,$2,$3,$4,$5,$6,false,$7::jsonb)',[uuid(450),batch.id,ids.business,'FORGED-STORNO','2026-10-17','Forged test cancellation',JSON.stringify(batch.document)]),/geprüfte/);
  await f.actor('otherBusiness');
  await assert.rejects(cancel(batch.id,'FOREIGN-STORNO',true,uuid(451)),/berechtigt/);
  await f.actor('business');
 });
 await test('finalized order and position edits, deletion and manual invoiced flips are blocked',async()=>{
  await assert.rejects(db.query('update work_orders set documentation=$2 where id=$1',[a.id,'Changed']));
  await assert.rejects(db.query('update work_orders set invoiced=false where id=$1',[a.id]));
  await assert.rejects(db.query('update work_orders set invoiced=true where id=$1',[c.id]));
  await assert.rejects(db.query('delete from work_order_items where work_order_id=$1',[a.id]));
  await assert.rejects(db.query('update work_order_items set quantity=quantity+1 where work_order_id=$1',[a.id]));
  await assert.rejects(db.query('insert into work_order_items(work_order_id,position_name,quantity,unit_price) values($1,$2,1,1)',[a.id,'Bad addition']));
  await assert.rejects(db.query('select public.delete_team_work_order($1)',[a.id]));
 });
 await test('later catalog and profile changes cannot mutate frozen invoice data',async()=>{
  const frozen=JSON.stringify(batch.document);await f.admin();await db.query('update materials set unit_price=unit_price+9');await db.query('update profiles set display_name=$2 where id=$1',[ids.anna,'Geänderter Testname']);await f.actor('business');
  assert.equal(JSON.stringify((await db.query('select document from invoice_batches_v908 where id=$1',[batch.id])).rows[0].document),frozen);
 });
 await test('cancel creates linked negative document without reoffering jobs or changing work time',async()=>{
  cancellation=await cancel(batch.id,'TEST-ST-001',false);assert.equal(cancellation.invoice_id,batch.id);assert.equal(cancellation.document.cancellationOf,batch.invoice_number);
  assert.equal(cancellation.document.tax.gross,-batch.document.tax.gross);assert.equal(cancellation.document.items[0].quantity,-batch.document.items[0].quantity);assert.equal(cancellation.document.items[0].price,batch.document.items[0].price);
  assert.equal((await db.query('select invoiced from work_orders where id=$1',[a.id])).rows[0].invoiced,true);await assert.rejects(prepare([a.id]));
  assert.deepEqual(await times(),beforeTimes);await f.actor('business');
 });
 await test('cancel retry is idempotent; second cancel and later change cannot cancel twice',async()=>{
  assert.equal((await cancel(batch.id,'TEST-ST-001',false)).id,cancellation.id);
  await assert.rejects(cancel(batch.id,'TEST-ST-002',true,uuid(101)),/bereits storniert/);
  assert.equal((await db.query('select count(*) n from invoice_cancellations_v908')).rows[0].n,1);
  await assert.rejects(db.query('update invoice_cancellations_v908 set reopen_orders=true where id=$1',[cancellation.id]));
  await assert.rejects(db.query('delete from invoice_cancellations_v908 where id=$1',[cancellation.id]));
 });
 await test('change cancels and reopens only exact source orders as separately marked editable jobs',async()=>{
  const next=await prepare([c.id]),invoice=await issue(next,'TEST-2026-002',uuid(2));
  const priorTimes=await times();await f.actor('business');const change=await cancel(invoice.id,'TEST-ST-002',true,uuid(102));assert.equal(change.reopen_orders,true);
  const changed=(await db.query('select * from work_orders where id=$1',[c.id])).rows[0];assert.equal(changed.invoiced,false);assert.equal(changed.invoice_reopened_from_v908,invoice.id);
  assert.equal((await db.query('select invoiced from work_orders where id=$1',[a.id])).rows[0].invoiced,true);
  await db.query('update work_orders set documentation=$2 where id=$1',[c.id,'Fiktive berichtige Dokumentation']);
  assert.deepEqual(await times(),priorTimes);await f.actor('business');const again=await prepare([c.id]);assert.equal(again.document.orderCount,1);
  const reissued=await issue(again,'TEST-2026-003',uuid(3));assert.equal(reissued.selection[0].id,c.id);
 });
 await test('RLS hides invoice originals, links and cancellations from employees, foreign businesses, anonymous',async()=>{
  for(const actor of ['anna','otherBusiness']){await f.actor(actor);for(const table of ['invoice_batches_v908','invoice_order_links_v908','invoice_cancellations_v908'])assert.equal((await db.query('select count(*) n from '+table)).rows[0].n,0);await assert.rejects(cancel(batch.id,'BAD',false,uuid(900)));}
  await f.admin();await db.exec('set role anon');await assert.rejects(db.query('select * from invoice_batches_v908'));await assert.rejects(prepare([c.id]));await f.admin();
 });
 await test('founder can view the business register without a duplicate employee identity',async()=>{
  await f.actor('admin');assert.equal((await db.query('select count(*) n from invoice_batches_v908')).rows[0].n,3);
  const self=await f.save({...f.order,employee_id:ids.business},[{key:uuid(700),employee_id:ids.business,start_time:'07:30',end_time:'08:30',pause_hours:0}]);
  assert.equal((await prepare([self.id])).document.days[0].periods[0].name,'business');
 });
 await test('all new exposed tables have RLS and no app update/delete grant',async()=>{
  await f.admin();for(const table of ['invoice_batches_v908','invoice_order_links_v908','invoice_cancellations_v908']){assert.equal((await db.query('select relrowsecurity r from pg_class where oid=$1::regclass',['public.'+table])).rows[0].r,true);assert.equal((await db.query("select has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d",['public.'+table])).rows[0].u,false);}
 });
 await db.close();console.log(passed+' invoice-ledger database tests passed.');
}
main().catch(error=>{console.error(error);process.exit(1);});
