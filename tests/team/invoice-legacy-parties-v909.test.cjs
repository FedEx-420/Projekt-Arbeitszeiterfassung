/* Real restricted-rate fixture and full old lifecycle, then forward compatibility.
 * Disposable local PGlite only; no hosted service or business data. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const base=path.join(__dirname,'invoice-labor-access-v909.test.cjs');
let wrapper=fs.readFileSync(base,'utf8');
const marker="const run=new Module(base,module);";
assert.equal(wrapper.split(marker).length,2);
const extra=String.raw`
 let empty,emptyPreview;
 await test('old open orders with recorded team hours reproduce the missing-position failure',async()=>{
  await f.actor('business');empty=await f.save({...f.order,work_date:'2026-10-08'});
  await f.admin();await db.query('delete from work_order_items where work_order_id=$1',[empty.id]);await f.actor('business');
  await assert.rejects(prepare([empty.id]),/keine abrechenbaren Positionen/);
 });
 await test('compatibility migration preserves every record, original invoice and function ACL',async()=>{
  await f.admin();const snapshot=async()=>JSON.stringify((await db.query("select 'orders' k,jsonb_agg(to_jsonb(w) order by id) r from work_orders w union all select 'entries',jsonb_agg(to_jsonb(t) order by id) from time_entries t union all select 'items',jsonb_agg(to_jsonb(i) order by id) from work_order_items i union all select 'invoices',jsonb_agg(to_jsonb(b) order by id) from invoice_batches_v908 b union all select 'cancellations',jsonb_agg(to_jsonb(c) order by id) from invoice_cancellations_v908 c")).rows);
  const before=await snapshot(),acl=(await db.query("select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid=any(array['public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure,'app_private.invoice_parties_v908(jsonb)'::regprocedure,'public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb)'::regprocedure]) order by oid")).rows;
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261025074557_invoice_legacy_positions_and_parties_v909.sql'),'utf8'));
  assert.equal(await snapshot(),before);assert.deepEqual((await db.query("select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid=any(array['public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure,'app_private.invoice_parties_v908(jsonb)'::regprocedure,'public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb)'::regprocedure]) order by oid")).rows,acl);
  await f.actor('business');
 });
 await test('empty team order derives each employee once, with exact recorded hours and current rates',async()=>{
  const before=await times();await f.actor('business');emptyPreview=await prepare([empty.id]);
  assert.equal(emptyPreview.document.invoice_rules_version,909);assert.equal(emptyPreview.document.items.length,2);
  const anna=emptyPreview.document.items.find(i=>i.employee_id===ids.anna),max=emptyPreview.document.items.find(i=>i.employee_id===ids.max);
  assert.equal(anna.quantity,3.25);assert.equal(max.quantity,3);assert.equal(anna.name,'Monteurstunde');assert.equal(max.name,'Meisterstunde');
  for(const line of emptyPreview.document.items)assert.equal(line.derived_from_work_time,true);
  assert.equal((await db.query('select count(*)::int n from work_order_items where work_order_id=$1',[empty.id])).rows[0].n,0);
  assert.deepEqual(await times(),before);await f.actor('business');
 });
 await test('derived price snapshots catch changes and preserve explicit customer zero overrides',async()=>{
  await f.admin();await db.query('insert into customer_hourly_rates(customer_id,monteur,meister) values($1,0,81) on conflict(customer_id) do update set monteur=0,meister=81',[ids.customer]);await f.actor('business');
  await assert.rejects(issue(emptyPreview,'STALE-DERIVED',uuid(910)),/inzwischen geändert/);
  emptyPreview=await prepare([empty.id]);assert.equal(emptyPreview.document.items.find(i=>i.employee_id===ids.anna).price,0);assert.equal(emptyPreview.document.items.find(i=>i.employee_id===ids.max).price,81);
  await f.admin();await db.query('delete from customer_hourly_rates where customer_id=$1',[ids.customer]);await f.actor('business');emptyPreview=await prepare([empty.id]);
 });
 await test('missing labor prices and foreign staff fail explicitly rather than fabricating zero',async()=>{
  await f.admin();await db.query('update materials set active=false where id=$1',[ids.monteur]);await f.actor('business');await assert.rejects(prepare([empty.id]),/aktive Stundenposition/);
  await f.admin();await db.query('update materials set active=true where id=$1',[ids.monteur]);await f.actor('otherBusiness');await assert.rejects(prepare([empty.id]));await f.actor('anna');await assert.rejects(prepare([empty.id]));await f.actor('business');
 });
 await test('issuing a derived invoice freezes lines without creating items or copying hours',async()=>{
  const before=await times();await f.actor('business');emptyPreview=await prepare([empty.id]);const saved=await issue(emptyPreview,'DERIVED-001',uuid(911));
  assert.equal(saved.document.items.length,2);assert.equal(saved.document.items[0].derived_from_work_time,true);
  assert.equal((await db.query('select count(*)::int n from work_order_items where work_order_id=$1',[empty.id])).rows[0].n,0);
  assert.equal((await issue(emptyPreview,'DERIVED-001',uuid(911))).id,saved.id);
  assert.deepEqual(await times(),before);await f.actor('business');
 });
 let single,singlePreview;
 await test('a legacy single-person order with no team periods uses its existing hours',async()=>{
  await f.admin();single=(await db.query("insert into work_orders(employee_id,work_date,customer_id,customer_name,title,start_time,end_time,pause_hours,executed_hours,team_periods,signed_by,signature_data) values($1,'2026-10-09',$2,'Klostermanns Hof','Synthetischer Altauftrag','08:00','09:00',0,1,'[]','Testkunde',$3) returning id",[ids.anna,ids.customer,'data:image/png;base64,'+'A'.repeat(220)])).rows[0];await f.actor('business');
  singlePreview=await prepare([single.id]);assert.equal(singlePreview.document.items.length,1);assert.equal(singlePreview.document.items[0].quantity,1);
 });
 await test('ordinary invoices still require an identifier; a user cannot forge the omission marker',async()=>{
  const noId={...parties,issuer:{...parties.issuer,taxNumber:'',vatId:''}};
  await assert.rejects(issue(singlePreview,'NO-ID',uuid(920),taxFor(singlePreview.document),noId),/Steuernummer/);
  await assert.rejects(issue(singlePreview,'FORGED',uuid(920),taxFor(singlePreview.document),{...noId,issuer:{...noId.issuer,taxIdentifierOmitted:'small_amount_33_ustdv'}}),/Steuernummer/);
  await assert.rejects(issue(singlePreview,'STRING',uuid(920),taxFor(singlePreview.document),{...noId,smallAmountConfirmed:'true'}),/ausdrücklich/);
 });
 await test('small-invoice eligibility is enforced against verified gross and excluded tax modes',async()=>{
  const noId={...parties,issuer:{...parties.issuer,taxNumber:'',vatId:''},smallAmountConfirmed:true};
  for(const mode of ['reverse','exempt'])await assert.rejects(issue(singlePreview,'EXCLUDED',uuid(921),taxFor(singlePreview.document,mode),noId),/33 UStDV/);
  await f.admin();await db.query('insert into customer_hourly_rates(customer_id,monteur) values($1,250.01)',[ids.customer]);await f.actor('business');
  singlePreview=await prepare([single.id]);await assert.rejects(issue(singlePreview,'OVER-250',uuid(921),taxFor(singlePreview.document,'pv'),noId),/33 UStDV/);
  const forged=taxFor(singlePreview.document,'pv');forged.gross=25000;await assert.rejects(issue(singlePreview,'FORGED-TOTAL',uuid(921),forged,noId));
  await f.admin();await db.query('update customer_hourly_rates set monteur=250 where customer_id=$1',[ids.customer]);await f.actor('business');singlePreview=await prepare([single.id]);
  await assert.rejects(issue(singlePreview,'OVER-250-VAT',uuid(921),taxFor(singlePreview.document),noId),/33 UStDV/);
  const saved=await issue(singlePreview,'SMALL-250',uuid(921),taxFor(singlePreview.document,'pv'),noId);
  assert.equal(saved.document.tax.gross,25000);assert.equal(saved.document.issuer.taxNumber,'');assert.equal(saved.document.issuer.vatId,'');assert.equal(saved.document.issuer.taxIdentifierOmitted,'small_amount_33_ustdv');
  assert.equal((await issue(singlePreview,'SMALL-250',uuid(921),taxFor(singlePreview.document,'pv'),noId)).id,saved.id);
 });
 await test('zero-hour empty orders are never converted into a fabricated charge',async()=>{
  await f.admin();const zero=(await db.query("insert into work_orders(employee_id,work_date,customer_id,customer_name,title,start_time,end_time,pause_hours,executed_hours,team_periods,signed_by,signature_data) values($1,'2026-10-12',$2,'Klostermanns Hof','Synthetischer leerer Altauftrag','08:00','08:00',0,0,'[]','Testkunde',$3) returning id",[ids.anna,ids.customer,'data:image/png;base64,'+'A'.repeat(220)])).rows[0];await f.actor('business');
  await assert.rejects(prepare([zero.id]),/positive gespeicherte Arbeitszeit/);
 });
`;
wrapper=wrapper.replace(marker,()=>"source=source.replace(' await db.close();',()=>"+JSON.stringify(extra)+"+' await db.close();');\n"+marker);
const run=new Module(base,module);run.filename=base;run.paths=module.paths;run._compile(wrapper,base);
