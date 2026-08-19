-- Employees must not be able to remove a work-day record that carries
-- either sickness or vacation data. Vacation request decisions already use
-- a chief-only RLS policy; this closes the matching work_days path.
create or replace function app_private.prevent_employee_sick_day_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and not (select app_private.is_chief())
     and (coalesce(old.sick, 0) <> 0 or coalesce(old.vacation, 0) <> 0) then
    raise exception 'Krankheits- und Urlaubstage können nur vom Chef eingetragen oder entfernt werden.';
  end if;

  return old;
end;
$$;

revoke all on function app_private.prevent_employee_sick_day_delete() from public;

drop trigger if exists prevent_employee_sick_day_delete on public.work_days;
create trigger prevent_employee_sick_day_delete
before delete on public.work_days
for each row execute function app_private.prevent_employee_sick_day_delete();

