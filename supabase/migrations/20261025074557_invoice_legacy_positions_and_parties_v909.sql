-- Forward-only invoice compatibility update, AFTER the v909 labor-access repair.
-- Does not write orders, time entries, materials, invoices, Auth, grants or RLS.
-- Historical empty open work orders get preview-only labor lines from recorded
-- hours and the current, explicitly reviewable company/customer hourly prices.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $migration$
declare
 targets regprocedure[]:=array[
  'public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure,
  'app_private.invoice_parties_v908(jsonb)'::regprocedure,
  'public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb)'::regprocedure];
 sources text[];expected text[];original jsonb:='[]';r record;idx integer;
 needle text;replacement text;
begin
 -- Capture security metadata before changing only reviewed source fragments.
 for idx in 1..3 loop
  select p.proowner,p.proacl,p.proconfig,p.prosecdef,pg_get_functiondef(p.oid) as definition
  into r from pg_proc p where p.oid=targets[idx];
  if r.prosecdef or r.proconfig is distinct from array['search_path=""']::text[] then
   raise exception 'Unerwartete Sicherheitskonfiguration. Keine Rechnungskorrektur angewendet.';
  end if;
  original:=original||jsonb_build_array(jsonb_build_object('owner',r.proowner,'acl',to_jsonb(r.proacl),'config',to_jsonb(r.proconfig)));
  sources[idx]:=r.definition;expected[idx]:=r.definition;
 end loop;
 if position('app_private.customer_labor_price_v868(w.customer_id,m.name,m.unit_price)' in sources[1])>0
  or position('from public.customer_hourly_rates r where r.customer_id=w.customer_id' in sources[1])=0 then
  raise exception 'Die zuvor bestätigte v909-Stundensatzkorrektur fehlt. Diese Datei nicht als Ersatz dafür ausführen.';
 end if;
 needle:='  if jsonb_array_length(dayitems)=0 then raise exception ''Ein ausgewählter Arbeitsschein enthält keine abrechenbaren Positionen. Bitte zuerst prüfen.'';end if;';
 replacement:=$fallback$  if jsonb_array_length(dayitems)=0 then
   declare source_periods jsonb;g record;staff public.profiles;labor public.materials;labor_name text;labor_price numeric;labor_line jsonb;
   begin
    source_periods:=case when jsonb_array_length(coalesce(w.team_periods,'[]'))>0 then w.team_periods
      else jsonb_build_array(jsonb_build_object('employee_id',w.employee_id,'executed_hours',w.executed_hours)) end;
    if exists(select 1 from jsonb_array_elements(source_periods)e
      where e->>'employee_id' is null or e->>'executed_hours' is null
        or (e->>'executed_hours')::numeric<0
        or (e->>'executed_hours')::numeric::text in ('NaN','Infinity','-Infinity')) then
     raise exception 'Arbeitszeit des alten Arbeitsscheins ist unvollständig oder ungültig. Bitte zuerst im Arbeitsschein prüfen.';
    end if;
    for g in select (e->>'employee_id')::uuid as employee_id,sum((e->>'executed_hours')::numeric) as hours
      from jsonb_array_elements(source_periods)e group by (e->>'employee_id')::uuid order by (e->>'employee_id')::uuid loop
     if g.hours<=0 then continue;end if;
     select * into staff from public.profiles where id=g.employee_id;
     if staff.id is null or app_private.team_company(staff.id) is distinct from p_company then
      raise exception 'Beteiligter Mitarbeiter des alten Arbeitsscheins ist nicht diesem Betrieb zugeordnet.';
     end if;
     labor_name:=case staff.labor_type when 'meister' then 'Meisterstunde' when 'monteur' then 'Monteurstunde'
       when 'aushilfe' then 'Aushilfsstunde' when 'azubi' then 'Auszubildendenstunde' else null end;
     if labor_name is null then raise exception 'Stundenart des Mitarbeiters zuerst in den Mitarbeiterdaten prüfen.';end if;
     select * into labor from public.materials mat where mat.business_id=p_company
       and lower(btrim(mat.name))=lower(labor_name) and mat.active is distinct from false order by mat.id limit 1;
     if labor.id is null or labor.unit_price is null then
      raise exception 'Für % fehlt eine aktive Stundenposition mit Preis in der Materialliste. Bitte dort prüfen.',labor_name;
     end if;
     labor_price:=coalesce((select case staff.labor_type when 'meister' then rate.meister
       when 'monteur' then rate.monteur when 'azubi' then rate.azubi end
       from public.customer_hourly_rates rate where rate.customer_id=w.customer_id),labor.unit_price);
     if labor_price<0 or labor_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Ungültiger Stundenpreis. Bitte Materialliste prüfen.';end if;
     labor_line:=jsonb_build_object('date',w.work_date,'name',labor_name,'quantity',g.hours,'unit','H','price',labor_price,
       'description',coalesce(w.title,'')||' · Stundenposition aus gespeicherter Arbeitszeit; Einstufung und aktuellen Preis prüfen',
       'execution',coalesce(line_execution,''),'derived_from_work_time',true,'employee_id',staff.id,
       'employee_name',coalesce(nullif(staff.display_name,''),staff.username));
     items:=items||jsonb_build_array(labor_line);dayitems:=dayitems||jsonb_build_array(labor_line);
     snap_items:=snap_items||jsonb_build_array(jsonb_build_object('item',null,'material',to_jsonb(labor),'resolved',labor_line,'derived_from_work_time',true));
     sum_price:=sum_price+g.hours*labor_price;
    end loop;
   end;
  end if;
  if jsonb_array_length(dayitems)=0 then raise exception 'Der alte Arbeitsschein enthält weder Positionen noch positive gespeicherte Arbeitszeit. Bitte zuerst prüfen.';end if;$fallback$;
 if (length(expected[1])-length(replace(expected[1],needle,'')))/length(needle)<>1 then raise exception 'Die erwartete Stelle für alte Arbeitsscheine fehlt. Nicht erneut ausführen.';end if;
 expected[1]:=replace(expected[1],needle,replacement);
 needle:='data:=jsonb_build_object(''kind'',''invoice'',''company'',';
 if (length(expected[1])-length(replace(expected[1],needle,'')))/length(needle)<>1 then raise exception 'Unerwartete Rechnungsstruktur.';end if;
 expected[1]:=replace(expected[1],needle,'data:=jsonb_build_object(''kind'',''invoice'',''invoice_rules_version'',909,''company'',');

 -- The small-invoice option requires an explicit domestic/exclusions statement.
 -- The issue function below independently checks the verified gross/tax data.
 needle:=' foreach key in array array[''issuer'',''customer''] loop';
 replacement:=$parties$ if p_parties ? 'smallAmountConfirmed' and jsonb_typeof(p_parties->'smallAmountConfirmed')<>'boolean' then
  raise exception 'Kleinbetragsbestätigung muss ausdrücklich Ja oder Nein sein.';
 end if;
 foreach key in array array['issuer','customer'] loop$parties$;
 if (length(expected[2])-length(replace(expected[2],needle,'')))/length(needle)<>1 then raise exception 'Unerwartete Parteienprüfung.';end if;
 expected[2]:=replace(expected[2],needle,replacement);
 needle:='if length(btrim(coalesce(p_parties->key->>''taxNumber'','''')))=0 and length(btrim(coalesce(p_parties->key->>''vatId'','''')))=0 then';
 replacement:='if coalesce(p_parties->''smallAmountConfirmed'',''false''::jsonb)<>''true''::jsonb and length(btrim(coalesce(p_parties->key->>''taxNumber'','''')))=0 and length(btrim(coalesce(p_parties->key->>''vatId'','''')))=0 then';
 if (length(expected[2])-length(replace(expected[2],needle,'')))/length(needle)<>1 then raise exception 'Unerwartete Steuerkennungsprüfung.';end if;
 expected[2]:=replace(expected[2],needle,replacement);
 needle:='  checked:=checked||jsonb_build_object(key,party);';
 replacement:=$parties$  if key='issuer' and p_parties->'smallAmountConfirmed'='true'::jsonb then
   party:=party||jsonb_build_object('taxNumber','','vatId','','taxIdentifierOmitted','small_amount_33_ustdv');
  end if;
  checked:=checked||jsonb_build_object(key,party);$parties$;
 if (length(expected[2])-length(replace(expected[2],needle,'')))/length(needle)<>1 then raise exception 'Unerwartete Parteienstruktur.';end if;
 expected[2]:=replace(expected[2],needle,replacement);
 needle:=' perform app_private.invoice_tax_checked_v908(prepared->''document''->''items'',p_tax);';
 replacement:=$issue$ perform app_private.invoice_tax_checked_v908(prepared->'document'->'items',p_tax);
 if parties->'issuer'->>'taxIdentifierOmitted'='small_amount_33_ustdv' then
  if (p_tax->>'gross')::numeric not between 0 and 25000
   or exists(select 1 from jsonb_array_elements(p_tax->'groups')g where g->>'code' not in ('standard','reduced','pv','small')) then
   raise exception 'Die Erleichterung nach § 33 UStDV gilt hier nicht. Steuerkennung erforderlich; bei Sonderfällen fachlich prüfen.';
  end if;
 end if;$issue$;
 if (length(expected[3])-length(replace(expected[3],needle,'')))/length(needle)<>1 then raise exception 'Unerwartete Abschlussprüfung.';end if;
 expected[3]:=replace(expected[3],needle,replacement);
 for idx in 1..3 loop execute expected[idx];end loop;
 for idx in 1..3 loop
  select p.proowner,p.proacl,p.proconfig,p.prosecdef into r from pg_proc p where p.oid=targets[idx];
  if r.prosecdef or original->(idx-1) is distinct from jsonb_build_object('owner',r.proowner,'acl',to_jsonb(r.proacl),'config',to_jsonb(r.proconfig))
    or pg_get_functiondef(targets[idx]) is distinct from expected[idx] then
   raise exception 'Nachprüfung fehlgeschlagen. Die gesamte Änderung wird zurückgerollt.';
  end if;
 end loop;
 if has_function_privilege('authenticated','app_private.customer_labor_price_v868(uuid,text,numeric)','EXECUTE')
  or has_function_privilege('anon','app_private.customer_labor_price_v868(uuid,text,numeric)','EXECUTE') then
  raise exception 'Unerwartete Hilfsfunktionsrechte. Die gesamte Änderung wird zurückgerollt.';
 end if;
end;
$migration$;
commit;
-- Persisted-state result, deliberately AFTER COMMIT. No old business data written.
select jsonb_build_object('version',909,'changed_functions',3,'existing_records_changed',0,
 'legacy_labor_preview_enabled',position('derived_from_work_time' in pg_get_functiondef('public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure))>0,
 'small_invoice_validation_enabled',position('small_amount_33_ustdv' in pg_get_functiondef('public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb)'::regprocedure))>0,
 'security_invoker_preserved',not exists(select 1 from pg_proc where oid=any(array[
   'public.prepare_invoice_batch_v908(uuid,jsonb)'::regprocedure,'app_private.invoice_parties_v908(jsonb)'::regprocedure,
   'public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb)'::regprocedure]) and prosecdef)) as result;
