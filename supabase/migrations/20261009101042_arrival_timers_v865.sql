begin;
create table public.job_timers (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_address text not null default '',
  appointment_id uuid references public.appointments(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  consumed_at timestamptz,
  work_order_id uuid references public.work_orders(id) on delete set null,
  source text not null check(source in ('gps','manual')),
  notification_lease_until timestamptz,
  notification_sent_at timestamptz,
  check(finished_at is null or finished_at>=started_at),
  check(consumed_at is null or finished_at is not null)
);
create unique index job_timer_one_active on public.job_timers(employee_id) where finished_at is null;
create index job_timers_business on public.job_timers(business_id);
create index job_timers_employee on public.job_timers(employee_id,started_at);
alter table public.job_timers enable row level security;
revoke all on public.job_timers from public,anon,authenticated,service_role;
grant select on public.job_timers to authenticated;
grant select,update on public.job_timers to service_role;
create policy job_timer_read on public.job_timers for select to authenticated using((employee_id=(select auth.uid()) and business_id=app_private.team_company((select auth.uid()))) or app_private.team_can_manage(business_id));

-- Privileged lifecycle is intentional: server clock, one active timer and
-- atomic work-order consumption must not be writable with client timestamps.
-- Every operation rechecks the live profile and strict own-user ownership.
create function app_private.start_job_timer_v865(p_customer uuid,p_appointment uuid,p_source text,p_position jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); company uuid; customer public.customers; plan public.appointments; loc public.customer_locations; timer public.job_timers; lat double precision; lon double precision; accuracy double precision;
begin
  company:=app_private.team_company(actor);
  if actor is null or company is null or not exists(select 1 from public.profiles where id=actor and role in ('employee','business')) then raise exception 'Bitte mit dem eigenen Mitarbeiterkonto anmelden.'; end if;
  perform 1 from public.profiles where id=actor for update;
  perform app_private.team_check_day(actor,(now() at time zone 'Europe/Berlin')::date);
  select * into customer from public.customers where id=p_customer and app_private.team_company(employee_id)=company;
  if not found then raise exception 'Der Kunde gehört nicht zu Ihrer Firma.'; end if;
  if p_appointment is not null then
    select * into plan from public.appointments where id=p_appointment and customer_id=p_customer and app_private.team_company(employee_id)=company;
    if not found or not (plan.employee_id=actor or actor=any(plan.team_employee_ids)) or plan.event_date<>(now() at time zone 'Europe/Berlin')::date or coalesce(app_private.planning_meta(plan.notes)->>'status','') not in ('planned','confirmed') or exists(select 1 from public.work_orders where id=plan.id) then raise exception 'Diese heutige Planung ist nicht verfügbar oder Ihnen nicht zugeordnet.'; end if;
  end if;
  if p_source='gps' then
    lat:=(p_position->>'latitude')::double precision;lon:=(p_position->>'longitude')::double precision;accuracy:=(p_position->>'accuracy')::double precision;
    select * into loc from public.customer_locations where customer_id=p_customer and business_id=company;
    if not found or lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180 or accuracy not between 0 and 100 or
      6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(lat-loc.latitude)/2),2)+cos(radians(lat))*cos(radians(loc.latitude))*power(sin(radians(lon-loc.longitude)/2),2))))>loc.radius_m then raise exception 'Noch keine sichere GPS-Ankunft am Kundenstandort.'; end if;
  elsif p_source<>'manual' or p_source is null then raise exception 'Ungültige Ankunftsart.'; end if;
  select * into timer from public.job_timers where employee_id=actor and finished_at is null;
  if found then if timer.customer_id=p_customer then return to_jsonb(timer); else raise exception 'Es läuft bereits ein Timer für einen anderen Kunden.'; end if; end if;
  insert into public.job_timers(employee_id,business_id,customer_id,customer_name,customer_address,appointment_id,source)
    values(actor,company,customer.id,customer.name,concat_ws(' ',nullif(customer.custom_fields->>'street',''),nullif(customer.custom_fields->>'house_no',''),nullif(customer.custom_fields->>'postal_code',''),nullif(customer.custom_fields->>'city','')),p_appointment,p_source) returning * into timer;
  return to_jsonb(timer);
end; $$;

create function app_private.stop_job_timer_v865(p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare timer public.job_timers;
begin
  if auth.uid() is null or app_private.team_company(auth.uid()) is null then raise exception 'Bitte anmelden.'; end if;
  select * into timer from public.job_timers where id=p_id and employee_id=auth.uid() and business_id=app_private.team_company(auth.uid()) for update;
  if not found or timer.consumed_at is not null then raise exception 'Der eigene Timer wurde nicht gefunden oder bereits übernommen.'; end if;
  if timer.finished_at is null then update public.job_timers set finished_at=greatest(now(),started_at) where id=timer.id returning * into timer; end if;
  return to_jsonb(timer);
end; $$;

create function app_private.save_timer_work_order_v865(p_timer_id uuid,p_order jsonb,p_periods jsonb,p_items jsonb,p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare timer public.job_timers; saved jsonb;
begin
  if auth.uid() is null or app_private.team_company(auth.uid()) is null then raise exception 'Bitte anmelden.'; end if;
  select * into timer from public.job_timers where id=p_timer_id and employee_id=auth.uid() and business_id=app_private.team_company(auth.uid()) for update;
  if not found or timer.finished_at is null then raise exception 'Bitte zuerst den eigenen Timer beenden.'; end if;
  if timer.consumed_at is not null then
    select to_jsonb(w) into saved from public.work_orders w where id=timer.work_order_id;
    if saved is null then raise exception 'Der zugehörige Arbeitsschein wurde gelöscht. Der Timer wird nicht erneut gebucht.'; end if;
    return saved;
  end if;
  if timer.customer_id is null or (p_order->>'customer_id')::uuid is distinct from timer.customer_id or (p_order->>'work_date')::date<>(timer.started_at at time zone 'Europe/Berlin')::date
    or not exists(select 1 from jsonb_array_elements(p_periods) period where period->>'employee_id'=auth.uid()::text) then raise exception 'Kunde, Datum oder eigener Mitarbeiter passt nicht zum Timer.'; end if;
  saved:=to_jsonb(public.save_team_work_order(p_order,p_periods,p_items,p_plan_id));
  update public.job_timers set consumed_at=now(),work_order_id=(saved->>'id')::uuid where id=timer.id;
  return saved;
end; $$;

revoke all on function app_private.start_job_timer_v865(uuid,uuid,text,jsonb),app_private.stop_job_timer_v865(uuid),app_private.save_timer_work_order_v865(uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.start_job_timer_v865(uuid,uuid,text,jsonb),app_private.stop_job_timer_v865(uuid),app_private.save_timer_work_order_v865(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
create function public.start_job_timer(p_customer uuid,p_appointment uuid default null,p_source text default 'manual',p_position jsonb default null)
returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.start_job_timer_v865(p_customer,p_appointment,p_source,p_position)$$;
create function public.stop_job_timer(p_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.stop_job_timer_v865(p_id)$$;
create function public.save_team_work_order_from_timer(p_timer_id uuid,p_order jsonb,p_periods jsonb,p_items jsonb default '[]',p_plan_id uuid default null)
returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.save_timer_work_order_v865(p_timer_id,p_order,p_periods,p_items,p_plan_id)$$;
revoke all on function public.start_job_timer(uuid,uuid,text,jsonb),public.stop_job_timer(uuid),public.save_team_work_order_from_timer(uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.start_job_timer(uuid,uuid,text,jsonb),public.stop_job_timer(uuid),public.save_team_work_order_from_timer(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
