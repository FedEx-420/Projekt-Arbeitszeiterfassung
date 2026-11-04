create function public.neugart_import_article_v975(actor uuid, company uuid, account_id uuid, article jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.profiles%rowtype;
 result public.materials%rowtype;
 sku text:=btrim(article->>'article_number');
 title text:=btrim(article->>'name');
begin
 select * into p from public.profiles where id=actor;
 if not exists(select 1 from public.neugart_accounts_v971 a where a.id=account_id and a.company_id=company and
   (p.role='administrator' or (p.role='business' and p.id=company) or
    (p.role='employee' and p.business_id=company and p.id=any(a.employee_ids)))) then
  raise exception 'Account unavailable' using errcode='42501';
 end if;
 if sku is null or length(sku) not between 1 and 120 or title is null or length(title) not between 1 and 200
 or (article->>'unit') is null or article->>'unit' not in ('Stk','M','Kg')
 or (article->>'recommended_price_1') is null
 or (article->>'recommended_price_1')::numeric not between 0 and 1000000 then
  raise exception 'Invalid merchant article';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text||':neugart:'||sku,0));
 select * into result from public.materials where business_id=company and lower(catalog_supplier)='neugart' and catalog_article_number=sku;
 if found then
  if not result.active then raise exception 'Material inactive'; end if;
  return to_jsonb(result);
 end if;
 -- Keep the exact merchant title separately. The SKU suffix makes the material's name unambiguous.
 insert into public.materials(business_id,name,unit,unit_price,purchase_price,recommended_price_1,
   catalog_supplier,catalog_article_number,catalog_product_name,catalog_manufacturer,
   catalog_manufacturer_number,catalog_manufacturer_number_source,catalog_gtin,catalog_image_url,catalog_category,active)
 values(company,left(title,145-length(sku))||' [Neugart '||sku||']',article->>'unit',(article->>'recommended_price_1')::numeric,
   (article->>'purchase_price')::numeric,(article->>'recommended_price_1')::numeric,
   'Neugart',sku,title,article->>'manufacturer',nullif(article->>'manufacturer_number',''),case when nullif(article->>'manufacturer_number','') is not null then 'merchant' end,
   app_private.catalog_gtin_v921(article->>'gtin'),nullif(article->>'image_url',''),article->>'category',true)
 returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.neugart_import_article_v975(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.neugart_import_article_v975(uuid,uuid,uuid,jsonb) to service_role;
