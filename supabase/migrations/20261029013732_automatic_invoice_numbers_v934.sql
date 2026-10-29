-- 08: Automatische Rechnungs- und Stornonummern, getrennt je Firma und Jahr.
-- Neuer Nummernkreis RE-JJJJ-000001 bzw. ST-JJJJ-000001.
-- Vorhandene App-Belege werden beruecksichtigt. Externe Nummernbuecher sind der App nicht bekannt.
-- Keine vorhandenen Belege, Arbeitsscheine oder Preise werden bei der Installation veraendert.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
CREATE OR REPLACE FUNCTION public.invoice_number_status_v934(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $body$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(app_private.invoice_manager_v908(p_company),false) THEN
  RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';
 END IF;
 RETURN jsonb_build_object('automatic_invoice_numbers',true,'version',934,'invoice_prefix','RE','cancellation_prefix','ST');
END;$body$;
CREATE OR REPLACE FUNCTION public.issue_invoice_auto_v934(p_id uuid,p_company uuid,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb DEFAULT NULL,p_prices jsonb DEFAULT '{}'::jsonb,p_sources jsonb DEFAULT '{}'::jsonb,p_engine integer DEFAULT 908)
RETURNS public.invoice_batches_v908 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE number_value text;prefix text;counter bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(app_private.invoice_manager_v908(p_company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';END IF;
 IF p_issued IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Rechnungsdatum oder Vorgangskennung fehlt.';END IF;
 prefix:='RE-'||extract(year from p_issued)::integer::text||'-';
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('worktime-invoice:'||p_company::text||':'||prefix,0));
 SELECT invoice_number INTO number_value FROM public.invoice_batches_v908 WHERE id=p_id AND company_id=p_company;
 IF number_value IS NULL THEN
  SELECT coalesce(max(substring(invoice_number from length(prefix)+1)::bigint),0)+1 INTO counter FROM public.invoice_batches_v908 WHERE company_id=p_company AND invoice_number ~ ('^'||prefix||'[0-9]{1,12}$');
  IF counter>999999999999 THEN RAISE EXCEPTION 'Der Nummernkreis ist ausgeschoepft.';END IF;
  number_value:=prefix||lpad(counter::text,greatest(6,length(counter::text)),'0');
 END IF;
 IF p_engine=922 THEN
  RETURN public.issue_invoice_batch_v922(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties,p_prices,p_sources);
 ELSIF p_engine=919 AND coalesce(p_sources,'{}'::jsonb)='{}'::jsonb THEN
  RETURN public.issue_invoice_batch_v919(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties,p_prices);
 ELSIF p_engine=908 AND coalesce(p_prices,'{}'::jsonb)='{}'::jsonb AND coalesce(p_sources,'{}'::jsonb)='{}'::jsonb THEN
  RETURN public.issue_invoice_batch_v908(p_id,p_company,number_value,p_issued,p_selection,p_tax,p_parties);
 ELSE RAISE EXCEPTION 'Unbekannte Rechnungs- oder Preisversion. Nichts gespeichert.';END IF;
END;$body$;
CREATE OR REPLACE FUNCTION public.cancel_invoice_auto_v934(p_id uuid,p_invoice uuid,p_issued date,p_reason text,p_reopen boolean DEFAULT false)
RETURNS public.invoice_cancellations_v908 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE company uuid;number_value text;prefix text;counter bigint;
BEGIN
 SELECT company_id INTO company FROM public.invoice_batches_v908 WHERE id=p_invoice;
 IF auth.uid() IS NULL OR company IS NULL OR NOT coalesce(app_private.invoice_manager_v908(company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Rechnung.' USING errcode='42501';END IF;
 IF p_issued IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Stornodatum oder Vorgangskennung fehlt.';END IF;
 prefix:='ST-'||extract(year from p_issued)::integer::text||'-';
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('worktime-invoice:'||company::text||':'||prefix,0));
 SELECT cancellation_number INTO number_value FROM public.invoice_cancellations_v908 WHERE id=p_id AND company_id=company;
 IF number_value IS NULL THEN
  SELECT coalesce(max(substring(cancellation_number from length(prefix)+1)::bigint),0)+1 INTO counter FROM public.invoice_cancellations_v908 WHERE company_id=company AND cancellation_number ~ ('^'||prefix||'[0-9]{1,12}$');
  IF counter>999999999999 THEN RAISE EXCEPTION 'Der Nummernkreis ist ausgeschoepft.';END IF;
  number_value:=prefix||lpad(counter::text,greatest(6,length(counter::text)),'0');
 END IF;
 RETURN public.cancel_invoice_batch_v908(p_id,p_invoice,number_value,p_issued,p_reason,p_reopen);
END;$body$;
REVOKE ALL ON FUNCTION public.invoice_number_status_v934(uuid),public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer),public.cancel_invoice_auto_v934(uuid,uuid,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invoice_number_status_v934(uuid),public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer),public.cancel_invoice_auto_v934(uuid,uuid,date,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT jsonb_build_object('version',934,'automatic_invoice_numbers_enabled',pg_catalog.to_regprocedure('public.issue_invoice_auto_v934(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb,jsonb,integer)') IS NOT NULL) AS installation;
