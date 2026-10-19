-- Additive core. Existing orders retain work_kind=customer; hours are not rewritten.
begin;
create function app_private.worker_manage_v908(p_employee uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles a join public.profiles p on p.id=p_employee
 where a.id=(select auth.uid()) and p.role in ('business','employee')
 and (a.role='administrator' or a.role='business' and (p.id=a.id or p.business_id=a.id)));
$$;
revoke all on function app_private.worker_manage_v908(uuid) from public,anon;
grant execute on function app_private.worker_manage_v908(uuid) to authenticated,service_role;

create table public.worker_time_rules_v908(
 employee_id uuid not null references public.profiles(id) on delete cascade,
 effective_from date not null,
 targets_enabled boolean not null default true,
 target_hours numeric[] not null,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 primary key(employee_id,effective_from)
);
create table public.worker_school_rules_v908(
 employee_id uuid not null references public.profiles(id) on delete cascade,
 effective_from date not null,
 school_hours numeric[] not null,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 primary key(employee_id,effective_from)
);
alter table public.worker_time_rules_v908 enable row level security;
alter table public.worker_school_rules_v908 enable row level security;
revoke all on public.worker_time_rules_v908,public.worker_school_rules_v908 from public,anon,authenticated;
grant select,insert,update,delete on public.worker_time_rules_v908,public.worker_school_rules_v908 to authenticated;
grant all on public.worker_time_rules_v908,public.worker_school_rules_v908 to service_role;
create policy worker_time_read on public.worker_time_rules_v908 for select to authenticated using(app_private.can_access_profile(employee_id));
create policy worker_time_write on public.worker_time_rules_v908 for all to authenticated using(app_private.worker_manage_v908(employee_id)) with check(app_private.worker_manage_v908(employee_id));
create policy worker_school_read on public.worker_school_rules_v908 for select to authenticated using(app_private.can_access_profile(employee_id));
create policy worker_school_write on public.worker_school_rules_v908 for all to authenticated using(app_private.worker_manage_v908(employee_id)) with check(app_private.worker_manage_v908(employee_id));

create function app_private.worker_rule_guard_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
declare hours numeric[]; employee uuid; berlin_today date:=(now() at time zone 'Europe/Berlin')::date;
begin
 if tg_op='DELETE' and current_user='service_role' then return old; end if;
 employee:=case when tg_op='DELETE' then old.employee_id else new.employee_id end;
 if not app_private.worker_manage_v908(employee) then raise exception 'Nur die zuständige Geschäftsführung oder der Administrator kann diese Vorgaben ändern.' using errcode='42501'; end if;
 if tg_op<>'INSERT' and old.effective_from<berlin_today then raise exception 'Vergangene Vorgaben bleiben erhalten. Eine neue, künftig gültige Vorgabe anlegen.'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and (new.employee_id<>old.employee_id or new.effective_from<>old.effective_from) then raise exception 'Person und Gültigkeitsdatum dürfen nicht verschoben werden.'; end if;
 if new.effective_from<berlin_today or new.effective_from>berlin_today+3660 then raise exception 'Gültigkeitsdatum muss heute oder innerhalb der nächsten zehn Jahre liegen.'; end if;
 select array_agg(value::numeric order by ordinality) into hours from jsonb_array_elements_text(to_jsonb(new)->case when tg_table_name='worker_time_rules_v908' then 'target_hours' else 'school_hours' end) with ordinality;
 if hours is null or array_ndims(hours)<>1 or array_lower(hours,1)<>1 or cardinality(hours)<>7 or exists(select 1 from unnest(hours) h where h is null or h<0 or h>24 or mod(h,0.25)<>0 or h::text in ('NaN','Infinity','-Infinity')) then raise exception 'Mo–So benötigen sieben Stundenwerte zwischen 0 und 24 in Viertelstunden.'; end if;
 if tg_table_name='worker_school_rules_v908' and exists(select 1 from unnest(hours) h where h>0) and not exists(select 1 from public.profiles where id=employee and labor_type='azubi') then raise exception 'Ein Schulplan kann nur für Auszubildende angelegt werden.'; end if;
 new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;
 new.updated_at:=now();return new;
end; $$;
revoke all on function app_private.worker_rule_guard_v908() from public,anon,authenticated;
create trigger worker_time_guard before insert or update or delete on public.worker_time_rules_v908 for each row execute function app_private.worker_rule_guard_v908();
create trigger worker_school_guard before insert or update or delete on public.worker_school_rules_v908 for each row execute function app_private.worker_rule_guard_v908();

create function public.save_worker_rule_v908(p_employee uuid,p_kind text,p_effective date,p_revision integer,p_hours numeric[],p_enabled boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;
begin
 if not app_private.worker_manage_v908(p_employee) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('time','school') or p_revision is null or p_revision<0 then raise exception 'Vorgabenart und Version prüfen.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('worker-rules:'||p_employee::text||p_kind,0));
 if p_kind='time' then
  if p_revision=0 then insert into public.worker_time_rules_v908(employee_id,effective_from,target_hours,targets_enabled) values(p_employee,p_effective,p_hours,p_enabled) returning to_jsonb(worker_time_rules_v908) into saved;
  else update public.worker_time_rules_v908 set target_hours=p_hours,targets_enabled=p_enabled where employee_id=p_employee and effective_from=p_effective and revision=p_revision returning to_jsonb(worker_time_rules_v908) into saved; end if;
 else
  if p_revision=0 then insert into public.worker_school_rules_v908(employee_id,effective_from,school_hours) values(p_employee,p_effective,p_hours) returning to_jsonb(worker_school_rules_v908) into saved;
  else update public.worker_school_rules_v908 set school_hours=p_hours where employee_id=p_employee and effective_from=p_effective and revision=p_revision returning to_jsonb(worker_school_rules_v908) into saved; end if;
 end if;
 if saved is null then raise exception 'Vorgabe wurde zwischenzeitlich geändert. Bitte neu laden.' using errcode='40001'; end if;
 return saved;
end; $$;
revoke all on function public.save_worker_rule_v908(uuid,text,date,integer,numeric[],boolean) from public,anon;
grant execute on function public.save_worker_rule_v908(uuid,text,date,integer,numeric[],boolean) to authenticated;

-- Founder override and working business owners are explicit, not duplicated accounts.
drop policy workweeks_business_write on public.employee_workweeks_v905;
create policy workweeks_business_write on public.employee_workweeks_v905 for all to authenticated
using(app_private.worker_manage_v908(employee_id)) with check(app_private.worker_manage_v908(employee_id));

alter table public.work_orders add column work_kind text not null default 'customer'
check(work_kind in ('customer','vehicle_cleanup','warehouse_cleanup','office','nonbillable','complaint','other'));
create function app_private.work_kind_guard_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and old.invoiced and new.work_kind is distinct from old.work_kind then raise exception 'Ein abgerechneter Auftrag darf nicht umklassifiziert werden.'; end if;
 if new.work_kind<>'customer' and new.invoiced then raise exception 'Interne/nicht abrechnungsfähige Arbeitsscheine dürfen nicht abgerechnet werden.'; end if;
 if new.work_kind='other' and nullif(btrim(new.documentation),'') is null then raise exception 'Bitte den sonstigen Grund unter Notiz / Dokumentation angeben.'; end if;
 return new;
end; $$;
revoke all on function app_private.work_kind_guard_v908() from public,anon,authenticated;
create trigger work_kind_guard before insert or update on public.work_orders for each row execute function app_private.work_kind_guard_v908();
create or replace function app_private.require_work_order_signature() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.work_kind<>'customer' then return new; end if;
 if nullif(btrim(new.signed_by),'') is null then raise exception 'Bitte eintragen, wer unterschrieben hat.' using errcode='23514'; end if;
 if coalesce(new.signature_data,'')!~'^data:image/png;base64,' or char_length(coalesce(new.signature_data,''))<200 then raise exception 'Bitte zuerst im Unterschriftsfeld unterschreiben.' using errcode='23514'; end if;
 if char_length(new.signature_data)>700000 then raise exception 'Die Unterschrift ist zu groß.' using errcode='23514'; end if;
 return new;
end; $$;

drop trigger require_signature_before_work_order_insert on public.work_orders;
create trigger require_signature_before_work_order_insert before insert or update of work_kind,signed_by,signature_data on public.work_orders
for each row execute function app_private.require_work_order_signature();
revoke all on function app_private.require_work_order_signature() from public,anon,authenticated;

create function public.school_credits_v908(p_employee uuid,p_from date,p_to date)
returns table(credit_id text,employee_id uuid,work_date date,hours numeric,effective_from date)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not app_private.can_access_profile(p_employee) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>3660 then raise exception 'Bitte einen gültigen Zeitraum von maximal zehn Jahren auswählen.'; end if;
 return query select 'school:'||p_employee::text||':'||d.day::date::text,p_employee,d.day::date,w.school_hours[extract(isodow from d.day)::integer],w.effective_from
 from pg_catalog.generate_series(p_from::timestamp,least(p_to,(now() at time zone 'Europe/Berlin')::date)::timestamp,interval '1 day') d(day)
 cross join lateral (select s.school_hours,s.effective_from from public.worker_school_rules_v908 s where s.employee_id=p_employee and s.effective_from<=d.day::date order by s.effective_from desc limit 1) w
 where w.school_hours[extract(isodow from d.day)::integer]>0 and not app_private.team_holiday(d.day::date)
 and not exists(select 1 from public.work_days a where a.employee_id=p_employee and a.work_date=d.day::date and (a.sick>0 or a.vacation>0))
 and not exists(select 1 from public.vacation_requests v where v.employee_id=p_employee and v.status='approved' and d.day::date between v.start_date and v.end_date);
end; $$;
revoke all on function public.school_credits_v908(uuid,date,date) from public,anon;
grant execute on function public.school_credits_v908(uuid,date,date) to authenticated;
create trigger worker_time_sync after insert or update or delete on public.worker_time_rules_v908 for each row execute function app_private.bump_planning_sync_v867();
create trigger worker_school_sync after insert or update or delete on public.worker_school_rules_v908 for each row execute function app_private.bump_planning_sync_v867();

-- Managed routines below are generated by a reviewed, exact-match transformation
-- of their deployed v907 definitions; no legacy booking algorithms are replaced.
-- BEGIN GENERATED ROUTINES V908
CREATE OR REPLACE FUNCTION public.work_order_team_roster(p_company uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, username text, display_name text, role text, business_id uuid, labor_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare company uuid; actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where profiles.id=auth.uid();
  if not found then raise exception 'Bitte anmelden.'; end if;
  company:=case when actor.role='administrator' then p_company else app_private.team_company(actor.id) end;
  if company is null or not exists(select 1 from public.profiles p where p.id=company and p.role='business') then raise exception 'Geschäftskonto auswählen.'; end if;
  if actor.role='employee' and coalesce((to_jsonb(actor)->'menu_permissions'->>'orders')::boolean,true)=false then raise exception 'Arbeitsscheine sind nicht freigegeben.'; end if;
  return query select p.id,p.username,p.display_name,p.role::text,case when p.role='business' then p.id else p.business_id end,
    coalesce(to_jsonb(p)->>'labor_type','monteur') from public.profiles p
    where p.role='business' and p.id=company or p.role='employee' and p.business_id=company order by (p.role='business') desc,p.username;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_team_work_order(p_order jsonb, p_periods jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_plan_id uuid DEFAULT NULL::uuid)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  actor public.profiles%rowtype; existing public.work_orders%rowtype; saved public.work_orders%rowtype; plan public.appointments%rowtype;
  order_id uuid; owner_id uuid; company uuid; customer public.customers%rowtype; work_day date;
  period jsonb; normalized jsonb := '[]'; first_period jsonb; employee public.profiles%rowtype;
  period_key uuid; lock_employee uuid; begin_at time; end_at time; pause numeric; hours numeric; labor text; previous jsonb;
  item jsonb; material public.materials%rowtype; quantity numeric; labor_sum record; kind_v908 text; preset_v908 text;
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
  kind_v908:=coalesce(nullif(p_order->>'work_kind',''),existing.work_kind,'customer');
  if kind_v908 not in ('customer','vehicle_cleanup','warehouse_cleanup','office','nonbillable','complaint','other') then raise exception 'Ungültige Auftragsart.'; end if;
  preset_v908:=case kind_v908 when 'vehicle_cleanup' then 'Aufräumen des Firmenfahrzeugs' when 'warehouse_cleanup' then 'Aufräumen des Firmenlagers' when 'office' then 'Bürotätigkeiten' when 'nonbillable' then 'Nicht abrechnungsfähiger Auftrag' when 'complaint' then 'Reklamation' else null end;
  if preset_v908 is not null and position(preset_v908 in coalesce(p_order->>'documentation',''))=0 then p_order:=p_order||jsonb_build_object('documentation',preset_v908||case when nullif(btrim(p_order->>'documentation'),'') is not null then E'\n'||(p_order->>'documentation') else '' end); end if;
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
  if nullif(p_order->>'customer_id','') is not null then
   select * into customer from public.customers where id=(p_order->>'customer_id')::uuid;
   if not found or coalesce((to_jsonb(customer)->>'business_id')::uuid,app_private.team_company(customer.employee_id)) is distinct from company then raise exception 'Der Kunde gehört nicht zu dieser Firma.'; end if;
  elsif kind_v908='customer' then raise exception 'Bitte einen Kunden angeben.';
  else customer.name:='Interne Tätigkeit'; end if;
  if kind_v908='customer' and (nullif(btrim(p_order->>'signed_by'),'') is null or coalesce(p_order->>'signature_data','') not like 'data:image/png;base64,%'
    or length(p_order->>'signature_data') not between 200 and 700000) then raise exception 'Unterschrift und Name sind erforderlich.'; end if;
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
    labor:=case coalesce(to_jsonb(employee)->>'labor_type','monteur') when 'meister' then 'Meisterstunde' when 'aushilfe' then 'Aushilfsstunde' when 'azubi' then 'Auszubildendenstunde' else 'Monteurstunde' end;
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
    insert into public.work_orders(id,employee_id,work_date,customer_id,customer_name,title,start_time,end_time,pause_hours,executed_hours,calculation_mode,documentation,signed_by,signature_data,team_periods,work_kind)
    values(order_id,owner_id,work_day,customer.id,customer.name,coalesce(p_order->>'title',''),(first_period->>'start_time')::time,(first_period->>'end_time')::time,
      (first_period->>'pause_hours')::numeric,(first_period->>'executed_hours')::numeric,'end_time',coalesce(p_order->>'documentation',''),p_order->>'signed_by',p_order->>'signature_data',normalized,kind_v908) returning * into saved;
  else
    update public.work_orders set work_date=work_day,customer_id=customer.id,customer_name=customer.name,title=coalesce(p_order->>'title',''),
      start_time=(first_period->>'start_time')::time,end_time=(first_period->>'end_time')::time,pause_hours=(first_period->>'pause_hours')::numeric,
      executed_hours=(first_period->>'executed_hours')::numeric,calculation_mode='end_time',documentation=coalesce(p_order->>'documentation',''),
      signed_by=p_order->>'signed_by',signature_data=p_order->>'signature_data',team_periods=normalized,work_kind=kind_v908 where id=order_id returning * into saved;
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
    if not found or lower(btrim(material.name)) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then raise exception 'Ungültiges Material dieser Firma.'; end if;
    quantity:=(item->>'quantity')::numeric;
    if quantity is null or quantity<=0 then raise exception 'Eine positive Stückzahl ist erforderlich.'; end if;
    insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price,unit) values(order_id,material.id,material.name,quantity,material.unit_price,app_private.canonical_unit_v860(coalesce(item->>'unit',material.unit),false));
  end loop;
  for labor_sum in select x->>'labor_name' name,sum((x->>'executed_hours')::numeric) hours from jsonb_array_elements(normalized) x group by x->>'labor_name' loop
    select * into material from public.materials where business_id=company and lower(btrim(name))=lower(labor_sum.name) order by active desc limit 1;
    if not found then insert into public.materials(business_id,name,unit_price,active) values(company,labor_sum.name,0,true) returning * into material;
    elsif material.active=false then update public.materials set active=true where id=material.id returning * into material; end if;
    insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price,unit) values(order_id,material.id,material.name,labor_sum.hours,material.unit_price,app_private.canonical_unit_v860(material.unit,true));
  end loop;
  if p_plan_id is not null and left(plan.notes,10)='ZE-PLAN-1:' then
    update public.appointments set notes='ZE-PLAN-1:'||((substring(plan.notes from 11)::jsonb)||jsonb_build_object('status','completed','workOrderId',order_id))::text where id=p_plan_id;
  end if;
  return saved;
end;
$function$
;
notify pgrst,'reload schema';
commit;
