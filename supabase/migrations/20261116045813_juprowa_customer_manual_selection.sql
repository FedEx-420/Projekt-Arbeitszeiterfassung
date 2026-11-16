begin;

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
  resolved jsonb;
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
      candidates.total, candidates.ids, candidates.strong, candidates.revision, candidates.names, candidates.matches,
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
        coalesce(jsonb_agg(local.name order by local.name, local.id), '[]'::jsonb) as names,
        coalesce(jsonb_agg(jsonb_build_object(
          'id',local.id,'name',local.name,'street',local.fields->>'street','house_no',local.fields->>'house_no',
          'postal_code',local.fields->>'postal_code','city',local.fields->>'city','updated_at',local.updated_at
        ) order by local.name, local.id) filter (where local.source_id is null), '[]'::jsonb) as matches
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
    'source_id', source_id, 'name', name, 'fields', fields, 'candidates', names, 'matches', matches,
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
      coalesce((select jsonb_agg(jsonb_build_object('id',v->>'source_id','name',v->>'name',
        'street',v->'fields'->>'street','house_no',v->'fields'->>'house_no','postal_code',v->'fields'->>'postal_code','city',v->'fields'->>'city',
        'candidates',v->'candidates','matches',(select coalesce(jsonb_agg(m - 'updated_at'),'[]'::jsonb) from jsonb_array_elements(v->'matches') m)))
        from jsonb_array_elements(plan) v where v->>'status' = 'review'), '[]'::jsonb));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_customers) selected
    join jsonb_array_elements(plan) v on v->>'source_id' = selected->>'source_id'
    where nullif(selected->>'review_target','') is not null
      and (v->>'status' <> 'review' or not exists (
        select 1 from jsonb_array_elements(v->'matches') m where m->>'id' = selected->>'review_target'
      ))
  ) then
    return jsonb_build_object('selection_error','invalid');
  end if;

  select coalesce(jsonb_agg(case when v->>'status' = 'review' then v || jsonb_build_object(
    'target', assignment->>'id', 'target_revision', assignment->>'updated_at', 'status','assigned'
  ) else v end order by v->>'source_id'), '[]'::jsonb) into resolved
  from jsonb_array_elements(plan) v
  join jsonb_array_elements(p_customers) selected on v->>'source_id' = selected->>'source_id'
  left join lateral (
    select m from jsonb_array_elements(v->'matches') m where m->>'id' = selected->>'review_target'
  ) choice(assignment) on true
  where v->>'status' <> 'review' or assignment is not null;

  if exists (
    select 1 from jsonb_array_elements(resolved) v where v->>'target' is not null
    group by v->>'target' having count(*) > 1
  ) then
    return jsonb_build_object('selection_error','duplicate');
  end if;

  stats := stats || jsonb_build_object('added',0,'assigned',0);
  for item in select value from jsonb_array_elements(resolved) loop
    if item->>'status' = 'new' and not exists (select 1 from jsonb_array_elements(p_customers) selected
      where selected->>'source_id' = item->>'source_id' and selected->'add_new' = 'true'::jsonb) then
      continue;
    end if;
    if item->>'status' = 'assigned' then
      stats := jsonb_set(stats,'{assigned}',to_jsonb((stats->>'assigned')::integer+1));
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
