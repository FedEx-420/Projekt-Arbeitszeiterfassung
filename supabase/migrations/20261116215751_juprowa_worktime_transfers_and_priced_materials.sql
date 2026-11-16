begin;
set local lock_timeout='5s';

create table public.juprowa_work_order_links (
  local_order_id uuid primary key references public.work_orders(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  portal_customer_id text not null,
  mandant_id text not null,
  worksheet_id text check (worksheet_id ~ '^[1-9][0-9]{0,14}$'),
  sheet_revision text check (sheet_revision ~ '^[a-f0-9]{64}$'),
  attempted_at timestamptz,
  transferred_at timestamptz,
  unique (business_id,portal_customer_id,mandant_id,worksheet_id)
);
alter table public.juprowa_work_order_links enable row level security;
revoke all on public.juprowa_work_order_links from public,anon,authenticated;
grant select,insert,update on public.juprowa_work_order_links to service_role;

create function public.juprowa_work_order_export(p_business uuid,p_revision uuid,p_order uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  connection public.juprowa_servicepad_connections;
  job public.work_orders;
  result jsonb;
begin
  select * into connection from public.juprowa_servicepad_connections where business_id=p_business and revision=p_revision;
  if not found then raise exception 'Ungültige Betriebsverbindung.' using errcode='42501'; end if;
  select * into job from public.work_orders
    where id=p_order and app_private.team_company(employee_id)=p_business
    and not invoiced and coalesce(work_kind,'customer')='customer';
  if not found then return null; end if;
  select jsonb_build_object('order',to_jsonb(job),'customer',jsonb_build_object('name',customer.name,
      'fields',customer.custom_fields,'remote_id',customer_link.source_id),
    'materials',coalesce((select jsonb_agg(jsonb_build_object('name',item.position_name,'quantity',item.quantity,
      'unit',item.unit,'price',item.unit_price,'article',material.catalog_article_number,'supplier',material.catalog_supplier)
      order by item.id)
      from public.work_order_items item
      left join public.materials material on material.id=item.material_id and material.business_id=p_business
      where item.work_order_id=p_order and lower(btrim(coalesce(item.unit,material.unit,''))) not in ('h','std','std.','stunde','stunden')),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',doc.id,'name',doc.file_name,'path',doc.file_path,'mime',doc.mime_type)
      order by doc.id) from public.work_order_documents doc where doc.work_order_id=p_order),'[]'::jsonb))
    into result from public.customers customer
    left join app_private.juprowa_customer_links customer_link on customer_link.customer_id=customer.id
      and customer_link.business_id=p_business and customer_link.portal_customer_id=connection.portal_customer_id
      and customer_link.mandant_id=connection.mandant_id
    where customer.id=job.customer_id and app_private.team_company(customer.employee_id)=p_business
    order by customer_link.source_id limit 1;
  return result;
end;
$$;
revoke all on function public.juprowa_work_order_export(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.juprowa_work_order_export(uuid,uuid,uuid) to service_role;

create function app_private.klarwerk_priced_work_sheets(p_hash text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  sheets jsonb := app_private.klarwerk_billing_work_sheets(p_hash,p_body);
  enriched jsonb;
begin
  select coalesce(jsonb_agg(source.sheet || jsonb_build_object('materials',priced.items)
      order by source.ordinality),'[]'::jsonb) into enriched
  from jsonb_array_elements(sheets) with ordinality as source(sheet,ordinality)
  cross join lateral (
    select coalesce(jsonb_agg(material.item || jsonb_build_object('unit_price',item.unit_price)
      order by material.ordinality),'[]'::jsonb) as items
    from jsonb_array_elements(source.sheet->'materials') with ordinality as material(item,ordinality)
    join public.work_order_items item on item.id=(material.item->>'id')::uuid
      and item.work_order_id=(source.sheet->>'id')::uuid
  ) priced;
  return enriched;
end;
$$;
revoke all on function app_private.klarwerk_priced_work_sheets(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_priced_work_sheets(text,jsonb) to service_role;

do $migration$
declare
  definition text := pg_get_functiondef('public.klarwerk_dispatch_v1007(text,text,jsonb)'::regprocedure);
  previous text := 'return app_private.klarwerk_billing_work_sheets(p_hash,p_body);';
begin
  if strpos(definition,previous)=0 then raise exception 'Unbekannte Klarwerk-Abfrage.'; end if;
  execute replace(definition,previous,$new$if p_body->'include_material_prices'='true'::jsonb then
      return app_private.klarwerk_priced_work_sheets(p_hash,p_body);
    end if;
    return app_private.klarwerk_billing_work_sheets(p_hash,p_body);$new$);
end;
$migration$;
notify pgrst,'reload schema';
commit;
