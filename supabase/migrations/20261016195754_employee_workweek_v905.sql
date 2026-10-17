-- Additive employee schedules. No profiles, orders, times or historical requests are rewritten.
begin;
create table public.employee_workweeks_v905 (
 employee_id uuid not null references public.profiles(id) on delete cascade,
 effective_from date not null,
 weekdays integer[] not null,
 updated_at timestamptz not null default now(),
 primary key(employee_id,effective_from),
 constraint weekdays_valid check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7])
);
alter table public.employee_workweeks_v905 enable row level security;
revoke all on public.employee_workweeks_v905 from public,anon,authenticated;
grant select,insert,update,delete on public.employee_workweeks_v905 to authenticated;
grant all on public.employee_workweeks_v905 to service_role;
create policy workweeks_read on public.employee_workweeks_v905 for select to authenticated using (
 app_private.can_access_profile(employee_id)
);
-- Only the responsible business account changes the schedule; even an administrator sees it read-only.
create policy workweeks_business_write on public.employee_workweeks_v905 for all to authenticated using (
 exists(select 1 from public.profiles actor join public.profiles target on target.id=employee_id where actor.id=(select auth.uid()) and actor.role='business' and target.role='employee' and target.business_id=actor.id)
) with check (
 exists(select 1 from public.profiles actor join public.profiles target on target.id=employee_id where actor.id=(select auth.uid()) and actor.role='business' and target.role='employee' and target.business_id=actor.id)
);
create function app_private.workday_v905(p_employee uuid,p_day date) returns boolean language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 select extract(isodow from p_day)::int=any(coalesce((select w.weekdays from public.employee_workweeks_v905 w where w.employee_id=p_employee and w.effective_from<=p_day order by w.effective_from desc limit 1),array[1,2,3,4,5]));
$$;
revoke all on function app_private.workday_v905(uuid,date) from public,anon;
grant execute on function app_private.workday_v905(uuid,date) to authenticated,service_role;
create function app_private.vacation_dates_v905(p_employee uuid,p_start date,p_end date) returns table(day date) language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 select d::date from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d
 where app_private.workday_v905(p_employee,d::date) and not app_private.team_holiday(d::date)
 and not exists(select 1 from public.work_days s where s.employee_id=p_employee and s.work_date=d::date and s.sick>0);
$$;
revoke all on function app_private.vacation_dates_v905(uuid,date,date) from public,anon;
grant execute on function app_private.vacation_dates_v905(uuid,date,date) to authenticated,service_role;
create function public.vacation_summary_v905(p_employee uuid,p_start date,p_end date) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare days integer; used numeric; allowance numeric; y integer;
begin
 if auth.uid() is null or not app_private.can_access_profile(p_employee) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>3660 then raise exception 'Ungültiger Urlaubszeitraum (maximal zehn Jahre).'; end if;
 select count(*) into days from app_private.vacation_dates_v905(p_employee,p_start,p_end);
 y:=extract(year from p_start);
 select coalesce(sum(coalesce((select least(1,s.vacation) from public.work_days s where s.employee_id=p_employee and s.work_date=b.date and s.vacation>0),credit)),0) into used from (
  select date, max(credit) credit from (
   select d.day as date,1::numeric credit from public.vacation_requests v cross join lateral app_private.vacation_dates_v905(p_employee,greatest(v.start_date,make_date(y,1,1)),least(v.end_date,make_date(y,12,31))) d where v.employee_id=p_employee and v.status='approved' and v.end_date>=make_date(y,1,1) and v.start_date<=make_date(y,12,31)
   union all
   select s.work_date,least(1,s.vacation) from public.work_days s where s.employee_id=p_employee and s.work_date between make_date(y,1,1) and make_date(y,12,31) and s.vacation>0 and coalesce(s.sick,0)=0 and app_private.workday_v905(p_employee,s.work_date) and not app_private.team_holiday(s.work_date)
  ) a group by date
 ) b;
 select vacation_allowance into allowance from public.profiles where id=p_employee;
 return jsonb_build_object('requested_days',days,'year',y,'used',used,'remaining',greatest(0,coalesce(allowance,0)-used));
end; $$;
revoke all on function public.vacation_summary_v905(uuid,date,date) from public,anon;
grant execute on function public.vacation_summary_v905(uuid,date,date) to authenticated;
-- New requests have a trustworthy count even if an old frontend supplies a weekday-only estimate.
create function app_private.count_vacation_v905() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.end_date<new.start_date or new.end_date-new.start_date>3660 then raise exception 'Ungültiger Urlaubszeitraum.'; end if;
 select count(*) into new.requested_days from app_private.vacation_dates_v905(new.employee_id,new.start_date,new.end_date);
 return new;
end; $$;
revoke all on function app_private.count_vacation_v905() from public,anon,authenticated;
-- This existing helper is pure calendar arithmetic, not a privileged data lookup.
grant execute on function app_private.team_holiday(date) to authenticated,service_role;
create trigger count_vacation_v905 before insert or update of employee_id,start_date,end_date,status on public.vacation_requests for each row execute function app_private.count_vacation_v905();
create trigger planning_sync_v867 after insert or update or delete on public.employee_workweeks_v905 for each row execute function app_private.bump_planning_sync_v867();
-- A continuous vacation request does not block an employee's unscheduled weekend.
create or replace function app_private.team_check_day(p_employee uuid,p_day date) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if app_private.team_holiday(p_day) then raise exception 'An NRW-Feiertagen kann keine Arbeitszeit gebucht werden.'; end if;
 if exists(select 1 from public.work_days where employee_id=p_employee and work_date=p_day and sick>0) then raise exception 'Ein beteiligter Mitarbeiter ist an diesem Tag krank gemeldet.'; end if;
 if app_private.workday_v905(p_employee,p_day) and exists(select 1 from public.vacation_requests where employee_id=p_employee and status='approved' and p_day between start_date and end_date) then raise exception 'Ein beteiligter Mitarbeiter hat an diesem Tag genehmigten Urlaub.'; end if;
end; $$;
create or replace function app_private.prevent_work_on_sick_day() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,app_private,pg_temp as $$
begin
 if app_private.team_holiday(new.work_date) then raise exception 'An NRW-Feiertagen können keine Arbeitszeiten oder Arbeitsscheine angelegt werden.'; end if;
 if exists(select 1 from public.work_days d where d.employee_id=new.employee_id and d.work_date=new.work_date and coalesce(d.sick,0)>0) then raise exception 'Für einen Krankheitstag können keine Arbeitszeiten oder Arbeitsscheine angelegt werden.'; end if;
 if app_private.workday_v905(new.employee_id,new.work_date) and exists(select 1 from public.vacation_requests v where v.employee_id=new.employee_id and v.status='approved' and new.work_date between v.start_date and v.end_date) then raise exception 'Für einen genehmigten Urlaubstag können keine Arbeitszeiten oder Arbeitsscheine angelegt werden.'; end if;
 return new;
end; $$;
notify pgrst,'reload schema';
commit;
