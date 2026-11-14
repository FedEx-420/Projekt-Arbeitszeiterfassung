const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture} = require('./team-db-fixture.cjs');

(async () => {
  const {db,ids} = await fixture();
  try {
    await db.exec(`
      create role service_role bypassrls;
      grant usage on schema app_private to service_role;
      alter table public.work_orders add column if not exists work_kind text;
      create table public.customer_hourly_rates (customer_id uuid primary key, monteur numeric, meister numeric, azubi numeric);
      create function app_private.klarwerk_dispatch_v1007(key text,op text,body jsonb) returns jsonb
        language plpgsql as $$begin
          if key <> 'test-link' then raise exception 'Freigabe ungültig' using errcode='42501'; end if;
          return jsonb_build_object('company',jsonb_build_object('id','${ids.business}'));
        end;$$;
      create function app_private.klarwerk_customer_addresses(text,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function app_private.klarwerk_work_sheets(text,jsonb) returns jsonb language sql as $$select '[]'::jsonb$$;
      revoke all on function app_private.klarwerk_dispatch_v1007(text,text,jsonb) from public;
      insert into public.materials (business_id,name,unit_price,active) values
        ('${ids.business}','Monteurstunde',57.25,true),('${ids.business}','Aushilfsstunde',38,true),
        ('${ids.business}','Meisterstunde',81,true),('${ids.otherBusiness}','Monteurstunde',99,true)
        on conflict (business_id,name) do update set unit_price=excluded.unit_price,active=true;
      insert into public.customer_hourly_rates values ('${ids.customer}',0,75,null);
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261114204232_klarwerk_labor_rates.sql'),'utf8'));
    const call = async (body={},key='test-link') => (await db.query(
      "select public.klarwerk_dispatch_v1007($1,'list',$2) as result",[key,JSON.stringify({entity:'labor-rates',...body})]
    )).rows[0].result;
    await db.exec('set role service_role');
    const result = await call({customer_id:ids.customer});
    assert.deepEqual(result.standard,{monteur:5725,meister:8100,helfer:3800});
    assert.deepEqual(result.customer,{monteur:0,meister:7500});
    assert.deepEqual((await call()).customer,{});
    await assert.rejects(call({customer_id:ids.otherCustomer}),/verknüpften Betrieb/);
    await assert.rejects(call({},'revoked'),/Freigabe ungültig/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query("select app_private.klarwerk_labor_rates('test-link','{}')"),/permission denied/);
    console.log('PASS linked business rates, customer overrides, explicit zero and access boundaries');
  } finally {
    await db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
