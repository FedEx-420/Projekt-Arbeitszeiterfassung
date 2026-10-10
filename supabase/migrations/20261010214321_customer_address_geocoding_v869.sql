-- Address-only geocoding; no account/work-record reset and no provider key in SQL.
begin;
grant usage on schema app_private to service_role;
alter table public.customer_locations add column source text not null default 'manual'
  check(source in ('manual','geoapify'));
alter table public.customer_locations add column address_key text;

create table app_private.geocoding_cache_v869(
 customer_id uuid primary key references public.customers(id) on delete cascade,
 address_key text not null, candidates jsonb not null default '[]',
 lease uuid, lease_until timestamptz, expires_at timestamptz not null default now(),
 error_code text
);
create table app_private.geocoding_budget_v869(
 scope text not null, bucket timestamptz not null, calls integer not null check(calls>=0),
 primary key(scope,bucket)
);
alter table app_private.geocoding_cache_v869 enable row level security;
alter table app_private.geocoding_budget_v869 enable row level security;
revoke all on app_private.geocoding_cache_v869,app_private.geocoding_budget_v869 from public,anon,authenticated,service_role;

create function app_private.geocoding_address_v869(p_customer uuid)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('street',trim(coalesce(custom_fields->>'street','')),
 'housenumber',trim(coalesce(custom_fields->>'house_no','')),
 'city',trim(coalesce(custom_fields->>'city','')),
 'postcode',trim(coalesce(custom_fields->>'postal_code','')),'country','Germany')
 from public.customers where id=p_customer
$$;
revoke all on function app_private.geocoding_address_v869(uuid) from public,anon,authenticated;

create function app_private.geocoding_manager_v869(p_actor uuid,p_customer uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare actor public.profiles; company uuid;
begin
 select * into actor from public.profiles where id=p_actor;
 select app_private.team_company(employee_id) into company from public.customers where id=p_customer;
 if actor.id is null or company is null or not(actor.role='administrator' or (actor.role='business' and actor.id=company)) then
  raise exception 'Nur die zuständige Geschäftsleitung darf Kundenadressen ermitteln.' using errcode='42501';
 end if;
 return company;
end $$;
revoke all on function app_private.geocoding_manager_v869(uuid,uuid) from public,anon,authenticated;

create function app_private.claim_customer_geocoding_v869(p_actor uuid,p_customer uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare company uuid; address jsonb; key text; cached app_private.geocoding_cache_v869; token uuid:=gen_random_uuid();
 scope_name text; bucket_time timestamptz; maximum integer; used integer; stamp timestamptz:=clock_timestamp();
begin
 company:=app_private.geocoding_manager_v869(p_actor,p_customer);
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text,869));
 address:=app_private.geocoding_address_v869(p_customer); key:=md5(address::text);
 if address->>'street'='' or (address->>'city'='' and address->>'postcode'='') then
  return jsonb_build_object('status','incomplete');
 end if;
 if exists(select 1 from jsonb_each_text(address) a where length(a.value)>180 or a.value~'[[:cntrl:]]') then
  return jsonb_build_object('status','incomplete');
 end if;
 select * into cached from app_private.geocoding_cache_v869 where customer_id=p_customer;
 if cached.address_key=key and cached.expires_at>stamp then
  return jsonb_build_object('status',case when cached.error_code is null then 'ready' else 'error' end,'address_key',key,'candidates',cached.candidates,'cached',true);
 end if;
 if cached.address_key=key and cached.lease_until>stamp then return jsonb_build_object('status','pending'); end if;
 -- All reservations use the same lock order. Failures still consume a credit reservation.
 for scope_name,bucket_time,maximum in
  select 'global-day',date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC',2500
  union all select 'global-second',date_trunc('second',stamp),4
  union all select 'business:'||company::text,date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC',150
 loop
  insert into app_private.geocoding_budget_v869(scope,bucket,calls) values(scope_name,bucket_time,0) on conflict do nothing;
  select calls into used from app_private.geocoding_budget_v869 where scope=scope_name and bucket=bucket_time for update;
  if used>=maximum then raise exception 'Das kostenlose Abruflimit ist erreicht. Bitte später erneut versuchen.' using errcode='P0001'; end if;
  update app_private.geocoding_budget_v869 set calls=calls+1 where scope=scope_name and bucket=bucket_time;
 end loop;
 delete from app_private.geocoding_budget_v869 where bucket<stamp-interval '2 days';
 insert into app_private.geocoding_cache_v869(customer_id,address_key,lease,lease_until,expires_at)
 values(p_customer,key,token,stamp+interval '40 seconds',stamp)
 on conflict(customer_id) do update set address_key=key,lease=token,lease_until=excluded.lease_until,expires_at=stamp,candidates='[]',error_code=null;
 return jsonb_build_object('status','fetch','lease',token,'address_key',key,'address',address);
end $$;
revoke all on function app_private.claim_customer_geocoding_v869(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.claim_customer_geocoding_v869(uuid,uuid) to service_role;
create function public.claim_customer_geocoding_v869(p_actor uuid,p_customer uuid) returns jsonb
language sql security invoker set search_path='' as $$select app_private.claim_customer_geocoding_v869(p_actor,p_customer)$$;
revoke all on function public.claim_customer_geocoding_v869(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_customer_geocoding_v869(uuid,uuid) to service_role;

create function app_private.finish_customer_geocoding_v869(p_actor uuid,p_customer uuid,p_lease uuid,p_candidates jsonb,p_error boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare cached app_private.geocoding_cache_v869; item jsonb;
begin
 perform app_private.geocoding_manager_v869(p_actor,p_customer);
 select * into cached from app_private.geocoding_cache_v869 where customer_id=p_customer for update;
 if cached.lease is distinct from p_lease or cached.address_key is distinct from md5(app_private.geocoding_address_v869(p_customer)::text)
  then return jsonb_build_object('status','stale'); end if;
 if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>5 then raise exception 'Ungültige Adresstreffer.'; end if;
 for item in select value from jsonb_array_elements(p_candidates) loop
  if (item->>'latitude')::double precision not between -90 and 90 or (item->>'longitude')::double precision not between -180 and 180
   or item->>'latitude' is null or item->>'longitude' is null or length(item->>'formatted')>400 then raise exception 'Ungültiger Standort.'; end if;
 end loop;
 update app_private.geocoding_cache_v869 set candidates=p_candidates,lease=null,lease_until=null,
 expires_at=now()+case when p_error then interval '2 minutes' when jsonb_array_length(p_candidates)=0 then interval '1 day' else interval '30 days' end,
 error_code=case when p_error then 'provider' else null end where customer_id=p_customer;
 return jsonb_build_object('status',case when p_error then 'error' else 'ready' end,'candidates',p_candidates,'address_key',cached.address_key,'cached',false);
end $$;
revoke all on function app_private.finish_customer_geocoding_v869(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function app_private.finish_customer_geocoding_v869(uuid,uuid,uuid,jsonb,boolean) to service_role;
create function public.finish_customer_geocoding_v869(p_actor uuid,p_customer uuid,p_lease uuid,p_candidates jsonb,p_error boolean) returns jsonb
language sql security invoker set search_path='' as $$select app_private.finish_customer_geocoding_v869(p_actor,p_customer,p_lease,p_candidates,p_error)$$;
revoke all on function public.finish_customer_geocoding_v869(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.finish_customer_geocoding_v869(uuid,uuid,uuid,jsonb,boolean) to service_role;

create function app_private.accept_customer_geocoding_v869(p_customer uuid,p_address_key text,p_index integer,p_replace_manual boolean)
returns public.customer_locations language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare company uuid; cached app_private.geocoding_cache_v869; candidate jsonb; saved public.customer_locations;
begin
 company:=app_private.geocoding_manager_v869(auth.uid(),p_customer);
 -- Lock the address row so concurrent edits cannot install an obsolete position.
 perform 1 from public.customers where id=p_customer for update;
 select * into cached from app_private.geocoding_cache_v869 where customer_id=p_customer for update;
 if p_address_key is null or cached.address_key is distinct from p_address_key or cached.address_key is distinct from md5(app_private.geocoding_address_v869(p_customer)::text)
  or cached.expires_at<now() or cached.error_code is not null or cached.lease is not null then raise exception 'Die Adresse wurde geändert. Bitte neu ermitteln.'; end if;
 if p_index is null or p_index<0 or p_index>=jsonb_array_length(cached.candidates) then raise exception 'Bitte einen gültigen Adresstreffer wählen.'; end if;
 candidate:=cached.candidates->p_index;
 if not coalesce(p_replace_manual,false) and exists(select 1 from public.customer_locations where customer_id=p_customer and source='manual')
  then raise exception 'Ein manuell gesetzter Standort besteht bereits. Bitte das Ersetzen ausdrücklich bestätigen.'; end if;
 insert into public.customer_locations(customer_id,business_id,latitude,longitude,source,address_key)
 values(p_customer,company,(candidate->>'latitude')::double precision,(candidate->>'longitude')::double precision,'geoapify',cached.address_key)
 on conflict(customer_id) do update set business_id=company,latitude=excluded.latitude,longitude=excluded.longitude,source='geoapify',address_key=excluded.address_key
 returning * into saved;
 return saved;
end $$;
revoke all on function app_private.accept_customer_geocoding_v869(uuid,text,integer,boolean) from public,anon;
grant execute on function app_private.accept_customer_geocoding_v869(uuid,text,integer,boolean) to authenticated;
create function public.accept_customer_geocoding_v869(p_customer uuid,p_address_key text,p_index integer,p_replace_manual boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select to_jsonb(app_private.accept_customer_geocoding_v869(p_customer,p_address_key,p_index,p_replace_manual))
$$;
revoke all on function public.accept_customer_geocoding_v869(uuid,text,integer,boolean) from public,anon;
grant execute on function public.accept_customer_geocoding_v869(uuid,text,integer,boolean) to authenticated;

create function app_private.invalidate_customer_geocoding_v869() returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 if row(old.custom_fields->>'street',old.custom_fields->>'house_no',old.custom_fields->>'city',old.custom_fields->>'postal_code',old.employee_id)
 is distinct from row(new.custom_fields->>'street',new.custom_fields->>'house_no',new.custom_fields->>'city',new.custom_fields->>'postal_code',new.employee_id) then
  delete from app_private.geocoding_cache_v869 where customer_id=new.id;
  -- Derived positions are invalidated; manually recorded sites and all work data remain intact.
  delete from public.customer_locations where customer_id=new.id and source='geoapify';
 end if;
 return new;
end $$;
revoke all on function app_private.invalidate_customer_geocoding_v869() from public,anon,authenticated;
create trigger invalidate_customer_geocoding_v869 after update of custom_fields,employee_id on public.customers
for each row execute function app_private.invalidate_customer_geocoding_v869();
create function app_private.manual_customer_location_v869() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then new.source:='manual';new.address_key:=null;end if;
 return new;
end $$;
revoke all on function app_private.manual_customer_location_v869() from public,anon,authenticated;
create trigger manual_customer_location_v869 before insert or update on public.customer_locations
for each row execute function app_private.manual_customer_location_v869();
-- Notify existing lightweight readers when managers set/change a site.
create function app_private.geocoding_location_revision_v869() returns trigger language plpgsql security definer
set search_path=pg_catalog,app_private as $$
declare company uuid;
begin
 company:=case when tg_op='DELETE' then old.business_id else new.business_id end;
 insert into app_private.planning_sync_revisions(company_id,revision) values(company,1)
 on conflict(company_id) do update set revision=app_private.planning_sync_revisions.revision+1;
 return null;
end $$;
revoke all on function app_private.geocoding_location_revision_v869() from public,anon,authenticated;
create trigger geocoding_location_revision_v869 after insert or update or delete on public.customer_locations
for each row execute function app_private.geocoding_location_revision_v869();
commit;
