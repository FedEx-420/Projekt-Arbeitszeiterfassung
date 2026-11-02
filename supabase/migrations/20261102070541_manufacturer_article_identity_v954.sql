-- Explicit manufacturer identity; never derive a manufacturer number from a wholesaler SKU.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
alter table public.materials add column catalog_manufacturer_number text,
 add column catalog_manufacturer_number_source text;
alter table public.materials add constraint materials_mpn_v954 check(
 (catalog_manufacturer_number is null and catalog_manufacturer_number_source is null) or
 (catalog_manufacturer_number is not null and catalog_manufacturer_number_source is not null and length(btrim(catalog_manufacturer_number)) between 1 and 120 and catalog_manufacturer_number!~'[[:cntrl:]]'
 and catalog_manufacturer_number_source in ('catalog','manual','merchant')));
create function app_private.catalog_mpn_key_v954(brand text,mpn text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when btrim(mpn)<>'' and length(btrim(mpn))<=120 and mpn!~'[[:cntrl:]]' and brand~'[[:alpha:]]'
 and lower(regexp_replace(btrim(brand),'[[:space:]-]+','','g')) not in ('unbekannt','unknown','keinhersteller','na','n/a')
 then case lower(regexp_replace(btrim(brand),'[[:space:]-]+','','g')) when 'doepke' then 'döpke' else lower(regexp_replace(btrim(brand),'[[:space:]-]+','','g')) end||chr(31)||upper(btrim(mpn)) end;
$$;
create index materials_mpn_v954 on public.materials(business_id,unit,(app_private.catalog_mpn_key_v954(catalog_manufacturer,catalog_manufacturer_number)))
 where active and catalog_manufacturer_number is not null;
create function app_private.catalog_mpn_guard_v954() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.catalog_manufacturer_number is not null) or
 (tg_op='UPDATE' and (new.catalog_manufacturer_number is distinct from old.catalog_manufacturer_number or new.catalog_manufacturer_number_source is distinct from old.catalog_manufacturer_number_source)) then
  if auth.uid() is not null and not app_private.catalog_manager_v908(new.business_id) then raise exception 'Keine Berechtigung für Hersteller-Artikelnummern.' using errcode='42501';end if;
 end if;return new;
end;$$;
create trigger catalog_mpn_guard_v954 before insert or update on public.materials for each row execute function app_private.catalog_mpn_guard_v954();
create function app_private.catalog_auto_mpn_v954(m public.materials) returns text language sql stable security invoker set search_path='' as $$
 select case when m.active and coalesce(m.unit,'Stk') not in ('H','Pau') and coalesce(m.catalog_manufacturer_source,'catalog') in ('catalog','manual')
 and m.catalog_manufacturer_number_source in ('catalog','manual','merchant') and m.catalog_product_id is null
 and not exists(select 1 from public.materials child where child.catalog_product_id=m.id)
 then app_private.catalog_mpn_key_v954(m.catalog_manufacturer,m.catalog_manufacturer_number) end;
$$;
create function app_private.catalog_mpn_safe_v954(company uuid,unit_name text,identity_key text) returns boolean language sql stable security invoker set search_path='' as $$
 with candidates as (
 select m.catalog_gtin,m.catalog_features from public.materials m where m.business_id=company and coalesce(m.unit,'Stk')=unit_name
 and m.active and app_private.catalog_mpn_key_v954(m.catalog_manufacturer,m.catalog_manufacturer_number)=identity_key
 and app_private.catalog_auto_mpn_v954(m)=identity_key
 ), features as (
 select f.key,f.value from candidates c cross join lateral jsonb_each(c.catalog_features) f
 where f.key in ('color','finish','rated_a','residual_ma','curve','voltage_v','poles','cross_mm2','length_m','frames','mounting')
 ) select (select count(distinct catalog_gtin) from candidates)<=1
 and not exists(select 1 from features where value->>'conflict'='true')
 and not exists(select 1 from features where coalesce(value->>'value','')<>'' group by key having count(distinct value->>'value')>1);
$$;
create or replace function app_private.catalog_members_v921(p_material uuid) returns setof uuid language sql stable security invoker set search_path='' as $$
 with recursive base as (select id,business_id,coalesce(unit,'Stk') as unit from public.materials where id=p_material), linked(id,gtin,parent,mpn) as (
  select m.id,m.catalog_gtin,m.catalog_product_id,app_private.catalog_auto_mpn_v954(m) from public.materials m join base b on b.id=m.id
  union
  select m.id,m.catalog_gtin,m.catalog_product_id,app_private.catalog_auto_mpn_v954(m) from public.materials m join base b on m.business_id=b.business_id and coalesce(m.unit,'Stk')=b.unit
  join linked l on m.id=l.parent or m.catalog_product_id=l.id or (l.gtin is not null and m.catalog_gtin=l.gtin)
  or (l.mpn is not null and app_private.catalog_mpn_key_v954(m.catalog_manufacturer,m.catalog_manufacturer_number)=l.mpn
   and app_private.catalog_auto_mpn_v954(m)=l.mpn and app_private.catalog_mpn_safe_v954(b.business_id,b.unit,l.mpn))
 ) select id from linked;
$$;
create function public.import_material_catalog_v954(p_company uuid,p_supplier text,p_rows jsonb,p_confirm_net_eur boolean,p_use_vk1 boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;clean_rows jsonb;result jsonb;prior jsonb:='{}';item public.materials;number_value text;source_value text;changed integer:=0;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>2097152 then raise exception 'Ungültiger Katalogausschnitt.';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r ? 'manufacturer_number' and jsonb_typeof(r->'manufacturer_number') not in ('string','null')) or
   (r ? 'manufacturer_number_source' and coalesce(r->>'manufacturer_number_source','') not in ('catalog','manual','merchant')) then raise exception 'Ungültige Hersteller-Artikelnummer.';end if;
  number_value:=nullif(btrim(r->>'manufacturer_number'),'');
  if number_value is not null and (length(number_value)>120 or number_value~'[[:cntrl:]]') then raise exception 'Ungültige Hersteller-Artikelnummer.';end if;
  select * into item from public.materials where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=r->>'article_number';
  if found then prior:=prior||jsonb_build_object(item.id::text,item.catalog_revision);end if;
 end loop;
 select jsonb_agg(value-array['manufacturer_number','manufacturer_number_source']) into clean_rows from jsonb_array_elements(p_rows);
 result:=public.import_material_catalog_v928(p_company,p_supplier,clean_rows,p_confirm_net_eur,p_use_vk1);
 for r in select value from jsonb_array_elements(p_rows) loop
  number_value:=nullif(btrim(r->>'manufacturer_number'),'');if number_value is null then continue;end if;
  source_value:=coalesce(r->>'manufacturer_number_source','catalog');
  select * into item from public.materials where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=r->>'article_number' for update;
  if item.catalog_manufacturer_number_source='manual' and source_value<>'manual' then continue;end if;
  if item.catalog_manufacturer_number is distinct from number_value or item.catalog_manufacturer_number_source is distinct from source_value then
   if prior ? item.id::text and item.catalog_revision=(prior->>item.id::text)::bigint then
    result:=result||jsonb_build_object('updated',(result->>'updated')::integer+1,'unchanged',(result->>'unchanged')::integer-1);
   end if;
   update public.materials set catalog_manufacturer_number=number_value,catalog_manufacturer_number_source=source_value where id=item.id and business_id=p_company;
   changed:=changed+1;
  end if;
 end loop;return result||jsonb_build_object('manufacturer_identity_version',954,'manufacturer_numbers_updated',changed);
end;$$;
revoke all on function app_private.catalog_mpn_key_v954(text,text),app_private.catalog_auto_mpn_v954(public.materials),app_private.catalog_mpn_safe_v954(uuid,text,text) from public,anon;
grant execute on function app_private.catalog_mpn_key_v954(text,text),app_private.catalog_auto_mpn_v954(public.materials),app_private.catalog_mpn_safe_v954(uuid,text,text) to authenticated;
revoke all on function app_private.catalog_mpn_guard_v954() from public,anon,authenticated;
revoke all on function public.import_material_catalog_v954(uuid,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.import_material_catalog_v954(uuid,text,jsonb,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
