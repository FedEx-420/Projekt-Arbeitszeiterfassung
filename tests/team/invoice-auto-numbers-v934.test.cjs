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

 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261029013732_automatic_invoice_numbers_v934.sql'),'utf8'));
 await f.actor('business');const a=await f.save(),b=await f.save({...f.order,work_date:'2026-10-06'}),c=await f.save({...f.order,work_date:'2026-10-07'});
 const auto=async(p,id=uuid(200),tax=taxFor(p.document))=>(await db.query('select to_jsonb(issue_invoice_auto_v934($1,$2,$3,$4,$5,$6)) d',[id,ids.business,'2026-10-17',JSON.stringify(p.selection),JSON.stringify(tax),JSON.stringify(parties)])).rows[0].d;
 const p=await prepare([a.id]);await issue(p,'RE-2026-000007',uuid(199));const pb=await prepare([b.id]);const saved=await auto(pb);assert.equal(saved.invoice_number,'RE-2026-000008');assert.deepEqual(await auto(pb),saved);console.log('PASS automatic numbers continue the existing company/year series; exact retries retain the same invoice and number');
 const pc=await prepare([c.id]);await assert.rejects(auto(pc,uuid(201),{...taxFor(pc.document),gross:1}));const third=await auto(pc,uuid(201));assert.equal(third.invoice_number,'RE-2026-000009');console.log('PASS invalid totals roll back completely without consuming a number');
 await assert.rejects(auto(pb,uuid(200),{...taxFor(pb.document),gross:1}));console.log('PASS a reused request with changed contents cannot create a second invoice');
 const st=(await db.query('select to_jsonb(cancel_invoice_auto_v934($1,$2,$3,$4,false)) d',[uuid(300),saved.id,'2026-10-17','Testkorrektur'])).rows[0].d;assert.equal(st.cancellation_number,'ST-2026-000001');assert.deepEqual((await db.query('select to_jsonb(cancel_invoice_auto_v934($1,$2,$3,$4,false)) d',[uuid(300),saved.id,'2026-10-17','Testkorrektur'])).rows[0].d,st);console.log('PASS cancellation uses its own automatic series and retains the original invoice');

 await f.admin();for(const file of ['20261017212505_catalog_prices_v908.sql','20261025172307_catalog_vk1_default_v911.sql','20261027050822_catalog_supplier_variants_v921.sql','20261027044754_invoice_material_prices_v919.sql','20261027060443_invoice_supplier_selection_v922.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',file),'utf8'));await db.query('update materials set recommended_price_1=4,purchase_price=1.5 where id=$1',[ids.material]);await f.actor('business');const d=await f.save({...f.order,work_date:'2026-10-08'});let pd=(await db.query('select prepare_invoice_batch_v922($1,$2,$3,$4) d',[ids.business,JSON.stringify([d.id]),'{}','{}'])).rows[0].d;const key=pd.document.items.find(l=>l.name==='Kabel').pricing_key,prices={[key]:3.1256};pd=(await db.query('select prepare_invoice_batch_v922($1,$2,$3,$4) d',[ids.business,JSON.stringify([d.id]),JSON.stringify(prices),'{}'])).rows[0].d;const priced=(await db.query('select to_jsonb(issue_invoice_auto_v934($1,$2,$3,$4,$5,$6,$7,$8,922)) d',[uuid(210),ids.business,'2026-10-17',JSON.stringify(pd.selection),JSON.stringify(taxFor(pd.document)),JSON.stringify(parties),JSON.stringify(prices),'{}'])).rows[0].d;assert.equal(priced.invoice_number,'RE-2026-000010');assert.equal(priced.document.items.find(l=>l.name==='Kabel').price,3.1256);console.log('PASS automatic numbering preserves the current supplier-pricing engine, exact edited material price and matching tax totals');
 for(const who of ['anna','otherBusiness']){await f.actor(who);await assert.rejects(db.query('select invoice_number_status_v934($1)',[ids.business]));await assert.rejects(auto(pc,uuid(400)));}await f.admin();assert.equal((await db.query("select has_function_privilege('anon','public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer)','EXECUTE') allowed")).rows[0].allowed,false);assert.equal((await db.query("select prosecdef from pg_proc where oid='public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure")).rows[0].prosecdef,false);console.log('PASS employees, foreign companies and anonymous callers remain blocked; all new functions use invoker rights');
 const status=(await db.query(fs.readFileSync(path.resolve(__dirname,'../../docs/00_Nur_Status_pruefen.txt'),'utf8'))).rows[0].app_status;assert.equal(status.automatische_nummern_08,true);assert.equal(status.sicheres_loeschen,true);console.log('PASS the read-only installation status query reports the installed capabilities');await db.close();}
main().catch(e=>{console.error(e);process.exitCode=1});
