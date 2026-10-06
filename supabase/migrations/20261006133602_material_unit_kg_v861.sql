-- Extend the existing unit contract; never rewrite historical rows or prices.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.materials drop constraint if exists materials_unit_v860_check;
alter table public.materials add constraint materials_unit_v860_check check(unit in ('Stk','M','H','Pau','Kg'));
alter table public.work_order_items drop constraint if exists work_order_items_unit_v860_check;
alter table public.work_order_items add constraint work_order_items_unit_v860_check check(unit in ('Stk','M','H','Pau','Kg'));

-- All existing writers and validators share this private, invoker helper.
create or replace function app_private.canonical_unit_v860(value text,hourly boolean default false)
returns text language plpgsql immutable security invoker set search_path=pg_catalog as $$
begin
  case lower(btrim(coalesce(value,'')))
    when '' then return case when hourly then 'H' else 'Stk' end;
    when 'stk' then return 'Stk'; when 'stk.' then return 'Stk';
    when 'm' then return 'M'; when 'h' then return 'H'; when 'pau' then return 'Pau';
    when 'kg' then return 'Kg';
    else raise exception 'Bitte Stk, M, H, Pau oder Kg als Einheit auswählen.' using errcode='23514';
  end case;
end $$;
revoke all on function app_private.canonical_unit_v860(text,boolean) from public,anon;
grant execute on function app_private.canonical_unit_v860(text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
