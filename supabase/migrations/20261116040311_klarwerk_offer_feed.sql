begin;
set local lock_timeout='5s';

create function app_private.klarwerk_offer_feed(p_hash text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  scope jsonb;
  firm uuid;
  result jsonb;
begin
  scope := app_private.klarwerk_offer_revision(p_hash);
  if p_body->>'sync'='revision' then
    return scope;
  end if;
  if scope->'allowed' is distinct from 'true'::jsonb then
    raise exception 'Angebote sind für diese Verbindung noch nicht freigegeben.' using errcode='42501';
  end if;
  firm := (scope->>'company_id')::uuid;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.id),'[]'::jsonb) into result
  from (
    select o.id,o.business_id,o.offer_number,o.customer_name,o.customer_snapshot,
      o.offer_date,o.valid_until,o.title,o.notes,o.status,o.items,o.subtotal,o.tax_amount,
      o.total,o.revision,o.updated_at,o.offer_config
    from public.offers o
    where o.business_id=firm and (p_body->>'id' is null or o.id=(p_body->>'id')::uuid)
    order by o.id limit 250 offset greatest(0,least(coalesce((p_body->>'offset')::integer,0),100000))
  ) item;
  return result;
end;
$$;
revoke all on function app_private.klarwerk_offer_feed(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_offer_feed(text,jsonb) to service_role;

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
