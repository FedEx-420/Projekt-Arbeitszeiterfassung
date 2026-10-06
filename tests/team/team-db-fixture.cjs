/* Disposable PostgreSQL fixture. Never connects to the production service. */
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const ids = Object.fromEntries(['admin','business','otherBusiness','anna','max','felix','customer','otherCustomer','monteur','meister','aushilfe','material','plan','order'].map((name,index) => [name,`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`]));
async function fixture({legacyRecords=false,offers=false,units=false}={}) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema app_private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,app_private,storage to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key,username text,display_name text default '',role text,business_id uuid,labor_type text default 'monteur',menu_permissions jsonb default '{}');
    create table public.customers(id uuid primary key default gen_random_uuid(),employee_id uuid references profiles(id),name text,custom_fields jsonb default '{}');
    create table public.work_days(employee_id uuid,work_date date,sick numeric default 0,vacation numeric default 0,primary key(employee_id,work_date));
    create table public.vacation_requests(id uuid primary key default gen_random_uuid(),employee_id uuid,start_date date,end_date date,status text,created_at timestamptz default now());
    create table public.appointments(id uuid primary key default gen_random_uuid(),employee_id uuid references profiles(id),event_date date,customer_id uuid references customers(id),customer_name text,title text,notes text default '',created_at timestamptz default now());
    create table public.work_orders(id uuid primary key default gen_random_uuid(),employee_id uuid references profiles(id),work_date date,customer_id uuid references customers(id),customer_name text,title text,start_time time,end_time time,pause_hours numeric default 0,executed_hours numeric default 0,calculation_mode text,documentation text,signed_by text,signature_data text,invoiced boolean default false,created_at timestamptz default now());
    create table public.time_entries(id uuid primary key default gen_random_uuid(),employee_id uuid references profiles(id),work_date date,customer_id uuid references customers(id),customer_name text,start_time time,end_time time,pause_hours numeric default 0,executed_hours numeric default 0,calculation_mode text,work_order_id uuid unique references work_orders(id) on delete set null,custom_fields jsonb default '{}',created_at timestamptz default now());
    create table public.materials(id uuid primary key default gen_random_uuid(),business_id uuid,name text,unit_price numeric default 0,active boolean default true,unique(business_id,name));
    create table public.work_order_items(id uuid primary key default gen_random_uuid(),work_order_id uuid references work_orders(id) on delete cascade,material_id uuid references materials(id),position_name text,quantity numeric,unit_price numeric);
    create table public.work_order_documents(id uuid primary key default gen_random_uuid(),work_order_id uuid references work_orders(id),employee_id uuid,file_path text,file_name text,mime_type text);
    create table public.mailbox_messages(id uuid primary key default gen_random_uuid(),recipient_id uuid not null references profiles(id) on delete cascade,sender_id uuid references profiles(id) on delete set null,message_type text not null check(message_type in ('password_help','vacation_request','vacation_decision','info','direct')),title text not null,body jsonb not null default '{}',read_at timestamptz,created_at timestamptz default now(),deleted_at timestamptz);
    alter table public.mailbox_messages enable row level security;
    create policy mailbox_read on public.mailbox_messages for select to authenticated using(recipient_id=auth.uid() or sender_id=auth.uid());
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create function app_private.fixture_manager(p_person uuid) returns boolean language sql stable security definer as $$select exists(select 1 from profiles actor where actor.id=auth.uid() and (actor.role='administrator' or (actor.role='business' and exists(select 1 from profiles p where p.id=p_person and (p.business_id=actor.id or p.id=actor.id)))))$$;
    create function app_private.fixture_company(p_person uuid) returns uuid language sql stable security definer set search_path=public,pg_temp as $$select case when role='business' then id else business_id end from profiles where id=p_person$$;
    grant execute on function app_private.fixture_manager(uuid) to authenticated;
    alter table profiles enable row level security;
    create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or app_private.fixture_manager(id));
    alter table customers enable row level security;
    create policy customers_read on customers for select to authenticated using(app_private.fixture_manager(employee_id) or app_private.fixture_company(employee_id)=app_private.fixture_company(auth.uid()));
    create policy customers_write on customers for all to authenticated using(app_private.fixture_manager(employee_id) or app_private.fixture_company(employee_id)=app_private.fixture_company(auth.uid())) with check(app_private.fixture_manager(employee_id) or app_private.fixture_company(employee_id)=app_private.fixture_company(auth.uid()));
    alter table appointments enable row level security;
    create policy appointments_old on appointments for all to authenticated using(employee_id=auth.uid() or app_private.fixture_manager(employee_id)) with check(employee_id=auth.uid() or app_private.fixture_manager(employee_id));
    alter table work_orders enable row level security;
    create policy orders_old on work_orders for all to authenticated using(employee_id=auth.uid() or app_private.fixture_manager(employee_id)) with check(employee_id=auth.uid() or app_private.fixture_manager(employee_id));
    alter table time_entries enable row level security;
    create policy times_old on time_entries for all to authenticated using(employee_id=auth.uid() or app_private.fixture_manager(employee_id)) with check(employee_id=auth.uid() or app_private.fixture_manager(employee_id));
    alter table work_days enable row level security; create policy work_days_old on work_days for select to authenticated using(employee_id=auth.uid() or app_private.fixture_manager(employee_id));
    alter table vacation_requests enable row level security; create policy vacation_old on vacation_requests for select to authenticated using(employee_id=auth.uid() or app_private.fixture_manager(employee_id));
    alter table materials enable row level security; create policy material_read on materials for select to authenticated using(app_private.fixture_manager(business_id) or business_id=(select business_id from profiles where id=auth.uid()));
    alter table work_order_items enable row level security; create policy item_old on work_order_items for all to authenticated using(exists(select 1 from work_orders w where w.id=work_order_id and (w.employee_id=auth.uid() or app_private.fixture_manager(w.employee_id)))) with check(exists(select 1 from work_orders w where w.id=work_order_id and (w.employee_id=auth.uid() or app_private.fixture_manager(w.employee_id))));
    alter table work_order_documents enable row level security;
    alter table storage.objects enable row level security;
    create function app_private.fixture_chief() returns boolean language sql stable security definer as $$select exists(select 1 from profiles where id=auth.uid() and role in ('administrator','business'))$$;
    create policy "Work documents are readable by owner or chief" on storage.objects for select to authenticated using(bucket_id='work-order-documents' and (split_part(name,'/',1)=auth.uid()::text or app_private.fixture_chief()));
    create policy "Work documents can be removed by owner or chief" on storage.objects for delete to authenticated using(bucket_id='work-order-documents' and (split_part(name,'/',1)=auth.uid()::text or app_private.fixture_chief()));
    create policy "Work documents can be uploaded by owner or chief" on storage.objects for insert to authenticated with check(bucket_id='work-order-documents' and (split_part(name,'/',1)=auth.uid()::text or app_private.fixture_chief()));
    grant select,insert,update,delete on all tables in schema public,storage to authenticated;
  `);
  // Synchronization definition checked against the live schema on 2026-10-04.
  await db.exec("create or replace function app_private.sync_work_order_to_time_entry()\nreturns trigger\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas $$\nbegin\n  insert into public.time_entries (\n    employee_id, work_date, customer_id, customer_name, start_time, end_time,\n    pause_hours, executed_hours, calculation_mode, work_order_id, custom_fields\n  ) values (\n    new.employee_id, new.work_date, new.customer_id, new.customer_name,\n    new.start_time, new.end_time, new.pause_hours, new.executed_hours,\n    new.calculation_mode, new.id, '{}'::jsonb\n  )\n  on conflict (work_order_id) do update set\n    employee_id = excluded.employee_id,\n    work_date = excluded.work_date,\n    customer_id = excluded.customer_id,\n    customer_name = excluded.customer_name,\n    start_time = excluded.start_time,\n    end_time = excluded.end_time,\n    pause_hours = excluded.pause_hours,\n    executed_hours = excluded.executed_hours,\n    calculation_mode = excluded.calculation_mode;\n  return new;\nend;\n$$;\nrevoke all on function app_private.sync_work_order_to_time_entry() from public;\ndrop trigger if exists sync_work_order_to_time_entry on public.work_orders;\ncreate trigger sync_work_order_to_time_entry\n  after insert or update of employee_id, work_date, customer_id, customer_name, start_time, end_time, pause_hours, executed_hours, calculation_mode\n  on public.work_orders\n  for each row execute procedure app_private.sync_work_order_to_time_entry();\n\n");
  await db.exec(`
    create function app_private.remove_work_order_time_entry() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
    begin delete from public.time_entries where work_order_id=old.id; return old; end; $$;
    create trigger remove_work_order_time_entry before delete on public.work_orders for each row execute function app_private.remove_work_order_time_entry();
  `);
  for (const [name,role,business,labor] of [['admin','administrator',null,'monteur'],['business','business',null,'monteur'],['otherBusiness','business',null,'monteur'],['anna','employee','business','monteur'],['max','employee','business','meister'],['felix','employee','otherBusiness','aushilfe']]) {
    await db.query('insert into profiles(id,username,role,business_id,labor_type) values($1,$2,$3,$4,$5)',[ids[name],name,role,business?ids[business]:null,labor]);
  }
  await db.query('insert into customers(id,employee_id,name) values($1,$2,$3),($4,$5,$6)',[ids.customer,ids.anna,'Klostermanns Hof',ids.otherCustomer,ids.felix,'Anderer Kunde']);
  for (const [name,label,price] of [['monteur','Monteurstunde',55],['meister','Meisterstunde',75],['aushilfe','Aushilfsstunde',30],['material','Kabel',2]]) await db.query('insert into materials(id,business_id,name,unit_price) values($1,$2,$3,$4)',[ids[name],ids.business,label,price]);
  if (legacyRecords) {
    await db.query("insert into work_orders(id,employee_id,work_date,customer_id,customer_name,title,start_time,end_time,pause_hours,executed_hours,calculation_mode,documentation,signed_by,signature_data) values($1,$2,'2026-09-30',$3,'Klostermanns Hof','Historischer Einzelauftrag','08:00','11:00',0.25,2.75,'end_time','Bestehende Dokumentation','Testkunde',$4)",[ids.order,ids.anna,ids.customer,'data:image/png;base64,'+'A'.repeat(220)]);
    await db.query("insert into time_entries(employee_id,work_date,customer_id,customer_name,start_time,end_time,pause_hours,executed_hours,calculation_mode,custom_fields) values($1,'2026-09-29',$2,'Klostermanns Hof','09:00','10:00',0,1,'end_time','{\"notes\":\"Historische manuelle Notiz\"}')",[ids.anna,ids.customer]);
  }
  const legacyBefore=legacyRecords ? {
    orders:(await db.query('select to_jsonb(w) record from work_orders w order by id')).rows.map(r=>r.record),
    times:(await db.query('select to_jsonb(t) record from time_entries t order by id')).rows.map(r=>r.record)
  } : null;
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/release853_team_work_orders.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261004173800_planning_approval_v854.sql'),'utf8'));
  if(offers)await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261005073938_offers_v857.sql'),'utf8'));
  if(units){
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261006122754_material_units_v860.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261006133602_material_unit_kg_v861.sql'),'utf8'));
    // Mirror the already installed catalog write policies for UI unit tests.
    await db.exec(`create policy material_insert on materials for insert to authenticated with check(app_private.fixture_manager(business_id) or business_id=app_private.fixture_company(auth.uid())); create policy material_manage on materials for update to authenticated using(app_private.fixture_manager(business_id)) with check(app_private.fixture_manager(business_id));`);
  }
  const actor = async name => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]]); await db.exec('set role authenticated'); };
  const admin = async () => db.exec('reset role');
  const order = {employee_id:ids.anna,work_date:'2026-10-05',customer_id:ids.customer,title:'Gemeinsame Montage',documentation:'Testnotiz',signed_by:'Testkunde',signature_data:'data:image/png;base64,'+'A'.repeat(220)};
  const periods=[{key:'10000000-0000-4000-8000-000000000001',employee_id:ids.anna,start_time:'08:00',end_time:'10:00',pause_hours:0},{key:'10000000-0000-4000-8000-000000000002',employee_id:ids.anna,start_time:'10:30',end_time:'12:00',pause_hours:0.25},{key:'10000000-0000-4000-8000-000000000003',employee_id:ids.max,start_time:'08:30',end_time:'12:00',pause_hours:0.5}];
  const save = async (o=order,p=periods,items=[{material_id:ids.material,quantity:3}],plan=null) => (await db.query('select to_jsonb(public.save_team_work_order($1::jsonb,$2::jsonb,$3::jsonb,$4::uuid)) result',[JSON.stringify(o),JSON.stringify(p),JSON.stringify(items),plan])).rows[0].result;
  return {db,ids,actor,admin,order,periods,save,legacyBefore};
}
module.exports={fixture,ids};
