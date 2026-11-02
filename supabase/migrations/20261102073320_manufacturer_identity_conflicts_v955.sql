-- Every stored product feature participates in exact manufacturer identity.
-- No existing material or issued document is modified.
create or replace function app_private.catalog_mpn_safe_v954(company uuid,unit_name text,identity_key text) returns boolean language sql stable security invoker set search_path='' as $$
 with candidates as (
 select m.catalog_gtin,m.catalog_features from public.materials m where m.business_id=company and coalesce(m.unit,'Stk')=unit_name
 and m.active and app_private.catalog_mpn_key_v954(m.catalog_manufacturer,m.catalog_manufacturer_number)=identity_key
 and app_private.catalog_auto_mpn_v954(m)=identity_key
 ), features as (
 select f.key,f.value from candidates c cross join lateral jsonb_each(c.catalog_features) f
 ) select (select count(distinct catalog_gtin) from candidates)<=1
 and not exists(select 1 from features where value->>'conflict'='true')
 and not exists(select 1 from features where coalesce(value->>'value','')<>'' group by key having count(distinct value->>'value')>1);
$$;
revoke all on function app_private.catalog_mpn_safe_v954(uuid,text,text) from public,anon;
grant execute on function app_private.catalog_mpn_safe_v954(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
