-- Additive fixed-price invoicing. Existing documents and itemized RPCs are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.prepare_invoice_fixed_v984(p_company uuid,p_order_ids jsonb,p_fixed jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $body$
declare prepared jsonb;config jsonb;price numeric;description text;line jsonb;selection jsonb;article_list jsonb;
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
 select coalesce(jsonb_agg(jsonb_build_object('name',item->'name','quantity',item->'quantity','unit',item->'unit') order by position),'[]'::jsonb)
 into article_list
 from jsonb_array_elements(prepared->'document'->'items') with ordinality as source(item,position)
 where item->'price_editable'='true'::jsonb;
 line:=jsonb_build_object('name',description,'quantity',1,'unit','Pauschal','price',price,'date',prepared->'document'->'from');
 select jsonb_agg(e||jsonb_build_object('fingerprint',md5((e->>'fingerprint')||config::text)) order by ord)
 into selection from jsonb_array_elements(prepared->'selection') with ordinality x(e,ord);
 prepared:=jsonb_set(prepared,'{selection}',selection);
 prepared:=jsonb_set(prepared,'{document}',((prepared->'document')-array['invoice_pricing_version','supplier_pricing_version'])||
 jsonb_build_object('invoice_fixed_version',984,'pricing_kind','fixed','fixed_price',config,'items',jsonb_build_array(line),'fixed_articles',article_list,'days','[]'::jsonb,'total',price));
 prepared:=jsonb_set(prepared,'{source_snapshot}',(prepared->'source_snapshot')||jsonb_build_object('invoice_fixed_v984',config));
 return prepared;
end;$body$;
revoke all on function public.prepare_invoice_fixed_v984(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.prepare_invoice_fixed_v984(uuid,jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
