const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture} = require('./team-db-fixture.cjs');

(async () => {
  const {db,ids,actor} = await fixture();
  try {
    await db.exec(`
      create role service_role bypassrls;
      grant usage on schema app_private to service_role;
      create table auth.users (id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
      insert into auth.users (id) select id from public.profiles;
      alter table public.customers add column updated_at timestamptz not null default now();
      create function app_private.touch_customer_fixture() returns trigger language plpgsql as
        $$begin new.updated_at := clock_timestamp(); return new; end;$$;
      create trigger touch before update on public.customers for each row execute function app_private.touch_customer_fixture();
      create table app_private.klarwerk_links_v1007 (id uuid default gen_random_uuid(), created_by uuid, company_id uuid,
        token_hash text, claimed_at timestamptz, revoked_at timestamptz);
      create table app_private.klarwerk_events_v1007 (link_id uuid, company_id uuid, operation text, request_id text);
      create function app_private.klarwerk_dispatch_v1007(text,text,jsonb) returns jsonb
        language sql as $$select '{"original":true}'::jsonb$$;
      create function app_private.klarwerk_work_sheets(text,jsonb) returns jsonb
        language sql as $$select '[]'::jsonb$$;
      revoke all on function app_private.klarwerk_dispatch_v1007(text,text,jsonb) from public;
      grant execute on function app_private.klarwerk_dispatch_v1007(text,text,jsonb) to service_role;
    `);
    const token = 'a'.repeat(64);
    await db.query('insert into app_private.klarwerk_links_v1007 (created_by,company_id,token_hash,claimed_at) values ($1,$1,$2,now())', [ids.business, token]);
    await db.query('update public.customers set custom_fields=$1 where id=$2', [{email:'fixture@example.invalid', extra_1:'intern', country:'Deutschland'},ids.customer]);
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261114174907_klarwerk_customer_addresses.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261115160500_fast_customer_address_sync.sql'),'utf8'));
    const call = async (op,data,key=token) => (await db.query('select public.klarwerk_dispatch_v1007($1,$2,$3) as result',[key,op,JSON.stringify(data)])).rows[0].result;
    await db.exec('set role service_role');
    const listed = await call('list',{entity:'customers'});
    assert.equal(listed.some(row=>row.id===ids.otherCustomer),false);
    const before=listed.find(row=>row.id===ids.customer);
    const clock = () => call('list',{entity:'customers',sync:'revision'});
    const zero=await clock();
    assert.equal(zero.revision,'0');
    assert.equal(zero.company_id,ids.business);
    assert.ok(zero.link_id);
    assert.equal(before.custom_fields.country,'Deutschland');
    assert.equal(before.custom_fields.extra_1,undefined);
    const args={customer_id:ids.customer,expected:before.updated_at,address:{street:'Testweg',house_no:'2a',postal_code:'01234',city:'Testort',country:'Deutschland'}};
    const update = (args,key) => call('rpc',{name:'update_customer_address',args},key);
    await assert.rejects(update({...args,customer_id:ids.otherCustomer}), /Kunde im verknüpften Betrieb/);
    await assert.rejects(update(args,'b'.repeat(64)), /Freigabe ungültig/);
    await assert.rejects(update({...args,address:{...args.address,email:'fremd'}}), /Ungültige Adressdaten/);
    const saved = await update(args);
    assert.ok(saved.updated_at);
    assert.equal((await clock()).revision,'1');
    assert.deepEqual(await update(args),saved);
    assert.equal((await clock()).revision,'1');
    assert.equal((await update({...args,address:{...args.address,city:'Anderer Ort'}})).conflict,true);
    assert.deepEqual(await call('company',{}),{original:true});
    await db.exec('reset role');
    const actual = (await db.query('select custom_fields from public.customers where id=$1',[ids.customer])).rows[0].custom_fields;
    assert.deepEqual(actual,{...args.address,email:'fixture@example.invalid',extra_1:'intern'});
    await actor('business');
    const getRevision = id => db.query('select public.customer_address_sync_revision($1) as revision',[id]).then(result=>result.rows[0].revision);
    assert.equal(await getRevision(ids.business),'1');
    await assert.rejects(getRevision(ids.otherBusiness),/nicht freigegeben/);
    await db.query('update public.customers set custom_fields=$1 where id=$2',[{...actual,street:'',house_no:'',postal_code:'',city:'',country:''},ids.customer]);
    assert.equal(await getRevision(ids.business),'2');
    await db.exec('reset role');
    await db.exec('set role service_role');
    assert.equal((await clock()).revision,'2');
    assert.equal((await call('list',{entity:'customers'})).find(row=>row.id===ids.customer).custom_fields.street,'');
    await db.exec('reset role');
    await db.exec("set role authenticated");
    await assert.rejects(update(args),/permission denied/);
    console.log('PASS both writers invalidate the customer revision in the same transaction, partial/cleared addresses, data preservation, retry and company isolation');
  } finally {
    await db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
