-- 09: Empfang von IDS-Warenkoerben. Keine Aenderung vorhandener Artikel oder Belege.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated,service_role;
CREATE TABLE IF NOT EXISTS app_private.ids_cart_jobs_v938(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.profiles(id),
 owner_id uuid NOT NULL REFERENCES public.profiles(id),
 supplier text NOT NULL CHECK(length(supplier) BETWEEN 1 AND 120),
 token_hash bytea NOT NULL CHECK(octet_length(token_hash)=32),
 positions jsonb NOT NULL CHECK(jsonb_typeof(positions)='array' AND jsonb_array_length(positions) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 received_at timestamptz,
 response_xml text CHECK(octet_length(response_xml)<=1048576)
);
CREATE INDEX IF NOT EXISTS ids_cart_owner_company_v938 ON app_private.ids_cart_jobs_v938(owner_id,company_id,created_at DESC);
ALTER TABLE app_private.ids_cart_jobs_v938 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.ids_cart_jobs_v938 FROM PUBLIC,anon,authenticated,service_role;
-- Only narrowly scoped functions can access the transient exchange records.
CREATE OR REPLACE FUNCTION app_private.ids_manager_v938(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (p.role='administrator' OR (p.role='business' AND p.id=p_company)))
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_company AND p.role='business');
$$;
CREATE OR REPLACE FUNCTION public.ids_status_v938(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT coalesce(app_private.ids_manager_v938(p_company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';END IF;
 RETURN jsonb_build_object('version',938,'available',true);
END;$$;
-- The private definer helpers are necessary because the job table is never exposed to API roles.
CREATE OR REPLACE FUNCTION app_private.ids_create_cart_v938(p_company uuid,p_supplier text,p_positions jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved app_private.ids_cart_jobs_v938;secret text;item jsonb;
BEGIN
 IF NOT coalesce(app_private.ids_manager_v938(p_company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';END IF;
 IF p_supplier IS NULL OR length(trim(p_supplier)) NOT BETWEEN 1 AND 120 OR p_positions IS NULL OR jsonb_typeof(p_positions)<>'array' OR jsonb_array_length(p_positions) NOT BETWEEN 1 AND 1000 OR octet_length(p_positions::text)>1048576 THEN RAISE EXCEPTION 'Ungueltige Artikelauswahl.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_positions) LOOP
  IF length(coalesce(item->>'sku','')) NOT BETWEEN 1 AND 15 OR coalesce(item->>'ref','')='' OR length(item->>'ref')>35 OR coalesce(item->>'quantity','') !~ '^[0-9]{1,6}([.][0-9]{1,2})?$' OR (item->>'quantity')::numeric<=0 OR coalesce(item->>'qu','') NOT IN ('PCE','MTR','KGM','PR','SET','LTR','MTK','MTQ','CMT','MMT','GRM','KTM') THEN RAISE EXCEPTION 'Artikelnummer, Menge oder Einheit ist nicht gueltig.';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.materials m WHERE m.id=(item->>'material_id')::uuid AND m.business_id=p_company AND m.active IS DISTINCT FROM false AND trim(coalesce(m.catalog_supplier,''))=trim(p_supplier)) THEN RAISE EXCEPTION 'Die Auswahl enthaelt einen fremden, inaktiven oder nicht zugeordneten Artikel.';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'ref') FROM jsonb_array_elements(p_positions))<>jsonb_array_length(p_positions) THEN RAISE EXCEPTION 'Positionsreferenz ist doppelt.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ids-cart:'||auth.uid()::text,0));
 DELETE FROM app_private.ids_cart_jobs_v938 WHERE owner_id=auth.uid() AND expires_at<now()-interval '1 day';
 IF (SELECT count(*) FROM app_private.ids_cart_jobs_v938 WHERE owner_id=auth.uid() AND expires_at>now() AND received_at IS NULL)>=20 THEN RAISE EXCEPTION 'Zu viele offene Warenkorbuebergaben. Bitte vorhandene Vorgaenge pruefen oder deren Ablauf abwarten.';END IF;
 secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO app_private.ids_cart_jobs_v938(company_id,owner_id,supplier,token_hash,positions)
 VALUES(p_company,auth.uid(),trim(p_supplier),sha256(convert_to(secret,'UTF8')),p_positions) RETURNING * INTO saved;
 RETURN jsonb_build_object('id',saved.id,'token',secret,'expires_at',saved.expires_at,'version',938);
END;$$;
CREATE OR REPLACE FUNCTION public.ids_create_cart_v938(p_company uuid,p_supplier text,p_positions jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT app_private.ids_create_cart_v938(p_company,p_supplier,p_positions);$$;
CREATE OR REPLACE FUNCTION app_private.ids_read_cart_v938(p_company uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE saved app_private.ids_cart_jobs_v938;
BEGIN
 IF NOT coalesce(app_private.ids_manager_v938(p_company),false) THEN RAISE EXCEPTION 'Keine Berechtigung fuer diese Firma.' USING errcode='42501';END IF;
 SELECT * INTO saved FROM app_private.ids_cart_jobs_v938 WHERE id=p_id AND owner_id=auth.uid() AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dieser Rueckgabevorgang gehoert nicht zu deinem Konto und dieser Firma.' USING errcode='42501';END IF;
 RETURN jsonb_build_object('id',saved.id,'company_id',saved.company_id,'supplier',saved.supplier,'positions',saved.positions,'received_at',saved.received_at,'expires_at',saved.expires_at,'xml',saved.response_xml);
END;$$;
CREATE OR REPLACE FUNCTION public.ids_read_cart_v938(p_company uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT app_private.ids_read_cart_v938(p_company,p_id);$$;
CREATE OR REPLACE FUNCTION app_private.ids_complete_cart_v938(p_id uuid,p_token text,p_xml text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved_id uuid;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR p_xml IS NULL OR octet_length(p_xml) NOT BETWEEN 1 AND 1048576 OR p_xml ~* '<!(DOCTYPE|ENTITY)' THEN RAISE EXCEPTION 'Ungueltige Rueckmeldung.';END IF;
 UPDATE app_private.ids_cart_jobs_v938 SET response_xml=p_xml,received_at=clock_timestamp()
 WHERE id=p_id AND token_hash=sha256(convert_to(p_token,'UTF8')) AND expires_at>now() AND received_at IS NULL RETURNING id INTO saved_id;
 IF saved_id IS NULL THEN RAISE EXCEPTION 'Rueckgabevorgang ungueltig, abgelaufen oder bereits verwendet.';END IF;
 RETURN jsonb_build_object('id',saved_id,'received',true);
END;$$;
CREATE OR REPLACE FUNCTION public.ids_complete_cart_v938(p_id uuid,p_token text,p_xml text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT app_private.ids_complete_cart_v938(p_id,p_token,p_xml);$$;
CREATE OR REPLACE FUNCTION public.ids_receiver_status_v938() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT jsonb_build_object('version',938,'available',true);$$;
REVOKE ALL ON FUNCTION app_private.ids_manager_v938(uuid),public.ids_status_v938(uuid),app_private.ids_create_cart_v938(uuid,text,jsonb),public.ids_create_cart_v938(uuid,text,jsonb),app_private.ids_read_cart_v938(uuid,uuid),public.ids_read_cart_v938(uuid,uuid),app_private.ids_complete_cart_v938(uuid,text,text),public.ids_complete_cart_v938(uuid,text,text),public.ids_receiver_status_v938() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.ids_manager_v938(uuid),public.ids_status_v938(uuid),app_private.ids_create_cart_v938(uuid,text,jsonb),public.ids_create_cart_v938(uuid,text,jsonb),app_private.ids_read_cart_v938(uuid,uuid),public.ids_read_cart_v938(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.ids_complete_cart_v938(uuid,text,text),public.ids_complete_cart_v938(uuid,text,text),public.ids_receiver_status_v938() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT 'IDS-Warenkorbrueckgabe vorbereitet. Zusaetzlich Edge Function ids-cart-return-v938 veroeffentlichen.' AS ergebnis;
