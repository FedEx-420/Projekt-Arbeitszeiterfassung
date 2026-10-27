-- Additive invoice pricing endpoints. Existing v908 callers remain unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
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
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',919,'invoice_material_prices_enabled',
 to_regprocedure('public.prepare_invoice_batch_v919(uuid,jsonb,jsonb)') is not null and to_regprocedure('public.issue_invoice_batch_v919(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb)') is not null) as installation;
