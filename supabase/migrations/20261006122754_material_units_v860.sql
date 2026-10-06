-- Add per-catalog defaults and per-position snapshots. Existing rows, prices,
-- working times, invoice status and saved quotation JSON are not rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.materials add column if not exists unit text;
alter table public.work_order_items add column if not exists unit text;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.materials'::regclass and conname='materials_unit_v860_check') then
    alter table public.materials add constraint materials_unit_v860_check check(unit in ('Stk','M','H','Pau'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.work_order_items'::regclass and conname='work_order_items_unit_v860_check') then
    alter table public.work_order_items add constraint work_order_items_unit_v860_check check(unit in ('Stk','M','H','Pau'));
  end if;
end $$;

create or replace function app_private.canonical_unit_v860(value text,hourly boolean default false)
returns text language plpgsql immutable security invoker set search_path=pg_catalog as $$
begin
  case lower(btrim(coalesce(value,'')))
    when '' then return case when hourly then 'H' else 'Stk' end;
    when 'stk' then return 'Stk'; when 'stk.' then return 'Stk';
    when 'm' then return 'M'; when 'h' then return 'H'; when 'pau' then return 'Pau';
    else raise exception 'Bitte Stk, M, H oder Pau als Einheit auswählen.' using errcode='23514';
  end case;
end $$;
revoke all on function app_private.canonical_unit_v860(text,boolean) from public,anon;
grant execute on function app_private.canonical_unit_v860(text,boolean) to authenticated;

create or replace function app_private.material_default_unit_v860()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
  new.unit:=app_private.canonical_unit_v860(new.unit,lower(btrim(new.name)) in ('monteurstunde','meisterstunde','aushilfsstunde'));
  return new;
end $$;
create or replace function app_private.item_default_unit_v860()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare catalog_unit text;
begin
  if new.unit is null and new.material_id is not null then select m.unit into catalog_unit from public.materials m where m.id=new.material_id; end if;
  new.unit:=app_private.canonical_unit_v860(coalesce(new.unit,catalog_unit),lower(btrim(new.position_name)) in ('monteurstunde','meisterstunde','aushilfsstunde'));
  return new;
end $$;
revoke all on function app_private.material_default_unit_v860(),app_private.item_default_unit_v860() from public,anon,authenticated;
drop trigger if exists material_default_unit_v860 on public.materials;
create trigger material_default_unit_v860 before insert or update of unit on public.materials for each row execute function app_private.material_default_unit_v860();
drop trigger if exists item_default_unit_v860 on public.work_order_items;
create trigger item_default_unit_v860 before insert or update of unit on public.work_order_items for each row execute function app_private.item_default_unit_v860();

-- Preserve the existing complete team transaction and its authorization,
-- time validation, atomic rollback and execute privileges. Guarded surgical
-- replacements fail atomically if the installed function differs unexpectedly.
do $migration$
declare definition text; old_fragment text; new_fragment text;
begin
  definition:=pg_get_functiondef('public.save_team_work_order(jsonb,jsonb,jsonb,uuid)'::regprocedure);
  if position('canonical_unit_v860' in definition)=0 then
    old_fragment:='insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price) values(order_id,material.id,material.name,quantity,material.unit_price);';
    new_fragment:='insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price,unit) values(order_id,material.id,material.name,quantity,material.unit_price,app_private.canonical_unit_v860(coalesce(item->>''unit'',material.unit),false));';
    if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected team material writer; units migration aborted.'; end if;
    definition:=replace(definition,old_fragment,new_fragment);
    old_fragment:='insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price) values(order_id,material.id,material.name,labor_sum.hours,material.unit_price);';
    new_fragment:='insert into public.work_order_items(work_order_id,material_id,position_name,quantity,unit_price,unit) values(order_id,material.id,material.name,labor_sum.hours,material.unit_price,app_private.canonical_unit_v860(material.unit,true));';
    if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected team labor writer; units migration aborted.'; end if;
    execute replace(definition,old_fragment,new_fragment);
  end if;
  definition:=pg_get_functiondef('app_private.validate_offer_v857()'::regprocedure);
  if position('canonical_unit_v860' in definition)=0 then
    old_fragment:='''unit'',case when kind_value=''labor'' then ''h'' else ''Stk.'' end';
    new_fragment:='''unit'',app_private.canonical_unit_v860(item->>''unit'',kind_value=''labor'')';
    if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then raise exception 'Unexpected offer validator; units migration aborted.'; end if;
    execute replace(definition,old_fragment,new_fragment);
  end if;
end $migration$;
notify pgrst,'reload schema';
commit;
