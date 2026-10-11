-- Opt-in device capability. Coordinates are used transiently, never stored.
begin;
create table app_private.owntracks_devices_v871 (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade, business_id uuid not null references public.profiles(id) on delete cascade,
 device_id uuid not null, owner_role text not null, secret_hash text not null unique check(secret_hash~'^[a-f0-9]{64}$'),
 enabled boolean not null default true, window_start integer not null check(window_start between 0 and 1439),
 window_end integer not null check(window_end between 1 and 1440 and window_end>window_start),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days', revoked_at timestamptz,
 last_received_at timestamptz, last_fix_at timestamptz, last_status text,
 candidate_id uuid references public.customers(id) on delete set null, candidate_since timestamptz,
 candidate_stamp text, timer_id uuid references public.job_timers(id) on delete set null,
 outside_since timestamptz, rate_window timestamptz, rate_calls integer not null default 0
);
create index owntracks_owner_device_v871 on app_private.owntracks_devices_v871(owner_id,device_id);
create index owntracks_worker_v871 on app_private.owntracks_devices_v871(employee_id);
create index owntracks_business_v871 on app_private.owntracks_devices_v871(business_id);
create index owntracks_customer_v871 on app_private.owntracks_devices_v871(candidate_id);
create index owntracks_timer_v871 on app_private.owntracks_devices_v871(timer_id);
alter table app_private.owntracks_devices_v871 enable row level security;
revoke all on app_private.owntracks_devices_v871 from public,anon,authenticated,service_role;

create function app_private.owntracks_setup_v871(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare worker uuid:=app_private.shortcut_worker_v870(p_device); company uuid:=app_private.team_company(worker);
begin
 return jsonb_build_object('employee_id',worker,'employee_name',(select coalesce(nullif(display_name,''),username) from public.profiles where id=worker),
 'customers_ready',(select count(*) from public.customers c join public.customer_locations l on l.customer_id=c.id
 where l.business_id=company and app_private.team_company(c.employee_id)=company
 and trim(coalesce(c.custom_fields->>'street',''))<>'' and trim(coalesce(c.custom_fields->>'house_no',''))<>''
 and trim(coalesce(c.custom_fields->>'postal_code',''))<>'' and trim(coalesce(c.custom_fields->>'city',''))<>''),
 'bindings',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'enabled',d.enabled,'window_start',d.window_start,'window_end',d.window_end,
 'expires_at',d.expires_at,'last_received_at',d.last_received_at,'last_status',d.last_status,
 'valid',d.expires_at>now() and d.employee_id=worker and d.business_id=company and d.owner_role=(select role from public.profiles where id=auth.uid())) order by d.created_at desc)
 from app_private.owntracks_devices_v871 d where d.owner_id=auth.uid() and d.device_id=p_device and d.revoked_at is null),'[]'));
end $$;
revoke all on function app_private.owntracks_setup_v871(uuid) from public,anon,service_role;
grant execute on function app_private.owntracks_setup_v871(uuid) to authenticated;
create function public.owntracks_setup_v871(p_device uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.owntracks_setup_v871(p_device)$$;
revoke all on function public.owntracks_setup_v871(uuid) from public,anon,service_role;
grant execute on function public.owntracks_setup_v871(uuid) to authenticated;

create function app_private.create_owntracks_device_v871(p_device uuid,p_secret_hash text,p_start integer,p_end integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare worker uuid; company uuid; saved app_private.owntracks_devices_v871;
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 worker:=app_private.shortcut_worker_v870(p_device);company:=app_private.team_company(worker);
 perform 1 from public.profiles where id=worker for update;
 if p_secret_hash is null or p_secret_hash!~'^[a-f0-9]{64}$' or p_start is null or p_end is null or p_start<0 or p_end>1440 or p_end<=p_start then raise exception 'Bitte Freigabe und tägliches Zeitfenster prüfen.';end if;
 if (select count(*) from app_private.owntracks_devices_v871 where owner_id=auth.uid() and revoked_at is null and expires_at>now() and device_id<>p_device)>=5 then raise exception 'Bitte zuerst eine alte Gerätefreigabe widerrufen.';end if;
 update app_private.owntracks_devices_v871 set revoked_at=now() where owner_id=auth.uid() and device_id=p_device and revoked_at is null;
 insert into app_private.owntracks_devices_v871(owner_id,employee_id,business_id,device_id,owner_role,secret_hash,window_start,window_end)
 values(auth.uid(),worker,company,p_device,(select role from public.profiles where id=auth.uid()),p_secret_hash,p_start,p_end) returning * into saved;
 return jsonb_build_object('id',saved.id,'expires_at',saved.expires_at);
end $$;
revoke all on function app_private.create_owntracks_device_v871(uuid,text,integer,integer) from public,anon,service_role;
grant execute on function app_private.create_owntracks_device_v871(uuid,text,integer,integer) to authenticated;
create function public.create_owntracks_device_v871(p_device uuid,p_secret_hash text,p_start integer,p_end integer) returns jsonb language sql security invoker set search_path='' as $$select app_private.create_owntracks_device_v871(p_device,p_secret_hash,p_start,p_end)$$;
revoke all on function public.create_owntracks_device_v871(uuid,text,integer,integer) from public,anon,service_role;
grant execute on function public.create_owntracks_device_v871(uuid,text,integer,integer) to authenticated;

create function app_private.control_owntracks_device_v871(p_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 if auth.uid() is null or p_action not in ('pause','resume','revoke') or p_action is null then raise exception 'Ungültige persönliche Freigabe.' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 update app_private.owntracks_devices_v871 set enabled=(p_action='resume'),revoked_at=case when p_action='revoke' then now() else revoked_at end,
 candidate_id=null,candidate_since=null,candidate_stamp=case when exists(select 1 from public.job_timers t where t.id=timer_id and t.finished_at is null) then candidate_stamp else null end,outside_since=null
 where id=p_id and owner_id=auth.uid() and revoked_at is null;
 if not found then raise exception 'Diese Freigabe gehört nicht zu Ihrem Zugang.' using errcode='42501';end if;
 return true;
end $$;
revoke all on function app_private.control_owntracks_device_v871(uuid,text) from public,anon,service_role;
grant execute on function app_private.control_owntracks_device_v871(uuid,text) to authenticated;
create function public.control_owntracks_device_v871(p_id uuid,p_action text) returns boolean language sql security invoker set search_path='' as $$select app_private.control_owntracks_device_v871(p_id,p_action)$$;
revoke all on function public.control_owntracks_device_v871(uuid,text) from public,anon,service_role;
grant execute on function public.control_owntracks_device_v871(uuid,text) to authenticated;

-- Only the authenticated native receiver can call this lifecycle. OwnTracks data
-- is device-reported, not proof of attendance. No automatic hours or signatures.
create function app_private.receive_owntracks_v871(p_secret_hash text,p_fix jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare d app_private.owntracks_devices_v871; owner public.profiles; worker public.profiles; timer public.job_timers;
 customer public.customers; loc public.customer_locations; plan_id uuid; fix_at timestamptz;
 lat double precision;lon double precision;accuracy double precision;distance double precision; hits uuid[];
 today date:=(now() at time zone 'Europe/Berlin')::date; minutes integer:=extract(hour from now() at time zone 'Europe/Berlin')::integer*60+extract(minute from now() at time zone 'Europe/Berlin')::integer;
 stamp text; outcome text:='ignored';
begin
 select * into d from app_private.owntracks_devices_v871 where secret_hash=p_secret_hash;
 if not found then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 select * into owner from public.profiles where id=d.owner_id for update;
 select * into worker from public.profiles where id=d.employee_id for update;
 select * into d from app_private.owntracks_devices_v871 where id=d.id for update;
 if d.id is null or d.revoked_at is not null or d.expires_at<=now() or owner.id is null or worker.id is null
 or owner.role is distinct from d.owner_role or worker.role not in ('employee','business') or app_private.team_company(worker.id) is distinct from d.business_id
 or not exists(select 1 from public.profiles where id=d.business_id and role='business') then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 if owner.role='administrator' then
  if not exists(select 1 from public.work_device_contexts where id=d.device_id and owner_id=owner.id and employee_id=worker.id and business_id=d.business_id) then raise exception 'Arbeitskonto geändert.' using errcode='28000';end if;
 elsif owner.id<>worker.id then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 if worker.role='employee' and worker.menu_permissions->>'orders'='false' then raise exception 'Keine Arbeitsschein-Freigabe.' using errcode='42501';end if;
 if d.rate_window is null or d.rate_window<now()-interval '1 minute' then d.rate_window:=now();d.rate_calls:=0;end if;
 if d.rate_calls>=30 then return jsonb_build_object('status','rate_limited');end if;
 update app_private.owntracks_devices_v871 set rate_window=d.rate_window,rate_calls=d.rate_calls+1,last_received_at=now() where id=d.id;
 if p_fix is null then return jsonb_build_object('status','connected');end if;
 if not d.enabled or minutes<d.window_start or minutes>=d.window_end or extract(isodow from today)>5 then outcome:='paused';
 else
  begin perform app_private.team_check_day(worker.id,today);exception when sqlstate 'P0001' then outcome:='day_blocked';end;
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
revoke all on function app_private.receive_owntracks_v871(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.receive_owntracks_v871(text,jsonb) to service_role;
create function public.receive_owntracks_v871(p_secret_hash text,p_fix jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select app_private.receive_owntracks_v871(p_secret_hash,p_fix)$$;
revoke all on function public.receive_owntracks_v871(text,jsonb) from public,anon,authenticated;
grant execute on function public.receive_owntracks_v871(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
