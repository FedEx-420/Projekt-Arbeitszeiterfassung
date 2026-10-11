-- Voluntary, customer-scoped iPhone arrival capability. No password/session in Shortcuts.
begin;
create table app_private.shortcut_arrivals_v870(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade, business_id uuid not null references public.profiles(id) on delete cascade,
 device_id uuid not null, customer_id uuid not null references public.customers(id) on delete cascade,
 owner_role text not null, secret_hash text not null unique check(secret_hash~'^[a-f0-9]{64}$'),
 location_stamp text not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days',
 revoked_at timestamptz, last_fired_at timestamptz, last_timer_id uuid references public.job_timers(id) on delete set null,
 rate_window timestamptz, rate_calls integer not null default 0
);
create index shortcut_arrivals_owner_device_v870 on app_private.shortcut_arrivals_v870(owner_id,device_id);
create index shortcut_arrivals_employee_v870 on app_private.shortcut_arrivals_v870(employee_id);
create index shortcut_arrivals_business_v870 on app_private.shortcut_arrivals_v870(business_id);
create index shortcut_arrivals_customer_v870 on app_private.shortcut_arrivals_v870(customer_id);
create index shortcut_arrivals_timer_v870 on app_private.shortcut_arrivals_v870(last_timer_id);
alter table app_private.shortcut_arrivals_v870 enable row level security;
revoke all on app_private.shortcut_arrivals_v870 from public,anon,authenticated,service_role;
grant usage on schema app_private to service_role;

create function app_private.shortcut_worker_v870(p_device uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare actor public.profiles; worker uuid;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or p_device is null then raise exception 'Bitte anmelden und dieses Gerät auswählen.' using errcode='42501';end if;
 if actor.role='administrator' then worker:=app_private.device_worker_v866(p_device);
 elsif actor.role in ('business','employee') then worker:=actor.id;
 else raise exception 'Dieses Konto kann keinen eigenen Timer verwenden.' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=app_private.team_company(worker) and role='business') then raise exception 'Das Arbeitskonto gehört zu keiner bestehenden Firma.' using errcode='42501';end if;
 if exists(select 1 from public.profiles where id=worker and role='employee' and menu_permissions->>'orders'='false') then raise exception 'Arbeitsscheine sind für dieses Arbeitskonto nicht freigegeben.' using errcode='42501';end if;
 return worker;
end $$;
revoke all on function app_private.shortcut_worker_v870(uuid) from public,anon,authenticated,service_role;

create function app_private.shortcut_location_stamp_v870(p_customer uuid) returns text
language sql stable set search_path=pg_catalog,public as $$
 select md5(jsonb_build_array(c.custom_fields->>'street',c.custom_fields->>'house_no',c.custom_fields->>'postal_code',c.custom_fields->>'city',l.latitude,l.longitude,l.radius_m)::text)
 from public.customers c join public.customer_locations l on l.customer_id=c.id
 where c.id=p_customer and l.business_id=app_private.team_company(c.employee_id)
$$;
revoke all on function app_private.shortcut_location_stamp_v870(uuid) from public,anon,authenticated,service_role;

create function app_private.shortcut_setup_v870(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare worker uuid:=app_private.shortcut_worker_v870(p_device); company uuid:=app_private.team_company(worker);result jsonb;
begin
 select jsonb_build_object('employee_id',p.id,'employee_name',coalesce(nullif(p.display_name,''),p.username),'business_id',company,
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'address',concat_ws(' ',nullif(c.custom_fields->>'street',''),nullif(c.custom_fields->>'house_no',''),nullif(c.custom_fields->>'postal_code',''),nullif(c.custom_fields->>'city','')),'ready',app_private.shortcut_location_stamp_v870(c.id) is not null) order by c.name)
 from public.customers c where app_private.team_company(c.employee_id)=company),'[]'),
 'bindings',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'customer_id',s.customer_id,'customer_name',c.name,'expires_at',s.expires_at,'last_fired_at',s.last_fired_at,
 'valid',s.expires_at>now() and s.employee_id=worker and s.business_id=company and s.location_stamp=app_private.shortcut_location_stamp_v870(s.customer_id)) order by s.created_at desc)
 from app_private.shortcut_arrivals_v870 s join public.customers c on c.id=s.customer_id where s.owner_id=auth.uid() and s.device_id=p_device and s.revoked_at is null),'[]')) into result from public.profiles p where p.id=worker;
 return result;
end $$;
revoke all on function app_private.shortcut_setup_v870(uuid) from public,anon,service_role;
grant execute on function app_private.shortcut_setup_v870(uuid) to authenticated;
create function public.shortcut_setup_v870(p_device uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.shortcut_setup_v870(p_device)$$;
revoke all on function public.shortcut_setup_v870(uuid) from public,anon,service_role;
grant execute on function public.shortcut_setup_v870(uuid) to authenticated;

create function app_private.create_shortcut_arrival_v870(p_device uuid,p_customer uuid,p_secret_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare worker uuid;company uuid;stamp text;saved app_private.shortcut_arrivals_v870;
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 worker:=app_private.shortcut_worker_v870(p_device);company:=app_private.team_company(worker);
 perform 1 from public.profiles where id=worker for update;
 if p_secret_hash is null or p_secret_hash!~'^[a-f0-9]{64}$' then raise exception 'Ungültiger Einrichtungscode.';end if;
 perform 1 from public.customers where id=p_customer and app_private.team_company(employee_id)=company for update;
 if not found then raise exception 'Der Kunde gehört nicht zur Firma des eigenen Arbeitskontos.' using errcode='42501';end if;
 stamp:=app_private.shortcut_location_stamp_v870(p_customer);
 if stamp is null then raise exception 'Bitte zuerst einen bestätigten Kundenstandort hinterlegen.';end if;
 if (select count(*) from app_private.shortcut_arrivals_v870 where owner_id=auth.uid() and revoked_at is null and expires_at>now() and not(device_id=p_device and customer_id=p_customer))>=40 then raise exception 'Maximal 40 aktive Kundenfreigaben. Bitte alte Freigaben widerrufen.';end if;
 update app_private.shortcut_arrivals_v870 set revoked_at=now() where owner_id=auth.uid() and device_id=p_device and customer_id=p_customer and revoked_at is null;
 insert into app_private.shortcut_arrivals_v870(owner_id,employee_id,business_id,device_id,customer_id,owner_role,secret_hash,location_stamp)
 values(auth.uid(),worker,company,p_device,p_customer,(select role from public.profiles where id=auth.uid()),p_secret_hash,stamp) returning * into saved;
 return jsonb_build_object('id',saved.id,'expires_at',saved.expires_at);
end $$;
revoke all on function app_private.create_shortcut_arrival_v870(uuid,uuid,text) from public,anon,service_role;
grant execute on function app_private.create_shortcut_arrival_v870(uuid,uuid,text) to authenticated;
create function public.create_shortcut_arrival_v870(p_device uuid,p_customer uuid,p_secret_hash text) returns jsonb language sql security invoker set search_path='' as $$select app_private.create_shortcut_arrival_v870(p_device,p_customer,p_secret_hash)$$;
revoke all on function public.create_shortcut_arrival_v870(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.create_shortcut_arrival_v870(uuid,uuid,text) to authenticated;

create function app_private.revoke_shortcut_arrival_v870(p_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 if auth.uid() is null then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 update app_private.shortcut_arrivals_v870 set revoked_at=coalesce(revoked_at,now()) where id=p_id and owner_id=auth.uid();
 if not found then raise exception 'Diese persönliche Freigabe gehört nicht zu Ihrem Zugang.' using errcode='42501';end if;
 return true;
end $$;
revoke all on function app_private.revoke_shortcut_arrival_v870(uuid) from public,anon,service_role;
grant execute on function app_private.revoke_shortcut_arrival_v870(uuid) to authenticated;
create function public.revoke_shortcut_arrival_v870(p_id uuid) returns boolean language sql security invoker set search_path='' as $$select app_private.revoke_shortcut_arrival_v870(p_id)$$;
revoke all on function public.revoke_shortcut_arrival_v870(uuid) from public,anon,service_role;
grant execute on function public.revoke_shortcut_arrival_v870(uuid) to authenticated;

-- Service-only capability lookup. Never accepts a caller-selected person, customer, or timestamp.
create function app_private.fire_shortcut_arrival_v870(p_secret_hash text,p_test boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare binding app_private.shortcut_arrivals_v870;owner public.profiles;worker public.profiles;customer public.customers;plan public.appointments;timer public.job_timers;today date:=(now() at time zone 'Europe/Berlin')::date;
begin
 select * into binding from app_private.shortcut_arrivals_v870 where secret_hash=p_secret_hash;
 if not found then raise exception 'Freigabe ungültig oder abgelaufen.' using errcode='28000';end if;
 -- Same lock order as create/revoke and the existing device-account setter.
 select * into owner from public.profiles where id=binding.owner_id for update;
 select * into worker from public.profiles where id=binding.employee_id for update;
 select * into binding from app_private.shortcut_arrivals_v870 where id=binding.id for update;
 if binding.id is null or binding.revoked_at is not null or binding.expires_at<=now() or owner.id is null or worker.id is null or owner.role is distinct from binding.owner_role or worker.role not in ('employee','business') or app_private.team_company(worker.id) is distinct from binding.business_id
 or not exists(select 1 from public.profiles where id=binding.business_id and role='business') then raise exception 'Freigabe ungültig oder abgelaufen.' using errcode='28000';end if;
 if owner.role='administrator' then
  if not exists(select 1 from public.work_device_contexts where id=binding.device_id and owner_id=owner.id and employee_id=worker.id and business_id=binding.business_id) then raise exception 'Persönliches Arbeitskonto wurde geändert. Bitte neu einrichten.' using errcode='28000';end if;
 elsif owner.id<>worker.id then raise exception 'Freigabe ungültig.' using errcode='28000';end if;
 if worker.role='employee' and worker.menu_permissions->>'orders'='false' then raise exception 'Arbeitsscheine sind für dieses Arbeitskonto nicht freigegeben.' using errcode='42501';end if;
 select * into customer from public.customers where id=binding.customer_id and app_private.team_company(employee_id)=binding.business_id for update;
 if not found then raise exception 'Kundenfreigabe nicht mehr verfügbar.' using errcode='28000';end if;
 perform 1 from public.customer_locations where customer_id=customer.id for update;
 if binding.location_stamp is distinct from app_private.shortcut_location_stamp_v870(binding.customer_id) then raise exception 'Kundenadresse oder Standort wurde geändert. Bitte die Automation neu einrichten.';end if;
 if binding.rate_window is null or binding.rate_window<now()-interval '1 minute' then
  update app_private.shortcut_arrivals_v870 set rate_window=now(),rate_calls=1 where id=binding.id;
 elsif binding.rate_calls>=12 then raise exception 'Zu viele Anfragen. Bitte eine Minute warten.' using errcode='54000';
 else update app_private.shortcut_arrivals_v870 set rate_calls=rate_calls+1 where id=binding.id;end if;
 if p_test then return jsonb_build_object('status','connected');end if;
 perform app_private.team_check_day(worker.id,today);
 if exists(select 1 from public.work_days where employee_id=worker.id and work_date=today and vacation>0) then raise exception 'Für diesen Tag ist Urlaub eingetragen.';end if;
 select * into plan from public.appointments a where a.customer_id=customer.id and a.event_date=today and app_private.team_company(a.employee_id)=binding.business_id
 and (a.employee_id=worker.id or worker.id=any(a.team_employee_ids)) and coalesce(app_private.planning_meta(a.notes)->>'status','') in ('planned','confirmed')
 and not exists(select 1 from public.work_orders w where w.id=a.id) order by a.created_at,a.id limit 1;
 if not found then return jsonb_build_object('status','no_plan');end if;
 select * into timer from public.job_timers where employee_id=worker.id and finished_at is null;
 if found then
  if timer.customer_id=customer.id then return jsonb_build_object('status','already_running');end if;
  raise exception 'Es läuft bereits ein Timer bei einem anderen Kunden.';
 end if;
 if exists(select 1 from public.job_timers where employee_id=worker.id and customer_id=customer.id and (started_at at time zone 'Europe/Berlin')::date=today) then return jsonb_build_object('status','already_recorded');end if;
 -- An iPhone automation reports arrival, not a server-verified GPS fix. Reuse
 -- the existing manual source; retain automation provenance in the private binding.
 insert into public.job_timers(employee_id,business_id,customer_id,customer_name,customer_address,appointment_id,source)
 values(worker.id,binding.business_id,customer.id,customer.name,concat_ws(' ',nullif(customer.custom_fields->>'street',''),nullif(customer.custom_fields->>'house_no',''),nullif(customer.custom_fields->>'postal_code',''),nullif(customer.custom_fields->>'city','')),plan.id,'manual') returning * into timer;
 update app_private.shortcut_arrivals_v870 set last_fired_at=now(),last_timer_id=timer.id where id=binding.id;
 return jsonb_build_object('status','started','started_at',timer.started_at);
end $$;
revoke all on function app_private.fire_shortcut_arrival_v870(text,boolean) from public,anon,authenticated;
grant execute on function app_private.fire_shortcut_arrival_v870(text,boolean) to service_role;
create function public.fire_shortcut_arrival_v870(p_secret_hash text,p_test boolean default false) returns jsonb language sql security invoker set search_path='' as $$select app_private.fire_shortcut_arrival_v870(p_secret_hash,p_test)$$;
revoke all on function public.fire_shortcut_arrival_v870(text,boolean) from public,anon,authenticated;
grant execute on function public.fire_shortcut_arrival_v870(text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
