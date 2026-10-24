-- Immutable invoice batches. No legacy row is converted into an invented invoice.
-- Existing order/time records are left untouched by installation.
begin;

create table public.invoice_batches_v908 (
  id uuid primary key,
  company_id uuid not null references public.profiles(id) on delete restrict,
  customer_key text not null,
  customer_name text not null,
  invoice_number text not null,
  issued_on date not null,
  selection jsonb not null,
  document jsonb not null,
  source_snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  unique(company_id,invoice_number),
  check(length(invoice_number) between 1 and 100),
  check(jsonb_typeof(selection)='array' and jsonb_array_length(selection) between 1 and 200),
  check(jsonb_typeof(document)='object'),
  check(jsonb_typeof(source_snapshot)='object')
);
create index invoice_batches_company_date_v908 on public.invoice_batches_v908(company_id,issued_on desc,created_at desc);
create table public.invoice_order_links_v908 (
  invoice_id uuid not null references public.invoice_batches_v908(id) on delete restrict,
  company_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null,
  primary key(invoice_id,order_id)
);
create index invoice_order_links_order_v908 on public.invoice_order_links_v908(order_id);
create index invoice_order_links_company_v908 on public.invoice_order_links_v908(company_id);
create table public.invoice_cancellations_v908 (
  id uuid primary key,
  invoice_id uuid not null unique references public.invoice_batches_v908(id) on delete restrict,
  company_id uuid not null references public.profiles(id) on delete restrict,
  cancellation_number text not null,
  issued_on date not null,
  reason text not null,
  reopen_orders boolean not null,
  document jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  unique(company_id,cancellation_number),
  check(length(cancellation_number) between 1 and 100),
  check(length(btrim(reason)) between 3 and 2000),
  check(jsonb_typeof(document)='object')
);
create index invoice_cancellations_company_v908 on public.invoice_cancellations_v908(company_id,created_at desc);
alter table public.work_orders add column invoice_reopened_from_v908 uuid references public.invoice_batches_v908(id) on delete restrict;
alter table public.work_orders add column invoice_reopened_at_v908 timestamptz;

create function app_private.invoice_manager_v908(p_company uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles a where a.id=(select auth.uid())
   and (a.role='administrator' or (a.role='business' and a.id=p_company)))
 and exists(select 1 from public.profiles b where b.id=p_company and b.role='business');
$$;
revoke all on function app_private.invoice_manager_v908(uuid) from public,anon;
grant execute on function app_private.invoice_manager_v908(uuid) to authenticated;

alter table public.invoice_batches_v908 enable row level security;
alter table public.invoice_order_links_v908 enable row level security;
alter table public.invoice_cancellations_v908 enable row level security;
revoke all on public.invoice_batches_v908,public.invoice_order_links_v908,public.invoice_cancellations_v908 from public,anon,authenticated;
grant select,insert on public.invoice_batches_v908,public.invoice_order_links_v908,public.invoice_cancellations_v908 to authenticated;
create policy invoice_batches_read_v908 on public.invoice_batches_v908 for select to authenticated using(app_private.invoice_manager_v908(company_id));
create policy invoice_batches_insert_v908 on public.invoice_batches_v908 for insert to authenticated with check(app_private.invoice_manager_v908(company_id));
create policy invoice_links_read_v908 on public.invoice_order_links_v908 for select to authenticated using(app_private.invoice_manager_v908(company_id));
create policy invoice_links_insert_v908 on public.invoice_order_links_v908 for insert to authenticated with check(app_private.invoice_manager_v908(company_id));
create policy invoice_cancel_read_v908 on public.invoice_cancellations_v908 for select to authenticated using(app_private.invoice_manager_v908(company_id));
create policy invoice_cancel_insert_v908 on public.invoice_cancellations_v908 for insert to authenticated with check(app_private.invoice_manager_v908(company_id));

create function app_private.invoice_append_only_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Rechnungsoriginale und Stornos können nicht überschrieben oder gelöscht werden.'; end if;
 if not app_private.invoice_manager_v908(new.company_id)
   or coalesce(current_setting('app.invoice_ledger_v908',true),'') not in ('issue','cancel','reopen') then
   raise exception 'Rechnungen bitte über die geprüfte Abschlussfunktion erstellen.';
 end if;
 if tg_table_name='invoice_order_links_v908' then
   if not exists(select 1 from public.invoice_batches_v908 b where b.id=new.invoice_id and b.company_id=new.company_id) then
     raise exception 'Ungültige Betriebszuordnung.';
   end if;
 else
   new.created_by:=auth.uid();new.created_at:=statement_timestamp();
 end if;
 return new;
end; $$;
revoke all on function app_private.invoice_append_only_v908() from public,anon,authenticated;
create trigger invoice_batch_append_only_v908 before insert or update or delete on public.invoice_batches_v908 for each row execute function app_private.invoice_append_only_v908();
create trigger invoice_link_append_only_v908 before insert or update or delete on public.invoice_order_links_v908 for each row execute function app_private.invoice_append_only_v908();
create trigger invoice_cancel_append_only_v908 before insert or update or delete on public.invoice_cancellations_v908 for each row execute function app_private.invoice_append_only_v908();

create function app_private.invoice_order_guard_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
declare operation text:=coalesce(current_setting('app.invoice_ledger_v908',true),'');company uuid;
begin
 company:=app_private.team_company(case when tg_op='DELETE' then old.employee_id else new.employee_id end);
 if operation in ('issue','reopen') and app_private.invoice_manager_v908(company) then
   if tg_op='UPDATE' and
      (to_jsonb(new)-array['invoiced','updated_at','invoice_reopened_from_v908','invoice_reopened_at_v908'])
      is not distinct from
      (to_jsonb(old)-array['invoiced','updated_at','invoice_reopened_from_v908','invoice_reopened_at_v908']) then return new;end if;
   raise exception 'Der Rechnungsabschluss darf keine Auftragszeiten oder Inhalte verändern.';
 end if;
 if tg_op='DELETE' then
   if coalesce(old.invoiced,false) then raise exception 'Abgerechnete Arbeitsscheine bleiben erhalten. Rechnung zuerst gezielt ändern.';end if;
   return old;
 end if;
 if (tg_op='INSERT' and (coalesce(new.invoiced,false) or new.invoice_reopened_from_v908 is not null or new.invoice_reopened_at_v908 is not null))
 or (tg_op='UPDATE' and (coalesce(old.invoiced,false) or new.invoiced is distinct from old.invoiced
   or new.invoice_reopened_from_v908 is distinct from old.invoice_reopened_from_v908
   or new.invoice_reopened_at_v908 is distinct from old.invoice_reopened_at_v908)) then
   raise exception 'Abrechnungen bitte über Rechnung abschließen, Stornieren oder Ändern durchführen.';
 end if;
 return new;
end; $$;
revoke all on function app_private.invoice_order_guard_v908() from public,anon,authenticated;
create trigger zz_invoice_order_guard_v908 before insert or update or delete on public.work_orders for each row execute function app_private.invoice_order_guard_v908();
create function app_private.invoice_item_guard_v908() returns trigger
language plpgsql security invoker set search_path='' as $$
declare source_order public.work_orders;target uuid;
begin
 target:=case when tg_op='DELETE' then old.work_order_id else new.work_order_id end;
 -- Serialize line edits with finalization, including an insert waiting on a parent lock.
 select * into source_order from public.work_orders where id=target for update;
 if source_order.invoiced and not (coalesce(current_setting('app.invoice_ledger_v908',true),'')='issue'
    and app_private.invoice_manager_v908(app_private.team_company(source_order.employee_id))) then
   raise exception 'Positionen einer abgerechneten Rechnung bleiben unverändert.';
 end if;
 if tg_op='UPDATE' and new.work_order_id is distinct from old.work_order_id
  and exists(select 1 from public.work_orders w where w.id=old.work_order_id and w.invoiced) then
   raise exception 'Abgerechnete Positionen können nicht verschoben werden.';
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end; $$;
revoke all on function app_private.invoice_item_guard_v908() from public,anon,authenticated;
create trigger zz_invoice_item_guard_v908 before insert or update or delete on public.work_order_items for each row execute function app_private.invoice_item_guard_v908();

-- Read-only preview. Fingerprints include sources, current resolved prices and identities.
create function public.prepare_invoice_batch_v908(p_company uuid,p_order_ids jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare company public.profiles;customer public.customers;w public.work_orders;i public.work_order_items;m public.materials;
 person public.profiles;first_order public.work_orders;order_json jsonb;item_json jsonb;period_json jsonb;line jsonb;
 orders jsonb:='[]';selection jsonb:='[]';items jsonb:='[]';days jsonb:='[]';periods jsonb;dayitems jsonb;
 names jsonb:='[]';snap_items jsonb:='[]';snapshot jsonb;data jsonb;customer_key text;count_orders int:=0;
 price numeric;line_name text;unit_name text;line_execution text;total_hours numeric:=0;sum_price numeric:=0;customer_data jsonb:='{}';
begin
 if not app_private.invoice_manager_v908(p_company) then raise exception 'Kein Zugriff auf die Rechnungen dieses Betriebs.';end if;
 if coalesce(jsonb_typeof(p_order_ids),'null')<>'array' or jsonb_array_length(p_order_ids) not between 1 and 200
 or exists(select 1 from jsonb_array_elements(p_order_ids) e where jsonb_typeof(e)<>'string' or (e#>>'{}')!~'^[0-9a-fA-F-]{36}$')
 or (select count(distinct e#>>'{}') from jsonb_array_elements(p_order_ids)e)<>jsonb_array_length(p_order_ids) then
   raise exception 'Bitte zwischen 1 und 200 unterschiedliche Arbeitsscheine auswählen.';
 end if;
 select * into company from public.profiles where id=p_company;
 for w in select wo.* from public.work_orders wo where wo.id in (select (e#>>'{}')::uuid from jsonb_array_elements(p_order_ids)e) order by wo.work_date,wo.id loop
  count_orders:=count_orders+1;
  if app_private.team_company(w.employee_id) is distinct from p_company or w.invoiced
    or coalesce(to_jsonb(w)->>'work_kind','customer')<>'customer' then
    raise exception 'Nur offene, abrechnungsfähige Kundenaufträge dieses Betriebs sind zulässig.';
  end if;
  if exists(select 1 from public.invoice_order_links_v908 l where l.order_id=w.id
    and not exists(select 1 from public.invoice_cancellations_v908 c where c.invoice_id=l.invoice_id and c.reopen_orders)) then
    raise exception 'Dieser Arbeitsschein gehört bereits zu einer Rechnung.';
  end if;
  if count_orders=1 then
    first_order:=w;customer_key:=coalesce(w.customer_id::text,'name:'||lower(btrim(w.customer_name)));
    select * into customer from public.customers where id=w.customer_id;
    if found then
      if app_private.team_company(customer.employee_id) is distinct from p_company then raise exception 'Der Kunde gehört nicht zum ausgewählten Betrieb.';end if;
      customer_data:=to_jsonb(customer);
    end if;
  elsif customer_key is distinct from coalesce(w.customer_id::text,'name:'||lower(btrim(w.customer_name))) then
    raise exception 'Eine Rechnung kann nur Arbeitsscheine desselben Kunden enthalten.';
  end if;
  periods:='[]';dayitems:='[]';snap_items:='[]';names:='[]';
  if jsonb_array_length(coalesce(w.team_periods,'[]'))>0 then
    for period_json in select value from jsonb_array_elements(w.team_periods) loop
      select * into person from public.profiles where id=(period_json->>'employee_id')::uuid;
      if app_private.team_company(person.id) is distinct from p_company then raise exception 'Beteiligter Mitarbeiter gehört nicht zum Betrieb.';end if;
      periods:=periods||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(person.display_name,''),person.username),'start',period_json->>'start_time','end',period_json->>'end_time','pause',coalesce((period_json->>'pause_hours')::numeric,0),'hours',coalesce((period_json->>'executed_hours')::numeric,0)));
      names:=names||jsonb_build_array(to_jsonb(person));
    end loop;
  else
    select * into person from public.profiles where id=w.employee_id;
    periods:=jsonb_build_array(jsonb_build_object('name',coalesce(nullif(person.display_name,''),person.username),'start',w.start_time,'end',w.end_time,'pause',w.pause_hours,'hours',w.executed_hours));
    names:=jsonb_build_array(to_jsonb(person));
  end if;
  select string_agg((p->>'name')||': '||left(p->>'start',5)||' Uhr - '||left(p->>'end',5)||' Uhr',E'\n') into line_execution from jsonb_array_elements(periods)p;
  for i in select wi.* from public.work_order_items wi where wi.work_order_id=w.id order by wi.id loop
    select * into m from public.materials mat where mat.business_id=p_company and (mat.id=i.material_id or lower(btrim(mat.name))=lower(btrim(i.position_name))) order by (mat.id=i.material_id) desc nulls last,mat.id limit 1;
    price:=coalesce(i.unit_price,0);line_name:=i.position_name;
    if found then
      price:=coalesce(m.unit_price,0);line_name:=m.name;
      if lower(btrim(m.name)) in ('monteurstunde','meisterstunde','auszubildendenstunde','aushilfsstunde') then
        price:=app_private.customer_labor_price_v868(w.customer_id,m.name,m.unit_price);
      end if;
    end if;
    unit_name:=coalesce(to_jsonb(i)->>'unit',to_jsonb(m)->>'unit','Stk');
    if price<0 or coalesce(i.quantity,0)<0 then raise exception 'Negative Auftragspositionen vor der Rechnungsstellung prüfen.';end if;
    line:=jsonb_build_object('date',w.work_date,'name',coalesce(line_name,'Leistung'),'quantity',i.quantity,'unit',unit_name,'price',price,'description',w.title,'execution',coalesce(line_execution,''));
    items:=items||jsonb_build_array(line);dayitems:=dayitems||jsonb_build_array(line);
    snap_items:=snap_items||jsonb_build_array(jsonb_build_object('item',to_jsonb(i),'material',case when m.id is null then null else to_jsonb(m) end,'resolved',line));
    sum_price:=sum_price+coalesce(i.quantity,0)*price;
  end loop;
  if jsonb_array_length(dayitems)=0 then raise exception 'Ein ausgewählter Arbeitsschein enthält keine abrechenbaren Positionen. Bitte zuerst prüfen.';end if;
  order_json:=jsonb_build_object('order',to_jsonb(w),'items',snap_items,'people',names,'customer',customer_data,'company',to_jsonb(company));
  selection:=selection||jsonb_build_array(jsonb_build_object('id',w.id,'fingerprint',md5(order_json::text)));
  orders:=orders||jsonb_build_array(order_json);
  total_hours:=total_hours+coalesce((select sum((p->>'hours')::numeric) from jsonb_array_elements(periods)p),0);
  days:=days||jsonb_build_array(jsonb_build_object('date',w.work_date,'periods',periods,'items',dayitems,'notes',jsonb_build_array(coalesce(w.documentation,'')),'signatures',case when nullif(w.signature_data,'') is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('image',w.signature_data,'signer',w.signed_by)) end));
 end loop;
 if count_orders<>jsonb_array_length(p_order_ids) then raise exception 'Mindestens ein Arbeitsschein fehlt oder ist nicht zugänglich.';end if;
 data:=jsonb_build_object('kind','invoice','company',coalesce(nullif(company.company_name,''),company.display_name,company.username),'companyProfile',to_jsonb(company),'customer',coalesce(nullif(customer_data->'custom_fields'->>'first_name','')||' ','')||coalesce(customer_data->>'name',first_order.customer_name,'Kunde'),'address',to_jsonb(array_remove(array[(concat_ws(' ',customer_data->'custom_fields'->>'street',customer_data->'custom_fields'->>'house_no')),(concat_ws(' ',customer_data->'custom_fields'->>'postal_code',customer_data->'custom_fields'->>'city')),customer_data->'custom_fields'->>'email'],'')),'from',first_order.work_date,'to',(select max(e->'order'->>'work_date') from jsonb_array_elements(orders)e),'orderCount',count_orders,'hours',total_hours,'total',sum_price,'days',days,'items',items);
 return jsonb_build_object('company_id',p_company,'customer_key',customer_key,'customer_name',coalesce(customer_data->>'name',first_order.customer_name,'Kunde'),'selection',selection,'document',data,'source_snapshot',jsonb_build_object('orders',orders,'company',to_jsonb(company),'customer',customer_data));
end; $$;
revoke all on function public.prepare_invoice_batch_v908(uuid,jsonb) from public,anon;
grant execute on function public.prepare_invoice_batch_v908(uuid,jsonb) to authenticated;

create function app_private.invoice_tax_checked_v908(p_items jsonb,p_tax jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb;line jsonb;rule jsonb;rules jsonb:='{"standard":19,"reduced":7,"pv":0,"small":0,"reverse":0,"exempt":0}';
 index_no integer:=0;rate numeric;amount bigint;net bigint;vat bigint;gross bigint;total_net bigint:=0;total_vat bigint:=0;total_gross bigint:=0;
begin
 if coalesce(jsonb_typeof(p_tax),'null')<>'object' or coalesce(p_tax->>'version','')<>'905' or coalesce(p_tax->>'basis','') not in ('net','gross')
 or coalesce(jsonb_typeof(p_tax->'lines'),'null')<>'array' or jsonb_array_length(p_tax->'lines')<>jsonb_array_length(p_items)
 or coalesce(jsonb_typeof(p_tax->'groups'),'null')<>'array' or coalesce(jsonb_typeof(p_tax->'notes'),'null')<>'array' then raise exception 'Umsatzsteuer vor dem Abschluss vollständig prüfen.';end if;
 for item in select value from jsonb_array_elements(p_items) loop
   line:=p_tax->'lines'->index_no;
   if not rules?(line->>'code') then raise exception 'Ungültige Steuerbehandlung.';end if;
   rate:=(rules->>(line->>'code'))::numeric;
   if (line->>'rate')::numeric is distinct from rate then raise exception 'Steuersatz passt nicht zur gewählten Steuerbehandlung.';end if;
   if line->>'code'<>'standard' and not exists(select 1 from jsonb_array_elements(p_tax->'notes') n where n->>'code'=line->>'code' and length(btrim(n->>'detail'))>0 and length(btrim(n->>'law'))>0) then
     raise exception 'Voraussetzungen und Rechtsgrundlage der Steuerbehandlung fehlen.';
   end if;
   amount:=round((item->>'quantity')::numeric*(item->>'price')::numeric*100);
   if p_tax->>'basis'='gross' then net:=round(amount*100::numeric/(100+rate));vat:=amount-net;else net:=amount;vat:=round(net*rate/100);end if;
   gross:=net+vat;
   if (line->>'index')::int is distinct from index_no or (line->>'net')::bigint is distinct from net
    or (line->>'vat')::bigint is distinct from vat or (line->>'gross')::bigint is distinct from gross then
      raise exception 'Steuerbetrag stimmt nicht mit den aktuellen Positionen überein. Vorschau erneut prüfen.';
   end if;
   total_net:=total_net+net;total_vat:=total_vat+vat;total_gross:=total_gross+gross;index_no:=index_no+1;
 end loop;
 if total_gross<=0 or total_gross>1000000000000 or (p_tax->>'net')::bigint is distinct from total_net
 or (p_tax->>'vat')::bigint is distinct from total_vat or (p_tax->>'gross')::bigint is distinct from total_gross then
   raise exception 'Rechnungssummen stimmen nicht überein oder sind nicht zulässig.';
 end if;
 if (select count(distinct g->>'code') from jsonb_array_elements(p_tax->'groups')g)<>jsonb_array_length(p_tax->'groups')
 or (select count(distinct l->>'code') from jsonb_array_elements(p_tax->'lines')l)<>jsonb_array_length(p_tax->'groups')
 or exists(select 1 from jsonb_array_elements(p_tax->'groups')g where not rules?(g->>'code')
   or (g->>'rate')::numeric is distinct from (rules->>(g->>'code'))::numeric
   or (g->>'net')::bigint is distinct from (select sum((l->>'net')::bigint) from jsonb_array_elements(p_tax->'lines')l where l->>'code'=g->>'code')
   or (g->>'vat')::bigint is distinct from (select sum((l->>'vat')::bigint) from jsonb_array_elements(p_tax->'lines')l where l->>'code'=g->>'code')
   or (g->>'gross')::bigint is distinct from (select sum((l->>'gross')::bigint) from jsonb_array_elements(p_tax->'lines')l where l->>'code'=g->>'code'))
 or (select sum((g->>'net')::bigint) from jsonb_array_elements(p_tax->'groups')g) is distinct from total_net
 or (select sum((g->>'vat')::bigint) from jsonb_array_elements(p_tax->'groups')g) is distinct from total_vat
 or (select sum((g->>'gross')::bigint) from jsonb_array_elements(p_tax->'groups')g) is distinct from total_gross then raise exception 'Steuergruppen stimmen nicht mit den Summen überein.';end if;
 return p_tax;
end; $$;
revoke all on function app_private.invoice_tax_checked_v908(jsonb,jsonb) from public,anon;
grant execute on function app_private.invoice_tax_checked_v908(jsonb,jsonb) to authenticated;

create function app_private.invoice_parties_v908(p_parties jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare party jsonb;key text;checked jsonb:='{}';address jsonb;
begin
 if jsonb_typeof(p_parties) is distinct from 'object' then raise exception 'Bitte Aussteller und Rechnungsempfänger vollständig angeben.';end if;
 foreach key in array array['issuer','customer'] loop
  party:=p_parties->key;address:=party->'address';
  if jsonb_typeof(party) is distinct from 'object' or length(btrim(coalesce(party->>'name',''))) not between 2 and 200
    or jsonb_typeof(address) is distinct from 'array' or jsonb_array_length(address) not between 2 and 4
    or exists(select 1 from jsonb_array_elements(address) a where jsonb_typeof(a)<>'string' or length(btrim(a#>>'{}')) not between 2 and 200 or (a#>>'{}')~'[[:cntrl:]]')
    or (party->>'name')~'[[:cntrl:]]' then raise exception 'Bitte vollständigen Namen und Anschrift von Aussteller und Rechnungsempfänger prüfen.';end if;
  party:=jsonb_build_object('name',btrim(party->>'name'),'address',address);
  if key='issuer' then
   if length(btrim(coalesce(p_parties->key->>'taxNumber','')))=0 and length(btrim(coalesce(p_parties->key->>'vatId','')))=0 then raise exception 'Bitte Steuernummer oder Umsatzsteuer-ID des Ausstellers angeben.';end if;
   if exists(select 1 from jsonb_each_text(p_parties->key) f where f.key in ('taxNumber','vatId','email','phone','iban') and (length(f.value)>160 or f.value~'[[:cntrl:]]')) then raise exception 'Aussteller-Kontaktdaten sind ungültig.';end if;
   party:=party||jsonb_build_object('taxNumber',btrim(coalesce(p_parties->key->>'taxNumber','')),'vatId',btrim(coalesce(p_parties->key->>'vatId','')),'email',btrim(coalesce(p_parties->key->>'email','')),'phone',btrim(coalesce(p_parties->key->>'phone','')),'iban',btrim(coalesce(p_parties->key->>'iban','')));
  end if;
  checked:=checked||jsonb_build_object(key,party);
 end loop;
 return checked;
end;$$;
revoke all on function app_private.invoice_parties_v908(jsonb) from public,anon;
grant execute on function app_private.invoice_parties_v908(jsonb) to authenticated;

create function public.issue_invoice_batch_v908(p_id uuid,p_company uuid,p_number text,p_issued date,p_selection jsonb,p_tax jsonb,p_parties jsonb default null) returns public.invoice_batches_v908
language plpgsql security invoker set search_path='' as $$
declare prepared jsonb;existing public.invoice_batches_v908;result public.invoice_batches_v908;parties jsonb;number_clean text:=btrim(p_number);old_setting text:=coalesce(current_setting('app.invoice_ledger_v908',true),'');
begin
 if not app_private.invoice_manager_v908(p_company) then raise exception 'Keine Berechtigung für diese Rechnung.';end if;
 parties:=app_private.invoice_parties_v908(p_parties);
 perform pg_advisory_xact_lock(hashtextextended('invoice-v908:'||p_company::text,0));
 select * into existing from public.invoice_batches_v908 where id=p_id;
 if found then
   if existing.company_id=p_company and existing.invoice_number=number_clean and existing.issued_on=p_issued and existing.selection=p_selection and existing.document->'tax'=p_tax and existing.document->'issuer'=parties->'issuer' and existing.document->>'customer'=parties->'customer'->>'name' and existing.document->'address'=parties->'customer'->'address' then return existing;end if;
   raise exception 'Diese Abschlusskennung wurde bereits mit anderen Daten verwendet.';
 end if;
 if p_id is null or p_issued is null or p_issued not between '2000-01-01'::date and '2099-12-31'::date
 or number_clean is null or length(number_clean) not between 1 and 100 or number_clean~'[[:cntrl:]]' then raise exception 'Echte Rechnungsnummer und gültiges Ausstellungsdatum erforderlich.';end if;
 if exists(select 1 from public.invoice_batches_v908 where company_id=p_company and lower(invoice_number)=lower(number_clean))
 or exists(select 1 from public.invoice_cancellations_v908 where company_id=p_company and lower(cancellation_number)=lower(number_clean)) then raise exception 'Diese Rechnungs- oder Stornonummer wurde in diesem Betrieb bereits verwendet.';end if;
 if coalesce(jsonb_typeof(p_selection),'null')<>'array' or jsonb_array_length(p_selection) not between 1 and 200 then raise exception 'Keine gültige Auftragsauswahl.';end if;
 perform 1 from public.work_orders w where w.id in(select (e->>'id')::uuid from jsonb_array_elements(p_selection)e) order by w.id for update;
 perform 1 from public.work_order_items i where i.work_order_id in(select (e->>'id')::uuid from jsonb_array_elements(p_selection)e) for share;
 perform 1 from public.materials m where m.business_id=p_company for share;
 perform 1 from public.profiles p where p.id=p_company or app_private.team_company(p.id)=p_company for share;
 perform 1 from public.customers c where c.id in(select w.customer_id from public.work_orders w where w.id in(select (e->>'id')::uuid from jsonb_array_elements(p_selection)e)) for share;
 prepared:=public.prepare_invoice_batch_v908(p_company,(select jsonb_agg(e->>'id') from jsonb_array_elements(p_selection)e));
 if prepared->'selection' is distinct from p_selection then raise exception 'Aufträge, Preise oder Stammdaten wurden inzwischen geändert. Bitte Vorschau neu erstellen.';end if;
 perform app_private.invoice_tax_checked_v908(prepared->'document'->'items',p_tax);
 perform set_config('app.invoice_ledger_v908','issue',true);
 insert into public.invoice_batches_v908(id,company_id,customer_key,customer_name,invoice_number,issued_on,selection,document,source_snapshot)
 values(p_id,p_company,prepared->>'customer_key',prepared->>'customer_name',number_clean,p_issued,p_selection,
   (prepared->'document')||jsonb_build_object('number',number_clean,'issued',p_issued,'tax',p_tax,'issuer',parties->'issuer','customer',parties->'customer'->>'name','address',parties->'customer'->'address','finalized',true),(prepared->'source_snapshot')||jsonb_build_object('billing_parties',parties)) returning * into result;
 insert into public.invoice_order_links_v908(invoice_id,company_id,order_id) select p_id,p_company,(e->>'id')::uuid from jsonb_array_elements(p_selection)e;
 -- The normal work-report route reads billed item prices. Freeze the same exact
 -- resolved prices there, atomically, without copying or changing work hours.
 update public.work_order_items i set unit_price=(line.value->'resolved'->>'price')::numeric,position_name=line.value->'resolved'->>'name',unit=line.value->'resolved'->>'unit'
 from jsonb_array_elements(prepared->'source_snapshot'->'orders') source(value)
 cross join lateral jsonb_array_elements(source.value->'items') line(value)
 where i.id=(line.value->'item'->>'id')::uuid and i.work_order_id=(source.value->'order'->>'id')::uuid;
 update public.work_orders set invoiced=true,invoice_reopened_from_v908=null,invoice_reopened_at_v908=null where id in(select (e->>'id')::uuid from jsonb_array_elements(p_selection)e);
 perform set_config('app.invoice_ledger_v908',old_setting,true);
 return result;
end; $$;
revoke all on function public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.issue_invoice_batch_v908(uuid,uuid,text,date,jsonb,jsonb,jsonb) to authenticated;

create function public.cancel_invoice_batch_v908(p_id uuid,p_invoice uuid,p_number text,p_issued date,p_reason text,p_reopen boolean) returns public.invoice_cancellations_v908
language plpgsql security invoker set search_path='' as $$
declare original public.invoice_batches_v908;previous public.invoice_cancellations_v908;result public.invoice_cancellations_v908;
 doc jsonb;tax jsonb;negative_items jsonb;negative_lines jsonb;negative_groups jsonb;number_clean text:=btrim(p_number);
 old_setting text:=coalesce(current_setting('app.invoice_ledger_v908',true),'');
begin
 select * into original from public.invoice_batches_v908 where id=p_invoice;
 if not found or not app_private.invoice_manager_v908(original.company_id) then raise exception 'Rechnung nicht gefunden oder nicht berechtigt.';end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-v908:'||original.company_id::text,0));
 select * into previous from public.invoice_cancellations_v908 where invoice_id=p_invoice;
 if found then
  if previous.id=p_id and previous.cancellation_number=number_clean and previous.issued_on=p_issued and previous.reason=btrim(p_reason) and previous.reopen_orders=p_reopen then return previous;end if;
  raise exception 'Diese Rechnung wurde bereits storniert. Ein zweites Storno ist nicht zulässig.';
 end if;
 if p_id is null or p_reopen is null or p_issued is null or p_issued<original.issued_on or p_issued>'2099-12-31'::date
 or number_clean is null or length(number_clean) not between 1 and 100 or number_clean~'[[:cntrl:]]'
 or length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'Stornonummer, Datum ab Rechnungsdatum und nachvollziehbaren Grund angeben.';end if;
 if exists(select 1 from public.invoice_batches_v908 where company_id=original.company_id and lower(invoice_number)=lower(number_clean))
 or exists(select 1 from public.invoice_cancellations_v908 where company_id=original.company_id and lower(cancellation_number)=lower(number_clean)) then raise exception 'Diese Rechnungs- oder Stornonummer wurde bereits verwendet.';end if;
 select jsonb_agg(i||jsonb_build_object('quantity',-(i->>'quantity')::numeric)) into negative_items from jsonb_array_elements(original.document->'items')i;
 select jsonb_agg(l||jsonb_build_object('net',-(l->>'net')::bigint,'vat',-(l->>'vat')::bigint,'gross',-(l->>'gross')::bigint)) into negative_lines from jsonb_array_elements(original.document->'tax'->'lines')l;
 select jsonb_agg(g||jsonb_build_object('net',-(g->>'net')::bigint,'vat',-(g->>'vat')::bigint,'gross',-(g->>'gross')::bigint)) into negative_groups from jsonb_array_elements(original.document->'tax'->'groups')g;
 tax:=(original.document->'tax')||jsonb_build_object('lines',negative_lines,'groups',negative_groups,'net',-(original.document->'tax'->>'net')::bigint,'vat',-(original.document->'tax'->>'vat')::bigint,'gross',-(original.document->'tax'->>'gross')::bigint);
 doc:=original.document||jsonb_build_object('number',number_clean,'issued',p_issued,'items',negative_items,'total',-(original.document->>'total')::numeric,'tax',tax,'finalized',true,'cancellationOf',original.invoice_number,'cancellationReason',btrim(p_reason),'cancellationInvoiceId',original.id);
 perform set_config('app.invoice_ledger_v908',case when p_reopen then 'reopen' else 'cancel' end,true);
 insert into public.invoice_cancellations_v908(id,invoice_id,company_id,cancellation_number,issued_on,reason,reopen_orders,document)
 values(p_id,p_invoice,original.company_id,number_clean,p_issued,btrim(p_reason),p_reopen,doc) returning * into result;
 if p_reopen then
   perform 1 from public.work_orders w where w.id in(select order_id from public.invoice_order_links_v908 where invoice_id=p_invoice) order by w.id for update;
   if exists(select 1 from public.work_orders w join public.invoice_order_links_v908 l on l.order_id=w.id where l.invoice_id=p_invoice and (not w.invoiced or app_private.team_company(w.employee_id) is distinct from original.company_id)) then raise exception 'Auftragszuordnung hat sich geändert. Ändern wurde vollständig abgebrochen.';end if;
   update public.work_orders set invoiced=false,invoice_reopened_from_v908=original.id,invoice_reopened_at_v908=statement_timestamp() where id in(select order_id from public.invoice_order_links_v908 where invoice_id=p_invoice);
 end if;
 perform set_config('app.invoice_ledger_v908',old_setting,true);
 return result;
end; $$;
revoke all on function public.cancel_invoice_batch_v908(uuid,uuid,text,date,text,boolean) from public,anon;
grant execute on function public.cancel_invoice_batch_v908(uuid,uuid,text,date,text,boolean) to authenticated;

commit;
