-- Requires v925 classification. Structured features and real image references.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin if to_regprocedure('public.import_material_catalog_v925(uuid,text,jsonb,boolean,boolean)') is null then raise exception 'Bitte zuerst die Hersteller-/Kategorien-Erweiterung v925 aus Datei 05 installieren.';end if;end;$$;
alter table public.materials add column catalog_features jsonb not null default '{}'::jsonb,add column catalog_image_url text;
create function app_private.product_features_valid_v928(features jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare entry record;
begin
 if jsonb_typeof(features) is distinct from 'object' or octet_length(features::text)>50000 then return false;end if;
 for entry in select key,value from jsonb_each(features) loop
  if entry.key not in ('fuse_size','fuse_class','protection','curve','rated_a','residual_ma','rcd_type','poles','breaking_ka','spd_type','voltage_v','switch_kind','series','color','finish','touch','mounting','frames','cable_type','cores','cross_mm2','tool_kind','drive','socket','power_w','kelvin','ip','dimmable','network_cat','length_m')
   or jsonb_typeof(entry.value) is distinct from 'object' or not(entry.value ?& array['value','source'])
   or exists(select 1 from jsonb_object_keys(entry.value) k where k not in ('value','source','conflict')) or (entry.value ? 'conflict' and jsonb_typeof(entry.value->'conflict') is distinct from 'boolean')
   or jsonb_typeof(entry.value->'value') is distinct from 'string' or length(entry.value->>'value') not between 1 and 160 or (entry.value->>'value')~'[[:cntrl:]]'
   or coalesce(entry.value->>'source','') not in ('catalog','manual','description') then return false;end if;
 end loop;return true;
end;$$;
revoke all on function app_private.product_features_valid_v928(jsonb) from public,anon;
grant execute on function app_private.product_features_valid_v928(jsonb) to authenticated;
alter table public.materials add constraint materials_features_v928 check(app_private.product_features_valid_v928(catalog_features)),
 add constraint materials_image_v928 check(catalog_image_url is null or (length(catalog_image_url)<=2000 and catalog_image_url~'^https://' and catalog_image_url!~'[[:cntrl:]]'));
create function app_private.product_features_guard_v928() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and (new.catalog_features<>'{}'::jsonb or new.catalog_image_url is not null))
 or (tg_op='UPDATE' and (new.catalog_features is distinct from old.catalog_features or new.catalog_image_url is distinct from old.catalog_image_url)) then
  if auth.uid() is not null and not app_private.catalog_manager_v908(new.business_id) then raise exception 'Nur die Geschäftsführung darf technische Artikelangaben ändern.';end if;
 end if;return new;
end;$$;
revoke all on function app_private.product_features_guard_v928() from public,anon,authenticated;
create trigger product_features_guard_v928 before insert or update on public.materials for each row execute function app_private.product_features_guard_v928();
create function public.import_material_catalog_v928(p_company uuid,p_supplier text,p_rows jsonb,p_confirm_net_eur boolean,p_use_vk1 boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;clean_rows jsonb;result jsonb;item public.materials;features jsonb;old_entry record;image text;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>2097152 then raise exception 'Ungültiger Katalogausschnitt.';end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for r in select value from jsonb_array_elements(p_rows) loop
  if not app_private.product_features_valid_v928(coalesce(r->'features','{}'::jsonb)) or (r ? 'image_url' and jsonb_typeof(r->'image_url') not in ('string','null')) then raise exception 'Technische Merkmale oder Bildlink sind ungültig.';end if;
  image:=nullif(btrim(r->>'image_url'),'');if image is not null and (length(image)>2000 or image!~'^https://' or image~'[[:cntrl:]]') then raise exception 'Bildlink muss eine gültige HTTPS-Adresse sein.';end if;
 end loop;
 select jsonb_agg(value-array['features','image_url']) into clean_rows from jsonb_array_elements(p_rows);
 result:=public.import_material_catalog_v925(p_company,p_supplier,clean_rows,p_confirm_net_eur,p_use_vk1);
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into item from public.materials where business_id=p_company and lower(catalog_supplier)=lower(btrim(p_supplier)) and catalog_article_number=r->>'article_number' for update;
  features:=coalesce(r->'features','{}'::jsonb);
  for old_entry in select key,value from jsonb_each(item.catalog_features) loop
   if (old_entry.value->>'source'='manual' and coalesce(features->old_entry.key->>'source','')<>'manual')
    or (old_entry.value->>'source'='catalog' and features->old_entry.key->>'source'='description') then features:=features||jsonb_build_object(old_entry.key,old_entry.value);end if;
  end loop;
  image:=coalesce(nullif(btrim(r->>'image_url'),''),item.catalog_image_url);
  update public.materials set catalog_features=features,catalog_image_url=image where id=item.id and business_id=p_company and (catalog_features is distinct from features or catalog_image_url is distinct from image);
 end loop;
 return result||jsonb_build_object('product_features_version',928);
end;$$;
revoke all on function public.import_material_catalog_v928(uuid,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.import_material_catalog_v928(uuid,text,jsonb,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',928,'product_features_enabled',true) as installation;
