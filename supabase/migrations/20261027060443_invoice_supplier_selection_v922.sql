-- Requires v919 invoice pricing and v921 catalog product grouping.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
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
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',922,'invoice_suppliers_enabled',to_regprocedure('public.issue_invoice_batch_v922(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb,jsonb)') is not null) as installation;
