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
 await f.admin();await db.query("update materials set recommended_price_1=4,purchase_price=1.5,catalog_gtin='04006381333931',catalog_product_name='Kabel' where id=$1",[ids.material]);await f.actor('business');
 const payload={name:'Kabel anderer Händler',article_number:'0009',unit:'Stk',gtin:'4006381333931',purchase_price:2.5,recommended_price_1:6,expected_id:null,expected_revision:null};
 await db.query('select import_material_catalog_v921($1,$2,$3,true,true)',[ids.business,'Händler B',JSON.stringify([payload])]);
 const supplier=(await db.query("select * from materials where catalog_supplier='Händler B'")).rows[0];
 const order=await f.save(),original=await preview([order.id]),line=original.document.items.find(l=>l.name==='Kabel'),key=line.pricing_key;
 await test('invoice lists supplier offers with separate purchase and selling prices',async()=>{assert.equal(line.supplier_options.length,2);assert.equal(line.price,4);assert.equal(line.supplier_options.find(s=>s.id===supplier.id).purchase_price,2.5);});
 const sources={[key]:supplier.id},selected=await preview([order.id],{},sources);
 await test('supplier selection uses that suppliers VK star and canonical customer name',async()=>{const l=selected.document.items.find(l=>l.pricing_key===key);assert.equal(l.price,6);assert.equal(l.purchase_price,2.5);assert.equal(l.name,'Kabel anderer Händler');assert.equal(l.supplier,'Händler B');assert.notDeepEqual(selected.selection,original.selection);});
 await test('unknown sources, unrelated materials and labor source changes fail',async()=>{await assert.rejects(preview([order.id],{}, {unknown:supplier.id}));await assert.rejects(preview([order.id],{}, {[key]:uuid(99999)}));const labor=original.document.items.find(l=>!l.price_editable);await assert.rejects(preview([order.id],{}, {[labor.pricing_key]:supplier.id}));});
 const custom=await preview([order.id],{[key]:7.1256},sources);
 let saved;
 await test('issued invoice freezes supplier, EK and edited net price without changing catalog or hours',async()=>{const before=(await db.query('select * from time_entries order by id')).rows;saved=await finish(custom,{[key]:7.1256},sources);const l=saved.document.items.find(l=>l.pricing_key===key);assert.equal(l.price,7.1256);assert.equal(l.supplier_material_id,supplier.id);assert.equal(l.purchase_price,2.5);assert.equal(Number((await db.query('select unit_price from materials where id=$1',[supplier.id])).rows[0].unit_price),6);assert.deepEqual((await db.query('select * from time_entries order by id')).rows,before);});
 await test('exact retry returns the same invoice and different supplier payload fails',async()=>{assert.equal((await finish(custom,{[key]:7.1256},sources)).id,saved.id);await assert.rejects(finish(custom,{[key]:7.1256},{}),/Händlerauswahl/);});
 console.log(JSON.stringify({passed,productionWrites:0}));await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
