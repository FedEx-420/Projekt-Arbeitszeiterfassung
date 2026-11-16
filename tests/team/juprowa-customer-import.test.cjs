const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');

const migrationDir = path.join(__dirname, '../../supabase/migrations');
const sql = ending => fs.readFileSync(path.join(migrationDir, fs.readdirSync(migrationDir).find(name => name.endsWith(ending))), 'utf8');
const company = '7f0d0000-0000-4000-8000-000000000001';
const other = '7f0d0000-0000-4000-8000-000000000002';
const token = '7f0d0000-0000-4000-8000-000000000003';
const existing = '7f0d0000-0000-4000-8000-000000000004';

test('confirms a fresh plan, imports once, fills blanks, and keeps ambiguous and foreign rows separate', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema app_private;
      create schema auth;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles(id uuid primary key, role text, business_id uuid);
      create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
      create table app_private.klarwerk_links_v1007(id uuid, created_by uuid, company_id uuid, token_hash text, claimed_at timestamptz, revoked_at timestamptz);
      create table app_private.klarwerk_events_v1007(link_id uuid, company_id uuid, operation text, request_id text);
      create function app_private.team_company(id uuid) returns uuid language sql as
        $$select case when role='business' then p.id else business_id end from public.profiles p where p.id=$1$$;
      create function app_private.customer_address_revision(id uuid) returns text language sql as $$select '1'::text$$;
      create table public.customers(id uuid primary key default gen_random_uuid(),
        employee_id uuid references profiles(id), name text not null,
        updated_at timestamptz not null default now(), custom_fields jsonb not null default '{}');
      grant select on public.profiles to service_role;
      grant select, insert, update on public.customers to service_role;
      create function touch_revision() returns trigger language plpgsql as $$
        begin new.updated_at = clock_timestamp(); return new; end
      $$;
      create trigger touch_customer before update on public.customers for each row execute function touch_revision();
    `);
    await db.exec(sql('_juprowa_servicepad_connection.sql'));
    await db.exec(sql('_juprowa_customer_import.sql'));
    await db.query('insert into profiles values ($1,\'business\',null),($2,\'business\',null)', [company, other]);
    await db.query('insert into auth.users(id) values ($1)', [company]);
    await db.query("insert into app_private.klarwerk_links_v1007 values (gen_random_uuid(),$1,$1,'synthetic-grant',now(),null)", [company]);
    await db.query("insert into juprowa_servicepad_connections values ($1,'portal','0','Test','dummy',$2)", [company, token]);
    await db.query(`insert into customers(id,employee_id,name,custom_fields) values
      ($1,$2,'Sven Beispiel','{"street":"Musterweg","house_no":"8","city":"Bonn","postal_code":"53111","country":"Deutschland","phone_private":"0228-222"}'),
      (gen_random_uuid(),$2,'Komplex GmbH','{}'),
      (gen_random_uuid(),$3,'Neukunde Beispiel','{"email":"new@example.invalid"}')`, [existing, company, other]);
    const incoming = [
      { source_id: '101', name: 'Sven Beispiel', fields: { street: 'Musterweg', house_no: '8', postal_code: '53111',
        city: 'Bonn', phone_private: '0228-999', email: 'sven@example.invalid', juprowa_number: '0123' } },
      { source_id: '102', name: 'Komplex GmbH', fields: { city: 'Bonn' } },
      { source_id: '103', name: 'Neukunde Beispiel', fields: { email: 'new@example.invalid' } },
    ];
    const batch = async (fingerprint, revision = token, scope = company) => (await db.query(
      'select juprowa_customer_batch($1,$2,$3::jsonb,$4) as value', [scope, revision, JSON.stringify(incoming), fingerprint],
    )).rows[0].value;
    await db.exec('set role authenticated');
    await assert.rejects(batch(null), /permission denied/);
    await db.exec('set role service_role');
    const initial = await batch(null);
    assert.deepEqual(initial.counts, { new: 1, linked: 1, review: 1 });
    assert.deepEqual(initial.review, [{ name: 'Komplex GmbH', candidates: ['Komplex GmbH'] }]);
    assert.deepEqual(await batch(null, token, other), { changed: true });
    await db.query("update customers set custom_fields = custom_fields || '{\"fax\":\"0228-111\"}' where id=$1", [existing]);
    const stale = await batch(initial.fingerprint);
    assert.equal(stale.applied, undefined);
    assert.notEqual(stale.fingerprint, initial.fingerprint);
    assert.equal((await batch(stale.fingerprint)).applied, true);
    const merged = (await db.query('select custom_fields from customers where id=$1', [existing])).rows[0].custom_fields;
    assert.equal(merged.email, 'sven@example.invalid');
    assert.equal(merged.phone_private, '0228-222');
    assert.equal(merged.juprowa_import_values.phone_private, undefined);
    const bridge = (await db.query("select app_private.klarwerk_customer_addresses('synthetic-grant','list','{}') as value")).rows[0].value;
    assert.equal(bridge.find(row => row.id === existing).custom_fields.juprowa_import_values.email, 'sven@example.invalid');
    assert.equal(bridge.length, 3);
    const repeated = await batch(null);
    assert.deepEqual(repeated.counts, { new: 0, linked: 2, review: 1 });
    assert.equal((await batch(repeated.fingerprint)).applied, true);
    assert.deepEqual((await db.query('select count(*)::int from customers where employee_id=$1', [company])).rows, [{ count: 3 }]);
  } finally {
    await db.close();
  }
});
