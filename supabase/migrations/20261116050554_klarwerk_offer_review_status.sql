begin;
set local lock_timeout='5s';

create table public.klarwerk_offer_reviews(
  offer_id uuid not null references public.offers(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  offer_revision integer not null check(offer_revision > 0),
  review_status text not null check(review_status in ('approved','accepted','declined')),
  offer_number text not null check(length(offer_number) between 1 and 150),
  reviewed_at timestamptz not null default now(),
  primary key(offer_id,offer_revision)
);
create index klarwerk_offer_reviews_business on public.klarwerk_offer_reviews(business_id);
alter table public.klarwerk_offer_reviews enable row level security;
revoke all on public.klarwerk_offer_reviews from public,anon,authenticated;
grant select on public.klarwerk_offer_reviews to authenticated;
create policy klarwerk_offer_review_manager_read on public.klarwerk_offer_reviews for select to authenticated
  using(app_private.team_can_manage(business_id));

create function app_private.klarwerk_record_offer_reviews(p_hash text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  scope jsonb;
  firm uuid;
  total integer;
begin
  scope := app_private.klarwerk_offer_revision(p_hash);
  if scope->'allowed' is distinct from 'true'::jsonb then
    raise exception 'Die Angebotsfreigabe für diese Verbindung fehlt.' using errcode='42501';
  end if;
  firm := (scope->>'company_id')::uuid;
  if jsonb_typeof(p_args->'reviews') is distinct from 'array' or jsonb_array_length(p_args->'reviews') > 250 then
    raise exception 'Ungültige Angebotsfreigaben.' using errcode='22023';
  end if;
  with records as (
    select distinct on (o.id,o.revision) o.id, o.revision, incoming.status, incoming.number
    from jsonb_to_recordset(p_args->'reviews') as incoming(id uuid, revision integer,status text,number text)
    join public.offers o on o.id=incoming.id and o.business_id=firm and o.revision=incoming.revision
    where incoming.status in ('approved','accepted','declined') and length(incoming.number) between 1 and 150
    order by o.id,o.revision
  )
  insert into public.klarwerk_offer_reviews(offer_id,business_id,offer_revision,review_status,offer_number)
  select id,firm,revision,status,number from records
  on conflict(offer_id,offer_revision) do update
  set review_status=excluded.review_status,offer_number=excluded.offer_number,reviewed_at=now()
  where public.klarwerk_offer_reviews.business_id=firm and
    (public.klarwerk_offer_reviews.review_status,public.klarwerk_offer_reviews.offer_number)
    is distinct from (excluded.review_status,excluded.offer_number);
  get diagnostics total = row_count;
  return jsonb_build_object('updated',total);
end;
$$;
revoke all on function app_private.klarwerk_record_offer_reviews(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_record_offer_reviews(text,jsonb) to service_role;

create or replace function public.klarwerk_dispatch_v1007(p_hash text,p_op text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
  if p_op='list' and p_body->>'entity'='fleet-orders' then
    return app_private.klarwerk_fleet_orders(p_hash,p_body);
  end if;
  if p_op='list' and p_body->>'entity'='labor-rates' then
    return app_private.klarwerk_labor_rates(p_hash,p_body);
  end if;
  if p_op='list' and p_body->>'entity'='customers' then
    return app_private.klarwerk_customer_addresses(p_hash,'list',p_body);
  end if;
  if p_op='rpc' and p_body->>'name'='update_customer_address' then
    return app_private.klarwerk_customer_addresses(p_hash,'update',p_body->'args');
  end if;
  if p_op='list' and p_body->>'entity'='work-sheets' then
    return app_private.klarwerk_work_sheets(p_hash,p_body);
  end if;
  if p_op='rpc' and p_body->>'name'='sync_offer_reviews' then
    return app_private.klarwerk_record_offer_reviews(p_hash,p_body->'args');
  end if;
  if p_op='list' and p_body->>'entity'='offers' then
    return app_private.klarwerk_offer_feed(p_hash,p_body);
  end if;
  if p_op='list' and p_body->>'entity'='orders'
    or p_op='rpc' and p_body->>'name' ~ '^(issue|prepare)_invoice' then
    raise exception 'Diese Aktion ist in der Arbeitszeiterfassung nicht verfügbar.' using errcode='42501';
  end if;
  return app_private.klarwerk_dispatch_v1007(p_hash,p_op,p_body);
end;
$$;

commit;
