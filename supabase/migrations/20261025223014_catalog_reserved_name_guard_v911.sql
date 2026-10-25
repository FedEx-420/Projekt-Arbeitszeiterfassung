-- Targeted forward repair for the original v911 catalog RPC only.
-- No account/material/order rows, grants, owners or migration-history rows change.
-- Unknown definitions/security configuration fail closed; an already guarded RPC is a no-op.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

do $repair$
declare
 target_oid oid:=pg_catalog.to_regprocedure('public.import_material_catalog_v911(uuid,text,jsonb,boolean,boolean)');
 before_record pg_catalog.pg_proc%rowtype;
 after_record pg_catalog.pg_proc%rowtype;
 current_md5 text;
 definition text;
 old_md5 constant text:='2973bf0c2a8e53590bea422192dc6da6';
 final_md5 constant text:='4666a76bf00d59cb1d86ce2c1fd043a0';
 reviewed_body text:=$reviewed_body$
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
$reviewed_body$;
begin
 if target_oid is null then
   raise exception 'v911-Katalogfunktion fehlt. Diese Reparatur installiert keine neue Grundversion.' using errcode='55000';
 end if;
 select * into strict before_record from pg_catalog.pg_proc where oid=target_oid;
 if before_record.prosecdef or before_record.proconfig is distinct from array['search_path=""']::text[]
   or before_record.prokind<>'f' or before_record.prorettype<>'jsonb'::pg_catalog.regtype
   or before_record.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql') then
   raise exception 'Unerwartete Sicherheitskonfiguration der v911-Katalogfunktion. Keine Änderung vorgenommen.' using errcode='55000';
 end if;
 reviewed_body:=pg_catalog.replace(reviewed_body,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10));
 if pg_catalog.md5(reviewed_body)<>final_md5 then
   raise exception 'Die Reparaturdatei weicht von der geprüften Zieldefinition ab.' using errcode='55000';
 end if;
 current_md5:=pg_catalog.md5(pg_catalog.replace(before_record.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)));
 if current_md5 not in (old_md5,final_md5) then
   raise exception 'Unbekannte v911-Katalogdefinition. Keine Änderung vorgenommen; bitte zuerst prüfen.' using errcode='55000';
 end if;
 if current_md5=old_md5 then
   -- pg_get_functiondef retains the installed owner/ACL and all declared options.
   -- Only the exact previously checked source body is substituted.
   definition:=pg_catalog.pg_get_functiondef(target_oid);
   if pg_catalog.strpos(definition,before_record.prosrc)=0 then
     raise exception 'Die vorhandene Funktionsdefinition konnte nicht eindeutig gelesen werden.' using errcode='55000';
   end if;
   execute pg_catalog.replace(definition,before_record.prosrc,reviewed_body);
 end if;
 select * into strict after_record from pg_catalog.pg_proc where oid=target_oid;
 if pg_catalog.md5(pg_catalog.replace(after_record.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)))<>final_md5
   or (pg_catalog.to_jsonb(after_record)-'prosrc') is distinct from (pg_catalog.to_jsonb(before_record)-'prosrc') then
   raise exception 'Zieldefinition oder Funktionsmetadaten weichen ab. Reparatur vollständig zurückgenommen.' using errcode='55000';
 end if;
end;
$repair$;
notify pgrst,'reload schema';
commit;

-- Independent metadata read AFTER COMMIT: this checks the actually stored body.
with installed as (
 select p.oid,p.prosecdef,p.proconfig,
   pg_catalog.md5(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10))) as source_md5
 from pg_catalog.pg_proc p
 where p.oid=pg_catalog.to_regprocedure('public.import_material_catalog_v911(uuid,text,jsonb,boolean,boolean)')
)
select pg_catalog.jsonb_build_object(
 'version',911,
 'catalog_import_ready',exists(select 1 from installed where not prosecdef and proconfig=array['search_path=""']::text[]
   and source_md5='4666a76bf00d59cb1d86ce2c1fd043a0'),
 'protected_hourly_names_guarded',exists(select 1 from installed where source_md5='4666a76bf00d59cb1d86ce2c1fd043a0'),
 'security_invoker_preserved',exists(select 1 from installed where not prosecdef and proconfig=array['search_path=""']::text[]),
 'source_md5',(select source_md5 from installed)
) as installation;
