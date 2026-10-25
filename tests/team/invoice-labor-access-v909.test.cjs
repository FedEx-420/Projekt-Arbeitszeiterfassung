/* Run the complete invoice lifecycle against the real v868 rate-table/RLS/ACL.
 * Only disposable PGlite records; never contacts the hosted project. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const dir=__dirname,base=path.join(dir,'invoice-ledger-database-v908.test.cjs');
let source=fs.readFileSync(base,'utf8');
const rates=fs.readFileSync(path.resolve(dir,'../../supabase/migrations/20261010194138_customer_labor_rates_v868.sql'),'utf8');
const start=rates.indexOf('create table public.customer_hourly_rates ('),end=rates.indexOf('revoke all on function app_private.customer_labor_price_v868(uuid,text,numeric) from public,anon,authenticated;');
assert.ok(start>=0&&end>start);
const actual=rates.slice(start,end)+'revoke all on function app_private.customer_labor_price_v868(uuid,text,numeric) from public,anon,authenticated;';
const stub="create function app_private.customer_labor_price_v868(p_customer uuid,p_name text,p_price numeric) returns numeric language sql stable set search_path='' as $$select p_price$$;";
assert.equal(source.split(stub).length,2,'fixture stub changed; review before running');
source=source.replace(stub,()=>actual);
const marker=" beforeTimes=await times();await f.actor('business');";
assert.equal(source.split(marker).length,2);
source=source.replace(marker,marker+`
 await test('original trigger-only helper ACL reproduces the reported permission error',async()=>{
  await assert.rejects(prepare([a.id,b.id]),error=>error.code==='42501'&&/customer_labor_price_v868/.test(error.message));
 });
 await test('v909 repairs one invoker routine without changing records or helper permissions',async()=>{
  await f.admin();
  const snapshot=async()=>JSON.stringify((await db.query("select 'orders' k,jsonb_agg(to_jsonb(w) order by id) r from work_orders w union all select 'entries',jsonb_agg(to_jsonb(t) order by id) from time_entries t union all select 'items',jsonb_agg(to_jsonb(i) order by id) from work_order_items i union all select 'invoices',jsonb_agg(to_jsonb(b) order by id) from invoice_batches_v908 b")).rows);
  const prior=await snapshot();
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261025000255_invoice_labor_rate_access_v909.sql'),'utf8'));
  assert.equal(await snapshot(),prior);
  const access=(await db.query("select has_function_privilege('authenticated','app_private.customer_labor_price_v868(uuid,text,numeric)','EXECUTE') auth,has_function_privilege('anon','app_private.customer_labor_price_v868(uuid,text,numeric)','EXECUTE') anon,(select prosecdef from pg_proc where oid='public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure) definer")).rows[0];
  assert.deepEqual(access,{auth:false,anon:false,definer:false});
  await f.actor('business');
 });
 await test('customer-specific zero and custom rates remain exact under RLS after the repair',async()=>{
  await f.admin();await db.query('insert into customer_hourly_rates(customer_id,monteur,meister,azubi) values($1,0,75,12)',[ids.customer]);
  await f.actor('business');const result=await prepare([a.id]);
  const labor=result.document.items.filter(line=>/stunde$/i.test(line.name));assert.ok(labor.length>0);
  for(const line of labor){if(line.name.toLowerCase()==='monteurstunde')assert.equal(Number(line.price),0);if(line.name.toLowerCase()==='meisterstunde')assert.equal(Number(line.price),75);}
  await f.actor('otherBusiness');assert.equal((await db.query('select count(*)::int n from customer_hourly_rates')).rows[0].n,0);await assert.rejects(prepare([a.id]));
  await f.admin();await db.query('delete from customer_hourly_rates where customer_id=$1',[ids.customer]);await f.actor('business');
 });
`);
const run=new Module(base,module);run.filename=base;run.paths=module.paths;run._compile(source,base);
