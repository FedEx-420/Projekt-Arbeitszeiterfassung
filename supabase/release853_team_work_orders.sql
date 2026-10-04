-- Additive migration. Existing orders and time records are not rebuilt/deleted.
-- Apply only after checking the live schema and its existing RLS policies.
begin;

alter table public.appointments add column if not exists team_employee_ids uuid[] not null default '{}';
alter table public.work_orders add column if not exists team_periods jsonb not null default '[]'::jsonb;
alter table public.time_entries
  add column if not exists team_work_order_id uuid references public.work_orders(id) on delete cascade,
  add column if not exists team_period_key uuid;
create unique index if not exists time_entries_team_period_key
  on public.time_entries(team_work_order_id, team_period_key);
create index if not exists appointments_team_employee_ids on public.appointments using gin(team_employee_ids);

create or replace function app_private.team_company(p_employee uuid)
returns uuid language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when p.role = 'business' then p.id when p.role = 'employee' then p.business_id else null end
  from public.profiles p where p.id = p_employee;
$$;

create or replace function app_private.team_can_manage(p_company uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid()
    and (p.role = 'administrator' or (p.role = 'business' and p.id = p_company)));
$$;

create or replace function app_private.team_order_access(p_order uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists(select 1 from public.work_orders w where w.id = p_order and (
    app_private.team_can_manage(app_private.team_company(w.employee_id))
    or (app_private.team_company(auth.uid()) = app_private.team_company(w.employee_id)
      and (w.employee_id = auth.uid() or exists(select 1 from jsonb_array_elements(w.team_periods) t
        where t->>'employee_id' = auth.uid()::text)))));
$$;

create or replace function app_private.team_holiday(p_day date)
returns boolean language plpgsql immutable set search_path = pg_catalog, public, pg_temp as $$
declare y int := extract(year from p_day); a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; v int; easter date;
begin
  a:=y%19; b:=y/100; c:=y%100; d:=b/4; e:=b%4; f:=(b+8)/25; g:=(b-f+1)/3;
  h:=(19*a+b-d-g+15)%30; i:=c/4; k:=c%4; l:=(32+2*e+2*i-h-k)%7; m:=(a+11*h+22*l)/451;
  v:=h+l-7*m+114; easter:=make_date(y,v/31,v%31+1);
  return to_char(p_day,'MM-DD') in ('01-01','05-01','10-03','11-01','12-25','12-26')
    or p_day in (easter-2,easter+1,easter+39,easter+50,easter+60);
end;
$$;

create or replace function app_private.team_check_day(p_employee uuid, p_day date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if app_private.team_holiday(p_day) then raise exception 'An NRW-Feiertagen kann keine Arbeitszeit gebucht werden.'; end if;
  if exists(select 1 from public.work_days where employee_id=p_employee and work_date=p_day and sick>0) then
    raise exception 'Ein beteiligter Mitarbeiter ist an diesem Tag krank gemeldet.';
  end if;
  if exists(select 1 from public.vacation_requests where employee_id=p_employee and status='approved' and p_day between start_date and end_date) then
    raise exception 'Ein beteiligter Mitarbeiter hat an diesem Tag genehmigten Urlaub.';
  end if;
end;
$$;

-- A narrow roster, not a relaxation of profile/password visibility.
create or replace function public.work_order_team_roster(p_company uuid default null)
returns table(id uuid, username text, display_name text, role text, business_id uuid, labor_type text)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare company uuid; actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where profiles.id=auth.uid();
  if not found then raise exception 'Bitte anmelden.'; end if;
  company:=case when actor.role='administrator' then p_company else app_private.team_company(actor.id) end;
  if company is null or not exists(select 1 from public.profiles p where p.id=company and p.role='business') then raise exception 'Geschäftskonto auswählen.'; end if;
  if actor.role='employee' and coalesce((to_jsonb(actor)->'menu_permissions'->>'orders')::boolean,true)=false then raise exception 'Arbeitsscheine sind nicht freigegeben.'; end if;
  return query select p.id,p.username,p.display_name,p.role::text,p.business_id,
    coalesce(to_jsonb(p)->>'labor_type','monteur') from public.profiles p
    where p.role='employee' and p.business_id=company order by p.username;
end;
$$;

create or replace function app_private.validate_team_planning()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare company uuid := app_private.team_company(new.employee_id); member uuid; cancelled boolean := false;
begin
  if tg_op='UPDATE' and old.team_employee_ids<>'{}'::uuid[] and not app_private.team_can_manage(company) then raise exception 'Nur die Geschäftsleitung darf die beteiligten Mitarbeiter einer Planung ändern.'; end if;
  if new.team_employee_ids='{}'::uuid[] then return new; end if;
  if not app_private.team_can_manage(company) then raise exception 'Nur die Geschäftsleitung darf die beteiligten Mitarbeiter einer Planung ändern.'; end if;
  if array_length(new.team_employee_ids,1)>100 then raise exception 'Zu viele beteiligte Mitarbeiter.'; end if;
  if left(new.notes,10)='ZE-PLAN-1:' then cancelled:=coalesce((substring(new.notes from 11)::jsonb)->>'status'='cancelled',false); end if;
  for member in select distinct unnest(new.team_employee_ids) loop
    if member is null or app_private.team_company(member) is distinct from company then raise exception 'Alle Mitarbeiter müssen derselben Firma angehören.'; end if;
    if not cancelled then perform app_private.team_check_day(member,new.event_date); end if;
  end loop;
  if not cancelled then perform app_private.team_check_day(new.employee_id,new.event_date); end if;
  return new;
end;
$$;
drop trigger if exists validate_team_planning on public.appointments;
create trigger validate_team_planning before insert or update of employee_id,event_date,team_employee_ids
  on public.appointments for each row execute function app_private.validate_team_planning();

-- Existing owner/manager policies remain in place. These SELECT policies only
-- share an explicitly assigned order (never another firm's orders/HR data).
drop policy if exists "Assigned team can read planning" on public.appointments;
create policy "Assigned team can read planning" on public.appointments for select to authenticated using (
  auth.uid()=any(team_employee_ids) and app_private.team_company(auth.uid())=app_private.team_company(employee_id));
drop policy if exists "Assigned team can read work orders" on public.work_orders;
create policy "Assigned team can read work orders" on public.work_orders for select to authenticated using (
  jsonb_array_length(team_periods)>0 and app_private.team_order_access(id));
drop policy if exists "Assigned team can read order items" on public.work_order_items;
create policy "Assigned team can read order items" on public.work_order_items for select to authenticated using (
  app_private.team_order_access(work_order_id));

-- No direct participant write grants: the following RPC validates the entire
-- order and books all employees, material and plan status in ONE transaction.
create or replace function public.save_team_work_order(p_order jsonb, p_periods jsonb, p_items jsonb default '[]', p_plan_id uuid default null)
returns public.work_orders language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  actor public.profiles%rowtype; existing public.work_orders%rowtype; saved public.work_orders%rowtype; plan public.appointments%rowtype;
  order_id uuid; owner_id uuid; company uuid; customer public.customers%rowtype; work_day date;
  period jsonb; normalized jsonb := '[]'; first_period jsonb; employee public.profiles%rowtype;
  period_key uuid; lock_employee uuid; begin_at time; end_at time; pause numeric; hours numeric; labor text; previous jsonb;
  item jsonb; material public.materials%rowtype; quantity numeric; labor_sum record;
begin
  select * into actor from public.profiles where id=auth.uid();
  if not found then raise exception 'Bitte anmelden.'; end if;
  if actor.role='employee' and coalesce((to_jsonb(actor)->'menu_permissions'->>'orders')::boolean,true)=false then raise exception 'Arbeitsscheine sind nicht freigegeben.'; end if;
  order_id:=coalesce(nullif(p_order->>'id','')::uuid,p_plan_id,gen_random_uuid());
  -- Serializes repeated/concurrent submissions of the same planned order.
  perform pg_advisory_xact_lock(hashtextextended(order_id::text,0));
  select * into existing from public.work_orders where id=order_id for update;
  if nullif(p_order->>'id','') is not null and existing.id is null then raise exception 'Dieser Arbeitsschein wurde zwischenzeitlich gelöscht. Er wird nicht erneut angelegt.'; end if;
  if existing.id is null and exists(select 1 from public.appointments where id=order_id) and p_plan_id is distinct from order_id then raise exception 'Eine Planung muss über ihren zugehörigen Auftrag abgeschlossen werden.'; end if;
  owner_id:=coalesce(existing.employee_id,(p_order->>'employee_id')::uuid);
  company:=app_private.team_company(owner_id); work_day:=(p_order->>'work_date')::date;
  if company is null or work_day is null then raise exception 'Firma und Arbeitstag fehlen.'; end if;
  if existing.id is not null then
    if not app_private.team_order_access(order_id) then raise exception 'Dieser Arbeitsschein gehört nicht zu Ihrem Auftrag.'; end if;
    if coalesce((to_jsonb(existing)->>'invoiced')::boolean,false) then raise exception 'Ein abgerechneter Arbeitsschein kann nicht verändert werden.'; end if;
  elsif not (app_private.team_can_manage(company) or actor.id=owner_id) then
    if p_plan_id is null then raise exception 'Nur eigene oder zugewiesene Arbeitsscheine dürfen angelegt werden.'; end if;
  end if;
  if p_plan_id is not null then
    select * into plan from public.appointments where id=p_plan_id for update;
    if not found or plan.employee_id<>owner_id or plan.event_date<>work_day then raise exception 'Die Planung wurde geändert. Bitte erneut öffnen.'; end if;
    if not (app_private.team_can_manage(company) or actor.id=owner_id or actor.id=any(plan.team_employee_ids)) then raise exception 'Dieser Auftrag ist Ihnen nicht zugewiesen.'; end if;
    if left(plan.notes,10)='ZE-PLAN-1:' and (substring(plan.notes from 11)::jsonb)->>'status'='cancelled' then raise exception 'Der Auftrag ist abgesagt.'; end if;
    if existing.id is not null and nullif(p_order->>'id','') is null then raise exception 'Dieser geplante Auftrag ist bereits abgeschlossen.'; end if;
  end if;
  select * into customer from public.customers where id=(p_order->>'customer_id')::uuid;
  if not found or coalesce((to_jsonb(customer)->>'business_id')::uuid,app_private.team_company(customer.employee_id)) is distinct from company then raise exception 'Der Kunde gehört nicht zu dieser Firma.'; end if;
  if nullif(btrim(p_order->>'signed_by'),'') is null or coalesce(p_order->>'signature_data','') not like 'data:image/png;base64,%'
    or length(p_order->>'signature_data') not between 200 and 700000 then raise exception 'Unterschrift und Name sind erforderlich.'; end if;
  if jsonb_typeof(p_periods) is distinct from 'array' or jsonb_array_length(p_periods) not between 1 and 200 then raise exception 'Mindestens ein gültiger Zeitabschnitt ist erforderlich.'; end if;
  -- Stable employee lock order avoids deadlocks between two simultaneous jobs.
  for lock_employee in select distinct (value->>'employee_id')::uuid from jsonb_array_elements(p_periods) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(lock_employee::text||work_day::text,0));
  end loop;
  for period in select value from jsonb_array_elements(p_periods) loop
    select * into employee from public.profiles where id=(period->>'employee_id')::uuid;
    if not found or app_private.team_company(employee.id) is distinct from company or employee.role not in ('employee','business') then raise exception 'Alle Mitwirkenden müssen derselben Firma angehören.'; end if;
    -- Serialize this employee/day against concurrent team bookings.
    perform pg_advisory_xact_lock(hashtextextended(employee.id::text||work_day::text,0));
    perform app_private.team_check_day(employee.id,work_day);
    period_key:=coalesce(nullif(period->>'key','')::uuid,gen_random_uuid());
    begin_at:=(period->>'start_time')::time; end_at:=(period->>'end_time')::time;
    pause:=coalesce((period->>'pause_hours')::numeric,0);
    if begin_at is null or end_at is null or end_at<=begin_at or extract(second from begin_at)<>0 or extract(second from end_at)<>0
      or extract(minute from begin_at)::int%15<>0 or extract(minute from end_at)::int%15<>0 or pause<0 or mod(pause,0.25)<>0 then
      raise exception 'Zeiten müssen am selben Tag liegen und in Viertelstunden erfasst werden.';
    end if;
    hours:=extract(epoch from end_at-begin_at)/3600-pause;
    if hours<0.25 or mod(hours,0.25)<>0 then raise exception 'Die Pause ist zu lang oder die Arbeitszeit ungültig.'; end if;
    for previous in select value from jsonb_array_elements(normalized) loop
      if previous->>'key'=period_key::text then raise exception 'Ein Zeitabschnitt wurde mehrfach übermittelt.'; end if;
      if previous->>'employee_id'=employee.id::text and begin_at<(previous->>'end_time')::time and (previous->>'start_time')::time<end_at then raise exception 'Die Zeitabschnitte eines Mitarbeiters dürfen sich nicht überschneiden.'; end if;
    end loop;
    if exists(select 1 from public.time_entries t where t.employee_id=employee.id and t.work_date=work_day
      and t.team_work_order_id is distinct from order_id and t.work_order_id is distinct from order_id
      and t.start_time<end_at and begin_at<t.end_time
      -- An exact existing manual record is linked below, not booked twice.
      and not (t.work_order_id is null and t.team_work_order_id is null and t.customer_id=customer.id and t.start_time=begin_at and t.end_time=end_at and t.pause_hours=pause)) then
      raise exception 'Für einen Mitarbeiter ist in diesem Zeitraum bereits andere Arbeitszeit erfasst.';
    end if;
    labor:=case coalesce(to_jsonb(employee)->>'labor_type','monteur') when 'meister' then 'Meisterstunde' when 'aushilfe' then 'Aushilfsstunde' else 'Monteurstunde' end;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('key',period_key,'employee_id',employee.id,
      'employee_name',coalesce(nullif(employee.display_name,''),employee.username),'labor_name',labor,
      'start_time',to_char(begin_at,'HH24:MI'),'end_time',to_char(end_at,'HH24:MI'),'pause_hours',pause,'executed_hours',hours));
  end loop;
  select value into first_period from jsonb_array_elements(normalized) where value->>'employee_id'=owner_id::text limit 1;
  if first_period is null then raise exception 'Die Zeit des zuständigen Mitarbeiters fehlt.'; end if;
  -- Header keeps the legacy owner's first period. Further periods are separate
  -- ledger entries; materials/order identity are never cloned per employee.
  perform set_config('app.team_order_rpc','yes',true);
  if existing.id is null then
    insert into public.work_orders(id,employee_id,work_date,customer_id,customer_name,title,start_time,end_time,pause_hours,executed_hours,calculation_mode,documentation,signed_by,signature_data,team_periods)
    values(order_id,owner_id,work_day,customer.id,customer.name,coalesce(p_order->>'title',''),(first_period->>'start_time')::time,(first_period->>'end_time')::time,
      (first_period->>'pause_hours')::numeric,(first_period->>'executed_hours')::numeric,'end_time',coalesce(p_order->>'documentation',''),p_order->>'signed_by',p_order->>'signature_data',normalized) returning * into saved;
  else
    update public.work_orders set work_date=work_day,customer_id=customer.id,customer_name=customer.name,title=coalesce(p_order->>'title',''),
      start_time=(first_period->>'start_time')::time,end_time=(first_period->>'end_time')::time,pause_hours=(first_period->>'pause_hours')::numeric,
      executed_hours=(first_period->>'executed_hours')::numeric,calculation_mode='end_time',documentation=coalesce(p_order->>'documentation',''),
      signed_by=p_order->>'signed_by',signature_data=p_order->>'signature_data',team_periods=normalized where id=order_id returning * into saved;
  end if;
  delete from public.time_entries t where t.team_work_order_id=order_id and t.work_order_id is null
    and not exists(select 1 from jsonb_array_elements(normalized) x where x->>'key'=t.team_period_key::text);
  for period in select value from jsonb_array_elements(normalized) loop
    -- Keep historical manual records. The UI's effective-period calculation
    -- suppresses an exact manual duplicate while this source order exists.
    if period->>'key'=first_period->>'key' then
      delete from public.time_entries where team_work_order_id=order_id and team_period_key=(period->>'key')::uuid and work_order_id is null;
      insert into public.time_entries(employee_id,work_date,customer_id,customer_name,start_time,end_time,pause_hours,executed_hours,calculation_mode,work_order_id,team_work_order_id,team_period_key,custom_fields)
      values(owner_id,work_day,customer.id,customer.name,(period->>'start_time')::time,(period->>'end_time')::time,(period->>'pause_hours')::numeric,
        (period->>'executed_hours')::numeric,'end_time',order_id,order_id,(period->>'key')::uuid,jsonb_build_object('notes',coalesce(p_order->>'documentation','')))
      on conflict(work_order_id) do update set team_work_order_id=excluded.team_work_order_id,team_period_key=excluded.team_period_key,custom_fields=excluded.custom_fields;
    else
      insert into public.time_entries(employee_id,work_date,customer_id,customer_name,start_time,end_time,pause_hours,executed_hours,calculation_mode,team_work_order_id,team_period_key,custom_fields)
      values((period->>'employee_id')::uuid,work_day,customer.id,customer.name,(period->>'start_time')::time,(period->>'end_time')::time,(period->>'pause_hours')::numeric,
        (period->>'executed_hours')::numeric,'end_time',order_id,(period->>'key')::uuid,jsonb_build_object('notes',coalesce(p_order->>'documentation','')))
      on conflict(team_work_order_id,team_period_key) do update set employee_id=excluded.employee_id,work_date=excluded.work_date,
        customer_id=excluded.customer_id,customer_name=excluded.customer_name,start_time=excluded.start_time,end_time=excluded.end_time,
        pause_hours=excluded.pause_hours,executed_hours=excluded.executed_hours,custom_fields=excluded.custom_fields;
    end if;
  end loop;
  delete from public.work_order_items where work_order_id=order_id;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>500 then raise exception 'Ungültige Materialpositionen.'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    select * into material from public.materials where id=(item->>'material_id')::uuid and business_id=company and active=true;
    if not found or lower(btrim(material.name)) in ('monteurstunde','meisterstunde','aushilfsstunde') then raise exception 'Ungültiges Material dieser Firma.'; end if;
    quantity:=(item->>'quantity')::numeric;
    if quantity is null or quantity<=0 then raise exception 'Eine positive Stückzahl ist erforderlich.'; end if;
    insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price) values(order_id,material.id,material.name,quantity,material.unit_price);
  end loop;
  for labor_sum in select x->>'labor_name' name,sum((x->>'executed_hours')::numeric) hours from jsonb_array_elements(normalized) x group by x->>'labor_name' loop
    select * into material from public.materials where business_id=company and lower(btrim(name))=lower(labor_sum.name) order by active desc limit 1;
    if not found then insert into public.materials(business_id,name,unit_price,active) values(company,labor_sum.name,0,true) returning * into material;
    elsif material.active=false then update public.materials set active=true where id=material.id returning * into material; end if;
    insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price) values(order_id,material.id,material.name,labor_sum.hours,material.unit_price);
  end loop;
  if p_plan_id is not null and left(plan.notes,10)='ZE-PLAN-1:' then
    update public.appointments set notes='ZE-PLAN-1:'||((substring(plan.notes from 11)::jsonb)||jsonb_build_object('status','completed','workOrderId',order_id))::text where id=p_plan_id;
  end if;
  return saved;
end;
$$;

create or replace function public.confirm_team_appointment(p_id uuid)
returns public.appointments language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare plan public.appointments%rowtype; meta jsonb; member uuid;
begin
  select * into plan from public.appointments where id=p_id for update;
  if not found or not (plan.employee_id=auth.uid() or (auth.uid()=any(plan.team_employee_ids) and app_private.team_company(auth.uid())=app_private.team_company(plan.employee_id))) then raise exception 'Dieser Auftrag ist Ihnen nicht zugewiesen.'; end if;
  if left(plan.notes,10)<>'ZE-PLAN-1:' then raise exception 'Bitte die Planung zuerst durch die Geschäftsleitung aktualisieren lassen.'; end if;
  meta:=substring(plan.notes from 11)::jsonb;
  if meta->>'status' not in ('planned','confirmed') or exists(select 1 from public.work_orders where id=p_id) then raise exception 'Der Auftrag ist bereits abgeschlossen oder abgesagt.'; end if;
  perform app_private.team_check_day(plan.employee_id,plan.event_date);
  foreach member in array plan.team_employee_ids loop perform app_private.team_check_day(member,plan.event_date); end loop;
  update public.appointments set notes='ZE-PLAN-1:'||(meta||jsonb_build_object('status','confirmed'))::text where id=p_id returning * into plan;
  return plan;
end;
$$;

create or replace function public.delete_team_work_order(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app_private.team_order_access(p_id) then raise exception 'Dieser Auftrag ist nicht verfügbar.'; end if;
  if exists(select 1 from public.work_orders where id=p_id and coalesce((to_jsonb(work_orders)->>'invoiced')::boolean,false)) then raise exception 'Abgerechnete Arbeitsscheine können nicht gelöscht werden.'; end if;
  perform set_config('app.team_order_rpc','yes',true);
  delete from public.work_order_documents where work_order_id=p_id;
  delete from public.work_order_items where work_order_id=p_id;
  delete from public.time_entries where work_order_id=p_id or team_work_order_id=p_id;
  delete from public.work_orders where id=p_id;
  -- Do not reoffer a deleted converted order as a confirmed draft.
  update public.appointments set notes='ZE-PLAN-1:'||((substring(notes from 11)::jsonb)||jsonb_build_object('status','cancelled','workOrderId',''))::text where id=p_id and left(notes,10)='ZE-PLAN-1:';
end;
$$;

create or replace function public.work_order_team_context(p_company uuid default null)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('version',1,'roster',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) from public.work_order_team_roster(p_company) r;
$$;

-- Prevent a legacy REST write from silently changing just one employee of an
-- existing team order. Invoice flags/price snapshots remain independent.
create or replace function app_private.guard_team_order_write()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if coalesce(current_setting('app.team_order_rpc',true),'')='yes' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' then
    if jsonb_array_length(old.team_periods)>0 then raise exception 'Gemeinsame Arbeitsscheine müssen vollständig über die Auftragsfunktion gelöscht werden.'; end if;
    return old;
  end if;
  if jsonb_array_length(new.team_periods)>0 or (tg_op='UPDATE' and jsonb_array_length(old.team_periods)>0) then
    raise exception 'Die Zeiten eines gemeinsamen Arbeitsscheins müssen zusammen gespeichert werden.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_team_order_write on public.work_orders;
create trigger guard_team_order_write before insert or delete or update of employee_id,work_date,customer_id,customer_name,start_time,end_time,pause_hours,executed_hours,team_periods
  on public.work_orders for each row execute function app_private.guard_team_order_write();

create or replace function app_private.guard_team_time_write()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if coalesce(current_setting('app.team_order_rpc',true),'')='yes' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' then
    if old.team_work_order_id is not null then raise exception 'Diesen Zeitabschnitt bitte im gemeinsamen Arbeitsschein ändern oder löschen.'; end if;
    return old;
  end if;
  if new.team_work_order_id is not null or (tg_op='UPDATE' and old.team_work_order_id is not null) then raise exception 'Diesen Zeitabschnitt bitte im gemeinsamen Arbeitsschein bearbeiten.'; end if;
  return new;
end;
$$;
drop trigger if exists guard_team_time_write on public.time_entries;
create trigger guard_team_time_write before insert or update or delete on public.time_entries
  for each row execute function app_private.guard_team_time_write();

drop policy if exists "Assigned team can read documents" on public.work_order_documents;
create policy "Assigned team can read documents" on public.work_order_documents for select to authenticated using(app_private.team_order_access(work_order_id));
drop policy if exists "Assigned team can attach documents" on public.work_order_documents;
create policy "Assigned team can attach documents" on public.work_order_documents for insert to authenticated with check(employee_id=auth.uid() and app_private.team_order_access(work_order_id));
drop policy if exists "Assigned team can read document files" on storage.objects;
create policy "Assigned team can read document files" on storage.objects for select to authenticated using(bucket_id='work-order-documents' and exists(select 1 from public.work_order_documents d where d.file_path=name and app_private.team_order_access(d.work_order_id)));
drop policy if exists "Assigned team can remove document files" on storage.objects;
create policy "Assigned team can remove document files" on storage.objects for delete to authenticated using(bucket_id='work-order-documents' and exists(select 1 from public.work_order_documents d where d.file_path=name and app_private.team_order_access(d.work_order_id)));

-- SECURITY DEFINER helper functions have no public/anonymous entry points.
revoke all on function app_private.team_company(uuid), app_private.team_can_manage(uuid), app_private.team_order_access(uuid), app_private.team_holiday(date), app_private.team_check_day(uuid,date), app_private.validate_team_planning(), app_private.guard_team_order_write(), app_private.guard_team_time_write() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.team_company(uuid), app_private.team_order_access(uuid) to authenticated;
revoke all on function public.work_order_team_roster(uuid), public.work_order_team_context(uuid), public.save_team_work_order(jsonb,jsonb,jsonb,uuid), public.confirm_team_appointment(uuid), public.delete_team_work_order(uuid) from public, anon;
grant execute on function public.work_order_team_roster(uuid), public.work_order_team_context(uuid), public.save_team_work_order(jsonb,jsonb,jsonb,uuid), public.confirm_team_appointment(uuid), public.delete_team_work_order(uuid) to authenticated;
commit;
