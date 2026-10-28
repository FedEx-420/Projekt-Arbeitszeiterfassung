-- 07: Standardverkaufspreise ohne Verlust von Nachkommastellen speichern.
-- Einmal im Supabase SQL Editor ausfuehren. Keine Artikel werden geloescht.
-- EK, VK*, VK**, Rechnungen, Arbeitsscheine und Zugriffsrechte bleiben erhalten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
DO $repair$
DECLARE col record;
BEGIN
 SELECT a.atttypid,a.atttypmod INTO col
 FROM pg_catalog.pg_attribute a
 WHERE a.attrelid='public.materials'::pg_catalog.regclass
   AND a.attname='unit_price' AND NOT a.attisdropped;
 IF NOT FOUND OR col.atttypid <> 'pg_catalog.numeric'::pg_catalog.regtype THEN
  RAISE EXCEPTION 'Standardpreis hat einen unbekannten Datentyp. Keine Aenderung ausgefuehrt; bitte Codex die Ausgabe zeigen.';
 END IF;
 -- Unbegrenztes NUMERIC bewahrt vorhandene Zahlen exakt und vermeidet
 -- erzwungene Cent-Rundung bei Katalogpreisen je 10/100/1000 Einheiten.
 IF col.atttypmod <> -1 THEN
  ALTER TABLE public.materials ALTER COLUMN unit_price TYPE numeric USING unit_price::numeric;
 END IF;
END;
$repair$;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT pg_catalog.jsonb_build_object(
 'reparatur', 'Katalog-Standardverkaufspreis',
 'standardpreis_ohne_zwangsrundung', a.atttypid='pg_catalog.numeric'::pg_catalog.regtype AND a.atttypmod=-1,
 'gespeicherter_datentyp', pg_catalog.format_type(a.atttypid,a.atttypmod)
) AS pruefergebnis
FROM pg_catalog.pg_attribute a
WHERE a.attrelid='public.materials'::pg_catalog.regclass
 AND a.attname='unit_price' AND NOT a.attisdropped;
