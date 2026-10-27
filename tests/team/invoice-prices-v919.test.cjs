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
 const preview=async(idsValue,prices={})=>(await db.query('select prepare_invoice_batch_v919($1,$2,$3) d',[ids.business,JSON.stringify(idsValue),JSON.stringify(prices)])).rows[0].d;
 const finish=async(p,prices={},id=uuid(901),taxValue=taxFor(p.document))=>(await db.query('select to_jsonb(issue_invoice_batch_v919($1,$2,$3,$4,$5,$6,$7,$8)) d',[id,ids.business,'TEST-919-'+id.slice(-3),'2026-10-17',JSON.stringify(p.selection),JSON.stringify(taxValue),JSON.stringify(parties),JSON.stringify(prices)])).rows[0].d;
 await f.admin();await db.query('update materials set recommended_price_1=4,purchase_price=1.5 where id=$1',[ids.material]);await f.actor('business');
 const order=await f.save(),p=await preview([order.id]);const line=p.document.items.find(l=>l.name==='Kabel'),key=line.pricing_key;
 await test('new invoice defaults to VK star and exposes EK without changing source materials',async()=>{assert.equal(line.price,4);assert.equal(line.purchase_price,1.5);assert.equal(line.standard_net_price,4);assert.equal(line.price_editable,true);assert.equal(p.document.invoice_pricing_version,919);assert.equal(Number((await db.query('select unit_price from materials where id=$1',[ids.material])).rows[0].unit_price),2);});
 const custom=await preview([order.id],{[key]:3.1256});
 await test('one edited net price is reflected in invoice items, day items and source snapshot',async()=>{assert.equal(custom.document.items.find(l=>l.pricing_key===key).price,3.1256);assert.equal(custom.document.days[0].items.find(l=>l.pricing_key===key).price,3.1256);assert.equal(custom.source_snapshot.orders[0].items.find(l=>l.resolved.pricing_key===key).resolved.price,3.1256);assert.deepEqual(custom.selection,p.selection);});
 await test('invalid and unknown line prices and labor changes are rejected',async()=>{for(const value of [-1,1000001,1.12345,'2'])await assert.rejects(preview([order.id],{[key]:value}));await assert.rejects(preview([order.id],{unknown:2}));const labor=p.document.items.find(l=>!l.price_editable);await assert.rejects(preview([order.id],{[labor.pricing_key]:2}));});
 await test('employees, other companies and anonymous callers cannot use invoice pricing',async()=>{for(const role of ['anna','otherBusiness']){await f.actor(role);await assert.rejects(preview([order.id]));}await f.admin();await db.exec('set role anon');await assert.rejects(preview([order.id]));await f.actor('business');});
 const beforeHours=await times();await f.actor('business');
 await test('server rejects tax amounts computed from the old price',async()=>{await assert.rejects(finish(custom,{[key]:3.1256},uuid(902),taxFor(p.document)));});
 let saved;
 await test('finalization freezes the reviewed price, preserves EK/catalog and records exactly the same hours',async()=>{saved=await finish(custom,{[key]:3.1256});assert.equal(saved.document.items.find(l=>l.pricing_key===key).price,3.1256);assert.equal(Number((await db.query('select unit_price from work_order_items where work_order_id=$1 and material_id=$2',[order.id,ids.material])).rows[0].unit_price),3.1256);assert.equal(Number((await db.query('select unit_price from materials where id=$1',[ids.material])).rows[0].unit_price),2);assert.deepEqual(await times(),beforeHours);await f.actor('business');});
 await test('an exact retry returns the existing invoice, but changed price payload is refused',async()=>{assert.equal((await finish(custom,{[key]:3.1256})).id,saved.id);await assert.rejects(finish(custom,{[key]:3.1257}),/anderen Materialpreisen/);assert.equal((await db.query('select count(*)::int n from invoice_batches_v908')).rows[0].n,1);});
 await test('old invoice preparation endpoint still retains its existing standard-price behavior',async()=>{const another=await f.save({...f.order,work_date:'2026-10-06'});assert.equal((await prepare([another.id])).document.items.find(l=>l.name==='Kabel').price,2);});
 console.log(JSON.stringify({passed,productionWrites:0}));await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
