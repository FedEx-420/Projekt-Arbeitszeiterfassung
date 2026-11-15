begin;
set local lock_timeout = '5s';

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
    select w.id,w.title,w.customer_id,w.service_location,days.work_date,days.start,days.drivers,days.visits
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
    'serviceLocation',service_location,'drivers',drivers,'visits',visits
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
