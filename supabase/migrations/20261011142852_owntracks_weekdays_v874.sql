-- Explicit weekdays in Europe/Berlin; old capabilities retain Monday-Friday.
begin;
create function app_private.owntracks_weekdays_v874(p_days integer[]) returns integer[]
language plpgsql immutable security invoker set search_path='' as $$
declare result integer[];
begin
 if p_days is null or array_ndims(p_days) is distinct from 1 or cardinality(p_days) not between 1 and 7
 or not p_days <@ array[1,2,3,4,5,6,7] or array_position(p_days,null) is not null
 or (select count(distinct n) from unnest(p_days) n)<>cardinality(p_days) then
  raise exception 'Bitte mindestens einen Wochentag von Montag bis Sonntag auswählen.' using errcode='22023';
 end if;
 select array_agg(n order by n) into result from unnest(p_days) n;
 return result;
end $$;
revoke all on function app_private.owntracks_weekdays_v874(integer[]) from public,anon,authenticated,service_role;

alter table app_private.owntracks_devices_v871 add column allowed_weekdays integer[] not null default array[1,2,3,4,5];
alter table app_private.owntracks_devices_v871 add constraint owntracks_weekdays_v874_check
 check(allowed_weekdays=app_private.owntracks_weekdays_v874(allowed_weekdays));

create function app_private.create_owntracks_device_v874(p_device uuid,p_secret_hash text,p_start integer,p_end integer,p_weekdays integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare days integer[]:=app_private.owntracks_weekdays_v874(p_weekdays); result jsonb;
begin
 if auth.uid() is null then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if (select role from public.profiles where id=auth.uid())='administrator'
 and (select count(*) from app_private.device_accounts_v873(p_device))>1 then
  result:=app_private.create_owntracks_device_v873(p_device,p_secret_hash,p_start,p_end);
 else
  result:=app_private.create_owntracks_device_v871(p_device,p_secret_hash,p_start,p_end);
 end if;
 update app_private.owntracks_devices_v871 set allowed_weekdays=days where id=(result->>'id')::uuid and owner_id=auth.uid();
 return result || jsonb_build_object('allowed_weekdays',days);
end $$;
revoke all on function app_private.create_owntracks_device_v874(uuid,text,integer,integer,integer[]) from public,anon,authenticated,service_role;
grant execute on function app_private.create_owntracks_device_v874(uuid,text,integer,integer,integer[]) to authenticated;
create function public.create_owntracks_device_v874(p_device uuid,p_secret_hash text,p_start integer,p_end integer,p_weekdays integer[])
returns jsonb language sql security invoker set search_path='' as $$select app_private.create_owntracks_device_v874(p_device,p_secret_hash,p_start,p_end,p_weekdays)$$;
revoke all on function public.create_owntracks_device_v874(uuid,text,integer,integer,integer[]) from public,anon,authenticated,service_role;
grant execute on function public.create_owntracks_device_v874(uuid,text,integer,integer,integer[]) to authenticated;

create function app_private.set_owntracks_weekdays_v874(p_id uuid,p_weekdays integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare days integer[]:=app_private.owntracks_weekdays_v874(p_weekdays); d app_private.owntracks_devices_v871; worker uuid;
begin
 if auth.uid() is null then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into d from app_private.owntracks_devices_v871 where id=p_id and owner_id=auth.uid();
 if not found or d.revoked_at is not null or d.expires_at<=now()
 or d.owner_role is distinct from (select role from public.profiles where id=auth.uid()) then
  raise exception 'Diese persönliche Freigabe ist nicht mehr gültig.' using errcode='42501';
 end if;
 worker:=app_private.shortcut_worker_v870(d.device_id);
 if exists(select 1 from app_private.owntracks_groups_v873 where capability_id=d.id) then
  if not app_private.owntracks_group_valid_v873(d.id) then raise exception 'Arbeitskonten geändert.' using errcode='42501';end if;
 elsif d.employee_id<>worker or d.business_id is distinct from app_private.team_company(worker) then
  raise exception 'Arbeitskonto geändert.' using errcode='42501';
 end if;
 update app_private.owntracks_devices_v871 set allowed_weekdays=days,candidate_id=null,candidate_since=null,
 candidate_stamp=case when exists(select 1 from public.job_timers t where t.id=timer_id and t.finished_at is null) then candidate_stamp else null end,outside_since=null
 where id=d.id and owner_id=auth.uid() and revoked_at is null;
 if not found then raise exception 'Freigabe wurde widerrufen.' using errcode='42501';end if;
 return jsonb_build_object('id',d.id,'allowed_weekdays',days);
end $$;
revoke all on function app_private.set_owntracks_weekdays_v874(uuid,integer[]) from public,anon,authenticated,service_role;
grant execute on function app_private.set_owntracks_weekdays_v874(uuid,integer[]) to authenticated;
create function public.set_owntracks_weekdays_v874(p_id uuid,p_weekdays integer[])
returns jsonb language sql security invoker set search_path='' as $$select app_private.set_owntracks_weekdays_v874(p_id,p_weekdays)$$;
revoke all on function public.set_owntracks_weekdays_v874(uuid,integer[]) from public,anon,authenticated,service_role;
grant execute on function public.set_owntracks_weekdays_v874(uuid,integer[]) to authenticated;

-- The generated definitions below preserve the existing lifecycle and scope.
-- WEEKDAY_LIFECYCLE_V874
create or replace function app_private.owntracks_setup_v871(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare worker uuid:=app_private.shortcut_worker_v870(p_device); company uuid:=app_private.team_company(worker);
begin
 return jsonb_build_object('employee_id',worker,'employee_name',(select coalesce(nullif(display_name,''),username) from public.profiles where id=worker),
 'customers_ready',(select count(*) from public.customers c join public.customer_locations l on l.customer_id=c.id
 where l.business_id=company and app_private.team_company(c.employee_id)=company
 and trim(coalesce(c.custom_fields->>'street',''))<>'' and trim(coalesce(c.custom_fields->>'house_no',''))<>''
 and trim(coalesce(c.custom_fields->>'postal_code',''))<>'' and trim(coalesce(c.custom_fields->>'city',''))<>''),
 'bindings',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'enabled',d.enabled,'window_start',d.window_start,'window_end',d.window_end,
 'allowed_weekdays',d.allowed_weekdays,'expires_at',d.expires_at,'last_received_at',d.last_received_at,'last_status',d.last_status,
 'valid',d.expires_at>now() and d.employee_id=worker and d.business_id=company and d.owner_role=(select role from public.profiles where id=auth.uid())) order by d.created_at desc)
 from app_private.owntracks_devices_v871 d where d.owner_id=auth.uid() and d.device_id=p_device and d.revoked_at is null),'[]'));
end $$;

create or replace function app_private.receive_owntracks_v871(p_secret_hash text,p_fix jsonb default null) returns jsonb
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
 if not d.enabled or minutes<d.window_start or minutes>=d.window_end or not (extract(isodow from today)::integer=any(d.allowed_weekdays)) then outcome:='paused';
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

create or replace function app_private.owntracks_setup_v873(p_device uuid)
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
  'allowed_weekdays',d.allowed_weekdays,'expires_at',d.expires_at,'last_received_at',d.last_received_at,'last_status',d.last_status,
  'valid',case when g.capability_id is not null then app_private.owntracks_group_valid_v873(d.id)
  else d.expires_at>now() and d.employee_id=primary_worker and d.business_id=app_private.team_company(primary_worker) and d.owner_role='administrator' end) order by d.created_at desc)
  from app_private.owntracks_devices_v871 d left join app_private.owntracks_groups_v873 g on g.capability_id=d.id
  where d.owner_id=auth.uid() and d.device_id=p_device and d.revoked_at is null),'[]'::jsonb));
end $$;

create or replace function app_private.receive_owntracks_v873(p_secret_hash text,p_fix jsonb default null) returns jsonb
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
 if not d.enabled or minutes<d.window_start or minutes>=d.window_end or not (extract(isodow from today)::integer=any(d.allowed_weekdays)) then outcome:='paused';
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
notify pgrst,'reload schema';
commit;
