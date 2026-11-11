-- Separate per-connection authorization for existing and new offer access.
begin;
set local lock_timeout='5s';
alter table app_private.klarwerk_links_v1007
  add column offers_allowed boolean not null default false;

create or replace function app_private.klarwerk_manage_v1007(p_actor uuid,p_company uuid,p_op text,p_body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; result jsonb;rid uuid;path text;begin
 select * into actor from public.profiles where id=p_actor;
 if actor.id is null or not exists(select 1 from auth.users where id=p_actor and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'Anmeldung nicht mehr gültig.' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_company and role='business') then raise exception 'Geschäftskonto nicht gefunden.' using errcode='42501';end if;
 if p_op in ('receipt-create','receipt-complete') then
  if actor.role<>'administrator' and app_private.team_company(p_actor) is distinct from p_company then raise exception 'Kein Zugriff auf diesen Betrieb.' using errcode='42501';end if;
  if p_op='receipt-create' then
   rid:=(p_body->>'id')::uuid;path:=p_company::text||'/'||rid::text||'/original.'||(p_body->>'extension');
   if coalesce(p_body->>'extension','') not in ('pdf','xml','png','jpg','webp') or coalesce(p_body->>'mime','') not in ('application/pdf','application/xml','text/xml','image/png','image/jpeg','image/webp') or length(btrim(coalesce(p_body->>'supplier',''))) not between 1 and 150 or length(coalesce(p_body->>'name','')) not between 1 and 250 then raise exception 'Ungültiger Einkaufsbeleg.';end if;
   insert into public.purchase_receipts_v1007(id,company_id,employee_id,supplier,invoice_number,invoice_date,file_name,mime_type,file_path) values(rid,p_company,p_actor,btrim(p_body->>'supplier'),left(p_body->>'number',100),(p_body->>'date')::date,p_body->>'name',p_body->>'mime',path);
   return jsonb_build_object('id',rid,'path',path);
  else
   select r.id,r.file_path into rid,path from public.purchase_receipts_v1007 r where r.id=(p_body->>'id')::uuid and r.company_id=p_company and r.employee_id=p_actor;
   if rid is null or not exists(select 1 from storage.objects where bucket_id='purchase-receipts-v1007' and name=path) then raise exception 'Originaldatei wurde noch nicht bestätigt.';end if;
   update public.purchase_receipts_v1007 set status='ready' where id=rid;return jsonb_build_object('ok',true);
  end if;
 end if;
 if actor.role<>'administrator' and not(actor.role='business' and actor.id=p_company) then raise exception 'Nur Geschäftsleitung oder Administration darf verknüpfen.' using errcode='42501';end if;
 if p_op='offer-scope' then
  if jsonb_typeof(p_body->'enabled') is distinct from 'boolean' then
   raise exception 'Ungültige Angebotsfreigabe.' using errcode='22023';
  end if;
  update app_private.klarwerk_links_v1007
  set offers_allowed=(p_body->>'enabled')::boolean
  where id=(p_body->>'id')::uuid and company_id=p_company
    and claimed_at is not null and revoked_at is null
  returning id into rid;
  if rid is null then raise exception 'Verbindung nicht gefunden.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'offers_allowed',(p_body->>'enabled')::boolean);
 elsif p_op='pair' then
  if coalesce(p_body->>'pair_hash','')!~'^[a-f0-9]{64}$' then raise exception 'Ungültiger Code.';end if;
  insert into app_private.klarwerk_links_v1007(company_id,created_by,label,pair_hash,pair_expires,offers_allowed) values(p_company,p_actor,left(coalesce(nullif(btrim(p_body->>'label'),''),'Klarwerk'),80),p_body->>'pair_hash',now()+interval '10 minutes',coalesce(p_body->'offers_allowed'='true'::jsonb,false)) returning id into rid;
  return jsonb_build_object('id',rid,'expires',now()+interval '10 minutes');
 elsif p_op='links' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'claimed_at',claimed_at,'revoked_at',revoked_at,'account_label',account_label,'pair_expires',pair_expires,'offers_allowed',offers_allowed) order by created_at desc),'[]') into result from app_private.klarwerk_links_v1007 where company_id=p_company;return result;
 elsif p_op='revoke' then
  update app_private.klarwerk_links_v1007 set revoked_at=now(),pair_hash=null where id=(p_body->>'id')::uuid and company_id=p_company;
  return jsonb_build_object('ok',true);
 end if;raise exception 'Unbekannte Aktion.';
end $$;
create or replace function app_private.klarwerk_dispatch_v1007(p_hash text,p_op text,p_body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g app_private.klarwerk_links_v1007;actor public.profiles;result jsonb;old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);off integer:=greatest(0,least(coalesce((p_body->>'offset')::integer,0),100000));begin
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
  select jsonb_build_object('link_id',g.id,'offers_allowed',g.offers_allowed,'company',jsonb_build_object('id',p.id,'name',coalesce(p.company_name,p.username),'company_logo_path',p.company_logo_path),'legal',coalesce(l.details,'{}')) into result from public.profiles p left join public.company_legal_info_v900 l on l.company_id=p.id where p.id=g.company_id;
 elsif p_op='list' then
  case p_body->>'entity'
   when 'orders' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select w.id,w.work_date,w.customer_id,w.customer_name,w.title,w.documentation,w.start_time,w.end_time,w.executed_hours,w.updated_at,w.employee_id from public.work_orders w where app_private.team_company(w.employee_id)=g.company_id and not w.invoiced and coalesce(w.work_kind,'customer')='customer' order by w.id limit 250 offset off) q;
   when 'customers' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select c.id,c.name,c.custom_fields,c.updated_at from public.customers c where app_private.team_company(c.employee_id)=g.company_id order by c.id limit 250 offset off)q;
   when 'invoices' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_batches_v908 where company_id=g.company_id order by id limit 250 offset off)q;
   when 'cancellations' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_cancellations_v908 where company_id=g.company_id order by id limit 250 offset off)q;
   when 'links' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.invoice_order_links_v908 where company_id=g.company_id order by order_id limit 250 offset off)q;
   when 'receipts' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select r.id,r.company_id,r.employee_id,r.supplier,r.invoice_number,r.invoice_date,r.file_name,r.mime_type,r.created_at,coalesce(p.display_name,p.username) uploader from public.purchase_receipts_v1007 r join public.profiles p on p.id=r.employee_id where r.company_id=g.company_id and r.status='ready' order by r.id limit 250 offset off)q;
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
   else raise exception 'Unbekannte Datenart.';
  end case;
 elsif p_op='receipt-file' then
  select jsonb_build_object('path',file_path,'name',file_name,'mime',mime_type) into result from public.purchase_receipts_v1007 where id=(p_body->>'id')::uuid and company_id=g.company_id and status='ready';if result is null then raise exception 'Beleg nicht gefunden.' using errcode='42501';end if;
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
   else raise exception 'Nicht freigegebene Rechnungsaktion.' using errcode='42501';
  end case;
  insert into app_private.klarwerk_events_v1007(link_id,company_id,operation,request_id) values(g.id,g.company_id,left(p_body->>'name',100),left(p_body->'args'->>'p_id',50));
 elsif p_op='disconnect' then update app_private.klarwerk_links_v1007 set revoked_at=now() where id=g.id;result:=jsonb_build_object('ok',true);
 else raise exception 'Unbekannte Aktion.';end if;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);return result;
end $$;
notify pgrst,'reload schema';
commit;
