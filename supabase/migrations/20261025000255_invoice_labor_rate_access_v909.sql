-- v909: the invoice preview runs as the authenticated caller. The v868
-- labor-price helper is deliberately trigger-only; do not grant it to clients
-- or turn the preview into SECURITY DEFINER to resolve the access error.
-- Read the same three customer overrides under their existing SELECT RLS.
-- No invoice, work order, time entry, price snapshot, policy or ACL is rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

do $migration$
declare
 target regprocedure:=to_regprocedure('public.prepare_invoice_batch_v908(uuid,jsonb)');
 helper regprocedure:=to_regprocedure('app_private.customer_labor_price_v868(uuid,text,numeric)');
 source text;
 expected text;
 old_call constant text:='app_private.customer_labor_price_v868(w.customer_id,m.name,m.unit_price)';
 replacement constant text:=$replacement$coalesce((select case lower(btrim(m.name))
          when 'meisterstunde' then r.meister
          when 'monteurstunde' then r.monteur
          when 'auszubildendenstunde' then r.azubi
        end from public.customer_hourly_rates r where r.customer_id=w.customer_id),m.unit_price)$replacement$;
 original_owner oid;
 original_acl aclitem[];
 original_config text[];
 helper_before jsonb;
begin
 if target is null or helper is null or to_regclass('public.customer_hourly_rates') is null then
  raise exception 'Rechnungsgrundlage fehlt. v909 wurde nicht angewendet.';
 end if;
 select p.proowner,p.proacl,p.proconfig,pg_get_functiondef(p.oid)
 into original_owner,original_acl,original_config,source from pg_proc p where p.oid=target;
 if exists(select 1 from pg_proc p where p.oid=target and (p.prosecdef or p.prolang<>(select oid from pg_language where lanname='plpgsql')))
   or original_config is distinct from array['search_path=""']::text[] then
  raise exception 'Unerwartete Sicherheitskonfiguration der Rechnungsvorbereitung. Keine Änderung vorgenommen.';
 end if;
 if not exists(select 1 from pg_class c where c.oid='public.customer_hourly_rates'::regclass and c.relrowsecurity)
   or not has_table_privilege('authenticated','public.customer_hourly_rates','SELECT')
   or has_function_privilege('authenticated',helper,'EXECUTE')
   or has_function_privilege('anon',helper,'EXECUTE') then
  raise exception 'Kundensatz-RLS oder Hilfsfunktionsrechte entsprechen nicht der geprüften Grundlage. Keine Änderung vorgenommen.';
 end if;
 if (length(source)-length(replace(source,old_call,'')))/length(old_call)<>1 then
  raise exception 'Die erwartete Rechnungsstelle wurde nicht genau einmal gefunden. Keine Änderung vorgenommen.';
 end if;
 select jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig))
 into helper_before from pg_proc p where p.oid=helper;
 expected:=replace(source,old_call,replacement);
 execute expected;
 if pg_get_functiondef(target) is distinct from expected
   or exists(select 1 from pg_proc p where p.oid=target and (p.prosecdef or p.proowner is distinct from original_owner
      or p.proacl is distinct from original_acl or p.proconfig is distinct from original_config))
   or helper_before is distinct from (select jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig)) from pg_proc p where p.oid=helper)
   or has_function_privilege('authenticated',helper,'EXECUTE')
   or has_function_privilege('anon',helper,'EXECUTE') then
  raise exception 'Nachprüfung fehlgeschlagen. Die gesamte v909-Änderung wird zurückgerollt.';
 end if;
end;
$migration$;

commit;
-- This result is deliberately read AFTER COMMIT: it reports persisted state.
select jsonb_build_object('version',909,
 'invoice_preview_repaired',position('app_private.customer_labor_price_v868(w.customer_id,m.name,m.unit_price)' in pg_get_functiondef('public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure))=0
   and position('from public.customer_hourly_rates r where r.customer_id=w.customer_id' in pg_get_functiondef('public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure))>0,
 'changed_functions',1,
 'security_invoker_preserved',not (select prosecdef from pg_proc where oid='public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure),
 'trigger_only_helper_still_restricted',not has_function_privilege('authenticated','app_private.customer_labor_price_v868(uuid,text,numeric)','EXECUTE')
   and not has_function_privilege('anon','app_private.customer_labor_price_v868(uuid,text,numeric)','EXECUTE'),
 'existing_records_changed',0) as result;
