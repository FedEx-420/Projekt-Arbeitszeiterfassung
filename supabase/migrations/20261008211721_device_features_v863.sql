-- Additive device features: no existing accounts, time, orders or prices change.
begin;
create table public.receipt_scans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  receipt_date date not null,
  category text not null check(category in ('fuel','receipt','training')),
  title text not null check(length(btrim(title)) between 1 and 160),
  items jsonb not null default '[]' check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=150),
  gross_total numeric(12,2) check(gross_total>=0),
  net_total numeric(12,2) check(net_total>=0),
  ocr_text text not null default '' check(length(ocr_text)<=30000),
  file_path text check(length(file_path)<=1024),
  file_name text check(length(file_name)<=255),
  created_at timestamptz not null default now()
);
create index receipt_scans_employee_date on public.receipt_scans(employee_id,receipt_date);
create index receipt_scans_business on public.receipt_scans(business_id);
create index receipt_scans_order on public.receipt_scans(work_order_id);
alter table public.receipt_scans enable row level security;
revoke all on public.receipt_scans from public,anon,authenticated;
grant select,insert,update,delete on public.receipt_scans to authenticated;
create policy receipt_read on public.receipt_scans for select to authenticated using (
  employee_id=(select auth.uid()) or app_private.team_can_manage(business_id)
  or (work_order_id is not null and app_private.team_order_access(work_order_id))
);
create policy receipt_insert on public.receipt_scans for insert to authenticated with check (
  business_id=app_private.team_company(employee_id)
  and (employee_id=(select auth.uid()) or app_private.team_can_manage(business_id))
  and (work_order_id is null or (app_private.team_order_access(work_order_id)
    and exists(select 1 from public.work_orders w where w.id=work_order_id and app_private.team_company(w.employee_id)=business_id)))
  and (file_path is null or app_private.team_document_folder_access(file_path))
);
create policy receipt_update on public.receipt_scans for update to authenticated using (
  employee_id=(select auth.uid()) or app_private.team_can_manage(business_id)
) with check (
  business_id=app_private.team_company(employee_id)
  and (employee_id=(select auth.uid()) or app_private.team_can_manage(business_id))
  and (work_order_id is null or (app_private.team_order_access(work_order_id)
    and exists(select 1 from public.work_orders w where w.id=work_order_id and app_private.team_company(w.employee_id)=business_id)))
  and (file_path is null or app_private.team_document_folder_access(file_path))
);
create policy receipt_delete on public.receipt_scans for delete to authenticated using (
  employee_id=(select auth.uid()) or app_private.team_can_manage(business_id)
);
create policy "Receipt images readable with their receipt" on storage.objects for select to authenticated using (
  bucket_id='work-order-documents' and exists(select 1 from public.receipt_scans r where r.file_path=name)
);

create table public.company_notification_settings (
  business_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  reminder_minutes integer not null default 30 check(reminder_minutes between 0 and 10080),
  notification_time time,
  check(notification_time is null or extract(second from notification_time)=0)
);
alter table public.company_notification_settings enable row level security;
revoke all on public.company_notification_settings from public,anon,authenticated;
grant select,insert,update,delete on public.company_notification_settings to authenticated;
create policy notification_settings_read on public.company_notification_settings for select to authenticated using (
  app_private.team_can_manage(business_id) or business_id=app_private.team_company((select auth.uid()))
);
create policy notification_settings_insert on public.company_notification_settings for insert to authenticated with check (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='administrator')
  and exists(select 1 from public.profiles p where p.id=company_notification_settings.business_id and p.role='business')
);
create policy notification_settings_update on public.company_notification_settings for update to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='administrator')
) with check (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='administrator')
  and exists(select 1 from public.profiles p where p.id=company_notification_settings.business_id and p.role='business')
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check(length(endpoint)<=2000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)?notify\.windows\.com)/'),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{20,30}={0,2}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
create policy push_own_read on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid())));
create policy push_own_update on public.push_subscriptions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid())));
create policy push_own_delete on public.push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));

-- Delivery claims are not a client API. Only the server's existing service role
-- receives privileges; no SECURITY DEFINER or anonymous execute is added.
create table public.push_deliveries (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  lease_until timestamptz not null default now(),
  attempts integer not null default 1,
  primary key(appointment_id,subscription_id,scheduled_at)
);
create index push_deliveries_subscription on public.push_deliveries(subscription_id);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.push_subscriptions,public.push_deliveries to service_role;
grant select on public.profiles,public.appointments,public.company_notification_settings to service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.team_company(uuid),app_private.planning_meta(text) to service_role;

create function app_private.reminder_at_v863(p_date date,p_notes text,p_minutes integer,p_time time)
returns timestamptz language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare meta jsonb; starts time; planned_at timestamptz;
begin
  meta:=app_private.planning_meta(p_notes);
  if coalesce(meta->>'status','') not in ('planned','confirmed') or coalesce(meta->>'start','')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
  starts:=(meta->>'start')::time;
  planned_at:=(p_date+starts) at time zone 'Europe/Berlin';
  if p_time is not null then
    if p_time>starts then return null; end if;
    return (p_date+p_time) at time zone 'Europe/Berlin';
  end if;
  return planned_at-make_interval(mins=>p_minutes);
end; $$;
revoke all on function app_private.reminder_at_v863(date,text,integer,time) from public,anon,authenticated;
grant execute on function app_private.reminder_at_v863(date,text,integer,time) to service_role;

create function public.claim_appointment_push_v863()
returns table(appointment_id uuid,subscription_id uuid,scheduled_at timestamptz,endpoint text,p256dh text,auth text)
language sql security invoker set search_path=pg_catalog,public,pg_temp as $$
  with due as (
    select a.id appointment_id,s.id subscription_id,app_private.reminder_at_v863(a.event_date,a.notes,c.reminder_minutes,c.notification_time) scheduled_at
    from public.appointments a
    join public.company_notification_settings c on c.business_id=app_private.team_company(a.employee_id) and c.enabled
    join public.push_subscriptions s on s.enabled and (s.user_id=a.employee_id or s.user_id=any(a.team_employee_ids))
    join public.profiles p on p.id=s.user_id and app_private.team_company(p.id)=c.business_id
    where a.event_date between (now() at time zone 'Europe/Berlin')::date-1 and (now() at time zone 'Europe/Berlin')::date+7
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
create table public.customer_locations (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  radius_m integer not null default 150 check(radius_m between 50 and 500)
);
create index customer_locations_business on public.customer_locations(business_id);
alter table public.customer_locations enable row level security;
revoke all on public.customer_locations from public,anon,authenticated;
grant select,insert,update,delete on public.customer_locations to authenticated;
create policy customer_location_read on public.customer_locations for select to authenticated using (
  app_private.team_can_manage(business_id) or business_id=app_private.team_company((select auth.uid()))
);
create policy customer_location_insert on public.customer_locations for insert to authenticated with check (
  app_private.team_can_manage(business_id) and exists(select 1 from public.customers c where c.id=customer_id and app_private.team_company(c.employee_id)=business_id)
);
create policy customer_location_update on public.customer_locations for update to authenticated using(app_private.team_can_manage(business_id)) with check (
  app_private.team_can_manage(business_id) and exists(select 1 from public.customers c where c.id=customer_id and app_private.team_company(c.employee_id)=business_id)
);
create policy customer_location_delete on public.customer_locations for delete to authenticated using(app_private.team_can_manage(business_id));

create table public.order_arrivals (
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  arrived_at timestamptz not null default now(),
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_m double precision not null check(accuracy_m between 0 and 5000),
  source text not null check(source in ('manual','proximity')),
  primary key(work_order_id,employee_id)
);
create index order_arrivals_employee on public.order_arrivals(employee_id,arrived_at);
create index order_arrivals_business on public.order_arrivals(business_id);
alter table public.order_arrivals enable row level security;
revoke all on public.order_arrivals from public,anon,authenticated;
grant select on public.order_arrivals to authenticated;
grant insert(work_order_id,employee_id,business_id,latitude,longitude,accuracy_m,source) on public.order_arrivals to authenticated;
create policy arrival_read on public.order_arrivals for select to authenticated using(employee_id=(select auth.uid()) or app_private.team_can_manage(business_id));
create policy arrival_insert on public.order_arrivals for insert to authenticated with check (
  employee_id=(select auth.uid()) and business_id=app_private.team_company((select auth.uid()))
  and exists(select 1 from public.work_orders w where w.id=work_order_id
    and app_private.team_company(w.employee_id)=order_arrivals.business_id and app_private.team_order_access(w.id)
    and w.work_date=(now() at time zone 'Europe/Berlin')::date
    and (source='manual' or (accuracy_m<=100 and exists(select 1 from public.customer_locations loc where loc.customer_id=w.customer_id and loc.business_id=order_arrivals.business_id
      and 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(order_arrivals.latitude-loc.latitude)/2),2)+cos(radians(order_arrivals.latitude))*cos(radians(loc.latitude))*power(sin(radians(order_arrivals.longitude-loc.longitude)/2),2))))<=loc.radius_m)))
  )
);
commit;
