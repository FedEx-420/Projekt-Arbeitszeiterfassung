-- Separate, manager-only quotations. No work, calendar or invoice data is changed.
begin;
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null,
  offer_number text not null,
  customer_id uuid,
  customer_name text not null check(length(customer_name) between 1 and 200),
  customer_snapshot jsonb not null default '{}' check(jsonb_typeof(customer_snapshot)='object'),
  offer_date date not null default current_date check(offer_date between date '1900-01-01' and date '9999-12-31'),
  valid_until date check(valid_until is null or valid_until>=offer_date),
  title text not null check(length(title) between 1 and 4000),
  notes text not null default '' check(length(notes)<=10000),
  status text not null default 'draft' check(status in ('draft','ready')),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
  vat_rate numeric(5,2) not null default 0 check(vat_rate between 0 and 100),
  subtotal numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,offer_number)
);
-- Customer/material identifiers are snapshot references, intentionally not
-- foreign keys: deleting a customer or material must not erase a saved offer or
-- interfere with the existing employee deletion workflows.
create index offers_company_date on public.offers(business_id,offer_date desc,id);
create index offers_customer on public.offers(customer_id);
create index offers_creator on public.offers(created_by);
alter table public.offers enable row level security;
revoke all on public.offers from public,anon;
grant select,insert,update,delete on public.offers to authenticated;
create policy offers_manager_select on public.offers for select to authenticated using(app_private.team_can_manage(business_id));
create policy offers_manager_insert on public.offers for insert to authenticated with check(app_private.team_can_manage(business_id));
create policy offers_manager_update on public.offers for update to authenticated using(app_private.team_can_manage(business_id)) with check(app_private.team_can_manage(business_id));
create policy offers_manager_delete on public.offers for delete to authenticated using(app_private.team_can_manage(business_id));

create function app_private.validate_offer_v857() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare
  customer public.customers; material public.materials; item jsonb;
  checked_items jsonb:='[]'; quantity_value numeric; price_value numeric;
  material_id_value uuid; kind_value text; name_value text; sum_value numeric:=0;
begin
  if auth.uid() is null or not app_private.team_can_manage(new.business_id) then
    raise exception 'Angebote dürfen nur durch Geschäfts- oder Administratorkonten verwaltet werden.' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles where id=new.business_id and role='business') then
    raise exception 'Bitte ein gültiges Geschäftskonto auswählen.' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if new.business_id is distinct from old.business_id or new.id is distinct from old.id then
      raise exception 'Die Firma eines Angebots darf nicht geändert werden.' using errcode='23514';
    end if;
    new.created_by:=old.created_by; new.offer_number:=old.offer_number; new.created_at:=old.created_at; new.revision:=old.revision+1;
  else
    new.created_by:=auth.uid(); new.revision:=1; new.created_at:=now();
    new.offer_number:='ANG-'||extract(year from new.offer_date)::text||'-'||upper(substr(replace(new.id::text,'-',''),1,12));
  end if;
  if new.customer_id is not null then
    select * into customer from public.customers where id=new.customer_id;
    if not found then
      if tg_op='UPDATE' and new.customer_id=old.customer_id then new.customer_id:=null;
      else raise exception 'Der Kunde gehört nicht zu dieser Firma.' using errcode='23514'; end if;
    elsif app_private.team_company(customer.employee_id) is distinct from new.business_id then
      raise exception 'Der Kunde gehört nicht zu dieser Firma.' using errcode='23514';
    end if;
  end if;
  new.customer_name:=btrim(new.customer_name); new.title:=btrim(new.title);
  if jsonb_typeof(new.customer_snapshot)<>'object' or length(new.customer_snapshot::text)>8000 then raise exception 'Ungültige Kundendaten.' using errcode='23514'; end if;
  if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items) not between 1 and 100 then
    raise exception 'Bitte mindestens eine und höchstens 100 Angebotspositionen hinzufügen.' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements(new.items) loop
    name_value:=btrim(coalesce(item->>'name','')); kind_value:=item->>'kind';
    if length(name_value) not between 1 and 200 or kind_value not in ('material','labor') or kind_value is null
      or coalesce(item->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or coalesce(item->>'unit_price','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'Bitte gültige Positionen, Mengen und Preise eingeben.' using errcode='23514';
    end if;
    quantity_value:=(item->>'quantity')::numeric; price_value:=(item->>'unit_price')::numeric;
    if quantity_value<=0 or quantity_value>100000 or price_value>1000000 or kind_value='labor' and quantity_value*4<>trunc(quantity_value*4) then
      raise exception 'Arbeitsstunden müssen in 0,25-h-Schritten und Mengen/Preise im gültigen Bereich liegen.' using errcode='23514';
    end if;
    material_id_value:=nullif(item->>'material_id','')::uuid;
    if material_id_value is not null then
      select * into material from public.materials where id=material_id_value;
      if not found then
        if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(old.items) old_item where old_item->>'material_id'=material_id_value::text) then material_id_value:=null;
        else raise exception 'Das Material gehört nicht zu dieser Firma.' using errcode='23514'; end if;
      elsif material.business_id is distinct from new.business_id then
        raise exception 'Das Material gehört nicht zu dieser Firma.' using errcode='23514';
      end if;
    end if;
    checked_items:=checked_items||jsonb_build_array(jsonb_build_object('kind',kind_value,'name',name_value,'material_id',material_id_value,'quantity',quantity_value,'unit',case when kind_value='labor' then 'h' else 'Stk.' end,'unit_price',price_value,'line_total',round(quantity_value*price_value,2)));
    sum_value:=sum_value+round(quantity_value*price_value,2);
  end loop;
  new.items:=checked_items; new.subtotal:=sum_value; new.tax_amount:=round(sum_value*new.vat_rate/100,2); new.total:=new.subtotal+new.tax_amount; new.updated_at:=now();
  return new;
end; $$;
revoke all on function app_private.validate_offer_v857() from public,anon,authenticated;
create trigger validate_offer_v857 before insert or update on public.offers for each row execute function app_private.validate_offer_v857();

create function public.save_offer_v857(p_data jsonb,p_revision integer default null) returns public.offers
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare target public.offers; saved public.offers; company uuid;
begin
  company:=nullif(p_data->>'business_id','')::uuid;
  if auth.uid() is null or not app_private.team_can_manage(company) then raise exception 'Keine Berechtigung für Angebote dieser Firma.' using errcode='42501'; end if;
  if nullif(p_data->>'id','') is not null then
    select * into target from public.offers where id=(p_data->>'id')::uuid for update;
    if not found then raise exception 'Angebot nicht gefunden.' using errcode='42501'; end if;
    if target.business_id is distinct from company then raise exception 'Die Firma eines Angebots darf nicht geändert werden.' using errcode='23514'; end if;
    if target.revision is distinct from p_revision then raise exception 'Das Angebot wurde inzwischen geändert. Bitte erneut öffnen.' using errcode='40001'; end if;
    update public.offers set customer_id=nullif(p_data->>'customer_id','')::uuid,customer_name=p_data->>'customer_name',customer_snapshot=coalesce(p_data->'customer_snapshot','{}'),offer_date=(p_data->>'offer_date')::date,valid_until=nullif(p_data->>'valid_until','')::date,title=p_data->>'title',notes=coalesce(p_data->>'notes',''),status=coalesce(p_data->>'status','draft'),items=p_data->'items',vat_rate=coalesce((p_data->>'vat_rate')::numeric,0) where id=target.id returning * into saved;
  else
    insert into public.offers(business_id,created_by,offer_number,customer_id,customer_name,customer_snapshot,offer_date,valid_until,title,notes,status,items,vat_rate)
    values(company,auth.uid(),'',nullif(p_data->>'customer_id','')::uuid,p_data->>'customer_name',coalesce(p_data->'customer_snapshot','{}'),(p_data->>'offer_date')::date,nullif(p_data->>'valid_until','')::date,p_data->>'title',coalesce(p_data->>'notes',''),coalesce(p_data->>'status','draft'),p_data->'items',coalesce((p_data->>'vat_rate')::numeric,0)) returning * into saved;
  end if;
  return saved;
end; $$;
create function public.delete_offer_v857(p_id uuid,p_revision integer) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare target public.offers;
begin
  select * into target from public.offers where id=p_id for update;
  if auth.uid() is null or not found or not app_private.team_can_manage(target.business_id) then raise exception 'Angebot nicht gefunden oder keine Berechtigung.' using errcode='42501'; end if;
  if target.revision is distinct from p_revision then raise exception 'Das Angebot wurde inzwischen geändert. Bitte erneut öffnen.' using errcode='40001'; end if;
  delete from public.offers where id=p_id;
  return p_id;
end; $$;
revoke all on function public.save_offer_v857(jsonb,integer),public.delete_offer_v857(uuid,integer) from public,anon;
grant execute on function public.save_offer_v857(jsonb,integer),public.delete_offer_v857(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
