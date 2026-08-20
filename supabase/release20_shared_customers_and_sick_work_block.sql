drop policy if exists "Customers are visible to owner or chief" on public.customers;
drop policy if exists "Customers can be changed by owner or chief" on public.customers;
drop policy if exists "Customers can be created by owner or chief" on public.customers;
drop policy if exists "Customers can be deleted by owner or chief" on public.customers;

create policy "Customers are shared with the team"
on public.customers for select to authenticated
using (true);

create policy "Customers can be changed by the team"
on public.customers for update to authenticated
using (true)
with check (true);

create policy "Customers can be created by the team"
on public.customers for insert to authenticated
with check (
  employee_id = (select auth.uid())
  or (select app_private.is_chief())
);

create policy "Customers can be deleted by the chief"
on public.customers for delete to authenticated
using ((select app_private.is_chief()));

create or replace function app_private.prevent_customer_creator_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.employee_id is distinct from old.employee_id then
    raise exception 'Der Ersteller eines Kunden kann nicht geändert werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_customer_creator_change on public.customers;
create trigger prevent_customer_creator_change
before update on public.customers
for each row execute function app_private.prevent_customer_creator_change();

create or replace function app_private.prevent_work_on_sick_day()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.work_days d
    where d.employee_id = new.employee_id
      and d.work_date = new.work_date
      and coalesce(d.sick, 0) > 0
  ) then
    raise exception 'Für einen Krankheitstag können keine Arbeitszeiten oder Arbeitsscheine angelegt werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_sick_time_entry on public.time_entries;
create trigger prevent_sick_time_entry
before insert or update of employee_id, work_date on public.time_entries
for each row execute function app_private.prevent_work_on_sick_day();

drop trigger if exists prevent_sick_work_order on public.work_orders;
create trigger prevent_sick_work_order
before insert or update of employee_id, work_date on public.work_orders
for each row execute function app_private.prevent_work_on_sick_day();
