begin;

create or replace function public.klarwerk_dispatch_v1007(p_hash text,p_op text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if p_op = 'list' and p_body->>'entity' = 'work-sheets' then
    return app_private.klarwerk_work_sheets(p_hash, p_body);
  end if;
  if p_op = 'list' and p_body->>'entity' in ('offers', 'receipts', 'orders')
    or p_op = 'receipt-file'
    or p_op = 'rpc' and p_body->>'name' ~ '^(issue|prepare)_invoice' then
    raise exception 'Diese Aktion ist in der Arbeitszeiterfassung nicht mehr verfügbar.' using errcode = '42501';
  end if;
  return app_private.klarwerk_dispatch_v1007(p_hash, p_op, p_body);
end;
$$;

notify pgrst, 'reload schema';
commit;
