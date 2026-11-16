begin;
set local lock_timeout = '5s';

create or replace function public.klarwerk_manage_v1007(p_actor uuid,p_company uuid,p_op text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if p_op not in ('pair','links','revoke','offer-scope') then
    raise exception 'Diese Aktion ist in der Arbeitszeiterfassung nicht verfügbar.' using errcode = '42501';
  end if;
  return app_private.klarwerk_manage_v1007(p_actor,p_company,p_op,p_body);
end;
$$;

create function app_private.klarwerk_offer_revision(p_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  link app_private.klarwerk_links_v1007;
  version text;
begin
  select g.* into link from app_private.klarwerk_links_v1007 g
  join public.profiles p on p.id=g.created_by and (p.role='administrator' or (p.role='business' and p.id=g.company_id))
  join auth.users u on u.id=p.id and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
  where g.token_hash=p_hash and g.revoked_at is null and g.claimed_at is not null for share of g;
  if link.id is null then
    raise exception 'Freigabe ungültig oder widerrufen.' using errcode='42501';
  end if;
  if link.offers_allowed then
    select count(*)::text || '|' || coalesce(max(updated_at)::text,'') || '|' || coalesce(sum(revision)::text,'0')
      into version from public.offers where business_id=link.company_id;
  end if;
  return jsonb_build_object('company_id',link.company_id,'link_id',link.id,
    'allowed',link.offers_allowed,'revision',version);
end;
$$;
revoke all on function app_private.klarwerk_offer_revision(text) from public,anon,authenticated;
grant execute on function app_private.klarwerk_offer_revision(text) to service_role;

create or replace function public.klarwerk_dispatch_v1007(p_hash text,p_op text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
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
  if p_op='list' and p_body->>'entity'='offers' and p_body->>'sync'='revision' then
    return app_private.klarwerk_offer_revision(p_hash);
  end if;
  if p_op='list' and p_body->>'entity'='orders'
    or p_op='rpc' and p_body->>'name' ~ '^(issue|prepare)_invoice' then
    raise exception 'Diese Aktion ist in der Arbeitszeiterfassung nicht verfügbar.' using errcode='42501';
  end if;
  return app_private.klarwerk_dispatch_v1007(p_hash,p_op,p_body);
end;
$$;

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
  site jsonb;
  sites jsonb := '[]'::jsonb;
  site_fields text[] := array['label','street','house_no','postal_code','city','country'];
  with_address boolean := coalesce(p_body ? 'address', false);
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
         where f.key in ('first_name','street','house_no','postal_code','city','country','address','email','phone_private','phone_mobile',
           'juprowa_number','juprowa_contacts','juprowa_import_values','service_locations')) as custom_fields
      from public.customers c where app_private.team_company(c.employee_id) = link.company_id
      order by c.id limit 250 offset greatest(0,least(coalesce((p_body->>'offset')::integer,0),100000))
    ) customer;
    return result;
  end if;

  if p_op is distinct from 'update' or jsonb_typeof(p_body) is distinct from 'object'
    or not (p_body ?| array['address','service_locations'])
    or (p_body - array['address','service_locations','customer_id','expected']) <> '{}'::jsonb then
    raise exception 'Ungültige Adressdaten.' using errcode = '22023';
  end if;
  if with_address then
    if jsonb_typeof(p_body->'address') is distinct from 'object'
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
  end if;
  if p_body ? 'service_locations' then
    if jsonb_typeof(p_body->'service_locations') is distinct from 'array'
      or jsonb_array_length(p_body->'service_locations') > 40 then
      raise exception 'Ungültige Ausführungsorte.' using errcode = '22023';
    end if;
    for site in select value from jsonb_array_elements(p_body->'service_locations') loop
      if jsonb_typeof(site) is distinct from 'object' or not (site ?& site_fields)
        or site - site_fields <> '{}'::jsonb then
        raise exception 'Ungültiger Ausführungsort.' using errcode = '22023';
      end if;
      foreach field in array site_fields loop
        field_value := btrim(site->>field);
        if jsonb_typeof(site->field) is distinct from 'string' or field_value ~ '[[:cntrl:]]'
          or length(field_value) > (case field when 'label' then 160 when 'house_no' then 40 when 'postal_code' then 24 when 'country' then 80 else 120 end)
          or (field not in ('label','house_no') and field_value='') then
          raise exception 'Bitte die Anschrift des Ausführungsorts prüfen.' using errcode = '22023';
        end if;
        site := jsonb_set(site,array[field],to_jsonb(field_value));
      end loop;
      sites := sites || jsonb_build_array(site);
    end loop;
    changes := changes || jsonb_build_object('service_locations',sites);
  end if;

  select * into item from public.customers
  where id = (p_body->>'customer_id')::uuid and app_private.team_company(employee_id) = link.company_id
  for update;
  if item.id is null then
    raise exception 'Kunde im verknüpften Betrieb nicht verfügbar.' using errcode = '42501';
  end if;
  if exists(select 1 from jsonb_each(changes) f where item.custom_fields->f.key is distinct from f.value)
    or (with_address and item.custom_fields ? 'address') then
    if item.updated_at is distinct from (p_body->>'expected')::timestamptz then
      return jsonb_build_object('conflict',true,'updated_at',item.updated_at);
    end if;
    update public.customers
      set custom_fields = (case when with_address then custom_fields - 'address' else custom_fields end) || changes
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

create or replace function public.juprowa_customer_batch(
  p_business uuid, p_revision uuid, p_customers jsonb, p_expected text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  connection public.juprowa_servicepad_connections;
  plan jsonb;
  fingerprint text;
  item jsonb;
  target uuid;
  extra_fields jsonb;
  current_fields jsonb;
  stats jsonb;
begin
  if jsonb_typeof(p_customers) is distinct from 'array' or jsonb_array_length(p_customers) > 401 then
    raise exception 'Ungültige Kundenliste' using errcode = '22023';
  end if;
  if p_expected is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_business::text, 125831));
  end if;
  select * into connection from public.juprowa_servicepad_connections
    where business_id = p_business and revision = p_revision for share;
  if connection.business_id is null then
    return jsonb_build_object('changed', true);
  end if;

  with incoming as materialized (
    select source_id, btrim(name) as name, fields
    from jsonb_to_recordset(p_customers) as c(source_id text, name text, fields jsonb)
    where source_id ~ '^[1-9][0-9]{0,14}$' and btrim(name) <> '' and jsonb_typeof(fields) = 'object'
  ), pool as materialized (
    select c.id, c.name, c.updated_at, c.custom_fields as fields, l.source_id
    from public.customers c
    join public.profiles p on p.id = c.employee_id
      and ((p.role = 'business' and p.id = p_business) or (p.role = 'employee' and p.business_id = p_business))
    left join app_private.juprowa_customer_links l on l.customer_id = c.id
      and l.business_id = p_business and l.portal_customer_id = connection.portal_customer_id
      and l.mandant_id = connection.mandant_id
  ), names as materialized (
    select null::uuid as id, source_id, name, fields, null::timestamptz as updated_at, true as remote from incoming
    union all
    select id, source_id, name, fields, updated_at, false from pool
  ), identity as materialized (
    select *,
      app_private.juprowa_match_text(name) as name_key,
      app_private.juprowa_match_text(concat_ws(' ', fields->>'first_name', name)) as contact_key,
      lower(btrim(fields->>'email')) as email_key,
      regexp_replace(coalesce(nullif(fields->>'phone_mobile',''),fields->>'phone_private',''), '[^0-9]', '', 'g') as phone_key,
      case when btrim(coalesce(fields->>'street','')) <> '' and btrim(coalesce(fields->>'postal_code','')) <> ''
        and btrim(coalesce(fields->>'city','')) <> '' then
        app_private.juprowa_match_text(concat_ws(' ', fields->>'street', fields->>'house_no', fields->>'postal_code', fields->>'city'))
      end as address_key
    from names
  ), compared as (
    select remote.source_id, remote.name, remote.fields, linked.id as linked_id, linked.updated_at as linked_at,
      candidates.total, candidates.ids, candidates.strong, candidates.revision, candidates.names,
      exists (select 1 from identity duplicate where duplicate.remote and duplicate.source_id <> remote.source_id
        and (duplicate.name_key = remote.name_key
          or (duplicate.email_key = remote.email_key and remote.email_key <> '')
          or (duplicate.phone_key = remote.phone_key and length(remote.phone_key) >= 7))) as repeated
    from identity remote
    left join identity linked on not linked.remote and linked.source_id = remote.source_id
    cross join lateral (
      select count(*) as total, array_agg(local.id order by local.id) as ids,
        bool_and(proof.same_name and (proof.same_email or proof.same_address) and local.source_id is null) as strong,
        max(local.updated_at) as revision,
        coalesce(jsonb_agg(local.name order by local.id), '[]'::jsonb) as names
      from identity local
      cross join lateral (select
        (remote.name_key = local.name_key or remote.name_key = local.contact_key or remote.contact_key = local.name_key) as same_name,
        (coalesce(remote.email_key,'') <> '' and remote.email_key = local.email_key) as same_email,
        (remote.address_key is not null and remote.address_key = local.address_key) as same_address
      ) proof
      where not local.remote and (proof.same_name or proof.same_email or proof.same_address
        or (length(remote.phone_key) >= 7 and remote.phone_key = local.phone_key))
    ) candidates
    where remote.remote
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_id', source_id, 'name', name, 'fields', fields, 'candidates', names,
    'status', case
      when linked_id is not null then 'linked'
      when repeated or (total > 0 and not (total = 1 and strong)) then 'review'
      when total = 1 and strong then 'match'
      when total = 0 then 'new'
      else 'review' end,
    'target', coalesce(linked_id, case when total = 1 and strong then ids[1] end),
    'target_revision', coalesce(linked_at, revision)
  ) order by source_id), '[]'::jsonb) into plan from compared;

  if jsonb_array_length(plan) <> jsonb_array_length(p_customers)
     or (select count(distinct v->>'source_id') from jsonb_array_elements(plan) v) <> jsonb_array_length(plan) then
    raise exception 'Ungültige Kundenliste' using errcode = '22023';
  end if;
  fingerprint := encode(sha256(convert_to(plan::text, 'UTF8')), 'hex');
  select jsonb_build_object(
    'new', count(*) filter (where v->>'status' = 'new'),
    'linked', count(*) filter (where v->>'status' in ('linked','match')),
    'review', count(*) filter (where v->>'status' = 'review')
  ) into stats from jsonb_array_elements(plan) v;
  if p_expected is null or p_expected <> fingerprint then
    return jsonb_build_object('fingerprint', fingerprint, 'counts', stats, 'new_candidates',
      coalesce((select jsonb_agg(jsonb_build_object('id',v->>'source_id','name',v->>'name','city',v->'fields'->>'city'))
        from jsonb_array_elements(plan) v where v->>'status'='new'),'[]'::jsonb), 'review',
      coalesce((select jsonb_agg(jsonb_build_object('name', v->>'name','candidates',v->'candidates'))
        from jsonb_array_elements(plan) v where v->>'status' = 'review'), '[]'::jsonb));
  end if;

  stats := stats || jsonb_build_object('added',0);
  for item in select value from jsonb_array_elements(plan) where value->>'status' <> 'review' loop
    if item->>'status' = 'new' and not exists (select 1 from jsonb_array_elements(p_customers) selected
      where selected->>'source_id' = item->>'source_id' and selected->'add_new' = 'true'::jsonb) then
      continue;
    end if;
    extra_fields := item->'fields';
    target := (item->>'target')::uuid;
    if item->>'status' = 'new' then
      stats := jsonb_set(stats,'{added}',to_jsonb((stats->>'added')::integer+1));
      insert into public.customers(employee_id, name, custom_fields)
      values (p_business, item->>'name', extra_fields || jsonb_build_object('juprowa_import_values', extra_fields)) returning id into target;
    else
      -- If an older record has one combined address, retain it as a unit.
      select c.custom_fields into current_fields from public.customers c
      where c.id = target and c.updated_at = (item->>'target_revision')::timestamptz
        and exists (select 1 from public.profiles p where p.id = c.employee_id
          and ((p.role = 'business' and p.id = p_business) or (p.role = 'employee' and p.business_id = p_business)))
      for update;
      if not found then
        raise exception 'Kunde wurde zwischenzeitlich geändert' using errcode = '40001';
      end if;
      select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb) into extra_fields from jsonb_each(extra_fields) f
      where (current_fields->f.key is null or current_fields->f.key in ('null'::jsonb, '[]'::jsonb, '""'::jsonb)
        or btrim(current_fields->>f.key) = '')
        and (f.key not in ('street','house_no','postal_code','city','country') or (
          (btrim(coalesce(current_fields->>'address','')) = '' or btrim(coalesce(current_fields->>'street','')) <> '')
          and not exists (
            select 1 from unnest(array['street','house_no','postal_code','city','country']) as keys(key)
            where btrim(coalesce(current_fields->>keys.key,'')) <> ''
              and btrim(coalesce(extra_fields->>keys.key,'')) <> ''
              and app_private.juprowa_match_text(current_fields->>keys.key)
                <> app_private.juprowa_match_text(extra_fields->>keys.key)
          )
        ));
      if extra_fields <> '{}'::jsonb or not (current_fields ? 'juprowa_import_values') then
        update public.customers set custom_fields = current_fields || extra_fields || jsonb_build_object(
          'juprowa_import_values', coalesce(current_fields->'juprowa_import_values','{}'::jsonb) || extra_fields
        ) where id = target;
      end if;
    end if;
    if item->>'status' <> 'linked' then
      insert into app_private.juprowa_customer_links(business_id, portal_customer_id, mandant_id, source_id, customer_id)
      values (p_business, connection.portal_customer_id, connection.mandant_id, item->>'source_id', target);
    end if;
  end loop;
  return jsonb_build_object('applied', true, 'counts', stats);
end
$$;

revoke all on function public.juprowa_customer_batch(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.juprowa_customer_batch(uuid,uuid,jsonb,text) to service_role;

commit;
