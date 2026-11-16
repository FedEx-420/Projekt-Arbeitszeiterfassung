begin;
set local lock_timeout = '5s';

create function app_private.klarwerk_billing_work_sheets(p_hash text, p_body jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  sheets jsonb := app_private.klarwerk_work_sheets(p_hash,p_body);
  firm uuid := (app_private.klarwerk_dispatch_v1007(p_hash,'company','{}')->'company'->>'id')::uuid;
  result jsonb;
begin
  if firm is null then
    raise exception 'Keine Betriebsfreigabe.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(item.sheet || jsonb_build_object('hours', details.hours)
    order by item.ordinality),'[]'::jsonb) into result
  from jsonb_array_elements(sheets) with ordinality as item(sheet,ordinality)
  join public.work_orders w on w.id=(item.sheet->>'id')::uuid
    and app_private.team_company(w.employee_id)=firm
  cross join lateral (
    select coalesce(jsonb_agg(hour.period || jsonb_build_object('employee_name',coalesce(
      nullif(btrim(stored.period->>'employee_name'),''),
      nullif(btrim(employee.display_name),''),nullif(btrim(employee.username),''))) order by hour.ordinality),
      '[]'::jsonb) as hours
    from jsonb_array_elements(item.sheet->'hours') with ordinality as hour(period,ordinality)
    cross join lateral (select w.team_periods->((hour.ordinality-1)::integer) as period) stored
    left join public.profiles employee on employee.id::text=coalesce(stored.period->>'employee_id',
      case when coalesce(w.team_periods,'[]'::jsonb)='[]'::jsonb then w.employee_id::text end)
      and app_private.team_company(employee.id)=firm
  ) details;
  return result;
end;
$$;
revoke all on function app_private.klarwerk_billing_work_sheets(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.klarwerk_billing_work_sheets(text,jsonb) to service_role;

create function app_private.klarwerk_reopen_cancelled_sheets(p_hash text, p_invoice uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  capability jsonb := app_private.klarwerk_dispatch_v1007(p_hash,'company','{}');
  firm uuid := (capability->'company'->>'id')::uuid;
  actor uuid;
  invoice_at timestamptz;
  affected integer;
  old_sub text := coalesce(current_setting('request.jwt.claim.sub',true),'');
  old_claims text := coalesce(current_setting('request.jwt.claims',true),'');
  old_operation text := coalesce(current_setting('app.invoice_ledger_v908',true),'');
begin
  select created_by into actor from app_private.klarwerk_links_v1007
    where id=(capability->>'link_id')::uuid and company_id=firm and revoked_at is null;
  if actor is null then
    raise exception 'Keine Betriebsfreigabe.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice-v908:'||firm::text,0));
  select invoice.created_at into invoice_at
    from public.invoice_batches_v908 invoice
    join public.invoice_cancellations_v908 cancellation
      on cancellation.invoice_id=invoice.id and cancellation.company_id=firm
    where invoice.id=p_invoice and invoice.company_id=firm;
  if invoice_at is null then
    raise exception 'Stornierte Rechnung im verbundenen Betrieb nicht gefunden.' using errcode='42501';
  end if;
  perform 1 from public.work_orders w join public.invoice_order_links_v908 link on link.order_id=w.id
    where link.invoice_id=p_invoice and link.company_id=firm
    order by w.id for update of w;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('app.invoice_ledger_v908','reopen',true);
  update public.work_orders w
    set invoiced=false, invoice_reopened_from_v908=p_invoice, invoice_reopened_at_v908=statement_timestamp()
    from public.invoice_order_links_v908 link
    where link.invoice_id=p_invoice and link.company_id=firm and link.order_id=w.id
      and w.invoiced and app_private.team_company(w.employee_id)=firm
      and not exists (
        select 1 from public.invoice_order_links_v908 other
        join public.invoice_batches_v908 replacement on replacement.id=other.invoice_id and replacement.company_id=firm
        left join public.invoice_cancellations_v908 later_cancel on later_cancel.invoice_id=replacement.id
          and later_cancel.company_id=firm
        where other.order_id=w.id and other.company_id=firm and replacement.id<>p_invoice
          and (later_cancel.id is null or
            (replacement.created_at>=invoice_at and not later_cancel.reopen_orders))
      );
  get diagnostics affected=row_count;
  perform set_config('app.invoice_ledger_v908',old_operation,true);
  perform set_config('request.jwt.claims',old_claims,true);
  perform set_config('request.jwt.claim.sub',old_sub,true);
  return jsonb_build_object('reopened',affected);
end;
$$;
revoke all on function app_private.klarwerk_reopen_cancelled_sheets(text,uuid) from public,anon,authenticated;
grant execute on function app_private.klarwerk_reopen_cancelled_sheets(text,uuid) to service_role;

do $migration$
declare
  definition text := pg_get_functiondef('public.klarwerk_dispatch_v1007(text,text,jsonb)'::regprocedure);
  work_sheet_branch text := $old$  if p_op='list' and p_body->>'entity'='work-sheets' then$old$;
begin
  if strpos(definition,work_sheet_branch)=0 then
    raise exception 'Unbekannte Version der Klarwerk-Schnittstelle.';
  end if;
  execute replace(definition,work_sheet_branch,$new$  if p_op='list' and p_body->>'entity'='work-sheets'
      and p_body->'include_billing_details'='true'::jsonb then
    return app_private.klarwerk_billing_work_sheets(p_hash,p_body);
  end if;
  if p_op='rpc' and p_body->>'name'='reopen_cancelled_work_sheets' then
    return app_private.klarwerk_reopen_cancelled_sheets(p_hash,(p_body->'args'->>'invoice_id')::uuid);
  end if;
  if p_op='list' and p_body->>'entity'='work-sheets' then$new$);
end;
$migration$;

notify pgrst, 'reload schema';
commit;
