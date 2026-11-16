begin;
set local lock_timeout='5s';

alter table public.work_orders
  add column klarwerk_archived_at timestamptz,
  add column klarwerk_billed boolean not null default false;

create table app_private.klarwerk_billing_snapshots (
  company_id uuid primary key,
  observed_at timestamptz not null
);
alter table app_private.klarwerk_billing_snapshots enable row level security;
revoke all on app_private.klarwerk_billing_snapshots from public,anon,authenticated;

create function app_private.klarwerk_sync_billing_snapshot(p_hash text,p_ids jsonb,p_observed timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  firm uuid := (app_private.klarwerk_dispatch_v1007(p_hash,'company','{}')->'company'->>'id')::uuid;
  ids uuid[];
  old_mode text:=coalesce(current_setting('app.klarwerk_billing_sync',true),'');
  accepted uuid;
begin
  if firm is null or p_observed is null or p_observed > clock_timestamp()+interval '2 minutes'
    or jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids)>50000 then
    raise exception 'Ungültiger Abrechnungsstand.' using errcode='42501';
  end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_ids);
  perform pg_advisory_xact_lock(hashtextextended('invoice-v908:'||firm::text,0));
  insert into app_private.klarwerk_billing_snapshots as s(company_id,observed_at)
    values(firm,p_observed) on conflict(company_id) do update set observed_at=excluded.observed_at
    where s.observed_at<=excluded.observed_at returning company_id into accepted;
  if accepted is null then return jsonb_build_object('synced',true);end if;
  perform set_config('app.klarwerk_billing_sync','1',true);
  update public.work_orders w set klarwerk_billed=(w.id=any(ids))
    where w.klarwerk_archived_at is null and not w.invoiced
      and (w.klarwerk_billed is distinct from (w.id=any(ids)))
      and app_private.team_company(w.employee_id)=firm;
  perform set_config('app.klarwerk_billing_sync',old_mode,true);
  return jsonb_build_object('synced',true);
end;
$$;
revoke all on function app_private.klarwerk_sync_billing_snapshot(text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function app_private.klarwerk_sync_billing_snapshot(text,jsonb,timestamptz) to service_role;

create function app_private.guard_archived_work_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.klarwerk_archived_at is not null or old.klarwerk_billed then
      raise exception 'Abgerechnete und archivierte Arbeitsscheine bleiben erhalten.';
    end if;
    return old;
  end if;
  if tg_op='INSERT' and new.klarwerk_billed then
    raise exception 'Abrechnungsstatus wird durch Klarwerk gesetzt.';
  end if;
  if tg_op='UPDATE' and (old.klarwerk_billed or new.klarwerk_billed)
    and not (current_user in ('postgres','service_role') and (
      coalesce(current_setting('app.klarwerk_billing_sync',true),'')='1' or coalesce(current_setting('app.klarwerk_archive',true),'')='1')) then
    raise exception 'Der Arbeitsschein gehört zu einer Rechnung in Klarwerk. Bitte zuerst stornieren.';
  end if;
  if (tg_op='INSERT' and new.klarwerk_archived_at is not null) or
    (tg_op='UPDATE' and (old.klarwerk_archived_at is not null or new.klarwerk_archived_at is not null)) then
    if tg_op<>'UPDATE' or coalesce(current_setting('app.klarwerk_archive',true),'')<>'1'
      or current_user not in ('postgres','service_role') or old.klarwerk_archived_at is not null then
      raise exception 'Archivierte Arbeitsscheine bleiben im Stundenarchiv erhalten.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_archived_work_order() from public,anon,authenticated;
create trigger zz_klarwerk_archive_guard before insert or update or delete on public.work_orders
  for each row execute function app_private.guard_archived_work_order();

create function app_private.klarwerk_archive_cancelled_orders(p_hash text,p_ids jsonb,p_invoice uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  firm uuid := (app_private.klarwerk_dispatch_v1007(p_hash,'company','{}')->'company'->>'id')::uuid;
  ids uuid[];
  original_ids uuid[];
  old_mode text := coalesce(current_setting('app.klarwerk_archive',true),'');
  locked_rows int;
begin
  if firm is null or jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids) not between 1 and 200 then
    raise exception 'Gültige Arbeitsscheine des verbundenen Betriebs erforderlich.' using errcode='42501';
  end if;
  select array_agg(distinct value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_ids);
  if cardinality(ids)<>jsonb_array_length(p_ids) then
    raise exception 'Doppelte Arbeitsscheine.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice-v908:'||firm::text,0));
  if p_invoice is not null then
    select array_agg(link.order_id order by link.order_id) into original_ids
      from public.invoice_order_links_v908 link
      join public.invoice_cancellations_v908 cancellation
        on cancellation.invoice_id=link.invoice_id and cancellation.company_id=firm
      where link.company_id=firm and link.invoice_id=p_invoice;
    if original_ids is distinct from ids then
      raise exception 'Die Arbeitsscheine gehören nicht zur stornierten Rechnung.' using errcode='42501';
    end if;
    perform app_private.klarwerk_reopen_cancelled_sheets(p_hash,p_invoice);
  end if;
  perform 1 from public.work_orders w where w.id=any(ids) and not w.invoiced
    and app_private.team_company(w.employee_id)=firm order by w.id for update;
  get diagnostics locked_rows=row_count;
  if locked_rows<>cardinality(ids) then
    raise exception 'Mindestens ein Arbeitsschein ist nicht verfügbar oder wurde erneut abgerechnet.';
  end if;
  perform set_config('app.klarwerk_archive','1',true);
  update public.work_orders set klarwerk_archived_at=statement_timestamp(),klarwerk_billed=false
    where id=any(ids) and klarwerk_archived_at is null;
  perform set_config('app.klarwerk_archive',old_mode,true);
  return jsonb_build_object('archived',locked_rows);
end;
$$;
revoke all on function app_private.klarwerk_archive_cancelled_orders(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function app_private.klarwerk_archive_cancelled_orders(text,jsonb,uuid) to service_role;

do $migration$
declare
  routine regprocedure;
  marker text;
  definition text;
begin
  for routine,marker in select * from (values
    ('app_private.klarwerk_work_sheets(text,jsonb)'::regprocedure,'and not w.invoiced'),
    ('app_private.klarwerk_dispatch_v1007(text,text,jsonb)'::regprocedure,'and not w.invoiced'),
    ('app_private.klarwerk_fleet_orders(text,jsonb)'::regprocedure,'where coalesce(w.work_kind,')
  ) as feeds(routine,marker) loop
    definition:=pg_get_functiondef(routine);
    if strpos(definition,marker)=0 then raise exception 'Unbekannte Abfrage %',routine; end if;
    execute replace(definition,marker,case when left(marker,5)='where' then
      'where w.klarwerk_archived_at is null and '||substr(marker,7)
      else 'and w.klarwerk_archived_at is null '||marker end);
  end loop;
  definition:=pg_get_functiondef('public.klarwerk_dispatch_v1007(text,text,jsonb)'::regprocedure);
  marker:='return app_private.klarwerk_dispatch_v1007(p_hash,p_op,p_body);';
  if strpos(definition,marker)=0 then raise exception 'Unbekannte Klarwerk-Schnittstelle.';end if;
  execute replace(definition,marker,$branch$if p_op='rpc' and p_body->>'name'='sync_billing_snapshot' then
    return app_private.klarwerk_sync_billing_snapshot(p_hash,p_body->'args'->'ids',(p_body->'args'->>'observed')::timestamptz);
  end if;
  if p_op='rpc' and p_body->>'name'='archive_cancelled_work_sheets' then
    return app_private.klarwerk_archive_cancelled_orders(p_hash,p_body->'args'->'ids',(p_body->'args'->>'invoice_id')::uuid);
  end if;
  return app_private.klarwerk_dispatch_v1007(p_hash,p_op,p_body);$branch$);
  definition:=pg_get_functiondef('public.juprowa_work_order_export(uuid,uuid,uuid)'::regprocedure);
  marker:='and not invoiced and coalesce(work_kind';
  if strpos(definition,marker)=0 then raise exception 'Unbekannte Juprowa-Schnittstelle.';end if;
  execute replace(definition,marker,'and klarwerk_archived_at is null and not klarwerk_billed '||marker);
end;
$migration$;

notify pgrst,'reload schema';
commit;
