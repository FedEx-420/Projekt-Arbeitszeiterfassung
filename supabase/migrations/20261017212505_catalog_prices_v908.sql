-- Additive catalog metadata and net prices only. Existing unit_price, order
-- items, invoice snapshots, accounts and historical data are not rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

alter table public.materials
 add column purchase_price numeric(14,4),
 add column recommended_price_1 numeric(14,4),
 add column recommended_price_2 numeric(14,4),
 add column catalog_supplier text,
 add column catalog_article_number text,
 add column catalog_revision bigint not null default 1;

alter table public.materials add constraint materials_catalog_prices_v908 check (
 (purchase_price is null or purchase_price between 0 and 1000000)
 and (recommended_price_1 is null or recommended_price_1 between 0 and 1000000)
 and (recommended_price_2 is null or recommended_price_2 between 0 and 1000000)
 and catalog_revision>0
 and ((catalog_supplier is null and catalog_article_number is null)
 or (catalog_supplier is not null and catalog_article_number is not null
 and length(catalog_supplier) between 1 and 120 and catalog_supplier=btrim(catalog_supplier)
 and length(catalog_article_number) between 1 and 120 and catalog_article_number=btrim(catalog_article_number)
 and catalog_supplier !~ '[[:cntrl:]]' and catalog_article_number !~ '[[:cntrl:]]'))
);
create unique index materials_catalog_supplier_article_v908
 on public.materials(business_id,lower(catalog_supplier),catalog_article_number)
 where catalog_supplier is not null;
create index materials_catalog_name_lookup_v908 on public.materials(business_id,lower(btrim(name)));

create function app_private.catalog_manager_v908(p_company uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid())
 and (p.role='administrator' or (p.role='business' and p.id=p_company)))
 and exists(select 1 from public.profiles company where company.id=p_company and company.role='business');
$$;
revoke all on function app_private.catalog_manager_v908(uuid) from public,anon;
grant execute on function app_private.catalog_manager_v908(uuid) to authenticated;

create function app_private.catalog_guard_v908()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
 if tg_op='INSERT' then
   changed:=new.purchase_price is not null or new.recommended_price_1 is not null
     or new.recommended_price_2 is not null or new.catalog_supplier is not null or new.catalog_article_number is not null;
   new.catalog_revision:=1;
 else
   changed:=new.purchase_price is distinct from old.purchase_price or new.recommended_price_1 is distinct from old.recommended_price_1
     or new.recommended_price_2 is distinct from old.recommended_price_2 or new.catalog_supplier is distinct from old.catalog_supplier
     or new.catalog_article_number is distinct from old.catalog_article_number
     or (new.business_id is distinct from old.business_id and old.catalog_supplier is not null);
   if changed and auth.uid() is not null and not app_private.catalog_manager_v908(old.business_id) then
     raise exception 'Nur die Geschäftsführung dieses Betriebs oder der Administrator darf Katalogpreise bearbeiten.' using errcode='42501';
   end if;
   new.catalog_revision:=old.catalog_revision+1;
 end if;
 if changed and auth.uid() is not null and not app_private.catalog_manager_v908(new.business_id) then
   raise exception 'Nur die Geschäftsführung dieses Betriebs oder der Administrator darf Katalogpreise bearbeiten.' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function app_private.catalog_guard_v908() from public,anon,authenticated;
create trigger catalog_guard_v908 before insert or update on public.materials
 for each row execute function app_private.catalog_guard_v908();

-- Uses existing catalog RLS/privileges, in addition to explicit live-role checks.
-- No SECURITY DEFINER workaround, no changes to installed material policies.
create function public.save_material_prices_v908(p_id uuid,p_company uuid,p_revision bigint,p_prices jsonb,p_supplier text default null,p_article_number text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.materials%rowtype; field text; value numeric;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.' using errcode='42501'; end if;
 if jsonb_typeof(p_prices) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_prices))<>3
 or exists(select 1 from jsonb_object_keys(p_prices) k where k not in ('purchase_price','recommended_price_1','recommended_price_2')) then
   raise exception 'EK, VK * und VK ** müssen eindeutig angegeben werden.' using errcode='23514';
 end if;
 foreach field in array array['purchase_price','recommended_price_1','recommended_price_2'] loop
   if p_prices->field <> 'null'::jsonb then
     if jsonb_typeof(p_prices->field) is distinct from 'number' then raise exception 'Preise müssen Zahlen oder leer sein.' using errcode='23514'; end if;
     value:=(p_prices->>field)::numeric;
     if value<0 or value>1000000 or value<>round(value,4) then raise exception 'Preis außerhalb des zulässigen Bereichs oder mehr als vier Nachkommastellen.' using errcode='23514'; end if;
   end if;
 end loop;
 select * into item from public.materials where id=p_id and business_id=p_company for update;
 if not found then raise exception 'Material nicht gefunden.' using errcode='42501'; end if;
 if item.catalog_revision is distinct from p_revision then raise exception 'Material wurde inzwischen geändert. Bitte neu laden und deine Eingabe prüfen.' using errcode='40001'; end if;
 update public.materials set purchase_price=(p_prices->>'purchase_price')::numeric,
 recommended_price_1=(p_prices->>'recommended_price_1')::numeric,recommended_price_2=(p_prices->>'recommended_price_2')::numeric,
 catalog_supplier=nullif(btrim(p_supplier),''),catalog_article_number=nullif(btrim(p_article_number),'')
 where id=p_id and business_id=p_company returning * into item;
 return to_jsonb(item);
end; $$;
revoke all on function public.save_material_prices_v908(uuid,uuid,bigint,jsonb,text,text) from public,anon;
grant execute on function public.save_material_prices_v908(uuid,uuid,bigint,jsonb,text,text) to authenticated;

create function public.import_material_catalog_v908(p_company uuid,p_supplier text,p_rows jsonb,p_confirm_net_eur boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row_data jsonb; item public.materials%rowtype; field text; amount numeric; supplier text:=btrim(p_supplier);
 article text; label text; u text; inserted integer:=0; updated integer:=0; unchanged integer:=0; equal_values boolean;
begin
 if not app_private.catalog_manager_v908(p_company) then raise exception 'Keine Berechtigung für diesen Betrieb.' using errcode='42501'; end if;
 if p_confirm_net_eur is distinct from true then raise exception 'EUR netto und endgültige Preise müssen bestätigt werden.' using errcode='23514'; end if;
 if supplier is null or length(supplier) not between 1 and 120 or supplier ~ '[[:cntrl:]]' or supplier ~ '^[=+@]' then raise exception 'Lieferant fehlt oder ist ungültig.' using errcode='23514'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000
 or octet_length(p_rows::text)>2097152 then raise exception 'Import muss 1 bis 1000 Artikel und höchstens 2 MB enthalten.' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'article_number' having count(*)>1) then
   raise exception 'Doppelte Lieferanten-Artikelnummer in der Auswahl.' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-v908:'||p_company::text,0));
 for row_data in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(row_data) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(row_data) k where k not in ('article_number','name','unit','purchase_price','recommended_price_1','recommended_price_2','expected_id','expected_revision'))
   or not (row_data ?& array['article_number','name','unit','expected_id','expected_revision'])
   or not (row_data ?| array['purchase_price','recommended_price_1','recommended_price_2']) then
     raise exception 'Unvollständige oder unbekannte Importfelder.' using errcode='23514';
   end if;
   article:=row_data->>'article_number';label:=row_data->>'name';u:=row_data->>'unit';
   if (row_data->>'expected_id' is null) is distinct from (row_data->>'expected_revision' is null)
   or (row_data->>'expected_id' is not null and (jsonb_typeof(row_data->'expected_id') is distinct from 'string'
     or (row_data->>'expected_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or jsonb_typeof(row_data->'expected_revision') is distinct from 'number'
     or (row_data->>'expected_revision') !~ '^[1-9][0-9]{0,15}$')) then
     raise exception 'Artikelversion aus der Vorschau ist ungültig.' using errcode='23514';
   end if;
   if jsonb_typeof(row_data->'article_number') is distinct from 'string' or article<>btrim(article) or length(article) not between 1 and 120 or article ~ '[[:cntrl:]]' or article ~ '^[=+@]'
   or jsonb_typeof(row_data->'name') is distinct from 'string' or label<>btrim(label) or length(label) not between 1 and 200 or label ~ '[[:cntrl:]]' or label ~ '^[=+@]'
   or u not in ('Stk','M','H','Pau','Kg') or u is null then raise exception 'Artikelnummer, Name oder Basiseinheit ungültig.' using errcode='23514'; end if;
   foreach field in array array['purchase_price','recommended_price_1','recommended_price_2'] loop
     if row_data ? field then
       if jsonb_typeof(row_data->field) is distinct from 'number' then raise exception 'Importpreise müssen Zahlen sein. Leere Preise nicht zuordnen.' using errcode='23514'; end if;
       amount:=(row_data->>field)::numeric;
       if amount<0 or amount>1000000 or amount<>round(amount,4) then raise exception 'Importpreis ungültig.' using errcode='23514'; end if;
     end if;
   end loop;
   select * into item from public.materials where business_id=p_company and lower(catalog_supplier)=lower(supplier) and catalog_article_number=article for update;
   if found then
     if row_data->>'expected_id' is not null and item.id is distinct from (row_data->>'expected_id')::uuid then raise exception 'Artikelzuordnung hat sich geändert. Vorschau neu erstellen.' using errcode='40001'; end if;
     if item.unit is distinct from u then raise exception 'Vorhandene Basiseinheit stimmt nicht überein. Bitte nicht automatisch umrechnen.' using errcode='23514'; end if;
     equal_values:=item.name=label;
     foreach field in array array['purchase_price','recommended_price_1','recommended_price_2'] loop
       if row_data ? field and (to_jsonb(item)->>field)::numeric is distinct from (row_data->>field)::numeric then equal_values:=false; end if;
     end loop;
     if equal_values then unchanged:=unchanged+1; continue; end if;
     if row_data->>'expected_id' is null or item.catalog_revision is distinct from (row_data->>'expected_revision')::bigint then
       raise exception 'Katalog wurde inzwischen geändert. Bitte Vorschau neu erstellen.' using errcode='40001';
     end if;
     update public.materials set name=label,
       purchase_price=case when row_data ? 'purchase_price' then (row_data->>'purchase_price')::numeric else purchase_price end,
       recommended_price_1=case when row_data ? 'recommended_price_1' then (row_data->>'recommended_price_1')::numeric else recommended_price_1 end,
       recommended_price_2=case when row_data ? 'recommended_price_2' then (row_data->>'recommended_price_2')::numeric else recommended_price_2 end
     where id=item.id and business_id=p_company;
     updated:=updated+1;
   else
     if row_data->>'expected_id' is not null or row_data->>'expected_revision' is not null then raise exception 'Ein Artikel aus der Vorschau wurde entfernt. Vorschau neu erstellen.' using errcode='40001'; end if;
     if exists(select 1 from public.materials m where m.business_id=p_company and lower(btrim(m.name))=lower(label)) then
       raise exception 'Gleichnamiger Artikel existiert ohne diese Lieferanten-Artikelnummer. Zuerst manuell zuordnen.' using errcode='23514';
     end if;
     if lower(label) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then raise exception 'Geschützte Stundenpositionen bitte manuell pflegen.' using errcode='23514'; end if;
     insert into public.materials(business_id,name,unit,unit_price,active,catalog_supplier,catalog_article_number,purchase_price,recommended_price_1,recommended_price_2)
     values(p_company,label,u,0,true,supplier,article,(row_data->>'purchase_price')::numeric,(row_data->>'recommended_price_1')::numeric,(row_data->>'recommended_price_2')::numeric);
     inserted:=inserted+1;
   end if;
 end loop;
 return jsonb_build_object('created',inserted,'updated',updated,'unchanged',unchanged,'company_id',p_company,'unit_price_changed',false);
end; $$;
revoke all on function public.import_material_catalog_v908(uuid,text,jsonb,boolean) from public,anon;
grant execute on function public.import_material_catalog_v908(uuid,text,jsonb,boolean) to authenticated;
comment on column public.materials.purchase_price is 'EUR netto je Basiseinheit; NULL = nicht hinterlegt, 0 = ausdrücklich kostenlos. Keine automatische Änderung historischer Preise.';
comment on column public.materials.recommended_price_1 is 'Empfohlener Verkaufspreis *: EUR netto je Basiseinheit, nullable. Kein automatischer Ersatz von unit_price.';
comment on column public.materials.recommended_price_2 is 'Empfohlener Verkaufspreis **: EUR netto je Basiseinheit, nullable. Kein automatischer Ersatz von unit_price.';
notify pgrst,'reload schema';
commit;
