-- Activate the previously prepared v918/v919/v922/v934 features as one transaction.
-- Installs functions only. Existing work orders, invoices, times and prices are unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

-- Source: 20261027044506_single_worker_order_overlaps_v918.sql
-- Only the cross-order time collision gate changes. No records or privileges change.



do $migration$
declare target regprocedure:='public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure;
 definition text;prior record;after_change record;
 old_block text:=$old$    if exists(select 1 from public.time_entries t where t.employee_id=employee.id and t.work_date=work_day
      and t.team_work_order_id is distinct from order_id and t.work_order_id is distinct from order_id
      and t.start_time<end_at and begin_at<t.end_time
      -- An exact existing manual record is linked below, not booked twice.
      and not (t.work_order_id is null and t.team_work_order_id is null and t.customer_id=customer.id and t.start_time=begin_at and t.end_time=end_at and t.pause_hours=pause)) then
      raise exception 'Für einen Mitarbeiter ist in diesem Zeitraum bereits andere Arbeitszeit erfasst.';
    end if;
$old$;
 new_block text:=$new$    if (select count(distinct value->>'employee_id') from jsonb_array_elements(p_periods))>1 and exists(select 1 from public.time_entries t where t.employee_id=employee.id and t.work_date=work_day
      and t.team_work_order_id is distinct from order_id and t.work_order_id is distinct from order_id
      and t.start_time<end_at and begin_at<t.end_time
      -- An exact existing manual record is linked below, not booked twice.
      and not (t.work_order_id is null and t.team_work_order_id is null and t.customer_id=customer.id and t.start_time=begin_at and t.end_time=end_at and t.pause_hours=pause)) then
      raise exception 'Für einen Mitarbeiter ist in diesem Zeitraum bereits andere Arbeitszeit erfasst.';
    end if;
$new$;
begin
 select proowner,proacl,prosecdef,proconfig into prior from pg_proc where oid=target;
 if not prior.prosecdef or not ('search_path=pg_catalog, public, pg_temp'=any(prior.proconfig)) then
  raise exception 'Unbekannte Sicherheitskonfiguration. Änderung nicht angewendet.';
 end if;
 old_block:=replace(old_block,E'\r\n',E'\n');new_block:=replace(new_block,E'\r\n',E'\n');
 definition:=replace(pg_get_functiondef(target),E'\r\n',E'\n');
 if position(new_block in definition)>0 then return;end if;
 if (length(definition)-length(replace(definition,old_block,'')))/length(old_block)<>1
 or position('perform app_private.team_check_day(employee.id,work_day)' in definition)=0
 or position('app_private.team_order_access(order_id)' in definition)=0
 or position('Ein abgerechneter Arbeitsschein kann nicht verändert werden.' in definition)=0 then
  raise exception 'Unbekannte Arbeitsschein-Funktion. Änderung nicht angewendet.';
 end if;
 execute replace(definition,old_block,new_block);
 select proowner,proacl,prosecdef,proconfig into after_change from pg_proc where oid=target;
 if prior is distinct from after_change then raise exception 'Sicherheitsmetadaten wurden verändert. Änderung zurückgenommen.';end if;
end;
$migration$;

-- Source: 20261027044754_invoice_material_prices_v919.sql
-- Additive invoice pricing endpoints. Existing v908 callers remain unchanged.



create function public.prepare_invoice_batch_v919(p_company uuid,p_order_ids jsonb,p_prices jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare prepared jsonb;src jsonb;o jsonb;wrapped jsonb;line jsonb;m jsonb;changed_items jsonb;order_items jsonb;
 orders jsonb:='[]';items jsonb:='[]';days jsonb:='[]';day jsonb;keys text[]:='{}';key text;
 price numeric;standard_price numeric;purchase numeric;labor boolean;idx integer:=0;total numeric:=0;
begin
 prepared:=public.prepare_invoice_batch_v908(p_company,p_order_ids);
 if jsonb_typeof(p_prices) is distinct from 'object' or octet_length(p_prices::text)>500000 then raise exception 'Ungültige Rechnungspreise.';end if;
 for src in select value from jsonb_array_elements(prepared->'source_snapshot'->'orders') loop
  order_items:='[]';changed_items:='[]';
  for wrapped in select value from jsonb_array_elements(src->'items') loop
   line:=wrapped->'resolved';m:=wrapped->'material';
   key:=(src->'order'->>'id')||':'||coalesce(wrapped->'item'->>'id','derived:'||(line->>'employee_id'));
   if key is null or key=any(keys) then raise exception 'Rechnungsposition nicht eindeutig. Bitte Vorschau neu erstellen.';end if;
   keys:=array_append(keys,key);
   labor:=lower(btrim(line->>'name')) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') or coalesce((wrapped->>'derived_from_work_time')::boolean,false);
   price:=(line->>'price')::numeric;
   if not labor and m->>'recommended_price_1' is not null then price:=(m->>'recommended_price_1')::numeric;end if;
   standard_price:=price;
   if p_prices ? key then
    if labor or jsonb_typeof(p_prices->key) is distinct from 'number' then raise exception 'Nur Materialpreise können hier angepasst werden.';end if;
    price:=(p_prices->>key)::numeric;
   end if;
   if price is null or price<0 or price>1000000 or price::text in ('NaN','Infinity','-Infinity') or price<>round(price,4) then raise exception 'Nettoverkaufspreis muss zwischen 0 und 1000000 Euro liegen, mit höchstens vier Nachkommastellen.';end if;
   line:=line||jsonb_build_object('price',price,'pricing_key',key,'price_editable',not labor);
   if not labor then line:=line||jsonb_build_object('purchase_price',m->'purchase_price','standard_net_price',standard_price);end if;
   items:=items||jsonb_build_array(line);order_items:=order_items||jsonb_build_array(line);
   changed_items:=changed_items||jsonb_build_array(wrapped||jsonb_build_object('resolved',line));
   total:=total+(line->>'quantity')::numeric*price;
  end loop;
  orders:=orders||jsonb_build_array(src||jsonb_build_object('items',changed_items));
  day:=(prepared->'document'->'days'->idx)||jsonb_build_object('items',order_items);days:=days||jsonb_build_array(day);idx:=idx+1;
 end loop;
 if exists(select 1 from jsonb_object_keys(p_prices) k where not k=any(keys)) then raise exception 'Unbekannte Rechnungsposition in der Preisauswahl.';end if;
 prepared:=jsonb_set(prepared,'{document}',(prepared->'document')||jsonb_build_object('invoice_pricing_version',919,'items',items,'days',days,'total',total));
 prepared:=jsonb_set(prepared,'{source_snapshot}',(prepared->'source_snapshot')||jsonb_build_object('orders',orders,'invoice_price_overrides_v919',p_prices));
 return prepared;
end;
$function$;
revoke all on function public.prepare_invoice_batch_v919(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.prepare_invoice_batch_v919(uuid,jsonb,jsonb) to authenticated;
-- Copy the installed, guarded invoice finalization algorithm and only change
-- the preparation call and idempotency price check. Retain old client behavior.
do $migration$
declare target regprocedure:='public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb)'::regprocedure;
 definition text;body text;needle text;replacement text;
begin
 if exists(select 1 from pg_proc where oid=target and prosecdef) then raise exception 'Unerwartete Rechnungsrechte. Installation abgebrochen.';end if;
 definition:=replace(pg_get_functiondef(target),E'\r\n',E'\n');
 body:=(select prosrc from pg_proc where oid=target);body:=replace(body,E'\r\n',E'\n');
 needle:='prepared:=public.prepare_invoice_batch_v908(p_company,(select jsonb_agg(e->>''id'') from jsonb_array_elements(p_selection)e));';
 replacement:='prepared:=public.prepare_invoice_batch_v919(p_company,(select jsonb_agg(e->>''id'') from jsonb_array_elements(p_selection)e),p_prices);';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 or position('perform app_private.invoice_tax_checked_v908' in body)=0
 or position('if not app_private.invoice_manager_v908(p_company)' in body)=0 then raise exception 'Unbekannter Rechnungsabschluss. Installation abgebrochen.';end if;
 body:=replace(body,needle,replacement);
 needle:=' if found then';
 replacement:=$retry$ if found then
   if existing.source_snapshot->'invoice_price_overrides_v919' is distinct from p_prices then raise exception 'Diese Abschlusskennung wurde bereits mit anderen Materialpreisen verwendet.';end if;$retry$;
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unbekannte Wiederholungsprüfung im Rechnungsabschluss.';end if;
 body:=replace(body,needle,replacement);
 execute 'create function public.issue_invoice_batch_v919(p_id uuid,p_company uuid,p_number text,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb default null,p_prices jsonb default ''{}''::jsonb) returns public.invoice_batches_v908 language plpgsql security invoker set search_path='''' as '||quote_literal(body);
end;
$migration$;
revoke all on function public.issue_invoice_batch_v919(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.issue_invoice_batch_v919(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- Source: 20261027060443_invoice_supplier_selection_v922.sql
-- Requires v919 invoice pricing and v921 catalog product grouping.



create function public.prepare_invoice_batch_v922(p_company uuid,p_order_ids jsonb,p_prices jsonb default '{}'::jsonb,p_sources jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare prepared jsonb;src jsonb;o jsonb;wrapped jsonb;line jsonb;m jsonb;changed_items jsonb;order_items jsonb;
 orders jsonb:='[]';items jsonb:='[]';days jsonb:='[]';day jsonb;keys text[]:='{}';key text;
 sources jsonb;chosen jsonb;choices jsonb:='[]';selection jsonb:='[]';selection_entry jsonb;material_id uuid;
 price numeric;standard_price numeric;purchase numeric;labor boolean;idx integer:=0;total numeric:=0;
begin
 prepared:=public.prepare_invoice_batch_v908(p_company,p_order_ids);
 if jsonb_typeof(p_prices) is distinct from 'object' or octet_length(p_prices::text)>500000 then raise exception 'Ungültige Rechnungspreise.';end if;
 if jsonb_typeof(p_sources) is distinct from 'object' or octet_length(p_sources::text)>500000 then raise exception 'Ungültige Händlerauswahl.';end if;
 for src in select value from jsonb_array_elements(prepared->'source_snapshot'->'orders') loop
  order_items:='[]';changed_items:='[]';choices:='[]';
  for wrapped in select value from jsonb_array_elements(src->'items') loop
   line:=wrapped->'resolved';m:=wrapped->'material';
   key:=(src->'order'->>'id')||':'||coalesce(wrapped->'item'->>'id','derived:'||(line->>'employee_id'));
   if key is null or key=any(keys) then raise exception 'Rechnungsposition nicht eindeutig. Bitte Vorschau neu erstellen.';end if;
   keys:=array_append(keys,key);
   labor:=lower(btrim(line->>'name')) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') or coalesce((wrapped->>'derived_from_work_time')::boolean,false);
   sources:='[]';chosen:=null;
   if not labor and m->>'id' is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id',mat.id,'supplier',mat.catalog_supplier,'article_number',mat.catalog_article_number,
     'name',coalesce(mat.catalog_product_name,mat.name),'unit',mat.unit,'purchase_price',mat.purchase_price,
     'recommended_price_1',mat.recommended_price_1,'recommended_price_2',mat.recommended_price_2,'unit_price',mat.unit_price,
     'revision',mat.catalog_revision) order by mat.catalog_supplier,mat.id),'[]') into sources
    from public.materials mat where mat.business_id=p_company and mat.active=true and coalesce(mat.unit,'Stk')=coalesce(m->>'unit','Stk')
     and mat.id in(select app_private.catalog_members_v921((m->>'id')::uuid));
   end if;
   if p_sources ? key then
    if labor or jsonb_typeof(p_sources->key) is distinct from 'string' then raise exception 'Nur für Material kann ein Händler gewählt werden.';end if;
    select value into chosen from jsonb_array_elements(sources) where value->>'id'=p_sources->>key;
    if chosen is null then raise exception 'Der Händler gehört nicht zu diesem Artikel oder ist nicht mehr aktiv.';end if;
    select to_jsonb(mat) into m from public.materials mat where mat.id=(chosen->>'id')::uuid and mat.business_id=p_company;
   end if;
   if not labor and m->>'catalog_product_name' is not null then line:=line||jsonb_build_object('name',m->>'catalog_product_name');end if;
   if not labor then
    line:=line||jsonb_build_object('supplier_options',sources,'supplier_material_id',m->>'id','supplier',m->>'catalog_supplier','supplier_article_number',m->>'catalog_article_number');
    choices:=choices||jsonb_build_array(jsonb_build_object('key',key,'selected',m,'options',sources));
   end if;
   price:=(line->>'price')::numeric;
   if not labor and p_sources ? key then price:=(m->>'unit_price')::numeric;end if;
   if not labor and m->>'recommended_price_1' is not null then price:=(m->>'recommended_price_1')::numeric;end if;
   standard_price:=price;
   if p_prices ? key then
    if labor or jsonb_typeof(p_prices->key) is distinct from 'number' then raise exception 'Nur Materialpreise können hier angepasst werden.';end if;
    price:=(p_prices->>key)::numeric;
   end if;
   if price is null or price<0 or price>1000000 or price::text in ('NaN','Infinity','-Infinity') or price<>round(price,4) then raise exception 'Nettoverkaufspreis muss zwischen 0 und 1000000 Euro liegen, mit höchstens vier Nachkommastellen.';end if;
   line:=line||jsonb_build_object('price',price,'pricing_key',key,'price_editable',not labor);
   if not labor then line:=line||jsonb_build_object('purchase_price',m->'purchase_price','standard_net_price',standard_price);end if;
   items:=items||jsonb_build_array(line);order_items:=order_items||jsonb_build_array(line);
   changed_items:=changed_items||jsonb_build_array(wrapped||jsonb_build_object('resolved',line,'material',m));
   total:=total+(line->>'quantity')::numeric*price;
  end loop;
  select value into selection_entry from jsonb_array_elements(prepared->'selection') where value->>'id'=src->'order'->>'id';
  selection:=selection||jsonb_build_array(selection_entry||jsonb_build_object('fingerprint',md5((selection_entry->>'fingerprint')||choices::text)));
  orders:=orders||jsonb_build_array(src||jsonb_build_object('items',changed_items));
  day:=(prepared->'document'->'days'->idx)||jsonb_build_object('items',order_items);days:=days||jsonb_build_array(day);idx:=idx+1;
 end loop;
 if exists(select 1 from jsonb_object_keys(p_prices) k where not k=any(keys)) then raise exception 'Unbekannte Rechnungsposition in der Preisauswahl.';end if;
 if exists(select 1 from jsonb_object_keys(p_sources) k where not k=any(keys)) then raise exception 'Unbekannte Position in der Händlerauswahl.';end if;
 prepared:=jsonb_set(prepared,'{selection}',selection);
 prepared:=jsonb_set(prepared,'{document}',(prepared->'document')||jsonb_build_object('invoice_pricing_version',919,'supplier_pricing_version',922,'items',items,'days',days,'total',total));
 prepared:=jsonb_set(prepared,'{source_snapshot}',(prepared->'source_snapshot')||jsonb_build_object('orders',orders,'invoice_price_overrides_v919',p_prices,'invoice_sources_v922',p_sources));
 return prepared;
end;
$function$;
revoke all on function public.prepare_invoice_batch_v922(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.prepare_invoice_batch_v922(uuid,jsonb,jsonb,jsonb) to authenticated;

do $migration$
declare target regprocedure:='public.issue_invoice_batch_v919(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb)'::regprocedure;body text;needle text;
begin
 if exists(select 1 from pg_proc where oid=target and prosecdef) then raise exception 'Unerwartete Rechnungsrechte.';end if;
 select replace(prosrc,E'\r\n',E'\n') into body from pg_proc where oid=target;
 needle:='public.prepare_invoice_batch_v919(p_company,(select jsonb_agg(e->>''id'') from jsonb_array_elements(p_selection)e),p_prices)';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unbekannte Rechnungsvorbereitung.';end if;
 body:=replace(body,needle,'public.prepare_invoice_batch_v922(p_company,(select jsonb_agg(e->>''id'') from jsonb_array_elements(p_selection)e),p_prices,p_sources)');
 needle:=' if found then';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unbekannte Abschlussprüfung.';end if;
 body:=replace(body,needle,$guard$ if found then
  if existing.source_snapshot->'invoice_sources_v922' is distinct from p_sources then raise exception 'Diese Abschlusskennung wurde bereits mit einer anderen Händlerauswahl verwendet.';end if;$guard$);
 execute 'create function public.issue_invoice_batch_v922(p_id uuid,p_company uuid,p_number text,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb default null,p_prices jsonb default ''{}''::jsonb,p_sources jsonb default ''{}''::jsonb) returns public.invoice_batches_v908 language plpgsql security invoker set search_path='''' as '||quote_literal(body);
end;$migration$;
revoke all on function public.issue_invoice_batch_v922(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.issue_invoice_batch_v922(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- Source: 20261029013732_automatic_invoice_numbers_v934.sql
-- 08: Automatische Rechnungs- und Stornonummern, getrennt je Firma und Jahr.
-- Neuer Nummernkreis RE-JJJJ-000001 bzw. ST-JJJJ-000001.
-- Vorhandene App-Belege werden beruecksichtigt. Externe Nummernbuecher sind der App nicht bekannt.
-- Keine vorhandenen Belege, Arbeitsscheine oder Preise werden bei der Installation veraendert.



CREATE OR REPLACE FUNCTION public.invoice_number_status_v934(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $body$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(app_private.invoice_manager_v908(p_company),false) THEN
  RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';
 END IF;
 RETURN jsonb_build_object('automatic_invoice_numbers',true,'version',934,'invoice_prefix','RE','cancellation_prefix','ST');
END;$body$;
CREATE OR REPLACE FUNCTION public.issue_invoice_auto_v934(p_id uuid,p_company uuid,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb DEFAULT NULL,p_prices jsonb DEFAULT '{}'::jsonb,p_sources jsonb DEFAULT '{}'::jsonb,p_engine integer DEFAULT 908)
RETURNS public.invoice_batches_v908 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE number_value text;prefix text;counter bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(app_private.invoice_manager_v908(p_company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';END IF;
 IF p_issued IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Rechnungsdatum oder Vorgangskennung fehlt.';END IF;
 prefix:='RE-'||extract(year from p_issued)::integer::text||'-';
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('worktime-invoice:'||p_company::text||':'||prefix,0));
 SELECT invoice_number INTO number_value FROM public.invoice_batches_v908 WHERE id=p_id AND company_id=p_company;
 IF number_value IS NULL THEN
  SELECT coalesce(max(substring(invoice_number from length(prefix)+1)::bigint),0)+1 INTO counter FROM public.invoice_batches_v908 WHERE company_id=p_company AND invoice_number ~ ('^'||prefix||'[0-9]{1,12}$');
  IF counter>999999999999 THEN RAISE EXCEPTION 'Der Nummernkreis ist ausgeschoepft.';END IF;
  number_value:=prefix||lpad(counter::text,greatest(6,length(counter::text)),'0');
 END IF;
 IF p_engine=922 THEN
  RETURN public.issue_invoice_batch_v922(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties,p_prices,p_sources);
 ELSIF p_engine=919 AND coalesce(p_sources,'{}'::jsonb)='{}'::jsonb THEN
  RETURN public.issue_invoice_batch_v919(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties,p_prices);
 ELSIF p_engine=908 AND coalesce(p_prices,'{}'::jsonb)='{}'::jsonb AND coalesce(p_sources,'{}'::jsonb)='{}'::jsonb THEN
  RETURN public.issue_invoice_batch_v908(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties);
 ELSE RAISE EXCEPTION 'Unbekannte Rechnungs- oder Preisversion. Nichts gespeichert.';END IF;
END;$body$;
CREATE OR REPLACE FUNCTION public.cancel_invoice_auto_v934(p_id uuid,p_invoice uuid,p_issued date,p_reason text,p_reopen boolean DEFAULT false)
RETURNS public.invoice_cancellations_v908 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE company uuid;number_value text;prefix text;counter bigint;
BEGIN
 SELECT company_id INTO company FROM public.invoice_batches_v908 WHERE id=p_invoice;
 IF auth.uid() IS NULL OR company IS NULL OR NOT coalesce(app_private.invoice_manager_v908(company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Rechnung.' USING errcode='42501';END IF;
 IF p_issued IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Stornodatum oder Vorgangskennung fehlt.';END IF;
 prefix:='ST-'||extract(year from p_issued)::integer::text||'-';
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('worktime-invoice:'||company::text||':'||prefix,0));
 SELECT cancellation_number INTO number_value FROM public.invoice_cancellations_v908 WHERE id=p_id AND company_id=company;
 IF number_value IS NULL THEN
  SELECT coalesce(max(substring(cancellation_number from length(prefix)+1)::bigint),0)+1 INTO counter FROM public.invoice_cancellations_v908 WHERE company_id=company AND cancellation_number ~ ('^'||prefix||'[0-9]{1,12}$');
  IF counter>999999999999 THEN RAISE EXCEPTION 'Der Nummernkreis ist ausgeschoepft.';END IF;
  number_value:=prefix||lpad(counter::text,greatest(6,length(counter::text)),'0');
 END IF;
 RETURN public.cancel_invoice_batch_v908(p_id,p_invoice,number_value,p_issued,p_reason,p_reopen);
END;$body$;
REVOKE ALL ON FUNCTION public.invoice_number_status_v934(uuid),public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer),public.cancel_invoice_auto_v934(uuid,uuid,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invoice_number_status_v934(uuid),public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer),public.cancel_invoice_auto_v934(uuid,uuid,date,text,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
