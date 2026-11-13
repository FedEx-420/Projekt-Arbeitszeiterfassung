begin;

create function app_private.klarwerk_work_sheets(p_hash text, p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id uuid;
  requested_ids uuid[];
  page_offset integer := greatest(0, least(coalesce((p_body->>'offset')::integer, 0), 100000));
  result jsonb;
begin
  company_id := (app_private.klarwerk_dispatch_v1007(p_hash, 'company', '{}')->'company'->>'id')::uuid;
  if p_body ? 'ids' then
    if jsonb_typeof(p_body->'ids') is distinct from 'array' then
      raise exception 'Arbeitsscheine als Liste angeben.';
    end if;
    if jsonb_array_length(p_body->'ids') not between 1 and 40 then
      raise exception 'Bitte 1 bis 40 Arbeitsscheine auswählen.';
    end if;
    select array_agg(id::uuid) into requested_ids from jsonb_array_elements_text(p_body->'ids') as ids(id);
    page_offset := 0;
  end if;

  with sheets as (
    select w.id, w.work_date, w.customer_id, w.customer_name, w.title, w.documentation,
      w.updated_at, w.team_periods, w.executed_hours, w.start_time, w.end_time, w.pause_hours
    from public.work_orders w
    where app_private.team_company(w.employee_id) = company_id
      and not w.invoiced and coalesce(w.work_kind, 'customer') = 'customer'
      and (requested_ids is null or w.id = any(requested_ids))
    order by w.id limit 250 offset page_offset
  ), projected as (
    select w.id, w.work_date, w.customer_id, w.customer_name, w.title, w.documentation, w.updated_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'name', i.position_name, 'quantity', i.quantity, 'unit', units.name
        ) order by i.id)
        from public.work_order_items i
        left join public.materials m on m.id = i.material_id and m.business_id = company_id
        cross join lateral (values (coalesce(nullif(btrim(i.unit), ''), nullif(btrim(m.unit), ''), 'Stück'))) units(name)
        where i.work_order_id = w.id
          and lower(units.name) not in ('h', 'std', 'std.', 'stunde', 'stunden')
          and lower(btrim(i.position_name)) not in (
            'monteurstunde', 'meisterstunde', 'aushilfsstunde', 'auszubildendenstunde'
          )
      ), '[]'::jsonb) as materials,
      case when jsonb_array_length(coalesce(w.team_periods, '[]')) > 0 then (
        select jsonb_agg(jsonb_build_object(
          'name', p.value->'labor_name', 'hours', p.value->'executed_hours',
          'start', p.value->'start_time', 'end', p.value->'end_time', 'pause', p.value->'pause_hours'
        ) order by p.ordinality)
        from jsonb_array_elements(w.team_periods) with ordinality as p(value, ordinality)
      ) else jsonb_build_array(jsonb_build_object(
        'hours', w.executed_hours, 'start', w.start_time, 'end', w.end_time, 'pause', w.pause_hours
      )) end as hours
    from sheets w
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) into result from projected p;
  return result;
end;
$$;

revoke all on function app_private.klarwerk_work_sheets(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_work_sheets(text,jsonb) to service_role;

create or replace function public.klarwerk_dispatch_v1007(p_hash text,p_op text,p_body jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$
  select case when p_op = 'list' and p_body->>'entity' = 'work-sheets'
    then app_private.klarwerk_work_sheets(p_hash, p_body)
    else app_private.klarwerk_dispatch_v1007(p_hash, p_op, p_body)
  end
$$;

notify pgrst, 'reload schema';
commit;
