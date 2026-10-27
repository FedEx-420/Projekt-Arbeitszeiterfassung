-- Requires the v921 supplier identity extension. No historical document writes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.materials add column catalog_manufacturer text,add column catalog_category text,
 add column catalog_manufacturer_source text,add column catalog_category_source text,
 add column catalog_source_category text,add column catalog_deleted_at timestamptz;
alter table public.materials add constraint materials_classification_v925 check(
 (catalog_manufacturer is null or (length(catalog_manufacturer)<=160 and catalog_manufacturer!~'[[:cntrl:]]'))
 and (catalog_category is null or (length(catalog_category)<=160 and catalog_category!~'[[:cntrl:]]'))
 and (catalog_source_category is null or length(catalog_source_category)<=160)
 and (catalog_manufacturer_source is null or catalog_manufacturer_source in ('catalog','inferred','manual','unknown'))
 and (catalog_category_source is null or catalog_category_source in ('catalog','inferred','manual','unknown')));
create index materials_classification_v925 on public.materials(business_id,catalog_category,catalog_manufacturer) where active=true;
create function app_private.catalog_classification_guard_v925() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and (new.catalog_manufacturer is not null or new.catalog_category is not null or new.catalog_deleted_at is not null or new.catalog_source_category is not null or new.catalog_manufacturer_source is not null or new.catalog_category_source is not null))
 or (tg_op='UPDATE' and (new.catalog_manufacturer is distinct from old.catalog_manufacturer or new.catalog_category is distinct from old.catalog_category
 or new.catalog_manufacturer_source is distinct from old.catalog_manufacturer_source or new.catalog_category_source is distinct from old.catalog_category_source
 or new.catalog_source_category is distinct from old.catalog_source_category or new.catalog_deleted_at is distinct from old.catalog_deleted_at)) then
  if auth.uid() is not null and not app_private.catalog_manager_v908(new.business_id) then raise exception 'Nur die Geschäftsführung darf Artikelgruppen ändern.';end if;
 end if;return new;
end;$$;
revoke all on function app_private.catalog_classification_guard_v925() from public,anon,authenticated;
create trigger catalog_classification_guard_v925 before insert or update on public.materials for each row execute function app_private.catalog_classification_guard_v925();
create function public.import_material_catalog_v925(p_company uuid,p_supplier text,p_rows jsonb,p_confirm_net_eur boolean,p_use_vk1 boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;clean_rows jsonb;result jsonb;item public.materials;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>2097152 then raise exception 'Ungültiger Katalogausschnitt.';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for r in select value from jsonb_array_elements(p_rows) loop
  if exists(select 1 from jsonb_each(r) e where e.key in ('manufacturer','category','manufacturer_source','category_source','source_category') and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Hersteller und Kategorie müssen Text sein.';end if;
 end loop;
 select jsonb_agg(value-array['manufacturer','category','manufacturer_source','category_source','source_category']) into clean_rows from jsonb_array_elements(p_rows);
 result:=public.import_material_catalog_v921(p_company,p_supplier,clean_rows,p_confirm_net_eur,p_use_vk1);
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into item from public.materials where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=r->>'article_number' for update;
  if item.catalog_manufacturer is not null and ((item.catalog_manufacturer_source='manual' and coalesce(r->>'manufacturer_source','')<>'manual') or (item.catalog_manufacturer_source='catalog' and coalesce(r->>'manufacturer_source','') in ('inferred','unknown',''))) then
   r:=r||jsonb_build_object('manufacturer',item.catalog_manufacturer,'manufacturer_source',item.catalog_manufacturer_source);
  end if;
  if item.catalog_category is not null and item.catalog_category_source='manual' and coalesce(r->>'category_source','')<>'manual' then
   r:=r||jsonb_build_object('category',item.catalog_category,'category_source',item.catalog_category_source);
  end if;
  update public.materials set catalog_manufacturer=nullif(btrim(r->>'manufacturer'),''),catalog_category=nullif(btrim(r->>'category'),''),
   catalog_manufacturer_source=nullif(r->>'manufacturer_source',''),catalog_category_source=nullif(r->>'category_source',''),catalog_source_category=nullif(r->>'source_category',''),
   active=case when catalog_deleted_at is not null then true else active end,catalog_deleted_at=null
  where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=r->>'article_number'
   and (catalog_manufacturer is distinct from nullif(btrim(r->>'manufacturer'),'') or catalog_category is distinct from nullif(btrim(r->>'category'),'')
    or catalog_manufacturer_source is distinct from nullif(r->>'manufacturer_source','') or catalog_category_source is distinct from nullif(r->>'category_source','')
    or catalog_source_category is distinct from nullif(r->>'source_category','') or catalog_deleted_at is not null);
 end loop;
 return result||jsonb_build_object('classification_version',925);
end;$$;
revoke all on function public.import_material_catalog_v925(uuid,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.import_material_catalog_v925(uuid,text,jsonb,boolean,boolean) to authenticated;
create function public.remove_catalog_articles_v925(p_company uuid,p_rows jsonb,p_confirm boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;m public.materials;count_removed integer:=0;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.';end if;
 if p_confirm is distinct from true or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 or octet_length(p_rows::text)>100000 then raise exception 'Die geprüfte Artikelauswahl muss bestätigt werden.';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception 'Artikel doppelt oder ohne ID in der Auswahl.';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for r in select value from jsonb_array_elements(p_rows) order by value->>'id' loop
  select * into m from public.materials where id=(r->>'id')::uuid and business_id=p_company for update;
  if not found or m.catalog_revision is distinct from (r->>'revision')::bigint or m.active is false then raise exception 'Artikelauswahl wurde geändert. Bitte neu laden und erneut prüfen.';end if;
  if lower(btrim(m.name)) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then raise exception 'Geschützte Stundenpositionen können nicht gelöscht werden.';end if;
 end loop;
 -- Retain IDs and frozen references for historical orders/offers/invoices.
 update public.materials set active=false,catalog_deleted_at=transaction_timestamp() where business_id=p_company and id in(select (value->>'id')::uuid from jsonb_array_elements(p_rows));
 get diagnostics count_removed=row_count;
 return jsonb_build_object('company_id',p_company,'removed',count_removed,'version',925);
end;$$;
revoke all on function public.remove_catalog_articles_v925(uuid,jsonb,boolean) from public,anon;
grant execute on function public.remove_catalog_articles_v925(uuid,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',925,'catalog_groups_enabled',true) as installation;
