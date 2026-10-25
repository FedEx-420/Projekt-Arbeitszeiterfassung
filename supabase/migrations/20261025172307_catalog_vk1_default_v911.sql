-- New opt-in endpoint only: v908 clients retain their existing import semantics.
-- No stored material, work order, invoice or account is rewritten on installation.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create function public.import_material_catalog_v911(
 p_company uuid,p_supplier text,p_rows jsonb,p_confirm_net_eur boolean,p_use_vk1 boolean)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare r jsonb;item public.materials%rowtype;field text;supplier text:=btrim(p_supplier);
 result jsonb;same_values boolean;changed integer:=0;found_count integer;changed_count integer;
begin
 if not app_private.catalog_manager_v908(p_company) then
   raise exception 'Keine Berechtigung für diesen Betrieb.' using errcode='42501';
 end if;
 if p_confirm_net_eur is distinct from true or p_use_vk1 is distinct from true then
   raise exception 'EUR netto und VK * als Standardverkaufspreis müssen bestätigt werden.' using errcode='23514';
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000
   or octet_length(p_rows::text)>2097152 then
   raise exception 'Import muss 1 bis 1000 Artikel und höchstens 2 MB enthalten.' using errcode='23514';
 end if;
 -- Same company lock as v908; the nested call participates in this transaction.
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for r in select value from jsonb_array_elements(p_rows) loop
   if lower(btrim(r->>'name')) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then
     raise exception 'Geschützte Stundenpositionen bitte manuell pflegen, nicht per Katalog anlegen oder umbenennen.' using errcode='23514';
   end if;
   select * into item from public.materials where business_id=p_company
     and lower(catalog_supplier)=lower(supplier) and catalog_article_number=r->>'article_number' for update;
   if found and lower(btrim(item.name)) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then
     raise exception 'Geschützte Stundenpreise bitte manuell pflegen, nicht per Katalog überschreiben oder umbenennen.' using errcode='23514';
   end if;
   if not found then
     if not (r ? 'recommended_price_1') then
       raise exception 'Für den neuen Artikel % fehlt VK *. Bitte den Nettoverkaufspreis ergänzen.',r->>'article_number' using errcode='23514';
     end if;
   elsif r ? 'recommended_price_1' then
     same_values:=item.name=r->>'name' and item.unit=r->>'unit'
       and item.unit_price is not distinct from (r->>'recommended_price_1')::numeric;
     foreach field in array array['purchase_price','recommended_price_1','recommended_price_2'] loop
       if r ? field and (to_jsonb(item)->>field)::numeric is distinct from (r->>field)::numeric then same_values:=false;end if;
     end loop;
     if not same_values and ((r->>'expected_id') is null or item.id is distinct from (r->>'expected_id')::uuid
       or item.catalog_revision is distinct from (r->>'expected_revision')::bigint) then
       raise exception 'Katalog oder Verkaufspreis wurde inzwischen geändert. Bitte Vorschau neu erstellen.' using errcode='40001';
     end if;
   end if;
 end loop;
 -- Reuse the installed complete validation, exact identity match and RLS.
 result:=public.import_material_catalog_v908(p_company,p_supplier,p_rows,p_confirm_net_eur);
 for r in select value from jsonb_array_elements(p_rows) loop
   if not (r ? 'recommended_price_1') then continue;end if;
   select count(*) into found_count from public.materials where business_id=p_company
     and lower(catalog_supplier)=lower(supplier) and catalog_article_number=r->>'article_number';
   if found_count<>1 then raise exception 'Artikel nach Import nicht eindeutig bestätigt.' using errcode='42501';end if;
   update public.materials set unit_price=(r->>'recommended_price_1')::numeric
     where business_id=p_company and lower(catalog_supplier)=lower(supplier)
       and catalog_article_number=r->>'article_number'
       and unit_price is distinct from (r->>'recommended_price_1')::numeric;
   get diagnostics changed_count=row_count;changed:=changed+changed_count;
   if not exists(select 1 from public.materials where business_id=p_company and lower(catalog_supplier)=lower(supplier)
     and catalog_article_number=r->>'article_number' and unit_price is not distinct from (r->>'recommended_price_1')::numeric) then
     raise exception 'Standardverkaufspreis konnte nicht bestätigt werden. Gesamter Import zurückgenommen.' using errcode='42501';
   end if;
 end loop;
 return result||jsonb_build_object('catalog_import_version',911,'standard_price_source','recommended_price_1',
   'standard_prices_updated',changed,'unit_price_changed',changed>0);
end;
$function$;
revoke all on function public.import_material_catalog_v911(uuid,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.import_material_catalog_v911(uuid,text,jsonb,boolean,boolean) to authenticated;
comment on function public.import_material_catalog_v911(uuid,text,jsonb,boolean,boolean)
 is 'Explicit reviewed catalog import: EK, VK *, VK ** retained; supplied VK * becomes standard EUR-net selling price in the same transaction. No historical snapshots rewritten.';
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',911,'catalog_import_ready',true,'existing_records_changed',0,
 'vk1_standard_price_supported',true,'protected_hourly_names_guarded',true,'security_invoker_preserved',not prosecdef) as installation
 from pg_proc where oid='public.import_material_catalog_v911(uuid,text,jsonb,boolean,boolean)'::regprocedure;
