begin;
do $migration$
declare
  definition text := replace(pg_get_functiondef('public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure), E'\r\n', E'\n');
begin
  if position('period_key uuid; lock_employee uuid;' in definition) = 0
     or position('for lock_employee in select distinct' in definition) = 0
     or position('team_check_day(employee.id,work_day)' in definition) = 0 then
    raise exception 'Unbekannte Version der Arbeitsschein-Funktion';
  end if;
  definition := replace(definition, 'lock_employee uuid;', 'lock_employee uuid; period_day date; lock_day date;');
  definition := regexp_replace(definition, 'for lock_employee in select distinct[^\n]+\n[^\n]+\n  end loop;', $replacement$for lock_employee, lock_day in
    select distinct (value->>'employee_id')::uuid, coalesce((value->>'work_date')::date,work_day)
    from jsonb_array_elements(p_periods) order by 1,2
  loop
    perform pg_advisory_xact_lock(hashtextextended(lock_employee::text||lock_day::text,0));
  end loop;$replacement$);
  definition := replace(definition, 'perform app_private.team_check_day(employee.id,work_day);', $replacement$period_day:=coalesce((period->>'work_date')::date,work_day);
    if not isfinite(period_day) then raise exception 'Ungültiges Datum für den Zeitabschnitt.'; end if;
    perform app_private.team_check_day(employee.id,period_day);$replacement$);
  definition := replace(definition, '    perform pg_advisory_xact_lock(hashtextextended(employee.id::text||work_day::text,0));', '');
  definition := replace(definition, 't.work_date=work_day', 't.work_date=period_day');
  definition := replace(definition, 'and begin_at<(previous', 'and (previous->>''work_date'')::date=period_day and begin_at<(previous');
  definition := replace(definition, '''employee_name'',coalesce', '''work_date'',period_day,''employee_name'',coalesce');
  definition := replace(definition, 'and team_period_key=(period->>''key'')::uuid and work_order_id is null;', 'and team_period_key=(period->>''key'')::uuid and work_order_id is null;');
  definition := replace(definition, 'values((period->>''employee_id'')::uuid,work_day,', 'values((period->>''employee_id'')::uuid,(period->>''work_date'')::date,');
  definition := replace(definition, 'if first_period is null', 'if (first_period->>''work_date'')::date is distinct from work_day and first_period is not null then raise exception ''Der erste Zeitabschnitt muss am Arbeitsscheindatum liegen.''; end if;
  if first_period is null');
  if position('Der erste Zeitabschnitt' in definition) = 0 or position('for lock_employee, lock_day' in definition) = 0 then raise exception 'Datumsänderung konnte nicht angewendet werden'; end if;
  execute definition;
end;
$migration$;

do $migration$
declare definition text := pg_get_functiondef('app_private.klarwerk_work_sheets(text,jsonb)'::regprocedure);
begin
  if position($old$'pause', p.value->'pause_hours'
        ) order by p.ordinality$old$ in definition) = 0 then raise exception 'Unbekannte Version der Klarwerk-Abfrage'; end if;
  execute replace(definition,$old$'pause', p.value->'pause_hours'
        ) order by p.ordinality$old$,$new$'pause', p.value->'pause_hours'
        ) || case when coalesce(p.value->>'work_date',w.work_date::text) <> w.work_date::text
            then jsonb_build_object('work_date',p.value->'work_date') else '{}'::jsonb end order by p.ordinality$new$);
end;
$migration$;

notify pgrst,'reload schema';
commit;

