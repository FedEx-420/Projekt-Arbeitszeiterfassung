-- Additive fixed-price invoicing. Existing documents and itemized RPCs are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function public.prepare_invoice_fixed_v984(p_company uuid,p_order_ids jsonb,p_fixed jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $body$
declare prepared jsonb;config jsonb;price numeric;description text;line jsonb;selection jsonb;
begin
 if jsonb_typeof(p_fixed) is distinct from 'object' or octet_length(p_fixed::text)>20000
 or jsonb_typeof(p_fixed->'price') is distinct from 'number' or jsonb_typeof(p_fixed->'description') is distinct from 'string'
 or exists(select 1 from jsonb_object_keys(p_fixed) k where k not in ('price','description')) then raise exception 'Ungültige Pauschalrechnung.';end if;
 price:=(p_fixed->>'price')::numeric;description:=btrim(p_fixed->>'description');
 if price<0 or price>1000000 or price<>round(price,2) or price::text in ('NaN','Infinity','-Infinity')
 or length(description) not between 1 and 4000 then raise exception 'Leistungsbeschreibung und Festpreis netto mit höchstens zwei Nachkommastellen erforderlich.';end if;
 config:=jsonb_build_object('description',description,'price',price);
 if p_fixed is distinct from config then raise exception 'Bitte die Leistungsbeschreibung ohne äußere Leerzeichen bestätigen.';end if;
 -- Retain authorization, customer consistency and source-revision checks.
 prepared:=public.prepare_invoice_batch_v922(p_company,p_order_ids,'{}','{}');
 line:=jsonb_build_object('name',description,'quantity',1,'unit','Pauschal','price',price,'date',prepared->'document'->'from');
 select jsonb_agg(e||jsonb_build_object('fingerprint',md5((e->>'fingerprint')||config::text)) order by ord)
 into selection from jsonb_array_elements(prepared->'selection') with ordinality x(e,ord);
 prepared:=jsonb_set(prepared,'{selection}',selection);
 prepared:=jsonb_set(prepared,'{document}',((prepared->'document')-array['invoice_pricing_version','supplier_pricing_version'])||
 jsonb_build_object('invoice_fixed_version',984,'pricing_kind','fixed','fixed_price',config,'items',jsonb_build_array(line),'days','[]'::jsonb,'total',price));
 prepared:=jsonb_set(prepared,'{source_snapshot}',(prepared->'source_snapshot')||jsonb_build_object('invoice_fixed_v984',config));
 return prepared;
end;$body$;
revoke all on function public.prepare_invoice_fixed_v984(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.prepare_invoice_fixed_v984(uuid,jsonb,jsonb) to authenticated;

-- Reuse the installed guarded finalizer. Abort on an unexpected source rather
-- than silently dropping locks, tax validation, idempotency or source checks.
do $migration$
declare body text;needle text;auto_body text;
begin
 if exists(select 1 from pg_proc where oid='public.issue_invoice_batch_v922(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure and prosecdef) then raise exception 'Unerwartete Rechnungsrechte.';end if;
 select replace(prosrc,E'\r\n',E'\n') into body from pg_proc where oid='public.issue_invoice_batch_v922(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure;
 needle:='public.prepare_invoice_batch_v922(p_company,(select jsonb_agg(e->>''id'') from jsonb_array_elements(p_selection)e),p_prices,p_sources)';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1
 or position('perform app_private.invoice_tax_checked_v908' in body)=0
 or position('if not app_private.invoice_manager_v908(p_company)' in body)=0 then raise exception 'Unbekannter Rechnungsabschluss.';end if;
 body:=replace(body,needle,'public.prepare_invoice_fixed_v984(p_company,(select jsonb_agg(e->>''id'') from jsonb_array_elements(p_selection)e),p_fixed)');
 needle:=' if found then';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'Unbekannte Wiederholungsprüfung.';end if;
 body:=replace(body,needle,$retry$ if found then
 if existing.source_snapshot->'invoice_fixed_v984' is distinct from p_fixed then raise exception 'Diese Abschlusskennung wurde bereits mit einem anderen Festpreis oder Leistungstext verwendet.';end if;$retry$);
 -- Existing pricing guards use local empty objects; no item-price overrides in this mode.
 execute 'create function public.issue_invoice_fixed_v984(p_id uuid,p_company uuid,p_number text,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb default null,p_fixed jsonb default null) returns public.invoice_batches_v908 language plpgsql security invoker set search_path='''' as '
 ||quote_literal(replace(body,'declare ', 'declare p_prices jsonb:=''{}'';p_sources jsonb:=''{}'';'));
 select replace(prosrc,E'\r\n',E'\n') into auto_body from pg_proc where oid='public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure;
 needle:=' IF p_engine=922 THEN';
 if (length(auto_body)-length(replace(auto_body,needle,'')))/length(needle)<>1 then raise exception 'Unbekannter Nummernkreis.';end if;
 auto_body:=substring(auto_body from 1 for position(needle in auto_body)-1)||E' RETURN public.issue_invoice_fixed_v984(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties,p_fixed);\nEND;';
 execute 'create function public.issue_invoice_fixed_auto_v984(p_id uuid,p_company uuid,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb default null,p_fixed jsonb default null) returns public.invoice_batches_v908 language plpgsql security invoker set search_path='''' as '||quote_literal(auto_body);
end;$migration$;
revoke all on function public.issue_invoice_fixed_v984(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb),public.issue_invoice_fixed_auto_v984(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.issue_invoice_fixed_v984(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb),public.issue_invoice_fixed_auto_v984(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
