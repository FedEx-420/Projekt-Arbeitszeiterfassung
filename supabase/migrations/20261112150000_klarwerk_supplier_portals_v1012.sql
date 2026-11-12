begin;
set local lock_timeout = '5s';

alter table public.purchase_receipts_v1007
  add column document_type text not null default 'invoice'
    check (document_type in ('invoice', 'delivery_note', 'credit_note', 'invoice_copy')),
  add column portal_provider text check (portal_provider in ('efg', 'fif')),
  add column portal_account_id uuid,
  add column portal_document_key text,
  add column portal_file_sha256 text,
  add column portal_totals jsonb,
  add column related_invoice_number text,
  alter column invoice_date drop not null,
  add constraint purchase_receipts_document_date_v1011 check (invoice_date is not null or document_type = 'delivery_note');

create unique index purchase_receipts_portal_key_v1011
  on public.purchase_receipts_v1007(company_id, portal_provider, portal_account_id, portal_document_key)
  where portal_provider is not null;
create unique index purchase_receipts_portal_file_v1011
  on public.purchase_receipts_v1007(company_id, portal_provider, portal_file_sha256)
  where portal_provider is not null;

-- Keep the scheduled lease, cursor and service authentication outside the public schema.
create table app_private.klarwerk_supplier_scans_v1011 (
  provider text not null check (provider in ('efg', 'fif')),
  account_id uuid not null,
  company_id uuid not null references public.profiles(id) on delete cascade,
  next_run timestamptz not null default now(),
  lease uuid,
  lease_until timestamptz,
  cursor_data jsonb not null default '{}',
  failures integer not null default 0,
  last_result text,
  last_success timestamptz,
  primary key (provider, account_id)
);
alter table app_private.klarwerk_supplier_scans_v1011 enable row level security;
revoke all on app_private.klarwerk_supplier_scans_v1011 from public, anon, authenticated;
create index klarwerk_supplier_scans_due_v1011
  on app_private.klarwerk_supplier_scans_v1011(next_run);

create view app_private.klarwerk_supplier_accounts_v1011 with (security_invoker = true) as
  select 'efg'::text as provider, id as account_id, company_id from public.neugart_accounts_v971
  union all
  select 'fif'::text, id, company_id from public.fif_accounts_v997;
revoke all on app_private.klarwerk_supplier_accounts_v1011 from public, anon, authenticated;

create function app_private.klarwerk_supplier_link_active_v1011(p_company uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1
    from public.profiles company
    join auth.users owner on owner.id = company.id
    join app_private.klarwerk_links_v1007 link on link.company_id = company.id
    join public.profiles issuer on issuer.id = link.created_by
    join auth.users auth_issuer on auth_issuer.id = issuer.id
    where company.id = p_company and company.role = 'business'
      and owner.deleted_at is null and (owner.banned_until is null or owner.banned_until < now())
      and link.claimed_at is not null and link.revoked_at is null and link.token_hash is not null
      and auth_issuer.deleted_at is null
      and (auth_issuer.banned_until is null or auth_issuer.banned_until < now())
      and (issuer.role = 'administrator' or (issuer.role = 'business' and issuer.id = company.id))
  )
$$;
revoke all on function app_private.klarwerk_supplier_link_active_v1011(uuid) from public, anon, authenticated;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'klarwerk_supplier_job_v1011');

create function public.klarwerk_supplier_job_v1011(p_op text, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job app_private.klarwerk_supplier_scans_v1011;
  receipt public.purchase_receipts_v1007;
  receipt_id uuid;
  document_key text;
  document_hash text;
  kind text;
  result text;
  claimed_jobs jsonb;
  p_provider text := p_body->>'provider';
  p_account uuid := (p_body->>'account_id')::uuid;
begin
  if p_op = 'claim' then
    if coalesce(p_body->>'secret', '') !~ '^[0-9a-f]{64}$' or not exists (
      select 1 from vault.decrypted_secrets
      where name = 'klarwerk_supplier_job_v1011' and decrypted_secret = p_body->>'secret'
    ) then
      raise exception 'Abruf abgewiesen.' using errcode = '42501';
    end if;

    insert into app_private.klarwerk_supplier_scans_v1011(provider, account_id, company_id)
      select a.provider, a.account_id, a.company_id
      from app_private.klarwerk_supplier_accounts_v1011 a
      where app_private.klarwerk_supplier_link_active_v1011(a.company_id)
    on conflict do nothing;

    with due as (
        select s.provider, s.account_id
        from app_private.klarwerk_supplier_scans_v1011 s
        join app_private.klarwerk_supplier_accounts_v1011 a using (provider, account_id, company_id)
        where s.next_run <= now() and (s.lease_until is null or s.lease_until < now())
          and app_private.klarwerk_supplier_link_active_v1011(s.company_id)
        order by s.next_run, s.provider, s.account_id
        limit 2 for update of s skip locked
      ), claimed as (
        update app_private.klarwerk_supplier_scans_v1011 s
        set lease = gen_random_uuid(), lease_until = now() + interval '3 minutes'
        from due where (s.provider, s.account_id) = (due.provider, due.account_id)
        returning s.provider, s.account_id, s.company_id, s.lease, s.cursor_data
      )
    select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into claimed_jobs from claimed;
    return claimed_jobs;
  end if;

  select s.* into job from app_private.klarwerk_supplier_scans_v1011 s
  where s.provider = p_provider and s.account_id = p_account
    and s.lease = (p_body->>'lease')::uuid and s.lease_until > now()
  for update;
  if not found then
    raise exception 'Abrufauftrag abgelaufen.' using errcode = '42501';
  end if;
  if not app_private.klarwerk_supplier_link_active_v1011(job.company_id)
    or not exists (
      select 1 from app_private.klarwerk_supplier_accounts_v1011 a
      where (a.provider, a.account_id, a.company_id) = (job.provider, job.account_id, job.company_id)
    ) then
    raise exception 'Händlerkonto oder Klarwerk-Verbindung nicht aktiv.' using errcode = '42501';
  end if;

  if p_op = 'finish' then
    result := p_body->>'result';
    if coalesce(result, '') not in ('complete', 'continue', 'login', 'permission', 'portal', 'storage', 'document') then
      raise exception 'Unbekanntes Abrufergebnis.';
    end if;
    update app_private.klarwerk_supplier_scans_v1011
    set lease = null, lease_until = null, last_result = result,
        cursor_data = case when result = 'complete' then '{}'::jsonb else coalesce(p_body->'cursor', cursor_data) end,
        last_success = case when result = 'complete' then now() else last_success end,
        failures = case when result in ('complete', 'continue') then 0 else least(failures + 1, 10) end,
        next_run = now() + case result
          when 'complete' then interval '3 hours'
          when 'continue' then interval '1 minute'
          when 'login' then interval '12 hours'
          when 'permission' then interval '12 hours'
          when 'document' then interval '3 hours'
          else least(12, 1 + failures) * interval '30 minutes'
        end
    where provider = job.provider and account_id = job.account_id;
    return jsonb_build_object('ok', true);
  end if;

  document_key := p_body->>'document_key';
  if coalesce(length(document_key), 0) not between 1 and 260 then
    raise exception 'Ungültige Dokumentkennung.';
  end if;
  select * into receipt from public.purchase_receipts_v1007
  where company_id = job.company_id and portal_provider = job.provider
    and portal_account_id = job.account_id and portal_document_key = document_key;

  if p_op = 'known' then
    -- A delivery note can gain an exact invoice reference later in the portal.
    if receipt.document_type = 'delivery_note' and receipt.related_invoice_number is null
      and coalesce(length(p_body->>'related_invoice_number'), 0) between 1 and 100 then
      update public.purchase_receipts_v1007 set related_invoice_number = p_body->>'related_invoice_number'
      where id = receipt.id and related_invoice_number is null;
    end if;
    return jsonb_build_object('ready', coalesce(receipt.status = 'ready', false));
  elsif p_op = 'reserve' then
    kind := p_body->>'document_type';
    document_hash := p_body->>'file_sha256';
    if coalesce(kind, '') not in ('invoice', 'delivery_note', 'credit_note', 'invoice_copy')
      or coalesce(document_hash, '') !~ '^[0-9a-f]{64}$'
      or coalesce(length(p_body->>'file_name'), 0) not between 1 and 250 then
      raise exception 'Ungültiger Originalbeleg.';
    end if;
    receipt_id := gen_random_uuid();
    insert into public.purchase_receipts_v1007(
      id, company_id, employee_id, supplier, invoice_number, invoice_date,
      file_name, mime_type, file_path, document_type, portal_provider, portal_account_id,
      portal_document_key, portal_file_sha256, related_invoice_number, portal_totals
    ) values (
      receipt_id, job.company_id, job.company_id,
      case job.provider when 'efg' then 'Neugart · EFG ONLINE PLUS' else 'H. Gautzsch · FiF' end,
      left(p_body->>'number', 100), (p_body->>'date')::date,
      p_body->>'file_name', 'application/pdf', job.company_id::text || '/' || receipt_id::text || '/original.pdf',
      kind, job.provider, job.account_id, document_key, document_hash, left(p_body->>'related_invoice_number', 100),
      case when jsonb_typeof(p_body->'totals') = 'object' then p_body->'totals' end
    ) on conflict do nothing;

    select r.* into receipt from public.purchase_receipts_v1007 r
    where r.company_id = job.company_id and r.portal_provider = job.provider
      and ((r.portal_account_id = job.account_id and r.portal_document_key = document_key)
        or r.portal_file_sha256 = document_hash)
    order by (r.portal_account_id = job.account_id and r.portal_document_key = document_key) desc
    limit 1;
    if not found or receipt.portal_file_sha256 is distinct from document_hash then
      raise exception 'Beleg hat sich während des Imports geändert.';
    end if;
    return jsonb_build_object('ready', receipt.status = 'ready', 'id', receipt.id, 'path', receipt.file_path);
  elsif p_op = 'complete' then
    -- The file hash allows simultaneous discovery by two logins of the same company.
    select r.* into receipt from public.purchase_receipts_v1007 r
    where r.id = (p_body->>'id')::uuid and r.company_id = job.company_id
      and r.portal_provider = job.provider and r.portal_file_sha256 = p_body->>'file_sha256';
    if not found or not exists (
      select 1 from storage.objects where bucket_id = 'purchase-receipts-v1007' and name = receipt.file_path
    ) then
      raise exception 'Originaldatei wurde nicht bestätigt.';
    end if;
    update public.purchase_receipts_v1007 set status = 'ready' where id = receipt.id and status = 'pending';
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Unbekannte Abrufaktion.';
end
$$;
revoke all on function public.klarwerk_supplier_job_v1011(text, jsonb) from public, anon, authenticated;
grant execute on function public.klarwerk_supplier_job_v1011(text, jsonb) to service_role;

create function app_private.klarwerk_supplier_schedule_v1011()
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://yzlnfrljlknazywskylb.supabase.co/functions/v1/supplier-portal-docs-v1011',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-klarwerk-job', decrypted_secret),
    timeout_milliseconds := 115000
  )
  from vault.decrypted_secrets
  where name = 'klarwerk_supplier_job_v1011'
$$;
revoke all on function app_private.klarwerk_supplier_schedule_v1011() from public, anon, authenticated;

-- Portal originals can only be written by the server-side importer.
drop policy purchase_files_insert_v1007 on storage.objects;
create policy purchase_files_insert_v1007 on storage.objects for insert to authenticated
with check (bucket_id = 'purchase-receipts-v1007' and exists (
  select 1 from public.purchase_receipts_v1007 r
  where r.file_path = name and r.employee_id = (select auth.uid())
    and r.status = 'pending' and r.portal_provider is null
));

CREATE OR REPLACE FUNCTION app_private.klarwerk_dispatch_v1007(p_hash text, p_op text, p_body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g app_private.klarwerk_links_v1007;actor public.profiles;result jsonb;arg jsonb:=p_body->'args';old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);off integer:=greatest(0,least(coalesce((p_body->>'offset')::integer,0),100000));begin
 if p_op='exchange' then
  if coalesce(p_body->>'token_hash','')!~'^[a-f0-9]{64}$' or length(coalesce(p_body->>'account_label',''))>150 then raise exception 'Ungültige Verbindung.';end if;
  update app_private.klarwerk_links_v1007 set pair_hash=null,token_hash=p_body->>'token_hash',claimed_at=now(),account_label=p_body->>'account_label' where pair_hash=p_hash and pair_expires>now() and claimed_at is null and revoked_at is null returning * into g;
 else
  select * into g from app_private.klarwerk_links_v1007 where token_hash=p_hash and revoked_at is null and claimed_at is not null for share;
 end if;
 if g.id is null then raise exception 'Freigabe ungültig, abgelaufen oder widerrufen.' using errcode='42501';end if;
 select * into actor from public.profiles where id=g.created_by for share;
 if actor.id is null or not(actor.role='administrator' or (actor.role='business' and actor.id=g.company_id)) or not exists(select 1 from auth.users where id=actor.id and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'Die Freigabe besitzt keine Berechtigung mehr.' using errcode='42501';end if;
 perform set_config('request.jwt.claim.sub',actor.id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
 if p_op in ('exchange','company') then
  select jsonb_build_object('link_id',g.id,'offers_allowed',g.offers_allowed,'company',jsonb_build_object('id',p.id,'name',coalesce(p.company_name,p.username),'company_logo_path',p.company_logo_path),'legal',coalesce(l.details,'{}'),'supplier_sync',(
   select coalesce(jsonb_agg(jsonb_build_object('provider',a.provider,'result',s.last_result,'last_success',s.last_success) order by a.provider,a.account_id),'[]'::jsonb)
   from app_private.klarwerk_supplier_accounts_v1011 a
   left join app_private.klarwerk_supplier_scans_v1011 s using (provider,account_id,company_id)
   where a.company_id=g.company_id
  )) into result from public.profiles p left join public.company_legal_info_v900 l on l.company_id=p.id where p.id=g.company_id;
 elsif p_op='list' then
  case p_body->>'entity'
   when 'orders' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select w.id,w.work_date,w.customer_id,w.customer_name,w.title,w.documentation,w.start_time,w.end_time,w.executed_hours,w.updated_at,w.employee_id from public.work_orders w where app_private.team_company(w.employee_id)=g.company_id and not w.invoiced and coalesce(w.work_kind,'customer')='customer' order by w.id limit 250 offset off) q;
   when 'customers' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select c.id,c.name,c.custom_fields,c.updated_at from public.customers c where app_private.team_company(c.employee_id)=g.company_id order by c.id limit 250 offset off)q;
   when 'invoices' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_batches_v908 where company_id=g.company_id order by id limit 250 offset off)q;
   when 'cancellations' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_cancellations_v908 where company_id=g.company_id order by id limit 250 offset off)q;
   when 'links' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_order_links_v908 where company_id=g.company_id order by order_id limit 250 offset off)q;
   when 'receipts' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select r.id,r.company_id,r.employee_id,r.supplier,r.invoice_number,r.invoice_date,r.file_name,r.mime_type,r.created_at,r.document_type,r.portal_provider,r.portal_account_id,r.related_invoice_number,r.portal_totals,coalesce(p.display_name,p.username) uploader from public.purchase_receipts_v1007 r join public.profiles p on p.id=r.employee_id where r.company_id=g.company_id and r.status='ready' and (r.document_type='invoice' or p_body->>'supplier_documents'='true') order by r.id limit 250 offset off)q;
   when 'offers' then
    if not g.offers_allowed then
     raise exception 'Angebote sind für diese Verbindung noch nicht freigegeben.' using errcode='42501';
    end if;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into result from (
     select o.id,o.business_id,o.offer_number,o.customer_name,o.customer_snapshot,
       o.offer_date,o.valid_until,o.title,o.notes,o.status,o.items,o.subtotal,o.tax_amount,
       o.total,o.revision,o.updated_at,o.offer_config
     from public.offers o
     where o.business_id=g.company_id and (p_body->>'id' is null or o.id=(p_body->>'id')::uuid)
     order by o.id limit 250 offset off
    ) q;
   when 'datev-settings' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.company_datev_settings_v907 where company_id=g.company_id order by company_id limit 250 offset off) q;
   when 'datev-bookings' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.datev_bookings_v907 where company_id=g.company_id order by id limit 250 offset off) q;
   when 'datev-exports' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.datev_exports_v907 where company_id=g.company_id order by id limit 250 offset off) q;
   when 'datev-artifacts' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.datev_export_artifacts_v907 where company_id=g.company_id order by export_id limit 250 offset off) q;
   when 'legal-info' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.company_legal_info_v900 where company_id=g.company_id order by company_id limit 250 offset off) q;
   when 'legal-accounting' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.company_legal_documents_v900 where company_id=g.company_id and kind='accounting' order by version limit 250 offset off) q;
   else raise exception 'Unbekannte Datenart.';
  end case;
 elsif p_op='receipt-file' then
  select jsonb_build_object('path',file_path,'name',file_name,'mime',mime_type) into result from public.purchase_receipts_v1007 where id=(p_body->>'id')::uuid and company_id=g.company_id and status='ready';if result is null then raise exception 'Beleg nicht gefunden.' using errcode='42501';end if;
 elsif p_op in ('datev-source','datev-artifact') then
  select to_jsonb(e) into result from public.datev_exports_v907 e
   where e.id=(p_body->>'id')::uuid and e.company_id=g.company_id;
  if result is null then raise exception 'Export nicht verfügbar.' using errcode='42501';end if;
  if p_op='datev-artifact' then
   result:=public.store_datev_artifact_v907((p_body->>'id')::uuid,actor.id,p_body->>'content',p_body->>'filename');
  end if;
 elsif p_op='rpc' then
  if p_body->>'name' in ('cancel_invoice_auto_v934','cancel_invoice_batch_v908') and not exists(select 1 from public.invoice_batches_v908 where id=(p_body->'args'->>'p_invoice')::uuid and company_id=g.company_id) then raise exception 'Fremde Rechnung.' using errcode='42501';end if;
  case p_body->>'name'
   when 'invoice_number_status_v934' then result:=public.invoice_number_status_v934(g.company_id);
   when 'prepare_invoice_batch_v919' then result:=public.prepare_invoice_batch_v919(g.company_id,p_body->'args'->'p_order_ids',coalesce(p_body->'args'->'p_prices','{}'));
   when 'prepare_invoice_batch_v922' then result:=public.prepare_invoice_batch_v922(g.company_id,p_body->'args'->'p_order_ids',coalesce(p_body->'args'->'p_prices','{}'),coalesce(p_body->'args'->'p_sources','{}'));
   when 'prepare_invoice_fixed_v984' then result:=public.prepare_invoice_fixed_v984(g.company_id,p_body->'args'->'p_order_ids',p_body->'args'->'p_fixed');
   when 'issue_invoice_auto_v934' then result:=to_jsonb(public.issue_invoice_auto_v934((p_body->'args'->>'p_id')::uuid,g.company_id,(p_body->'args'->>'p_issued')::date,p_body->'args'->'p_selection',p_body->'args'->'p_tax',p_body->'args'->'p_parties',coalesce(p_body->'args'->'p_prices','{}'),coalesce(p_body->'args'->'p_sources','{}'),(p_body->'args'->>'p_engine')::integer));
   when 'issue_invoice_fixed_auto_v984' then result:=to_jsonb(public.issue_invoice_fixed_auto_v984((p_body->'args'->>'p_id')::uuid,g.company_id,(p_body->'args'->>'p_issued')::date,p_body->'args'->'p_selection',p_body->'args'->'p_tax',p_body->'args'->'p_parties',p_body->'args'->'p_fixed'));
   when 'issue_invoice_batch_v919' then result:=to_jsonb(public.issue_invoice_batch_v919((p_body->'args'->>'p_id')::uuid,g.company_id,p_body->'args'->>'p_number',(p_body->'args'->>'p_issued')::date,p_body->'args'->'p_selection',p_body->'args'->'p_tax',p_body->'args'->'p_parties',coalesce(p_body->'args'->'p_prices','{}')));
   when 'issue_invoice_batch_v922' then result:=to_jsonb(public.issue_invoice_batch_v922((p_body->'args'->>'p_id')::uuid,g.company_id,p_body->'args'->>'p_number',(p_body->'args'->>'p_issued')::date,p_body->'args'->'p_selection',p_body->'args'->'p_tax',p_body->'args'->'p_parties',coalesce(p_body->'args'->'p_prices','{}'),coalesce(p_body->'args'->'p_sources','{}')));
   when 'issue_invoice_fixed_v984' then result:=to_jsonb(public.issue_invoice_fixed_v984((p_body->'args'->>'p_id')::uuid,g.company_id,p_body->'args'->>'p_number',(p_body->'args'->>'p_issued')::date,p_body->'args'->'p_selection',p_body->'args'->'p_tax',p_body->'args'->'p_parties',p_body->'args'->'p_fixed'));
   when 'cancel_invoice_auto_v934' then result:=to_jsonb(public.cancel_invoice_auto_v934((p_body->'args'->>'p_id')::uuid,(p_body->'args'->>'p_invoice')::uuid,(p_body->'args'->>'p_issued')::date,p_body->'args'->>'p_reason',coalesce((p_body->'args'->>'p_reopen')::boolean,false)));
   when 'cancel_invoice_batch_v908' then result:=to_jsonb(public.cancel_invoice_batch_v908((p_body->'args'->>'p_id')::uuid,(p_body->'args'->>'p_invoice')::uuid,p_body->'args'->>'p_number',(p_body->'args'->>'p_issued')::date,p_body->'args'->>'p_reason',coalesce((p_body->'args'->>'p_reopen')::boolean,false)));
   when 'save_datev_settings_v907' then result:=to_jsonb(public.save_datev_settings_v907(g.company_id,(arg->>'p_revision')::integer,arg->'p_config'));
   when 'save_datev_booking_v907' then result:=to_jsonb(public.save_datev_booking_v907((arg->>'p_id')::uuid,g.company_id,(arg->>'p_revision')::integer,arg->'p_data'));
   when 'create_datev_export_v907' then result:=to_jsonb(public.create_datev_export_v907((arg->>'p_id')::uuid,g.company_id,(arg->>'p_period')::date,arg->'p_selection',(arg->>'p_settings_revision')::integer));
   when 'delete_datev_booking' then
    with removed as (delete from public.datev_bookings_v907 where company_id=g.company_id and id=(arg->>'p_id')::uuid returning id)
    select coalesce(jsonb_agg(to_jsonb(removed)),'[]') into result from removed;
   when 'save_company_legal_info_v900' then
    result:=to_jsonb(public.save_company_legal_info_v900(g.company_id,(arg->>'p_revision')::integer,arg->'p_details'));
   when 'append_company_legal_documents_v900' then
    if jsonb_typeof(arg->'p_documents') is distinct from 'array' or jsonb_array_length(arg->'p_documents')<>1
      or arg->'p_documents'->0->>'kind' is distinct from 'accounting' then
     raise exception 'Nur die Verfahrensdokumentation ist freigegeben.' using errcode='42501';
    end if;
    select coalesce(jsonb_agg(to_jsonb(d)),'[]') into result from public.append_company_legal_documents_v900(g.company_id,(arg->>'p_info_revision')::integer,arg->'p_documents') d;
   else raise exception 'Nicht freigegebene Rechnungsaktion.'  using errcode='42501';
  end case;
  insert into app_private.klarwerk_events_v1007(link_id,company_id,operation,request_id) values(g.id,g.company_id,left(p_body->>'name',100),left(p_body->'args'->>'p_id',50));
 elsif p_op='disconnect' then update app_private.klarwerk_links_v1007 set revoked_at=now() where id=g.id;result:=jsonb_build_object('ok',true);
 else raise exception 'Unbekannte Aktion.';end if;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);return result;
end $function$;

notify pgrst, 'reload schema';
commit;
