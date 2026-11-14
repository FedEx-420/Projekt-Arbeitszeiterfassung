begin;

create or replace function app_private.klarwerk_customer_addresses(p_hash text, p_op text, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  link app_private.klarwerk_links_v1007;
  item public.customers;
  fields text[] := array['street','house_no','postal_code','city','country'];
  changes jsonb := '{}'::jsonb;
  field text;
  field_value text;
  result jsonb;
begin
  select * into link from app_private.klarwerk_links_v1007
  where token_hash = p_hash and revoked_at is null and claimed_at is not null
  for share;
  if link.id is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = link.created_by and (p.role = 'administrator' or (p.role = 'business' and p.id = link.company_id))
      and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
  ) then
    raise exception 'Freigabe ungültig oder widerrufen.' using errcode = '42501';
  end if;

  if p_op = 'list' then
    select coalesce(jsonb_agg(to_jsonb(customer) order by customer.id), '[]'::jsonb) into result
    from (
      select link.company_id as company_id, c.id, c.name, c.updated_at,
        (select coalesce(jsonb_object_agg(f.key,f.value),'{}'::jsonb)
         from jsonb_each(coalesce(c.custom_fields,'{}'::jsonb)) f
         where f.key in ('first_name','street','house_no','postal_code','city','country','address','email','phone_private','phone_mobile')) as custom_fields
      from public.customers c where app_private.team_company(c.employee_id) = link.company_id
      order by c.id limit 250 offset greatest(0,least(coalesce((p_body->>'offset')::integer,0),100000))
    ) customer;
    return result;
  end if;

  if p_op is distinct from 'update' or jsonb_typeof(p_body->'address') is distinct from 'object'
     or not ((p_body->'address') ?& fields) or ((p_body->'address') - fields) <> '{}'::jsonb then
    raise exception 'Ungültige Adressdaten.' using errcode = '22023';
  end if;
  foreach field in array fields loop
    field_value := btrim((p_body->'address')->>field);
    if jsonb_typeof((p_body->'address')->field) is distinct from 'string'
       or length(field_value) > 120 or field_value ~ '[[:cntrl:]]'
       or (field <> 'house_no' and field_value = '') then
      raise exception 'Bitte die Kundenanschrift prüfen.' using errcode = '22023';
    end if;
    changes := changes || jsonb_build_object(field,field_value);
  end loop;

  select * into item from public.customers
  where id = (p_body->>'customer_id')::uuid and app_private.team_company(employee_id) = link.company_id
  for update;
  if item.id is null then
    raise exception 'Kunde im verknüpften Betrieb nicht verfügbar.' using errcode = '42501';
  end if;
  if not (coalesce(item.custom_fields, '{}'::jsonb) @> changes) then
    if item.updated_at is distinct from (p_body->>'expected')::timestamptz then
      return jsonb_build_object('conflict',true,'updated_at',item.updated_at);
    end if;
    update public.customers
      set custom_fields = (coalesce(custom_fields,'{}'::jsonb) - 'address') || changes
      where id = item.id
      returning * into item;
    insert into app_private.klarwerk_events_v1007(link_id,company_id,operation,request_id)
      values(link.id,link.company_id,'update_customer_address',item.id::text);
  end if;
  return jsonb_build_object('updated_at',item.updated_at);
end;
$$;
revoke all on function app_private.klarwerk_customer_addresses(text,text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_customer_addresses(text,text,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.klarwerk_dispatch_v1007(p_hash text, p_op text, p_body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
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

commit;
