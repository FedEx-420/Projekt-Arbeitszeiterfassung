-- Customer overrides are separate from the company-shared editable address
-- fields. No existing rates, accounts, invoices or material rows are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

alter table public.profiles drop constraint if exists profiles_labor_type_check;
alter table public.profiles add constraint profiles_labor_type_check
 check(labor_type in ('monteur','meister','aushilfe','azubi'));

create table public.customer_hourly_rates (
 customer_id uuid primary key references public.customers(id) on delete cascade,
 meister numeric(12,2) check(meister between 0 and 100000),
 monteur numeric(12,2) check(monteur between 0 and 100000),
 azubi numeric(12,2) check(azubi between 0 and 100000),
 updated_at timestamptz not null default now()
);
alter table public.customer_hourly_rates enable row level security;
revoke all on public.customer_hourly_rates from public,anon,authenticated;
grant select on public.customer_hourly_rates to authenticated;

-- The definer only resolves the live actor and customer's actual company;
-- company IDs and role claims supplied by clients are never trusted.
create function app_private.customer_rates_access_v868(p_customer uuid,p_manage boolean)
returns boolean language sql stable security definer
set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.profiles actor join public.customers c on c.id=p_customer
 where actor.id=auth.uid() and (
   actor.role='administrator'
   or (actor.role='business' and actor.id=app_private.team_company(c.employee_id))
   or (not p_manage and actor.role='employee' and actor.business_id=app_private.team_company(c.employee_id))
 ));
$$;
revoke all on function app_private.customer_rates_access_v868(uuid,boolean) from public,anon,authenticated;
grant execute on function app_private.customer_rates_access_v868(uuid,boolean) to authenticated;
create policy "Company can read customer rates" on public.customer_hourly_rates
for select to authenticated using(app_private.customer_rates_access_v868(customer_id,false));

create function app_private.save_customer_hourly_rates_v868(p_customer uuid,p_rates jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare saved public.customer_hourly_rates%rowtype; field text; value numeric;
begin
 if not app_private.customer_rates_access_v868(p_customer,true) then
   raise exception 'Nur die Geschäftsleitung dieser Firma darf Kundensätze ändern.' using errcode='42501';
 end if;
 if jsonb_typeof(p_rates) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(p_rates) k where k not in ('meister','monteur','azubi')) then
   raise exception 'Ungültige Kundensätze.' using errcode='23514';
 end if;
 foreach field in array array['meister','monteur','azubi'] loop
   if p_rates ? field and p_rates->field <> 'null'::jsonb then
     if jsonb_typeof(p_rates->field)<>'number' then raise exception 'Bitte einen gültigen Preis eingeben.' using errcode='23514'; end if;
     value:=(p_rates->>field)::numeric;
     if value<0 or value>100000 or value<>round(value,2) then raise exception 'Preise müssen zwischen 0 und 100000 Euro liegen und höchstens zwei Nachkommastellen haben.' using errcode='23514'; end if;
   end if;
 end loop;
 if coalesce(p_rates->>'meister',p_rates->>'monteur',p_rates->>'azubi') is null then
   delete from public.customer_hourly_rates where customer_id=p_customer;
   return jsonb_build_object('customer_id',p_customer,'meister',null,'monteur',null,'azubi',null);
 end if;
 insert into public.customer_hourly_rates(customer_id,meister,monteur,azubi)
 values(p_customer,(p_rates->>'meister')::numeric,(p_rates->>'monteur')::numeric,(p_rates->>'azubi')::numeric)
 on conflict(customer_id) do update set meister=excluded.meister,monteur=excluded.monteur,azubi=excluded.azubi,updated_at=now()
 returning * into saved;
 return to_jsonb(saved);
end; $$;
revoke all on function app_private.save_customer_hourly_rates_v868(uuid,jsonb) from public,anon,authenticated;
grant execute on function app_private.save_customer_hourly_rates_v868(uuid,jsonb) to authenticated;
create function public.save_customer_hourly_rates(p_customer uuid,p_rates jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog,pg_temp as $$
 select app_private.save_customer_hourly_rates_v868(p_customer,p_rates);
$$;
revoke all on function public.save_customer_hourly_rates(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_customer_hourly_rates(uuid,jsonb) to authenticated;

-- Used by the item trigger, including atomic team/timer saves. A missing
-- override uses the business material price; explicit 0 is not missing.
create function app_private.customer_labor_price_v868(p_customer uuid,p_name text,p_default numeric)
returns numeric language sql stable security invoker set search_path=pg_catalog,pg_temp as $$
 select coalesce((select case lower(btrim(p_name))
   when 'meisterstunde' then r.meister when 'monteurstunde' then r.monteur
   when 'auszubildendenstunde' then r.azubi end
   from public.customer_hourly_rates r where r.customer_id=p_customer),p_default);
$$;
revoke all on function app_private.customer_labor_price_v868(uuid,text,numeric) from public,anon,authenticated;

create function app_private.price_labor_item_v868()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare job public.work_orders%rowtype; material public.materials%rowtype;
begin
 select * into job from public.work_orders where id=new.work_order_id;
 if job.id is null then return new; end if;
 if job.invoiced then
   -- A finalized invoice's snapshots must not change even through direct REST.
   if tg_op='UPDATE' and (new.unit_price is distinct from old.unit_price or new.material_id is distinct from old.material_id
     or new.position_name is distinct from old.position_name or new.quantity is distinct from old.quantity or new.unit is distinct from old.unit) then
     raise exception 'Abgerechnete Positionen behalten ihre gespeicherten Preise.' using errcode='23514';
   elsif tg_op='INSERT' then raise exception 'Abgerechnete Arbeitsscheine sind abgeschlossen.' using errcode='23514'; end if;
   return new;
 end if;
 select * into material from public.materials where id=new.material_id;
 if material.id is not null and lower(btrim(material.name)) in ('monteurstunde','meisterstunde','auszubildendenstunde','aushilfsstunde') then
   if material.business_id is distinct from app_private.team_company(job.employee_id) then
     raise exception 'Die Stundenposition gehört nicht zu dieser Firma.' using errcode='23514';
   end if;
   new.position_name:=material.name;
   new.unit_price:=app_private.customer_labor_price_v868(job.customer_id,material.name,material.unit_price);
   new.unit:='H';
 end if;
 return new;
end; $$;
revoke all on function app_private.price_labor_item_v868() from public,anon,authenticated;
create trigger price_labor_item_v868 before insert or update on public.work_order_items
for each row execute function app_private.price_labor_item_v868();

-- Guarded extension of the installed team writer preserves all previous
-- authorization, absence/overlap checks, atomic ledger writes and timer hooks.
do $migration$
declare definition text; old_fragment text; new_fragment text; target regprocedure;
begin
 definition:=pg_get_functiondef('public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure);
 old_fragment:='when ''aushilfe'' then ''Aushilfsstunde'' else ''Monteurstunde'' end;';
 new_fragment:='when ''aushilfe'' then ''Aushilfsstunde'' when ''azubi'' then ''Auszubildendenstunde'' else ''Monteurstunde'' end;';
 if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected labor classification; activation aborted.'; end if;
 definition:=replace(definition,old_fragment,new_fragment);
 old_fragment:='(''monteurstunde'',''meisterstunde'',''aushilfsstunde'')';
 if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected labor item validation; activation aborted.'; end if;
 execute replace(definition,old_fragment,'(''monteurstunde'',''meisterstunde'',''aushilfsstunde'',''auszubildendenstunde'')');
 foreach target in array array['app_private.material_default_unit_v860()'::regprocedure,'app_private.item_default_unit_v860()'::regprocedure] loop
   definition:=pg_get_functiondef(target);
   if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected hourly unit default; activation aborted.'; end if;
   execute replace(definition,old_fragment,'(''monteurstunde'',''meisterstunde'',''aushilfsstunde'',''auszubildendenstunde'')');
 end loop;
end $migration$;

create or replace function app_private.protect_hourly_materials()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
 if tg_op='DELETE' then
   if lower(btrim(old.name)) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde') then
     raise exception 'Stundenpositionen können nicht gelöscht werden.' using errcode='23514';
   end if;
   return old;
 end if;
 if lower(btrim(old.name)) in ('monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde')
 and (lower(btrim(new.name)) is distinct from lower(btrim(old.name)) or new.active is distinct from old.active or new.business_id is distinct from old.business_id) then
   raise exception 'Stundenpositionen können nur beim Preis geändert werden.' using errcode='23514';
 end if;
 return new;
end; $$;

-- New Azubi positions are created on first use, not by rewriting the catalog.
-- Prices are re-snapshotted when the business marks an open order invoiced.
create function app_private.freeze_labor_prices_v868()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if new.invoiced and not coalesce(old.invoiced,false) then
   update public.work_order_items i set unit_price=app_private.customer_labor_price_v868(new.customer_id,m.name,m.unit_price)
   from public.materials m where i.work_order_id=old.id and m.id=i.material_id
     and m.business_id=app_private.team_company(new.employee_id)
     and lower(btrim(m.name)) in ('monteurstunde','meisterstunde','auszubildendenstunde','aushilfsstunde');
 end if;
 return new;
end; $$;
revoke all on function app_private.freeze_labor_prices_v868() from public,anon,authenticated;
create trigger freeze_labor_prices_v868 before update of invoiced on public.work_orders
for each row execute function app_private.freeze_labor_prices_v868();

create function app_private.bump_customer_rates_v868()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare company uuid;
begin
 select app_private.team_company(c.employee_id) into company from public.customers c
 where c.id=case when tg_op='DELETE' then old.customer_id else new.customer_id end;
 if company is not null then
   insert into app_private.planning_sync_revisions as r(company_id,revision) values(company,1)
   on conflict(company_id) do update set revision=r.revision+1;
 else
   update app_private.planning_sync_revisions set revision=revision+1 where company_id='00000000-0000-0000-0000-000000000000';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function app_private.bump_customer_rates_v868() from public,anon,authenticated;
create trigger customer_rates_sync_v868 after insert or update or delete on public.customer_hourly_rates
for each row execute function app_private.bump_customer_rates_v868();
notify pgrst,'reload schema';
commit;
