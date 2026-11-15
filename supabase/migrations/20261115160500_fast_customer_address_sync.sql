begin;
set local lock_timeout = '5s';

create table app_private.customer_address_revisions (
  company_id uuid primary key,
  revision bigint not null check (revision > 0)
);
alter table app_private.customer_address_revisions enable row level security;
revoke all on app_private.customer_address_revisions from public, anon, authenticated;

create function app_private.bump_customer_address_revision()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  old_company uuid;
  new_company uuid;
  company uuid;
begin
  if tg_table_name = 'customers' then
    if tg_op = 'UPDATE' and (old.name,old.custom_fields,old.employee_id)
        is not distinct from (new.name,new.custom_fields,new.employee_id) then
      return null;
    end if;
    if tg_op <> 'INSERT' then old_company := app_private.team_company(old.employee_id); end if;
    if tg_op <> 'DELETE' then new_company := app_private.team_company(new.employee_id); end if;
  else
    if tg_op = 'UPDATE' and (old.role,old.business_id) is not distinct from (new.role,new.business_id) then
      return null;
    end if;
    old_company := case when old.role='business' then old.id when old.role='employee' then old.business_id end;
    if tg_op <> 'DELETE' then
      new_company := case when new.role='business' then new.id when new.role='employee' then new.business_id end;
    end if;
  end if;

  for company in select distinct id from unnest(array[old_company,new_company]) id
    where id is not null order by id
  loop
    insert into app_private.customer_address_revisions as versions(company_id,revision)
    values (company,1) on conflict (company_id) do update set revision=versions.revision+1;
  end loop;
  return null;
end;
$$;
revoke all on function app_private.bump_customer_address_revision() from public, anon, authenticated;

create trigger customer_address_sync_version
after insert or delete or update of name, custom_fields, employee_id on public.customers
for each row execute function app_private.bump_customer_address_revision();

create trigger customer_address_company_version
after delete or update of role, business_id on public.profiles
for each row execute function app_private.bump_customer_address_revision();

create function app_private.customer_address_revision(p_company uuid)
returns text language sql stable set search_path = ''
as $$
  select coalesce((select revision::text from app_private.customer_address_revisions
    where company_id=p_company),'0');
$$;
revoke all on function app_private.customer_address_revision(uuid) from public, anon, authenticated;

-- The native app may check a revision for its selected company only.
-- The actual customer list still uses the existing customers RLS policies.
create function app_private.current_customer_address_revision(p_company uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_company is null or auth.uid() is null or
    not (app_private.team_can_manage(p_company) or app_private.team_company(auth.uid()) is not distinct from p_company)
    or not exists (select 1 from public.profiles where id=p_company and role='business') then
    raise exception 'Kundenabgleich für diesen Betrieb nicht freigegeben.' using errcode='42501';
  end if;
  return app_private.customer_address_revision(p_company);
end;
$$;
revoke all on function app_private.current_customer_address_revision(uuid) from public, anon, authenticated;
grant execute on function app_private.current_customer_address_revision(uuid) to authenticated;

create function public.customer_address_sync_revision(p_company uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select app_private.current_customer_address_revision(p_company) $$;
revoke all on function public.customer_address_sync_revision(uuid) from public, anon, authenticated;
grant execute on function public.customer_address_sync_revision(uuid) to authenticated;


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

  if p_op = 'list' and p_body->>'sync' = 'revision' then
    return jsonb_build_object('revision',app_private.customer_address_revision(link.company_id),
      'company_id',link.company_id,'link_id',link.id);
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
  if not (coalesce(item.custom_fields, '{}'::jsonb) @> changes) or item.custom_fields ? 'address' then
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

commit;
