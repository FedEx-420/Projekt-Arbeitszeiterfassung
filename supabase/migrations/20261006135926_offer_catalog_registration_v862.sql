-- Register new quotation names in the company's shared catalogs atomically.
-- No backfill, historical document rewrite or elevated function privileges.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Existing same_business only matches employee profiles via business_id.
-- Also share customers owned directly by the current business profile. Keep
-- all existing access predicates and keep deletion restricted to managers.
alter policy "Business customers are visible to team" on public.customers
  using ((select app_private.same_business(employee_id)) or employee_id=(select app_private.current_business_id()));
alter policy "Business customers can be changed" on public.customers
  using ((select app_private.same_business(employee_id)) or employee_id=(select app_private.current_business_id()))
  with check ((select app_private.same_business(employee_id)) or employee_id=(select app_private.current_business_id()));
alter policy "Business customers can be removed" on public.customers
  using ((select app_private.is_manager()) and ((select app_private.same_business(employee_id)) or employee_id=(select app_private.current_business_id())));
create or replace function public.save_offer_v857(p_data jsonb,p_revision integer default null) returns public.offers
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp set lock_timeout='5s' as $$
declare
  target public.offers; saved public.offers; company uuid;
  customer public.customers; material public.materials;
  name_value text; item jsonb; registered_items jsonb:='[]';
begin
  company:=nullif(p_data->>'business_id','')::uuid;
  if auth.uid() is null or not app_private.team_can_manage(company) then
    raise exception 'Keine Berechtigung für Angebote dieser Firma.' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles where id=company and role='business') then
    raise exception 'Bitte ein gültiges Geschäftskonto auswählen.' using errcode='23514';
  end if;
  if nullif(p_data->>'id','') is not null then
    select * into target from public.offers where id=(p_data->>'id')::uuid for update;
    if not found then raise exception 'Angebot nicht gefunden.' using errcode='42501'; end if;
    if target.business_id is distinct from company then raise exception 'Die Firma eines Angebots darf nicht geändert werden.' using errcode='23514'; end if;
    if target.revision is distinct from p_revision then raise exception 'Das Angebot wurde inzwischen geändert. Bitte erneut öffnen.' using errcode='40001'; end if;
  end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' then
    raise exception 'Bitte gültige Angebotspositionen hinzufügen.' using errcode='23514';
  end if;
  if jsonb_array_length(p_data->'items') not between 1 and 100 then
    raise exception 'Bitte mindestens eine und höchstens 100 Angebotspositionen hinzufügen.' using errcode='23514';
  end if;
  -- One bounded company lock prevents duplicate names between simultaneous
  -- offer saves, including repeated free-text positions in the same offer.
  perform pg_advisory_xact_lock(hashtextextended('offer_catalog_v862:'||company::text,0));
  if nullif(p_data->>'customer_id','') is null then
    name_value:=btrim(coalesce(p_data->>'customer_name',''));
    if length(name_value) not between 1 and 160 then
      raise exception 'Bitte einen Kundennamen mit höchstens 160 Zeichen eingeben.' using errcode='23514';
    end if;
    -- Exact matches only: declining fuzzy suggestions must not merge names.
    select c.* into customer from public.customers c
      where lower(btrim(c.name))=lower(name_value)
        and app_private.team_company(c.employee_id)=company
      order by c.id limit 1;
    if not found then
      if jsonb_typeof(coalesce(p_data->'customer_snapshot','{}')) is distinct from 'object'
        or length(coalesce(p_data->'customer_snapshot','{}')::text)>8000 then
        raise exception 'Ungültige Kundendaten.' using errcode='23514';
      end if;
      insert into public.customers(employee_id,name,custom_fields)
        values(company,name_value,coalesce(p_data->'customer_snapshot','{}')) returning * into customer;
    end if;
    p_data:=jsonb_set(p_data,'{customer_id}',to_jsonb(customer.id));
  end if;
  for item in select value from jsonb_array_elements(p_data->'items') loop
    if nullif(item->>'material_id','') is null then
      name_value:=btrim(coalesce(item->>'name',''));
      if length(name_value) not between 1 and 160
        or coalesce(item->>'unit_price','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
        raise exception 'Bitte einen Artikelnamen mit höchstens 160 Zeichen und einen gültigen Preis eingeben.' using errcode='23514';
      end if;
      if (item->>'unit_price')::numeric>1000000 then
        raise exception 'Bitte einen gültigen Artikelpreis eingeben.' using errcode='23514';
      end if;
      select m.* into material from public.materials m
        where m.business_id=company and lower(btrim(m.name))=lower(name_value)
        order by m.active desc,m.id limit 1;
      if not found then
        insert into public.materials(business_id,name,unit_price,unit,active)
          values(company,name_value,(item->>'unit_price')::numeric,
            app_private.canonical_unit_v860(item->>'unit',item->>'kind'='labor'),true)
          returning * into material;
      elsif material.active=false then
        update public.materials set active=true where id=material.id returning * into material;
      end if;
      item:=jsonb_set(item,'{material_id}',to_jsonb(material.id));
    end if;
    registered_items:=registered_items||jsonb_build_array(item);
  end loop;
  p_data:=jsonb_set(p_data,'{items}',registered_items);
  -- The existing trigger checks ownership, quantities, units and totals.
  -- Any failure rolls back BOTH catalogs and the offer together.
  if target.id is not null then
    update public.offers set customer_id=nullif(p_data->>'customer_id','')::uuid,customer_name=p_data->>'customer_name',customer_snapshot=coalesce(p_data->'customer_snapshot','{}'),offer_date=(p_data->>'offer_date')::date,valid_until=nullif(p_data->>'valid_until','')::date,title=p_data->>'title',notes=coalesce(p_data->>'notes',''),status=coalesce(p_data->>'status','draft'),items=p_data->'items',vat_rate=coalesce((p_data->>'vat_rate')::numeric,0) where id=target.id returning * into saved;
  else
    insert into public.offers(business_id,created_by,offer_number,customer_id,customer_name,customer_snapshot,offer_date,valid_until,title,notes,status,items,vat_rate)
    values(company,auth.uid(),'',nullif(p_data->>'customer_id','')::uuid,p_data->>'customer_name',coalesce(p_data->'customer_snapshot','{}'),(p_data->>'offer_date')::date,nullif(p_data->>'valid_until','')::date,p_data->>'title',coalesce(p_data->>'notes',''),coalesce(p_data->>'status','draft'),p_data->'items',coalesce((p_data->>'vat_rate')::numeric,0)) returning * into saved;
  end if;
  return saved;
end; $$;
revoke all on function public.save_offer_v857(jsonb,integer) from public,anon;
grant execute on function public.save_offer_v857(jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
