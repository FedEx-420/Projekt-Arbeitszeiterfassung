begin;

alter table public.work_orders add column service_location jsonb;
alter table public.work_orders add constraint work_orders_service_location_format check (
  service_location is null or (
    coalesce(work_kind, 'customer') = 'customer'
    and jsonb_typeof(service_location) = 'object'
    and octet_length(service_location::text) <= 3000
    and not jsonb_path_exists(service_location, '$.* ? (@.type() != "string")')
    and service_location - array['label', 'street', 'house_no', 'postal_code', 'city', 'country'] = '{}'::jsonb
    and length(coalesce(service_location->>'label', '')) <= 160
    and length(coalesce(service_location->>'street', '')) <= 120
    and length(coalesce(service_location->>'house_no', '')) <= 40
    and length(coalesce(service_location->>'postal_code', '')) <= 24
    and length(coalesce(service_location->>'city', '')) <= 120
    and length(coalesce(service_location->>'country', '')) <= 80
    and (
      (service_location - 'label' = '{}'::jsonb and nullif(btrim(service_location->>'label'), '') is not null)
      or (
        nullif(btrim(service_location->>'street'), '') is not null
        and nullif(btrim(service_location->>'postal_code'), '') is not null
        and nullif(btrim(service_location->>'city'), '') is not null
        and nullif(btrim(service_location->>'country'), '') is not null
      )
    )
  )
) not valid;

-- Extend the existing atomic save used by team, planning and timer flows.
-- Clients from older releases omit the key when editing a work sheet.
do $migration$
declare
  definition text := replace(pg_get_functiondef('public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure), E'\r\n', E'\n');
  insert_columns text := 'signed_by,signature_data,team_periods,work_kind)';
  insert_values text := 'normalized,kind_v908) returning * into saved;';
  update_values text := 'team_periods=normalized,work_kind=kind_v908 where id=order_id returning * into saved;';
begin
  if strpos(definition, insert_columns) = 0 or strpos(definition, insert_values) = 0 or strpos(definition, update_values) = 0 then
    raise exception 'Unbekannte Version der Arbeitsschein-Funktion';
  end if;
  definition := replace(definition, insert_columns, 'signed_by,signature_data,team_periods,work_kind,service_location)');
  definition := replace(definition, insert_values, $new$normalized,kind_v908,
    case when kind_v908='customer' then nullif(p_order->'service_location','null'::jsonb) end) returning * into saved;$new$);
  definition := replace(definition, update_values, $new$team_periods=normalized,work_kind=kind_v908,
    service_location=case
      when kind_v908<>'customer' then null
      when p_order ? 'service_location' then nullif(p_order->'service_location','null'::jsonb)
      when existing.customer_id is distinct from customer.id then null
      else existing.service_location
    end where id=order_id returning * into saved;$new$);
  execute definition;
end;
$migration$;

-- Preserve the JSON shape and therefore the fingerprint of older work sheets
-- that have no explicit service location.
do $migration$
declare
  definition text := replace(pg_get_functiondef('app_private.klarwerk_work_sheets(text,jsonb)'::regprocedure), E'\r\n', E'\n');
  periods text := 'w.team_periods, w.executed_hours, w.start_time, w.end_time, w.pause_hours';
  projection text := 'w.title, w.documentation, w.updated_at,';
  aggregate text := 'jsonb_agg(to_jsonb(p) order by p.id)';
begin
  if strpos(definition, periods) = 0 or strpos(definition, projection) = 0 or strpos(definition, aggregate) = 0 then
    raise exception 'Unbekannte Version der Klarwerk-Arbeitsscheinabfrage';
  end if;
  definition := replace(definition, periods, periods || ', w.service_location');
  definition := replace(definition, projection, projection || ' w.service_location,');
  definition := replace(definition, aggregate, $new$jsonb_agg(
    (to_jsonb(p) - 'service_location') || case when p.service_location is null then '{}'::jsonb
      else jsonb_build_object('service_location',p.service_location) end order by p.id)$new$);
  execute definition;
end;
$migration$;

create or replace function app_private.klarwerk_fleet_orders(p_hash text,p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  firm uuid;
  first_day date;
  next_month date;
  roster jsonb;
  orders jsonb;
begin
  firm := (app_private.klarwerk_dispatch_v1007(p_hash,'company','{}')->'company'->>'id')::uuid;
  if firm is null then
    raise exception 'Keine Betriebsfreigabe.' using errcode='42501';
  end if;
  if coalesce(p_body->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Bitte einen Monat auswählen.' using errcode='22023';
  end if;
  first_day := ((p_body->>'month')||'-01')::date;
  next_month := (first_day+interval '1 month')::date;

  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.id),'[]')
    into roster
    from public.profiles p
    where (p.business_id=firm and p.role='employee') or p.id=firm;

  with candidates as (
    select w.id,w.work_date,w.start_time,w.customer_id,w.employee_id,w.team_periods,w.service_location
      from public.work_orders w
      where w.work_date>=first_day and w.work_date<next_month
        and coalesce(w.work_kind,'customer')='customer'
        and app_private.team_company(w.employee_id)=firm
      order by w.work_date,w.id
      limit 2501
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'date',w.work_date,'start',w.start_time,
    'customerId',w.customer_id,'serviceLocation',w.service_location,'drivers',
    (select jsonb_agg(distinct p.id)
      from public.profiles p
      where ((p.business_id=firm and p.role='employee') or p.id=firm) and
        (p.id=w.employee_id or exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(w.team_periods)='array'
            then w.team_periods else '[]'::jsonb end) item
          where item->>'employee_id'=p.id::text)))
  ) order by w.work_date,w.id),'[]') into orders from candidates w;
  if jsonb_array_length(orders)>2500 or jsonb_array_length(roster)>500 then
    raise exception 'Zu viele Fahrtaufträge für den ausgewählten Monat.' using errcode='22023';
  end if;
  return jsonb_build_object('companyId',firm,'month',p_body->>'month','employees',roster,'orders',orders);
end
$$;

revoke all on function app_private.klarwerk_fleet_orders(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_fleet_orders(text,jsonb) to service_role;

-- The live installation already has this dispatcher branch. Include it for
-- installations that apply the Arbeitszeiterfassung migrations from scratch.
do $migration$
declare
  definition text := pg_get_functiondef('public.klarwerk_dispatch_v1007(text,text,jsonb)'::regprocedure);
  fallback text := 'return app_private.klarwerk_dispatch_v1007(p_hash, p_op, p_body);';
begin
  if strpos(definition, 'klarwerk_fleet_orders') = 0 then
    if strpos(definition, fallback) = 0 then raise exception 'Unbekannte Version der Klarwerk-Betriebsverbindung'; end if;
    execute replace(definition,fallback,$new$if p_op='list' and p_body->>'entity'='fleet-orders' then
    return app_private.klarwerk_fleet_orders(p_hash,p_body);
  end if;
  return app_private.klarwerk_dispatch_v1007(p_hash, p_op, p_body);$new$);
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
