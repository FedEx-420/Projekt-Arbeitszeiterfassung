begin;
set local lock_timeout = '5s';

create function app_private.valid_wholesaler_stops(stops jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when jsonb_typeof(stops) is distinct from 'array' then false else
    jsonb_array_length(stops) <= 12 and octet_length(stops::text) <= 10000
    and not exists (
      select 1 from jsonb_array_elements(stops) as item(stop)
      where jsonb_typeof(stop) is distinct from 'object'
        or coalesce(stop->>'date','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        or coalesce(stop->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or exists (
          select 1 from (values ('label',160),('street',120),('house_no',40),('postal_code',24),
            ('city',120),('country',80),('date',10),('time',5)) as fields(name,max_length)
          where jsonb_typeof(stop->name) is distinct from 'string'
             or btrim(stop->>name) = '' or length(stop->>name) > max_length
        )
    ) end;
$$;
revoke all on function app_private.valid_wholesaler_stops(jsonb) from public, anon;
grant execute on function app_private.valid_wholesaler_stops(jsonb) to authenticated, service_role;

alter table public.work_orders
  add column wholesaler_stops jsonb not null default '[]'::jsonb,
  add constraint work_orders_wholesaler_stops_format check (
    app_private.valid_wholesaler_stops(wholesaler_stops)
    and (coalesce(work_kind, 'customer') = 'customer' or wholesaler_stops = '[]'::jsonb)
  );

-- Keep the existing role, ownership, billing lock and team-period checks.
do $migration$
declare
  definition text := pg_get_functiondef('public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure);
  insert_columns text := 'signed_by,signature_data,team_periods,work_kind,service_location)';
  insert_values text := 'then nullif(p_order->''service_location'',''null''::jsonb) end) returning * into saved;';
  update_values text := 'else existing.service_location';
begin
  if strpos(definition, insert_columns)=0 or strpos(definition, insert_values)=0 or strpos(definition, update_values)=0 then
    raise exception 'Unbekannte Version der Arbeitsschein-Funktion';
  end if;
  definition := replace(definition, insert_columns, 'signed_by,signature_data,team_periods,work_kind,service_location,wholesaler_stops)');
  definition := replace(definition, insert_values, $new$then nullif(p_order->'service_location','null'::jsonb) end,
    case when kind_v908='customer' then coalesce(p_order->'wholesaler_stops','[]'::jsonb) else '[]'::jsonb end) returning * into saved;$new$);
  definition := replace(definition, update_values, $new$else existing.service_location
    end, wholesaler_stops=case
      when kind_v908<>'customer' then '[]'::jsonb
      when p_order ? 'wholesaler_stops' then p_order->'wholesaler_stops'
      when existing.customer_id is distinct from customer.id then '[]'::jsonb
      else existing.wholesaler_stops$new$);
  execute definition;
end;
$migration$;

-- Add the field only for work sheets with stops so existing draft fingerprints stay valid.
do $migration$
declare
  definition text := pg_get_functiondef('app_private.klarwerk_work_sheets(text,jsonb)'::regprocedure);
  periods text := 'w.start_time, w.end_time, w.pause_hours, w.service_location';
  projection text := 'w.updated_at, w.service_location,';
  aggregate text := '(to_jsonb(p) - ''service_location'')';
  end_aggregate text := 'else jsonb_build_object(''service_location'',p.service_location) end order by p.id';
begin
  if strpos(definition,periods)=0 or strpos(definition,projection)=0 or
     strpos(definition,aggregate)=0 or strpos(definition,end_aggregate)=0 then
    raise exception 'Unbekannte Version der Klarwerk-Arbeitsscheinabfrage';
  end if;
  definition := replace(definition,periods,periods || ', w.wholesaler_stops');
  definition := replace(definition,projection,projection || ' w.wholesaler_stops,');
  definition := replace(definition,aggregate,$new$(to_jsonb(p) - 'service_location' - 'wholesaler_stops')$new$);
  definition := replace(definition,end_aggregate,$new$else jsonb_build_object('service_location',p.service_location) end
    || case when p.wholesaler_stops = '[]'::jsonb then '{}'::jsonb
      else jsonb_build_object('wholesaler_stops',p.wholesaler_stops) end order by p.id$new$);
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

  with staff as materialized (
    select id from public.profiles
    where (business_id=firm and role='employee') or id=firm
  ), day_visits as (
    select w.id,w.title,w.customer_id,w.service_location,w.wholesaler_stops,days.work_date,days.start,days.drivers,days.visits
    from public.work_orders w
    join staff owner on owner.id=w.employee_id
    cross join lateral (
      select coalesce(
          case when period->>'work_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then period->>'work_date' end,
          w.work_date::text
        ) as work_date,
        min(nullif(period->>'start_time','')) as start,
        jsonb_agg(distinct driver.id order by driver.id) as drivers,
        jsonb_agg(jsonb_build_object('driverId',driver.id,'start',nullif(period->>'start_time',''))
          order by period->>'start_time',driver.id) as visits
      from jsonb_array_elements(
        case when jsonb_typeof(w.team_periods)='array' and w.team_periods<>'[]'::jsonb then w.team_periods
          else jsonb_build_array(jsonb_build_object(
            'work_date',w.work_date,'start_time',w.start_time,'employee_id',w.employee_id
          )) end
      ) period
      join staff driver on driver.id::text = period->>'employee_id'
      group by 1
    ) days
    where coalesce(w.work_kind,'customer')='customer'
      and ((w.work_date>=first_day and w.work_date<next_month) or w.team_periods<>'[]'::jsonb)
      and days.work_date >= first_day::text and days.work_date < next_month::text
    order by days.work_date,w.id
    limit 2501
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'date',work_date,'start',start,'title',title,'customerId',customer_id,
    'serviceLocation',service_location,'shoppingStops',wholesaler_stops,'drivers',drivers,'visits',visits
  ) order by work_date,id),'[]') into orders from day_visits;

  if jsonb_array_length(orders)>2500 or jsonb_array_length(roster)>500 then
    raise exception 'Zu viele Fahrtaufträge für den ausgewählten Monat.' using errcode='22023';
  end if;
  return jsonb_build_object('companyId',firm,'month',p_body->>'month','employees',roster,'orders',orders);
end;
$$;
revoke all on function app_private.klarwerk_fleet_orders(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_fleet_orders(text,jsonb) to service_role;

commit;
