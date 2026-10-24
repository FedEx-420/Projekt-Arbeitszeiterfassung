/* Integrated disposable PostgreSQL smoke. Never connects to the live service.
 * The base fixture runs real v853/v854/v857/v860/v861/v862 migrations. Missing
 * legacy branding/access/sync signatures are declared explicitly below, as in
 * the focused tests. Customer-specific v868 labor pricing is NOT simulated:
 * its stub returns the default and this test does not claim override coverage.
 */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { fixture } = require('./team-db-fixture.cjs');
const migrationDir = path.resolve(__dirname, '../../supabase/migrations');
const migrations = ['20261017153757_business_workflow_core_v908.sql', '20261017155136_categorized_mailbox_v908.sql', '20261017212459_invoice_ledger_v908.sql', '20261017212505_catalog_prices_v908.sql', '20261017212517_offer_composition_v908.sql'];
const uuid = n => '97000000-0000-4000-8000-' + String(n).padStart(12, '0');
async function main() {
 const f = await fixture({ legacyRecords: true, offers: true, units: true, catalog: true }), { db, ids, actor, admin } = f;
 let passed = 0; const test = async (name, action) => { await action(); passed++; console.log('PASS ' + name); };
 try {
  await db.exec(`
   create role service_role bypassrls;
   grant usage on schema public,auth,app_private,storage to service_role;
   alter function app_private.fixture_manager(uuid) set search_path=public,pg_temp;
   alter table profiles add column vacation_allowance numeric default 30,add column company_name text;
   alter table vacation_requests add column requested_days numeric default 0;
   alter table work_orders add column updated_at timestamptz default now();
   alter table storage.objects add column metadata jsonb;
   create function app_private.can_access_profile(p uuid) returns boolean language sql stable security definer set search_path='' as $$select p=auth.uid() or app_private.fixture_manager(p)$$;
   create function app_private.is_administrator() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='administrator')$$;
   grant execute on function app_private.can_access_profile(uuid),app_private.is_administrator() to authenticated;
   grant execute on function app_private.team_company(uuid) to service_role;
   create function app_private.bump_planning_sync_v867() returns trigger language plpgsql as $$begin if tg_op='DELETE' then return old;else return new;end if;end;$$;
   create function app_private.require_work_order_signature() returns trigger language plpgsql as $$begin return new;end;$$;
   create trigger require_signature_before_work_order_insert before insert on work_orders for each row execute function app_private.require_work_order_signature();
   create function app_private.customer_labor_price_v868(p_customer uuid,p_name text,p_price numeric) returns numeric language sql stable set search_path='' as $$select p_price$$;
   create policy mailbox_admin_integration on mailbox_messages for all to authenticated using(app_private.is_administrator()) with check(app_private.is_administrator());
   create policy mailbox_recipient_integration on mailbox_messages for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
   create table public.mailbox_attachments(id uuid primary key default gen_random_uuid(),message_id uuid not null references mailbox_messages(id) on delete cascade,file_path text unique not null,file_name text not null,mime_type text,file_size bigint);
   alter table public.mailbox_attachments enable row level security;
   create policy integration_attachment_read on mailbox_attachments for select to authenticated using(exists(select 1 from public.mailbox_messages m where m.id=message_id));
   grant select on public.mailbox_attachments to authenticated;
   grant all on all tables in schema public,storage to service_role;
   update profiles set company_name='Synthetischer Integrationsbetrieb' where role='business';
  `);
  await db.exec(fs.readFileSync(path.join(migrationDir, '20261016195754_employee_workweek_v905.sql'), 'utf8'));
  const history = async () => { await admin(); return (await db.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),'orders',(select jsonb_agg(to_jsonb(w) order by id) from work_orders w),'times',(select jsonb_agg(to_jsonb(t) order by id) from time_entries t),'items',(select jsonb_agg(to_jsonb(i) order by id) from work_order_items i)) d")).rows[0].d; };
  const before = await history();
  await test('All five v908 migrations install in intended order without signature/trigger collisions', async () => { for (const name of migrations) await db.exec(fs.readFileSync(path.join(migrationDir, name), 'utf8')); });
  await test('Combined install preserves preexisting people, hours and work contents', async () => {
   const after = await history(); assert.deepEqual(after.profiles, before.profiles); assert.deepEqual(after.times, before.times); assert.deepEqual(after.items, before.items);
   assert.deepEqual(after.orders.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !['work_kind', 'invoice_reopened_from_v908', 'invoice_reopened_at_v908'].includes(key)))), before.orders);
  });
  await actor('business');
  await test('Business appears once as worker while staff remain company-specific', async () => { const rows = (await db.query('select * from work_order_team_roster($1)', [ids.business])).rows; assert.equal(rows.filter(p => p.id === ids.business).length, 1); assert.ok(rows.some(p => p.id === ids.anna)); assert.ok(!rows.some(p => p.id === ids.felix)); });
  const day = (await db.query("select (now() at time zone 'Europe/Berlin')::date::text d")).rows[0].d;
  await test('Time-rule and school-rule routines coexist with employee access boundaries', async () => {
   await db.query('select save_worker_rule_v908($1,$2,$3,0,$4,false)', [ids.business, 'time', day, [0, 0, 0, 0, 0, 0, 0]]);
   await admin(); await db.query("update profiles set labor_type='azubi' where id=$1", [ids.anna]); await actor('business');
   await db.query('select save_worker_rule_v908($1,$2,$3,0,$4,true)', [ids.anna, 'school', day, [8, 8, 8, 8, 8, 0, 0]]);
   await actor('anna'); assert.equal((await db.query('select * from worker_school_rules_v908')).rows.length, 1); await assert.rejects(() => db.query('select save_worker_rule_v908($1,$2,$3,0,$4,true)', [ids.anna, 'time', day, [1, 1, 1, 1, 1, 0, 0]])); await actor('business');
  });
  await test('Empty time arrays cannot bypass NULL aggregate validation', async () => {
   await assert.rejects(() => db.query('select save_worker_rule_v908($1,$2,$3,0,$4,true)', [ids.max, 'time', day, []]), /sieben Stundenwerte/);
   assert.equal((await db.query('select * from worker_time_rules_v908 where employee_id=$1', [ids.max])).rows.length, 0);
  });
  const materialInput = { article_number: '00017', name: 'Synthetischer Katalogartikel', unit: 'Stk', purchase_price: 1.2345, recommended_price_1: 3.5, recommended_price_2: 4, expected_id: null, expected_revision: null };
  await test('Catalog import works after invoice guards and keeps identity/precision exact', async () => {
   const result = (await db.query('select import_material_catalog_v908($1,$2,$3,true) r', [ids.business, 'Integration Großhandel', JSON.stringify([materialInput])])).rows[0].r; assert.equal(result.created, 1);
   const result2 = (await db.query('select import_material_catalog_v908($1,$2,$3,true) r', [ids.business, 'Integration Großhandel', JSON.stringify([materialInput])])).rows[0].r; assert.equal(result2.unchanged, 1);
  });
  const imported = (await db.query("select * from materials where catalog_article_number='00017'")).rows[0];
  let offer;
  await test('Offer uses recommended-price snapshot and canonical VAT after catalog schema extension', async () => {
   const input = { business_id: ids.business, customer_id: ids.customer, customer_name: 'Klostermanns Hof', offer_date: '2026-10-17', title: 'Integration Angebot', items: [{ kind: 'material', material_id: imported.id, name: imported.name, unit: 'Stk', quantity: 2, unit_price: Number(imported.recommended_price_1) }], status: 'draft', vat_rate: 19, offer_config: { version: 908, kind: 'itemized', categories: [], assignment: [], issuer: { business_id: ids.business, company_name: 'Integration Betrieb' }, tax_choice: { basis: 'net', mode: 'standard', confirmed: true, overrides: {}, reasons: {} } } };
   offer = (await db.query('select to_jsonb(save_offer_v908($1,null)) r', [JSON.stringify(input)])).rows[0].r; assert.equal(offer.total, 8.33); assert.equal(offer.offer_config.tax.vat, 133);
  });
  let order, internal;
  await test('Combined order writer, signature rule and catalog guard save regular and internal work atomically', async () => {
   order = await f.save({ ...f.order, employee_id: ids.business, work_date: '2026-10-06' }, [{ ...f.periods[0], employee_id: ids.business }], [{ material_id: imported.id, quantity: 2, unit: 'Stk' }]);
   internal = await f.save({ ...f.order, work_date: '2026-10-07', customer_id: null, work_kind: 'office', signed_by: '', signature_data: '' }, [f.periods[0]], []);
   assert.equal(order.employee_id, ids.business); assert.equal(internal.work_kind, 'office'); assert.equal((await db.query('select count(*)::int n from time_entries where team_work_order_id=$1', [internal.id])).rows[0].n, 1);
  });
  const taxes = { window: {} }; vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../invoice-tax-v905.js'), 'utf8'), taxes);
  const parties = { issuer: { name: 'Integration Betrieb', address: ['Teststraße 1', '12345 Teststadt'], taxNumber: 'Synthetisch-123' }, customer: { name: 'Klostermanns Hof', address: ['Testweg 2', '12345 Teststadt'] } };
  let invoice;
  await test('Invoice rejects internal work, then freezes selected company work and its actual prices', async () => {
   await assert.rejects(() => db.query('select prepare_invoice_batch_v908($1,$2) r', [ids.business, JSON.stringify([internal.id])]));
   const prepared = (await db.query('select prepare_invoice_batch_v908($1,$2) r', [ids.business, JSON.stringify([order.id])])).rows[0].r;
   const tax = taxes.window.WorktimeInvoiceTax.calculate(prepared.document.items, { basis: 'net', mode: 'standard', confirmed: true, overrides: {}, reasons: {} });
   invoice = (await db.query('select to_jsonb(issue_invoice_batch_v908($1,$2,$3,$4,$5,$6,$7)) r', [uuid(1), ids.business, 'INTEGRATION-001', '2026-10-17', JSON.stringify(prepared.selection), JSON.stringify(tax), JSON.stringify(parties)])).rows[0].r;
   assert.equal(invoice.document.finalized, true); assert.ok(invoice.document.tax.gross > 0);
  });
  const frozenInvoice = JSON.stringify(invoice.document), frozenOffer = JSON.stringify(offer);
  await test('Catalog edits after invoicing cannot alter the frozen invoice or offer', async () => {
   const current = (await db.query('select * from materials where id=$1', [imported.id])).rows[0];
   await db.query('select save_material_prices_v908($1,$2,$3,$4,$5,$6)', [imported.id, ids.business, current.catalog_revision, JSON.stringify({ purchase_price: 2, recommended_price_1: 99, recommended_price_2: 199 }), 'Integration Großhandel', '00017']);
   assert.equal(JSON.stringify((await db.query('select document from invoice_batches_v908 where id=$1', [invoice.id])).rows[0].document), frozenInvoice);
   assert.equal(JSON.stringify((await db.query('select to_jsonb(o) r from offers o where id=$1', [offer.id])).rows[0].r), frozenOffer);
  });
  const timeBeforeCancel = (await db.query('select to_jsonb(t) r from time_entries t order by id')).rows;
  await test('Invoice change and work editor preserve the same time ledger through every installed trigger', async () => {
   await db.query('select cancel_invoice_batch_v908($1,$2,$3,$4,$5,true)', [uuid(2), invoice.id, 'INTEGRATION-ST-001', '2026-10-17', 'Synthetische Berichtigung']);
   const reopened = (await db.query('select * from work_orders where id=$1', [order.id])).rows[0]; assert.equal(reopened.invoiced, false); assert.equal(reopened.invoice_reopened_from_v908, invoice.id);
   await db.query('update work_orders set documentation=$2 where id=$1', [order.id, 'Integration: bearbeitbar nach Änderung']);
   assert.deepEqual((await db.query('select to_jsonb(t) r from time_entries t order by id')).rows, timeBeforeCancel);
  });
  let planId;
  await test('Confirmed planning generates separate job-info messages for owner and participating staff', async () => {
   const notes = 'ZE-PLAN-1:' + JSON.stringify({ status: 'confirmed', start: '08:00', end: '10:00', details: 'Integration Termin' });
   planId = (await db.query("insert into appointments(employee_id,event_date,customer_id,customer_name,title,notes,team_employee_ids) values($1,'2026-10-20',$2,'Klostermanns Hof','Integration',$3,$4) returning id", [ids.business, ids.customer, notes, [ids.anna]])).rows[0].id;
   assert.equal((await db.query("select count(*)::int n from mailbox_messages where category='job_info' and recipient_id=$1", [ids.business])).rows[0].n, 1);
   await actor('anna'); assert.equal((await db.query("select count(*)::int n from mailbox_messages where category='job_info'")).rows[0].n, 1); await actor('business');
  });
  const service = async () => { await admin(); await db.exec('set role service_role'); };
  let mail;
  await test('Draft/publish and private attachment metadata work beside order/invoice triggers', async () => {
   await service(); mail = (await db.query('select to_jsonb(prepare_mail_v908($1,$2,$3)) r', [ids.anna, uuid(3), JSON.stringify({ recipientId: ids.business, category: 'delivery', title: 'Integration Lieferschein', message: 'Geprüfter Beleg.', commission: 'Klostermanns Hof' })])).rows[0].r;
   await actor('business'); assert.equal((await db.query('select * from mailbox_messages where id=$1', [mail.id])).rows.length, 0);
   const filePath = mail.id + '/integration.pdf'; await admin(); await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', ['mailbox-attachments', filePath, { size: 7, mimetype: 'application/pdf' }]);
   await service(); await db.query('select publish_mail_v908($1,$2,$3)', [ids.anna, mail.id, JSON.stringify([{ filePath, fileName: 'Integration.pdf', fileSize: 7, mimeType: 'application/pdf' }])]);
   await actor('business'); assert.equal((await db.query('select * from mailbox_attachments where message_id=$1', [mail.id])).rows.length, 1);
  });
  await test('Sender/recipient trash states remain independent with planning and financial mail present', async () => {
   await actor('anna'); await db.query("select mark_mail_v908($1,'trash')", [mail.id]); await actor('business'); await db.query("select mark_mail_v908($1,'read')", [mail.id]);
   const copy = (await db.query('select * from mailbox_user_state_v908 where message_id=$1', [mail.id])).rows[0]; assert.equal(copy.user_id, ids.business); assert.equal(copy.deleted_at, null); assert.ok(copy.read_at);
  });
  await test('Foreign business cannot cross-read/save ledger, catalog, offer, school or mailbox data', async () => {
   await actor('otherBusiness');
   for (const table of ['worker_time_rules_v908', 'worker_school_rules_v908', 'invoice_batches_v908', 'invoice_cancellations_v908', 'mailbox_user_state_v908', 'mailbox_messages', 'mailbox_attachments', 'offers']) assert.equal((await db.query('select count(*)::int n from ' + table)).rows[0].n, 0, table);
   assert.equal((await db.query('select * from materials where business_id=$1', [ids.business])).rows.length, 0);
   await assert.rejects(() => db.query('select import_material_catalog_v908($1,$2,$3,true)', [ids.business, 'Attack', JSON.stringify([materialInput])]));
   await assert.rejects(() => db.query('select prepare_invoice_batch_v908($1,$2)', [ids.business, JSON.stringify([order.id])]));
  });
  await test('One founder can inspect both scopes without granting employee or anonymous management', async () => {
   await actor('admin'); assert.equal((await db.query('select count(*)::int n from invoice_batches_v908')).rows[0].n, 1); assert.ok((await db.query('select * from mailbox_messages')).rows.length >= 3);
   await actor('anna'); assert.equal((await db.query('select * from invoice_batches_v908')).rows.length, 0); assert.equal((await db.query('select * from offers')).rows.length, 0);
   await admin(); await db.exec('set role anon'); for (const table of ['worker_time_rules_v908', 'invoice_batches_v908', 'mailbox_user_state_v908', 'offers']) await assert.rejects(() => db.query('select * from ' + table));
  });
  console.log(JSON.stringify({ passed, migrations: migrations.length, productionWrites: 0, legacyStubLimits: ['branding/access helper signatures', 'sync bump body', 'customer-specific labor override not covered'], planId }));
 } finally { await db.close(); }
}
main().catch(error => { console.error(error.stack); process.exit(1); });
