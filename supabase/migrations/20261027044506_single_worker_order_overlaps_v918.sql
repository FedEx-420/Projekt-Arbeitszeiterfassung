-- Only the cross-order time collision gate changes. No records or privileges change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $migration$
declare target regprocedure:='public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure;
 definition text;prior record;after_change record;
 old_block text:=$old$    if exists(select 1 from public.time_entries t where t.employee_id=employee.id and t.work_date=work_day
      and t.team_work_order_id is distinct from order_id and t.work_order_id is distinct from order_id
      and t.start_time<end_at and begin_at<t.end_time
      -- An exact existing manual record is linked below, not booked twice.
      and not (t.work_order_id is null and t.team_work_order_id is null and t.customer_id=customer.id and t.start_time=begin_at and t.end_time=end_at and t.pause_hours=pause)) then
      raise exception 'Für einen Mitarbeiter ist in diesem Zeitraum bereits andere Arbeitszeit erfasst.';
    end if;
$old$;
 new_block text:=$new$    if (select count(distinct value->>'employee_id') from jsonb_array_elements(p_periods))>1 and exists(select 1 from public.time_entries t where t.employee_id=employee.id and t.work_date=work_day
      and t.team_work_order_id is distinct from order_id and t.work_order_id is distinct from order_id
      and t.start_time<end_at and begin_at<t.end_time
      -- An exact existing manual record is linked below, not booked twice.
      and not (t.work_order_id is null and t.team_work_order_id is null and t.customer_id=customer.id and t.start_time=begin_at and t.end_time=end_at and t.pause_hours=pause)) then
      raise exception 'Für einen Mitarbeiter ist in diesem Zeitraum bereits andere Arbeitszeit erfasst.';
    end if;
$new$;
begin
 select proowner,proacl,prosecdef,proconfig into prior from pg_proc where oid=target;
 if not prior.prosecdef or not ('search_path=pg_catalog, public, pg_temp'=any(prior.proconfig)) then
  raise exception 'Unbekannte Sicherheitskonfiguration. Änderung nicht angewendet.';
 end if;
 definition:=replace(pg_get_functiondef(target),E'\r\n',E'\n');
 if position(new_block in definition)>0 then return;end if;
 if (length(definition)-length(replace(definition,old_block,'')))/length(old_block)<>1
 or position('perform app_private.team_check_day(employee.id,work_day)' in definition)=0
 or position('app_private.team_order_access(order_id)' in definition)=0
 or position('Ein abgerechneter Arbeitsschein kann nicht verändert werden.' in definition)=0 then
  raise exception 'Unbekannte Arbeitsschein-Funktion. Änderung nicht angewendet.';
 end if;
 execute replace(definition,old_block,new_block);
 select proowner,proacl,prosecdef,proconfig into after_change from pg_proc where oid=target;
 if prior is distinct from after_change then raise exception 'Sicherheitsmetadaten wurden verändert. Änderung zurückgenommen.';end if;
end;
$migration$;
notify pgrst,'reload schema';
commit;
select jsonb_build_object('version',918,'single_worker_overlap_enabled',
 position($check$if (select count(distinct value->>'employee_id') from jsonb_array_elements(p_periods))>1 and exists($check$
 in pg_get_functiondef('public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure))>0) as installation;
