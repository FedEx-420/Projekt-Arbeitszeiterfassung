begin;

create or replace function app_private.klarwerk_labor_rates(p_hash text, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  firm uuid;
  customer uuid := nullif(p_body->>'customer_id','')::uuid;
  sheet_ids uuid[] := '{}';
  standard jsonb;
  individual jsonb;
  roles jsonb;
begin
  firm := (app_private.klarwerk_dispatch_v1007(p_hash,'company','{}')->'company'->>'id')::uuid;
  if customer is not null and not exists (
    select 1 from public.customers c where c.id=customer and app_private.team_company(c.employee_id)=firm
  ) then
    raise exception 'Kunde im verknüpften Betrieb nicht verfügbar.' using errcode='42501';
  end if;
  if p_body ? 'ids' then
    if jsonb_typeof(p_body->'ids') is distinct from 'array' then
      raise exception 'Arbeitsscheine als Liste angeben.' using errcode='22023';
    end if;
    if jsonb_array_length(p_body->'ids') not between 1 and 40 then
      raise exception 'Bitte 1 bis 40 Arbeitsscheine angeben.' using errcode='22023';
    end if;
    select array_agg(value::uuid) into sheet_ids from jsonb_array_elements_text(p_body->'ids');
  end if;

  select coalesce(jsonb_object_agg(r.role,r.cents),'{}'::jsonb) into standard
  from (
    select distinct on (names.role) names.role, round(m.unit_price*100) as cents
    from (values ('monteur','monteurstunde',1),('meister','meisterstunde',1),
                 ('helfer','aushilfsstunde',1),('helfer','helferstunde',2),('azubi','auszubildendenstunde',1)) names(role,label,priority)
    join public.materials m on m.business_id=firm and lower(m.name)=names.label
    where m.active and m.unit_price between 0 and 9999999
    order by names.role,names.priority
  ) r;
  select jsonb_strip_nulls(jsonb_build_object('monteur',round(r.monteur*100),'meister',round(r.meister*100),'azubi',round(r.azubi*100)))
  into individual from public.customer_hourly_rates r where r.customer_id=customer;
  select coalesce(jsonb_object_agg(w.id, p.labor_type),'{}'::jsonb) into roles
  from public.work_orders w join public.profiles p on p.id=w.employee_id
  where w.id=any(sheet_ids) and not w.invoiced and coalesce(w.work_kind,'customer')='customer'
    and w.customer_id=customer and app_private.team_company(w.employee_id)=firm;
  return jsonb_build_object('company_id',firm,'standard',standard,'customer',coalesce(individual,'{}'::jsonb),'roles',roles);
end;
$$;
revoke all on function app_private.klarwerk_labor_rates(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_labor_rates(text,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.klarwerk_dispatch_v1007(p_hash text, p_op text, p_body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_op = 'list' and p_body->>'entity' = 'labor-rates' then
    return app_private.klarwerk_labor_rates(p_hash,p_body);
  end if;
  if p_op = 'list' and p_body->>'entity' = 'customers' then
    return app_private.klarwerk_customer_addresses(p_hash, 'list', p_body);
  end if;
  if p_op = 'rpc' and p_body->>'name' = 'update_customer_address' then
    return app_private.klarwerk_customer_addresses(p_hash, 'update', p_body->'args');
  end if;
  if p_op = 'list' and p_body->>'entity' = 'work-sheets' then
    return app_private.klarwerk_work_sheets(p_hash, p_body);
  end if;
  if p_op = 'list' and p_body->>'entity' in ('offers', 'orders')
    or p_op = 'rpc' and p_body->>'name' ~ '^(issue|prepare)_invoice' then
    raise exception 'Diese Aktion ist in der Arbeitszeiterfassung nicht mehr verfügbar.' using errcode = '42501';
  end if;
  return app_private.klarwerk_dispatch_v1007(p_hash, p_op, p_body);
end;
$function$;
revoke all on function public.klarwerk_dispatch_v1007(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.klarwerk_dispatch_v1007(text,text,jsonb) to service_role;

commit;
