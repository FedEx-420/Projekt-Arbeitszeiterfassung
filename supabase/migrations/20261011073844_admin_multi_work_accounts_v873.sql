-- Additive personal multi-company device scope. No historical time/order changes.
begin;
create table public.admin_personal_accounts_v873 (
 owner_id uuid not null references public.profiles(id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade,
 business_id uuid not null references public.profiles(id) on delete cascade,
 primary key(owner_id,employee_id)
);
create index admin_personal_worker_v873 on public.admin_personal_accounts_v873(employee_id);
create index admin_personal_business_v873 on public.admin_personal_accounts_v873(business_id);
alter table public.admin_personal_accounts_v873 enable row level security;
revoke all on public.admin_personal_accounts_v873 from public,anon,authenticated,service_role;
grant select on public.admin_personal_accounts_v873 to authenticated,service_role;
create policy admin_personal_read_v873 on public.admin_personal_accounts_v873 for select to authenticated using (
 owner_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='administrator')
);
create table public.work_device_accounts_v873 (
 device_id uuid not null references public.work_device_contexts(id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade,
 business_id uuid not null references public.profiles(id) on delete cascade,
 primary key(device_id,employee_id)
);
create index work_device_worker_v873 on public.work_device_accounts_v873(employee_id);
create index work_device_business_v873 on public.work_device_accounts_v873(business_id);
alter table public.work_device_accounts_v873 enable row level security;
revoke all on public.work_device_accounts_v873 from public,anon,authenticated,service_role;
grant select on public.work_device_accounts_v873 to authenticated,service_role;
create policy work_device_accounts_read_v873 on public.work_device_accounts_v873 for select to authenticated using (
 exists(select 1 from public.work_device_contexts d join public.profiles p on p.id=d.owner_id
 where d.id=device_id and d.owner_id=(select auth.uid()) and p.role='administrator')
);
create table app_private.owntracks_groups_v873 (
 capability_id uuid primary key references app_private.owntracks_devices_v871(id) on delete cascade,
 primary_employee_id uuid not null references public.profiles(id) on delete cascade,
 member_count integer not null check(member_count between 2 and 5)
);
create index owntracks_group_primary_v873 on app_private.owntracks_groups_v873(primary_employee_id);
create table app_private.owntracks_group_members_v873 (
 capability_id uuid not null references app_private.owntracks_groups_v873(capability_id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade,
 business_id uuid not null references public.profiles(id) on delete cascade,
 primary key(capability_id,employee_id), unique(capability_id,business_id)
);
create index owntracks_group_worker_v873 on app_private.owntracks_group_members_v873(employee_id);
create index owntracks_group_business_v873 on app_private.owntracks_group_members_v873(business_id);
alter table app_private.owntracks_groups_v873 enable row level security;
alter table app_private.owntracks_group_members_v873 enable row level security;
revoke all on app_private.owntracks_groups_v873,app_private.owntracks_group_members_v873 from public,anon,authenticated,service_role;

-- Internal scope: primary plus explicitly saved additional accounts, never every
-- profile visible to an administrator. Called only from checked private code.
create function app_private.device_accounts_v873(p_device uuid)
returns table(employee_id uuid,business_id uuid) language sql stable security definer set search_path='' as $$
 select d.employee_id,d.business_id from public.work_device_contexts d where d.id=p_device
 union select a.employee_id,a.business_id from public.work_device_accounts_v873 a where a.device_id=p_device
$$;
revoke all on function app_private.device_accounts_v873(uuid) from public,anon,authenticated,service_role;

create function app_private.set_work_device_accounts_v873(p_device uuid,p_primary uuid,p_employees uuid[],p_subscription uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare saved jsonb; n integer; firms integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='administrator') then raise exception 'Nur der Administrator kann seine persönlichen Arbeitskonten verknüpfen.' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if p_employees is null or array_position(p_employees,null) is not null then raise exception 'Bitte gültige Arbeitskonten auswählen.';end if;
 n:=cardinality(p_employees);
 if n=0 and p_primary is null then
  saved:=app_private.set_work_device_context_v866(p_device,null,p_subscription);
  return jsonb_build_object('context',saved,'accounts','[]'::jsonb);
 end if;
 if n not between 1 and 5 or p_primary is null or not (p_primary=any(p_employees)) or n<>(select count(distinct x) from unnest(p_employees) x) then raise exception 'Bitte ein Hauptarbeitskonto und bis zu fünf unterschiedliche Firmen auswählen.';end if;
 perform 1 from public.profiles where id=any(p_employees) order by id for update;
 select count(distinct app_private.team_company(p.id)) into firms from public.profiles p join public.profiles b on b.id=app_private.team_company(p.id) and b.role='business'
 where p.id=any(p_employees) and p.role in ('employee','business');
 if firms<>n then raise exception 'Pro Firma ist genau ein vorhandenes persönliches Arbeitskonto erlaubt.';end if;
 saved:=app_private.set_work_device_context_v866(p_device,p_primary,p_subscription);
 delete from public.work_device_accounts_v873 where device_id=p_device;
 insert into public.work_device_accounts_v873(device_id,employee_id,business_id)
 select p_device,x,app_private.team_company(x) from unnest(p_employees) x where x<>p_primary;
 delete from public.admin_personal_accounts_v873 where owner_id=auth.uid();
 insert into public.admin_personal_accounts_v873(owner_id,employee_id,business_id)
 select auth.uid(),x,app_private.team_company(x) from unnest(p_employees) x;
 return jsonb_build_object('context',saved,'accounts',(select jsonb_agg(to_jsonb(a) order by a.employee_id) from app_private.device_accounts_v873(p_device) a));
end $$;
revoke all on function app_private.set_work_device_accounts_v873(uuid,uuid,uuid[],uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.set_work_device_accounts_v873(uuid,uuid,uuid[],uuid) to authenticated;
create function public.set_work_device_accounts_v873(p_device uuid,p_primary uuid,p_employees uuid[],p_subscription uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select app_private.set_work_device_accounts_v873(p_device,p_primary,p_employees,p_subscription)$$;
revoke all on function public.set_work_device_accounts_v873(uuid,uuid,uuid[],uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_work_device_accounts_v873(uuid,uuid,uuid[],uuid) to authenticated;

create function app_private.owntracks_group_valid_v873(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.owntracks_devices_v871 d
 join app_private.owntracks_groups_v873 g on g.capability_id=d.id
 join public.profiles o on o.id=d.owner_id and o.role='administrator' and o.role=d.owner_role
 join public.work_device_contexts c on c.id=d.device_id and c.owner_id=o.id and c.employee_id=g.primary_employee_id
 where d.id=p_id and d.revoked_at is null and d.expires_at>now()
 and g.member_count=(select count(*) from app_private.owntracks_group_members_v873 m where m.capability_id=d.id)
 and g.member_count=(select count(*) from app_private.device_accounts_v873(d.device_id))
 and exists(select 1 from app_private.owntracks_group_members_v873 m where m.capability_id=d.id and m.employee_id=d.employee_id and m.business_id=d.business_id)
 and not exists(select 1 from app_private.owntracks_group_members_v873 m
 left join public.profiles w on w.id=m.employee_id and w.role in ('employee','business')
 left join public.profiles b on b.id=m.business_id and b.role='business'
 where m.capability_id=d.id and (w.id is null or b.id is null or app_private.team_company(w.id) is distinct from m.business_id
 or (w.role='employee' and w.menu_permissions->>'orders'='false')
 or not exists(select 1 from app_private.device_accounts_v873(d.device_id) a where a.employee_id=m.employee_id and a.business_id=m.business_id)))
 )
$$;
revoke all on function app_private.owntracks_group_valid_v873(uuid) from public,anon,authenticated,service_role;

create function app_private.owntracks_setup_v873(p_device uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare result jsonb; primary_worker uuid:=app_private.device_worker_v866(p_device);
begin
 result:=app_private.owntracks_setup_v871(p_device);
 return result || jsonb_build_object('accounts',(select jsonb_agg(jsonb_build_object('employee_id',p.id,'business_id',a.business_id,
  'employee_name',coalesce(nullif(p.display_name,''),p.username),'company_name',coalesce(nullif(b.company_name,''),b.display_name,b.username)) order by a.business_id)
  from app_private.device_accounts_v873(p_device) a join public.profiles p on p.id=a.employee_id and p.role in ('employee','business')
  join public.profiles b on b.id=a.business_id and b.role='business' where app_private.team_company(p.id)=a.business_id),
 'customers_ready',(select count(*) from public.customers c join public.customer_locations l on l.customer_id=c.id
  where exists(select 1 from app_private.device_accounts_v873(p_device) a where a.business_id=l.business_id and app_private.team_company(c.employee_id)=a.business_id)
  and trim(coalesce(c.custom_fields->>'street',''))<>'' and trim(coalesce(c.custom_fields->>'house_no',''))<>''
  and trim(coalesce(c.custom_fields->>'postal_code',''))<>'' and trim(coalesce(c.custom_fields->>'city',''))<>''
  and (l.source='manual' or l.address_key=md5(app_private.geocoding_address_v869(c.id)::text))),
 'bindings',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'enabled',d.enabled,'window_start',d.window_start,'window_end',d.window_end,
  'expires_at',d.expires_at,'last_received_at',d.last_received_at,'last_status',d.last_status,
  'valid',case when g.capability_id is not null then app_private.owntracks_group_valid_v873(d.id)
  else d.expires_at>now() and d.employee_id=primary_worker and d.business_id=app_private.team_company(primary_worker) and d.owner_role='administrator' end) order by d.created_at desc)
  from app_private.owntracks_devices_v871 d left join app_private.owntracks_groups_v873 g on g.capability_id=d.id
  where d.owner_id=auth.uid() and d.device_id=p_device and d.revoked_at is null),'[]'::jsonb));
end $$;
revoke all on function app_private.owntracks_setup_v873(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.owntracks_setup_v873(uuid) to authenticated;
create function public.owntracks_setup_v873(p_device uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.owntracks_setup_v873(p_device)$$;
revoke all on function public.owntracks_setup_v873(uuid) from public,anon,authenticated,service_role;
grant execute on function public.owntracks_setup_v873(uuid) to authenticated;

create function app_private.create_owntracks_device_v873(p_device uuid,p_secret_hash text,p_start integer,p_end integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare worker uuid; result jsonb; n integer; firms integer;
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 worker:=app_private.device_worker_v866(p_device);
 select count(*),count(distinct a.business_id) into n,firms from app_private.device_accounts_v873(p_device) a;
 if n not between 2 and 5 or n<>firms then raise exception 'Bitte zuerst beide persönlichen Arbeitskonten für dieses Gerät speichern.';end if;
 result:=app_private.create_owntracks_device_v871(p_device,p_secret_hash,p_start,p_end);
 insert into app_private.owntracks_groups_v873(capability_id,primary_employee_id,member_count) values((result->>'id')::uuid,worker,n);
 insert into app_private.owntracks_group_members_v873(capability_id,employee_id,business_id)
 select (result->>'id')::uuid,a.employee_id,a.business_id from app_private.device_accounts_v873(p_device) a;
 if not app_private.owntracks_group_valid_v873((result->>'id')::uuid) then raise exception 'Ein verknüpftes Arbeitskonto ist nicht mehr gültig oder darf keine Arbeitsscheine anlegen.';end if;
 return result;
end $$;
revoke all on function app_private.create_owntracks_device_v873(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function app_private.create_owntracks_device_v873(uuid,text,integer,integer) to authenticated;
create function public.create_owntracks_device_v873(p_device uuid,p_secret_hash text,p_start integer,p_end integer) returns jsonb language sql security invoker set search_path='' as $$select app_private.create_owntracks_device_v873(p_device,p_secret_hash,p_start,p_end)$$;
revoke all on function public.create_owntracks_device_v873(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.create_owntracks_device_v873(uuid,text,integer,integer) to authenticated;

create function app_private.timer_worker_for_device_v873(p_device uuid,p_timer uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare primary_worker uuid:=app_private.device_worker_v866(p_device); worker uuid;
begin
 select t.employee_id into worker from public.job_timers t
 join app_private.device_accounts_v873(p_device) a on a.employee_id=t.employee_id and a.business_id=t.business_id
 join public.profiles w on w.id=a.employee_id and w.role in ('employee','business')
 join public.profiles b on b.id=a.business_id and b.role='business'
 where t.id=p_timer and app_private.team_company(w.id)=a.business_id;
 if worker is null then raise exception 'Dieser Timer gehört nicht zu einem Ihrer verknüpften Arbeitskonten.' using errcode='42501';end if;
 return worker;
end $$;
revoke all on function app_private.timer_worker_for_device_v873(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.start_device_job_timer_v866(p_device uuid,p_customer uuid,p_appointment uuid,p_source text,p_position jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid;company uuid;customer public.customers;plan public.appointments;loc public.customer_locations;timer public.job_timers;lat double precision;lon double precision;accuracy double precision;
begin
  perform 1 from public.profiles where id=auth.uid() for update;
  worker:=app_private.device_worker_v866(p_device);
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
  if exists(select 1 from public.job_timers t join app_private.device_accounts_v873(p_device) a on a.employee_id=t.employee_id and a.business_id=t.business_id where t.finished_at is null and t.employee_id<>worker) then raise exception 'Für ein anderes verknüpftes Arbeitskonto läuft bereits ein Timer. Bitte zuerst prüfen oder beenden.';end if;
  select * into timer from public.job_timers where employee_id=worker and finished_at is null;
  if found then if timer.customer_id=p_customer then return to_jsonb(timer);else raise exception 'Für Ihr Arbeitskonto läuft bereits ein Timer bei einem anderen Kunden.';end if;end if;
  insert into public.job_timers(employee_id,business_id,customer_id,customer_name,customer_address,appointment_id,source)
    values(worker,company,customer.id,customer.name,concat_ws(' ',nullif(customer.custom_fields->>'street',''),nullif(customer.custom_fields->>'house_no',''),nullif(customer.custom_fields->>'postal_code',''),nullif(customer.custom_fields->>'city','')),p_appointment,p_source) returning * into timer;
  return to_jsonb(timer);
end; $$;
create or replace function app_private.stop_device_job_timer_v866(p_device uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid:=app_private.timer_worker_for_device_v873(p_device,p_id);timer public.job_timers;
begin
  select * into timer from public.job_timers where id=p_id and employee_id=worker and business_id=app_private.team_company(worker) for update;
  if not found or timer.consumed_at is not null then raise exception 'Der Timer Ihres Arbeitskontos wurde nicht gefunden oder bereits übernommen.'; end if;
  if timer.finished_at is null then update public.job_timers set finished_at=greatest(now(),started_at) where id=timer.id returning * into timer;end if;
  return to_jsonb(timer);
end; $$;
create or replace function app_private.save_device_timer_order_v866(p_device uuid,p_timer_id uuid,p_order jsonb,p_periods jsonb,p_items jsonb,p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare worker uuid:=app_private.timer_worker_for_device_v873(p_device,p_timer_id);timer public.job_timers;saved jsonb;
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
        or (p.role='administrator' and exists(select 1 from public.work_device_contexts d
          join (select id device_id,employee_id,business_id from public.work_device_contexts union select device_id,employee_id,business_id from public.work_device_accounts_v873) linked on linked.device_id=d.id
          join public.profiles w on w.id=linked.employee_id and w.role in ('employee','business')
          join public.profiles b on b.id=linked.business_id and b.role='business'
          where d.owner_id=p.id and d.subscription_id=s.id and linked.business_id=app_private.team_company(w.id) and linked.business_id=app_private.team_company(a.employee_id)
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
create function app_private.receive_owntracks_v873(p_secret_hash text,p_fix jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare d app_private.owntracks_devices_v871; owner public.profiles; worker public.profiles; timer public.job_timers;
 customer public.customers; loc public.customer_locations; plan_id uuid; fix_at timestamptz;
 lat double precision;lon double precision;accuracy double precision;distance double precision; hits uuid[];
 today date:=(now() at time zone 'Europe/Berlin')::date; minutes integer:=extract(hour from now() at time zone 'Europe/Berlin')::integer*60+extract(minute from now() at time zone 'Europe/Berlin')::integer;
 stamp text; outcome text:='ignored'; active_count integer;
begin
 select * into d from app_private.owntracks_devices_v871 where secret_hash=p_secret_hash;
 if not found then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 select * into owner from public.profiles where id=d.owner_id for update;
 perform 1 from public.profiles p where p.id in (select m.employee_id from app_private.owntracks_group_members_v873 m where m.capability_id=d.id) order by p.id for update;
 select * into worker from public.profiles where id=d.employee_id;
 select * into d from app_private.owntracks_devices_v871 where id=d.id for update;
 if d.id is null or d.revoked_at is not null or d.expires_at<=now() or owner.id is null or worker.id is null
 or owner.role is distinct from d.owner_role or worker.role not in ('employee','business') or app_private.team_company(worker.id) is distinct from d.business_id
 or not exists(select 1 from public.profiles where id=d.business_id and role='business') then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 if owner.role='administrator' then
  if not app_private.owntracks_group_valid_v873(d.id) then raise exception 'Persönliche Arbeitskonten geändert. Bitte OwnTracks erneut verbinden.' using errcode='28000';end if;
 elsif owner.id<>worker.id then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 if worker.role='employee' and worker.menu_permissions->>'orders'='false' then raise exception 'Keine Arbeitsschein-Freigabe.' using errcode='42501';end if;
 if d.rate_window is null or d.rate_window<now()-interval '1 minute' then d.rate_window:=now();d.rate_calls:=0;end if;
 if d.rate_calls>=30 then return jsonb_build_object('status','rate_limited');end if;
 update app_private.owntracks_devices_v871 set rate_window=d.rate_window,rate_calls=d.rate_calls+1,last_received_at=now() where id=d.id;
 if p_fix is null then return jsonb_build_object('status','connected');end if;
 if not d.enabled or minutes<d.window_start or minutes>=d.window_end or extract(isodow from today)>5 then outcome:='paused';
 end if;
 if outcome in ('paused','day_blocked') then
  update app_private.owntracks_devices_v871 set last_status=outcome,candidate_id=null,candidate_since=null,candidate_stamp=case when exists(select 1 from public.job_timers t where t.id=timer_id and t.finished_at is null) then candidate_stamp else null end,outside_since=null where id=d.id;
  return jsonb_build_object('status',outcome);
 end if;
 if jsonb_typeof(p_fix)<>'object' or jsonb_typeof(p_fix->'lat')<>'number' or jsonb_typeof(p_fix->'lon')<>'number' or jsonb_typeof(p_fix->'acc')<>'number' or jsonb_typeof(p_fix->'tst')<>'number' then return jsonb_build_object('status','invalid_fix');end if;
 lat:=(p_fix->>'lat')::double precision;lon:=(p_fix->>'lon')::double precision;accuracy:=(p_fix->>'acc')::double precision;
 if lat not between -90 and 90 or lon not between -180 and 180 or accuracy not between 0 and 100 or (p_fix->>'tst')::numeric not between 0 and 4102444800 then return jsonb_build_object('status','invalid_fix');end if;
 fix_at:=to_timestamp((p_fix->>'tst')::double precision);
 if fix_at<now()-interval '10 minutes' or fix_at>now()+interval '30 seconds' or (fix_at at time zone 'Europe/Berlin')::date<>today or fix_at<=d.last_fix_at then return jsonb_build_object('status','stale_fix');end if;
 if d.last_fix_at is null or fix_at-d.last_fix_at>interval '10 minutes' then d.candidate_since:=null;d.outside_since:=null;end if;
 update app_private.owntracks_devices_v871 set last_fix_at=fix_at,candidate_id=d.candidate_id,candidate_since=d.candidate_since,candidate_stamp=d.candidate_stamp,outside_since=d.outside_since where id=d.id;
 -- One physical device must never start two simultaneous company timers.
 select count(*) into active_count from public.job_timers t where t.finished_at is null and t.employee_id in
 (select m.employee_id from app_private.owntracks_group_members_v873 m where m.capability_id=d.id);
 if active_count>1 then
  update app_private.owntracks_devices_v871 set last_status='other_timer' where id=d.id;
  return jsonb_build_object('status','other_timer');
 end if;
 if active_count=1 then
  select t.employee_id,t.business_id into d.employee_id,d.business_id from public.job_timers t where t.finished_at is null and t.employee_id in
   (select m.employee_id from app_private.owntracks_group_members_v873 m where m.capability_id=d.id);
 else
  select array_agg(c.id) into hits from public.customers c join public.customer_locations l on l.customer_id=c.id
  join app_private.owntracks_group_members_v873 m on m.capability_id=d.id and m.business_id=l.business_id
  where app_private.team_company(c.employee_id)=m.business_id
  and trim(coalesce(c.custom_fields->>'street',''))<>'' and trim(coalesce(c.custom_fields->>'house_no',''))<>''
  and trim(coalesce(c.custom_fields->>'postal_code',''))<>'' and trim(coalesce(c.custom_fields->>'city',''))<>''
  and (l.source='manual' or l.address_key=md5(app_private.geocoding_address_v869(c.id)::text))
  and 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(lat-l.latitude)/2),2)+cos(radians(lat))*cos(radians(l.latitude))*power(sin(radians(lon-l.longitude)/2),2))))+accuracy<=l.radius_m;
  if coalesce(cardinality(hits),0)<>1 then
   outcome:=case when cardinality(hits)>1 then 'ambiguous' else 'no_customer' end;
   update app_private.owntracks_devices_v871 set last_status=outcome,candidate_id=null,candidate_since=null,candidate_stamp=null,outside_since=null where id=d.id;
   return jsonb_build_object('status',outcome);
  end if;
  select m.employee_id,m.business_id into d.employee_id,d.business_id from app_private.owntracks_group_members_v873 m
   join public.customer_locations l on l.business_id=m.business_id where m.capability_id=d.id and l.customer_id=hits[1];
 end if;
 select * into worker from public.profiles where id=d.employee_id;
 update app_private.owntracks_devices_v871 set employee_id=d.employee_id,business_id=d.business_id where id=d.id;
 begin perform app_private.team_check_day(worker.id,today);exception when sqlstate 'P0001' then outcome:='day_blocked';end;
 if outcome='day_blocked' then
  update app_private.owntracks_devices_v871 set last_status=outcome,candidate_id=null,candidate_since=null,
   candidate_stamp=case when exists(select 1 from public.job_timers t where t.id=timer_id and t.finished_at is null) then candidate_stamp else null end,outside_since=null where id=d.id;
  return jsonb_build_object('status',outcome);
 end if;
 select * into timer from public.job_timers where employee_id=worker.id and finished_at is null for update;
 if found then
  if timer.id is distinct from d.timer_id then outcome:='other_timer';
  else
   select * into loc from public.customer_locations where customer_id=timer.customer_id and business_id=d.business_id;
   if loc.customer_id is null then outcome:='site_changed';
   elsif d.candidate_stamp is distinct from app_private.shortcut_location_stamp_v870(timer.customer_id) then outcome:='site_changed';
   else
    distance:=6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(lat-loc.latitude)/2),2)+cos(radians(lat))*cos(radians(loc.latitude))*power(sin(radians(lon-loc.longitude)/2),2))));
    if distance-accuracy>loc.radius_m+100 then
     if d.outside_since is not null and fix_at-d.outside_since>=interval '60 seconds' then
      update public.job_timers set finished_at=greatest(started_at,least(now(),d.outside_since)) where id=timer.id and finished_at is null;outcome:='finished';
     else update app_private.owntracks_devices_v871 set outside_since=coalesce(d.outside_since,fix_at) where id=d.id;outcome:='leaving';end if;
    else update app_private.owntracks_devices_v871 set outside_since=null where id=d.id;outcome:='running';end if;
   end if;
  end if;
 else
  select array_agg(c.id) into hits from public.customers c join public.customer_locations l on l.customer_id=c.id
  where l.business_id=d.business_id and app_private.team_company(c.employee_id)=d.business_id
  and trim(coalesce(c.custom_fields->>'street',''))<>'' and trim(coalesce(c.custom_fields->>'house_no',''))<>''
  and trim(coalesce(c.custom_fields->>'postal_code',''))<>'' and trim(coalesce(c.custom_fields->>'city',''))<>''
  and (l.source='manual' or l.address_key=md5(app_private.geocoding_address_v869(c.id)::text))
  and 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(lat-l.latitude)/2),2)+cos(radians(lat))*cos(radians(l.latitude))*power(sin(radians(lon-l.longitude)/2),2))))+accuracy<=l.radius_m;
  if coalesce(array_length(hits,1),0)<>1 then
   update app_private.owntracks_devices_v871 set candidate_id=null,candidate_since=null,candidate_stamp=null,outside_since=null where id=d.id;
   outcome:=case when array_length(hits,1)>1 then 'ambiguous' else 'no_customer' end;
  else
   select * into customer from public.customers where id=hits[1];stamp:=app_private.shortcut_location_stamp_v870(customer.id);
   if d.candidate_id is distinct from customer.id or d.candidate_stamp is distinct from stamp or d.candidate_since is null then
    update app_private.owntracks_devices_v871 set candidate_id=customer.id,candidate_since=fix_at,candidate_stamp=stamp,outside_since=null where id=d.id;outcome:='arriving';
   elsif fix_at-d.candidate_since<interval '60 seconds' then outcome:='arriving';
   elsif exists(select 1 from public.job_timers where employee_id=worker.id and customer_id=customer.id and (started_at at time zone 'Europe/Berlin')::date=today) then outcome:='already_recorded';
   else
    select a.id into plan_id from public.appointments a where a.customer_id=customer.id and a.event_date=today and app_private.team_company(a.employee_id)=d.business_id
    and (a.employee_id=worker.id or worker.id=any(a.team_employee_ids)) and coalesce(app_private.planning_meta(a.notes)->>'status','') in ('planned','confirmed')
    and not exists(select 1 from public.work_orders w where w.id=a.id) order by a.created_at,a.id limit 1;
    insert into public.job_timers(employee_id,business_id,customer_id,customer_name,customer_address,appointment_id,started_at,source)
    values(worker.id,d.business_id,customer.id,customer.name,concat_ws(' ',customer.custom_fields->>'street',customer.custom_fields->>'house_no',customer.custom_fields->>'postal_code',customer.custom_fields->>'city'),plan_id,least(now(),d.candidate_since),'gps') returning * into timer;
    update app_private.owntracks_devices_v871 set timer_id=timer.id,outside_since=null where id=d.id;outcome:='started';
   end if;
  end if;
 end if;
 update app_private.owntracks_devices_v871 set last_status=outcome where id=d.id;
 return jsonb_build_object('status',outcome);
end $$;
revoke all on function app_private.receive_owntracks_v873(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.receive_owntracks_v873(text,jsonb) to service_role;
create function app_private.dispatch_owntracks_v873(p_secret_hash text,p_fix jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from app_private.owntracks_devices_v871 d join app_private.owntracks_groups_v873 g on g.capability_id=d.id where d.secret_hash=p_secret_hash) then
  return app_private.receive_owntracks_v873(p_secret_hash,p_fix);
 end if;
 return app_private.receive_owntracks_v871(p_secret_hash,p_fix);
end $$;
revoke all on function app_private.dispatch_owntracks_v873(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.dispatch_owntracks_v873(text,jsonb) to service_role;
create or replace function public.receive_owntracks_v871(p_secret_hash text,p_fix jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select app_private.dispatch_owntracks_v873(p_secret_hash,p_fix)$$;
notify pgrst,'reload schema';
commit;
