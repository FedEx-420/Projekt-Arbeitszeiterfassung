-- A fixed price is explicitly net, including direct RPC callers.
begin;
set local lock_timeout='5s';
do $migration$
declare target regprocedure:='public.issue_invoice_fixed_v984(uuid,uuid,text,date,jsonb,jsonb,jsonb,jsonb)'::regprocedure;definition text;needle text;
begin
 select replace(pg_get_functiondef(target),E'\r\n',E'\n') into definition;
 needle:=' perform app_private.invoice_tax_checked_v908(prepared->''document''->''items'',p_tax);';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unerwartete Steuerprüfung der Pauschalrechnung.';end if;
 definition:=replace(definition,needle,$guard$ if p_tax->>'basis' is distinct from 'net' then raise exception 'Der Festpreis ist netto. Bitte die Umsatzsteuer auf Nettobasis bestätigen.';end if;
 perform app_private.invoice_tax_checked_v908(prepared->'document'->'items',p_tax);$guard$);
 execute definition;
end;$migration$;
notify pgrst,'reload schema';
commit;
