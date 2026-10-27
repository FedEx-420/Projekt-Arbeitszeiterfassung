-- Supplier variants share a logical product card. Existing rows/history stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.materials add column catalog_gtin text,add column catalog_raw_gtin text,
 add column catalog_product_name text,add column catalog_product_id uuid references public.materials(id) on delete set null;
create index materials_gtin_v921 on public.materials(business_id,catalog_gtin,unit) where catalog_gtin is not null;
create index materials_product_v921 on public.materials(catalog_product_id) where catalog_product_id is not null;
create function app_private.catalog_gtin_v921(raw text) returns text language plpgsql immutable security invoker set search_path='' as $$
declare value text:=btrim(raw);i integer;total integer:=0;
begin
 if value is null or length(value) not in (8,12,13,14) or value!~'^[0-9]+$' or value~'^0+$' then return null;end if;
 for i in 1..length(value)-1 loop total:=total+substring(value from length(value)-i for 1)::integer*case when mod(i,2)=1 then 3 else 1 end;end loop;
 if mod(total+right(value,1)::integer,10)<>0 then return null;end if;
 return lpad(value,14,'0');
end;$$;
revoke all on function app_private.catalog_gtin_v921(text) from public,anon;
grant execute on function app_private.catalog_gtin_v921(text) to authenticated;
alter table public.materials add constraint materials_gtin_v921 check(catalog_gtin is null or (app_private.catalog_gtin_v921(catalog_gtin) is not null and catalog_gtin=app_private.catalog_gtin_v921(catalog_gtin))),
 add constraint materials_product_name_v921 check(catalog_product_name is null or length(btrim(catalog_product_name)) between 1 and 200),
 add constraint materials_raw_gtin_v921 check(catalog_raw_gtin is null or length(catalog_raw_gtin)<=32);
create function app_private.catalog_identity_guard_v921() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and (new.catalog_gtin is not null or new.catalog_raw_gtin is not null or new.catalog_product_name is not null or new.catalog_product_id is not null))
 or (tg_op='UPDATE' and (new.catalog_gtin is distinct from old.catalog_gtin or new.catalog_raw_gtin is distinct from old.catalog_raw_gtin
 or new.catalog_product_name is distinct from old.catalog_product_name or new.catalog_product_id is distinct from old.catalog_product_id)) then
  if auth.uid() is not null and not app_private.catalog_manager_v908(new.business_id) then raise exception 'Nur die Geschäftsführung darf Artikelzuordnungen ändern.';end if;
  if new.catalog_product_id is not null and not exists(select 1 from public.materials m where m.id=new.catalog_product_id and m.business_id=new.business_id and coalesce(m.unit,'Stk')=coalesce(new.unit,'Stk')) then raise exception 'Zielartikel gehört nicht zur selben Firma und Einheit.';end if;
 end if;
 return new;
end;$$;
revoke all on function app_private.catalog_identity_guard_v921() from public,anon,authenticated;
create trigger catalog_identity_guard_v921 before insert or update on public.materials for each row execute function app_private.catalog_identity_guard_v921();
create function app_private.catalog_members_v921(p_material uuid) returns setof uuid language sql stable security invoker set search_path='' as $$
 with recursive base as (select id,business_id,unit from public.materials where id=p_material), linked(id,gtin,parent) as (
  select m.id,m.catalog_gtin,m.catalog_product_id from public.materials m join base b on b.id=m.id
  union
  select m.id,m.catalog_gtin,m.catalog_product_id from public.materials m join base b on m.business_id=b.business_id and coalesce(m.unit,'Stk')=coalesce(b.unit,'Stk')
  join linked l on m.id=l.parent or m.catalog_product_id=l.id or (l.gtin is not null and m.catalog_gtin=l.gtin)
 ) select id from linked;
$$;
revoke all on function app_private.catalog_members_v921(uuid) from public,anon;
grant execute on function app_private.catalog_members_v921(uuid) to authenticated;
create function public.link_catalog_product_v921(p_company uuid,p_material uuid,p_target uuid,p_revision bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.materials;target public.materials;members uuid[];root uuid;bad integer;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für Artikelzuordnungen.';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 select * into item from public.materials where id=p_material and business_id=p_company for update;
 if not found or item.catalog_revision is distinct from p_revision then raise exception 'Artikel wurde inzwischen geändert. Bitte neu laden.';end if;
 select * into target from public.materials where id=p_target and business_id=p_company for update;
 if not found or coalesce(item.unit,'Stk') is distinct from coalesce(target.unit,'Stk') then raise exception 'Artikel müssen dieselbe Firma und Einheit haben.';end if;
 select array_agg(id),min(id::text)::uuid,count(distinct catalog_gtin) into members,root,bad from public.materials
 where id in(select app_private.catalog_members_v921(p_material) union select app_private.catalog_members_v921(p_target));
 if bad>1 then raise exception 'Die Artikelgruppen haben unterschiedliche gültige GTIN. Verpackung und Ausführung zuerst prüfen.';end if;
 if exists(select 1 from public.materials where id=any(members) and lower(btrim(name)) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde')) then raise exception 'Geschützte Stundenpositionen nicht mit Materialien zusammenfassen.';end if;
 update public.materials set catalog_product_id=case when id=root then null else root end where id=any(members);
 return jsonb_build_object('company_id',p_company,'linked',cardinality(members),'product_id',root);
end;$$;
revoke all on function public.link_catalog_product_v921(uuid,uuid,uuid,bigint) from public,anon;
grant execute on function public.link_catalog_product_v921(uuid,uuid,uuid,bigint) to authenticated;
create function public.import_material_catalog_v921(p_company uuid,p_supplier text,p_rows jsonb,p_confirm_net_eur boolean,p_use_vk1 boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row_data jsonb;clean_rows jsonb:='[]';clean_row jsonb;item public.materials;product_name text;raw_gtin text;identity text;label text;result jsonb;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>2097152 then raise exception 'Ungültiger Katalogausschnitt.';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for row_data in select value from jsonb_array_elements(p_rows) loop
  if row_data ? 'gtin' and jsonb_typeof(row_data->'gtin') not in ('string','null') then raise exception 'GTIN muss als Text angegeben werden.';end if;
  product_name:=btrim(row_data->>'name');raw_gtin:=nullif(btrim(row_data->>'gtin'),'');
  if lower(product_name) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then raise exception 'Geschützte Stundenpositionen nicht per Katalog importieren.';end if;
  if product_name is null or length(product_name) not between 1 and 200 or product_name~'[[:cntrl:]]' or product_name~'^[=+@]' or length(coalesce(raw_gtin,''))>32 then raise exception 'Artikelname oder GTIN ist zu lang.';end if;
  select * into item from public.materials where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=row_data->>'article_number';
  identity:=left(md5(lower(btrim(p_supplier))||':'||(row_data->>'article_number')),12);
  -- Stable internal label avoids legacy unique-name collisions; customer-facing
  -- product name and exact supplier identity remain separate columns.
  label:=left(product_name,180)||' ['||identity||']';
  clean_row:=(row_data-'gtin')||jsonb_build_object('name',case when item.id is not null and item.name=product_name then product_name else label end);
  clean_rows:=clean_rows||jsonb_build_array(clean_row);
 end loop;
 result:=public.import_material_catalog_v911(p_company,p_supplier,clean_rows,p_confirm_net_eur,p_use_vk1);
 for row_data in select value from jsonb_array_elements(p_rows) loop
  update public.materials set catalog_product_name=btrim(row_data->>'name'),catalog_raw_gtin=coalesce(nullif(btrim(row_data->>'gtin'),''),catalog_raw_gtin),catalog_gtin=coalesce(app_private.catalog_gtin_v921(row_data->>'gtin'),catalog_gtin)
  where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=row_data->>'article_number'
   and (catalog_product_name is distinct from btrim(row_data->>'name') or catalog_raw_gtin is distinct from coalesce(nullif(btrim(row_data->>'gtin'),''),catalog_raw_gtin) or catalog_gtin is distinct from coalesce(app_private.catalog_gtin_v921(row_data->>'gtin'),catalog_gtin));
 end loop;
 return result||jsonb_build_object('supplier_variants_version',921);
end;$$;
revoke all on function public.import_material_catalog_v921(uuid,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.import_material_catalog_v921(uuid,text,jsonb,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',921,'supplier_variants_enabled',to_regprocedure('public.import_material_catalog_v921(uuid,text,jsonb,boolean,boolean)') is not null) as installation;
