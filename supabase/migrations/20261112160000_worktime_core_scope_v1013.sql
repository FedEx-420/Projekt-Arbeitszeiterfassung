-- Limit the worktime connection to operational records and the Klarwerk-owned finance register.
begin;
create or replace function app_private.klarwerk_dispatch_v1007(p_hash text,p_op text,p_body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select jsonb_build_object('link_id',g.id,'company',jsonb_build_object('id',p.id,'name',coalesce(p.company_name,p.username),'company_logo_path',p.company_logo_path),'legal',coalesce(l.details,'{}')) into result from public.profiles p left join public.company_legal_info_v900 l on l.company_id=p.id where p.id=g.company_id;
 elsif p_op='list' then
  case p_body->>'entity'
   when 'orders' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select g.company_id as company_id,w.id,w.work_date,w.customer_id,w.customer_name,w.title,w.documentation,w.start_time,w.end_time,w.executed_hours,w.updated_at,w.employee_id from public.work_orders w where app_private.team_company(w.employee_id)=g.company_id and not w.invoiced and coalesce(w.work_kind,'customer')='customer' order by w.id limit 250 offset off) q;
   when 'customers' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select g.company_id as company_id,c.id,c.name,
     (select coalesce(jsonb_object_agg(f.key,f.value),'{}') from jsonb_each(coalesce(c.custom_fields,'{}')) f
      where f.key in ('first_name','street','house_no','postal_code','city','address','email','phone_private','phone_mobile')) as custom_fields,c.updated_at from public.customers c where app_private.team_company(c.employee_id)=g.company_id order by c.id limit 250 offset off)q;
   when 'invoices' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_batches_v908 where company_id=g.company_id order by id limit 250 offset off)q;
   when 'cancellations' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_cancellations_v908 where company_id=g.company_id order by id limit 250 offset off)q;
   when 'links' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_order_links_v908 where company_id=g.company_id order by order_id limit 250 offset off)q;
   when 'datev-settings' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.company_datev_settings_v907 where company_id=g.company_id order by company_id limit 250 offset off) q;
   when 'datev-bookings' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.datev_bookings_v907 where company_id=g.company_id order by id limit 250 offset off) q;
   when 'datev-exports' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.datev_exports_v907 where company_id=g.company_id order by id limit 250 offset off) q;
   when 'datev-artifacts' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.datev_export_artifacts_v907 where company_id=g.company_id order by export_id limit 250 offset off) q;
   when 'legal-info' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.company_legal_info_v900 where company_id=g.company_id order by company_id limit 250 offset off) q;
   when 'legal-accounting' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.company_legal_documents_v900 where company_id=g.company_id and kind='accounting' order by version limit 250 offset off) q;
   else raise exception 'Unbekannte Datenart.';
  end case;
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
end $$;

do $$
declare fn regprocedure;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'issue_invoice_batch_v908','issue_invoice_batch_v919','issue_invoice_batch_v922',
    'issue_invoice_auto_v934','issue_invoice_fixed_auto_v984','issue_invoice_fixed_v984',
    'cancel_invoice_auto_v934','cancel_invoice_batch_v908','prepare_invoice_batch_v908',
    'prepare_invoice_batch_v919','prepare_invoice_batch_v922','prepare_invoice_fixed_v984',
    'save_datev_settings_v907','save_datev_booking_v907','create_datev_export_v907'
  )
 loop execute format('revoke execute on function %s from public, anon, authenticated',fn); end loop;
end $$;
revoke all on public.invoice_batches_v908, public.invoice_order_links_v908, public.invoice_cancellations_v908,
 public.company_datev_settings_v907, public.datev_bookings_v907, public.datev_exports_v907, public.datev_export_artifacts_v907
 from public, anon, authenticated;
select cron.alter_job(jobid, active := false) from cron.job where jobname='klarwerk-supplier-portals' and active;
notify pgrst,'reload schema';
commit;
