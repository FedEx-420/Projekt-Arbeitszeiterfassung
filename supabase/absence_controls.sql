-- Vacation and sickness values can be managed only by a chief account.
create or replace function app_private.prevent_employee_vacation_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_vacation numeric := 0;
  old_sick numeric := 0;
begin
  if tg_op = 'UPDATE' then
    old_vacation := coalesce(old.vacation, 0);
    old_sick := coalesce(old.sick, 0);
  end if;

  if auth.uid() is not null
     and not (select app_private.is_chief())
     and new.vacation is distinct from old_vacation then
    raise exception 'Urlaubstage können nur vom Chef geändert werden.';
  end if;

  if auth.uid() is not null
     and not (select app_private.is_chief())
     and coalesce(new.sick, 0) is distinct from old_sick then
    raise exception 'Krankheitstage können nur vom Chef eingetragen oder entfernt werden.';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prevent_employee_vacation_changes() from public;

drop trigger if exists prevent_employee_vacation_changes on public.work_days;
create trigger prevent_employee_vacation_changes
before insert or update on public.work_days
for each row execute function app_private.prevent_employee_vacation_changes();

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

