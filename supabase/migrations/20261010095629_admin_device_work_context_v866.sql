-- Explicit personal work identity for one administrator device. Never changes
-- the authenticated identity or company/employee view permissions.
begin;
create table public.work_device_contexts (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid unique references public.push_subscriptions(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index work_device_context_owner on public.work_device_contexts(owner_id);
create index work_device_context_employee on public.work_device_contexts(employee_id);
create index work_device_context_business on public.work_device_contexts(business_id);
alter table public.work_device_contexts enable row level security;
revoke all on public.work_device_contexts from public,anon,authenticated,service_role;
grant select on public.work_device_contexts to authenticated,service_role;
create policy work_device_read on public.work_device_contexts for select to authenticated using (
  owner_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='administrator')
);

create function app_private.device_worker_v866(p_device uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='administrator') then raise exception 'Nur der angemeldete Administrator kann sein persönliches Arbeitskonto verknüpfen.'; end if;
  select d.employee_id into worker from public.work_device_contexts d
    join public.profiles p on p.id=d.employee_id and p.role in ('employee','business')
    join public.profiles b on b.id=d.business_id and b.role='business'
    where d.id=p_device and d.owner_id=auth.uid() and app_private.team_company(p.id)=d.business_id;
  if worker is null then raise exception 'Bitte das persönliche Arbeitskonto für dieses Gerät erneut auswählen.'; end if;
  return worker;
end; $$;

create function app_private.set_work_device_context_v866(p_device uuid,p_employee uuid,p_subscription uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare company uuid; result public.work_device_contexts;
begin
  if auth.uid() is null or p_device is null or not exists(select 1 from public.profiles where id=auth.uid() and role='administrator') then raise exception 'Nur der angemeldete Administrator kann sein persönliches Arbeitskonto verknüpfen.'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  if exists(select 1 from public.work_device_contexts where id=p_device and owner_id<>auth.uid()) then raise exception 'Dieses Gerät gehört nicht zu Ihrem Zugang.'; end if;
  if p_employee is null then delete from public.work_device_contexts where id=p_device and owner_id=auth.uid();return null;end if;
  company:=app_private.team_company(p_employee);
  if company is null or not exists(select 1 from public.profiles where id=p_employee and role in ('employee','business')) or not exists(select 1 from public.profiles where id=company and role='business') then raise exception 'Das Arbeitskonto wurde gelöscht oder gehört zu keiner Firma.'; end if;
  if p_subscription is not null and not exists(select 1 from public.push_subscriptions where id=p_subscription and user_id=auth.uid() and enabled) then raise exception 'Die Push-Freigabe gehört nicht zu diesem angemeldeten Konto.'; end if;
  insert into public.work_device_contexts(id,owner_id,employee_id,business_id,subscription_id)
    values(p_device,auth.uid(),p_employee,company,p_subscription)
    on conflict(id) do update set employee_id=excluded.employee_id,business_id=excluded.business_id,subscription_id=excluded.subscription_id,updated_at=now()
    where work_device_contexts.owner_id=auth.uid() returning * into result;
  if result.id is null then raise exception 'Die Geräteverknüpfung konnte nicht bestätigt werden.'; end if;
  return to_jsonb(result);
end; $$;

create function app_private.start_device_job_timer_v866(p_device uuid,p_customer uuid,p_appointment uuid,p_source text,p_position jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid:=app_private.device_worker_v866(p_device);company uuid;customer public.customers;plan public.appointments;loc public.customer_locations;timer public.job_timers;lat double precision;lon double precision;accuracy double precision;
begin
  company:=app_private.team_company(worker);
  perform 1 from public.profiles where id=worker for update;
  perform app_private.team_check_day(worker,(now() at time zone 'Europe/Berlin')::date);
  select * into customer from public.customers where id=p_customer and app_private.team_company(employee_id)=company;
  if not found then raise exception 'Der Kunde gehört nicht zur Firma Ihres Arbeitskontos.'; end if;
  if p_appointment is not null then
    select * into plan from public.appointments where id=p_appointment and customer_id=p_customer and app_private.team_company(employee_id)=company;
    if not found or not (plan.employee_id=worker or worker=any(plan.team_employee_ids)) or plan.event_date<>(now() at time zone 'Europe/Berlin')::date or coalesce(app_private.planning_meta(plan.notes)->>'status','') not in ('planned','confirmed') or exists(select 1 from public.work_orders where id=plan.id) then raise exception 'Diese heutige Planung ist Ihrem Arbeitskonto nicht zugeordnet oder nicht mehr verfügbar.'; end if;
  end if;
  if p_source='gps' then
    lat:=(p_position->>'latitude')::double precision;lon:=(p_position->>'longitude')::double precision;accuracy:=(p_position->>'accuracy')::double precision;
    select * into loc from public.customer_locations where customer_id=p_customer and business_id=company;
    if not found or lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180 or accuracy not between 0 and 100 or
      6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(lat-loc.latitude)/2),2)+cos(radians(lat))*cos(radians(loc.latitude))*power(sin(radians(lon-loc.longitude)/2),2))))>loc.radius_m then raise exception 'Noch keine sichere GPS-Ankunft am Kundenstandort.'; end if;
  elsif p_source<>'manual' or p_source is null then raise exception 'Ungültige Ankunftsart.'; end if;
  select * into timer from public.job_timers where employee_id=worker and finished_at is null;
  if found then if timer.customer_id=p_customer then return to_jsonb(timer);else raise exception 'Für Ihr Arbeitskonto läuft bereits ein Timer bei einem anderen Kunden.';end if;end if;
  insert into public.job_timers(employee_id,business_id,customer_id,customer_name,customer_address,appointment_id,source)
    values(worker,company,customer.id,customer.name,concat_ws(' ',nullif(customer.custom_fields->>'street',''),nullif(customer.custom_fields->>'house_no',''),nullif(customer.custom_fields->>'postal_code',''),nullif(customer.custom_fields->>'city','')),p_appointment,p_source) returning * into timer;
  return to_jsonb(timer);
end; $$;

create function app_private.stop_device_job_timer_v866(p_device uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid:=app_private.device_worker_v866(p_device);timer public.job_timers;
begin
  select * into timer from public.job_timers where id=p_id and employee_id=worker and business_id=app_private.team_company(worker) for update;
  if not found or timer.consumed_at is not null then raise exception 'Der Timer Ihres Arbeitskontos wurde nicht gefunden oder bereits übernommen.'; end if;
  if timer.finished_at is null then update public.job_timers set finished_at=greatest(now(),started_at) where id=timer.id returning * into timer;end if;
  return to_jsonb(timer);
end; $$;

create function app_private.save_device_timer_order_v866(p_device uuid,p_timer_id uuid,p_order jsonb,p_periods jsonb,p_items jsonb,p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid:=app_private.device_worker_v866(p_device);timer public.job_timers;saved jsonb;
begin
  select * into timer from public.job_timers where id=p_timer_id and employee_id=worker and business_id=app_private.team_company(worker) for update;
  if not found or timer.finished_at is null then raise exception 'Bitte zuerst den Timer Ihres Arbeitskontos beenden.'; end if;
  if timer.consumed_at is not null then
    select to_jsonb(w) into saved from public.work_orders w where id=timer.work_order_id;
    if saved is null then raise exception 'Der zugehörige Arbeitsschein wurde gelöscht. Der Timer wird nicht erneut gebucht.';end if;
    return saved;
  end if;
  if timer.customer_id is null or (p_order->>'customer_id')::uuid is distinct from timer.customer_id or (p_order->>'work_date')::date is distinct from (timer.started_at at time zone 'Europe/Berlin')::date
    or not exists(select 1 from jsonb_array_elements(p_periods) period where period->>'employee_id'=worker::text) then raise exception 'Kunde, Datum oder persönliches Arbeitskonto passt nicht zum Timer.';end if;
  -- Keep the real admin actor: the established team API rechecks its rights.
  saved:=to_jsonb(public.save_team_work_order(p_order,p_periods,p_items,p_plan_id));
  update public.job_timers set consumed_at=now(),work_order_id=(saved->>'id')::uuid where id=timer.id;
  return saved;
end; $$;

create function app_private.record_device_arrival_v866(p_device uuid,p_order uuid,p_position jsonb,p_source text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid:=app_private.device_worker_v866(p_device);company uuid:=app_private.team_company(worker);ord public.work_orders;loc public.customer_locations;arrival public.order_arrivals;lat double precision:=(p_position->>'latitude')::double precision;lon double precision:=(p_position->>'longitude')::double precision;accuracy double precision:=(p_position->>'accuracy')::double precision;
begin
  select * into ord from public.work_orders w where w.id=p_order and app_private.team_company(w.employee_id)=company and w.work_date=(now() at time zone 'Europe/Berlin')::date
    and (w.employee_id=worker or exists(select 1 from jsonb_array_elements(w.team_periods) t where t->>'employee_id'=worker::text));
  if not found then raise exception 'Dieser heutige Auftrag gehört nicht zu Ihrem Arbeitskonto.';end if;
  if lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180 or accuracy not between 0 and 5000 or p_source is null or p_source not in ('manual','proximity') then raise exception 'Ungültige GPS-Position.';end if;
  if p_source='proximity' then
    select * into loc from public.customer_locations where customer_id=ord.customer_id and business_id=company;
    if not found or accuracy>100 or 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(lat-loc.latitude)/2),2)+cos(radians(lat))*cos(radians(loc.latitude))*power(sin(radians(lon-loc.longitude)/2),2))))>loc.radius_m then raise exception 'Noch keine sichere GPS-Ankunft am Kundenstandort.';end if;
  end if;
  insert into public.order_arrivals(work_order_id,employee_id,business_id,latitude,longitude,accuracy_m,source) values(p_order,worker,company,lat,lon,accuracy,p_source) on conflict(work_order_id,employee_id) do nothing;
  select * into arrival from public.order_arrivals where work_order_id=p_order and employee_id=worker;
  return to_jsonb(arrival);
end; $$;

-- Public wrappers are invoker-only; privileged implementations are private,
-- authenticated-only, with live role/ownership checks on every operation.
revoke all on function app_private.device_worker_v866(uuid),app_private.set_work_device_context_v866(uuid,uuid,uuid),app_private.start_device_job_timer_v866(uuid,uuid,uuid,text,jsonb),app_private.stop_device_job_timer_v866(uuid,uuid),app_private.save_device_timer_order_v866(uuid,uuid,jsonb,jsonb,jsonb,uuid),app_private.record_device_arrival_v866(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function app_private.set_work_device_context_v866(uuid,uuid,uuid),app_private.start_device_job_timer_v866(uuid,uuid,uuid,text,jsonb),app_private.stop_device_job_timer_v866(uuid,uuid),app_private.save_device_timer_order_v866(uuid,uuid,jsonb,jsonb,jsonb,uuid),app_private.record_device_arrival_v866(uuid,uuid,jsonb,text) to authenticated;
create function public.set_work_device_context(p_device uuid,p_employee uuid,p_subscription uuid default null) returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.set_work_device_context_v866(p_device,p_employee,p_subscription)$$;
create function public.start_job_timer_for_device(p_device uuid,p_customer uuid,p_appointment uuid default null,p_source text default 'manual',p_position jsonb default null) returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.start_device_job_timer_v866(p_device,p_customer,p_appointment,p_source,p_position)$$;
create function public.stop_job_timer_for_device(p_device uuid,p_id uuid) returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.stop_device_job_timer_v866(p_device,p_id)$$;
create function public.save_team_work_order_from_device_timer(p_device uuid,p_timer_id uuid,p_order jsonb,p_periods jsonb,p_items jsonb default '[]',p_plan_id uuid default null) returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.save_device_timer_order_v866(p_device,p_timer_id,p_order,p_periods,p_items,p_plan_id)$$;
create function public.record_order_arrival_for_device(p_device uuid,p_order uuid,p_position jsonb,p_source text default 'manual') returns jsonb language sql security invoker set search_path=pg_catalog,public,pg_temp as $$select app_private.record_device_arrival_v866(p_device,p_order,p_position,p_source)$$;
revoke all on function public.set_work_device_context(uuid,uuid,uuid),public.start_job_timer_for_device(uuid,uuid,uuid,text,jsonb),public.stop_job_timer_for_device(uuid,uuid),public.save_team_work_order_from_device_timer(uuid,uuid,jsonb,jsonb,jsonb,uuid),public.record_order_arrival_for_device(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.set_work_device_context(uuid,uuid,uuid),public.start_job_timer_for_device(uuid,uuid,uuid,text,jsonb),public.stop_job_timer_for_device(uuid,uuid),public.save_team_work_order_from_device_timer(uuid,uuid,jsonb,jsonb,jsonb,uuid),public.record_order_arrival_for_device(uuid,uuid,jsonb,text) to authenticated;

create or replace function public.claim_appointment_push_v863()
returns table(appointment_id uuid,subscription_id uuid,scheduled_at timestamptz,endpoint text,p256dh text,auth text)
language sql security invoker set search_path=pg_catalog,public,pg_temp as $$
  with due as (
    select a.id appointment_id,s.id subscription_id,
      app_private.reminder_at_v863(a.event_date,a.notes,
        case when r.appointment_id is not null then r.reminder_minutes else c.reminder_minutes end,
        case when r.appointment_id is not null then r.notification_time else c.notification_time end) scheduled_at
    from public.appointments a
    left join public.appointment_reminders r on r.appointment_id=a.id and r.business_id=app_private.team_company(a.employee_id)
    left join public.company_notification_settings c on c.business_id=app_private.team_company(a.employee_id)
    join public.push_subscriptions s on s.enabled
    join public.profiles p on p.id=s.user_id
    where (case when r.appointment_id is not null then r.enabled else coalesce(c.enabled,false) end)
      and a.event_date between (now() at time zone 'Europe/Berlin')::date-1 and (now() at time zone 'Europe/Berlin')::date+7
      and (
        (app_private.team_company(p.id)=app_private.team_company(a.employee_id) and (p.id=a.employee_id or p.id=any(a.team_employee_ids)))
        or (p.role='administrator' and exists(select 1 from public.work_device_contexts d join public.profiles w on w.id=d.employee_id and w.role in ('employee','business')
          where d.owner_id=p.id and d.subscription_id=s.id and d.business_id=app_private.team_company(w.id) and d.business_id=app_private.team_company(a.employee_id)
            and (w.id=a.employee_id or w.id=any(a.team_employee_ids))))
      )
  ), claimed as (
    insert into public.push_deliveries(appointment_id,subscription_id,scheduled_at,lease_until)
    select d.appointment_id,d.subscription_id,d.scheduled_at,now()+interval '3 minutes' from due d
    where d.scheduled_at<=now() and d.scheduled_at>now()-interval '15 minutes'
      and not exists(select 1 from public.push_deliveries old where old.appointment_id=d.appointment_id and old.subscription_id=d.subscription_id and old.scheduled_at=d.scheduled_at and (old.sent_at is not null or old.lease_until>=now() or old.attempts>=3))
    order by d.scheduled_at limit 100
    on conflict(appointment_id,subscription_id,scheduled_at) do update set lease_until=excluded.lease_until,attempts=push_deliveries.attempts+1
    where push_deliveries.sent_at is null and push_deliveries.lease_until<now() and push_deliveries.attempts<3
    returning push_deliveries.appointment_id,push_deliveries.subscription_id,push_deliveries.scheduled_at
  ) select c.appointment_id,c.subscription_id,c.scheduled_at,s.endpoint,s.p256dh,s.auth from claimed c join public.push_subscriptions s on s.id=c.subscription_id;
$$;
revoke all on function public.claim_appointment_push_v863() from public,anon,authenticated;
grant execute on function public.claim_appointment_push_v863() to service_role;
notify pgrst,'reload schema';
commit;
