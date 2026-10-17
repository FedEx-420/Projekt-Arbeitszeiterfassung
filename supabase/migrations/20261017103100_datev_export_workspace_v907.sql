-- Additive DATEV handoff workspace. Not an invoice ledger, tax filing or online connection.
begin;
create function app_private.datev_manager_v907(p_company uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles c where c.id=p_company and c.role='business')
 and exists(select 1 from public.profiles a where a.id=(select auth.uid()) and (a.role='administrator' or a.role='business' and a.id=p_company));
$$;
revoke all on function app_private.datev_manager_v907(uuid) from public,anon;
grant execute on function app_private.datev_manager_v907(uuid) to authenticated,service_role;

create table public.company_datev_settings_v907(
 company_id uuid primary key references public.profiles(id) on delete cascade,
 config jsonb not null,
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
create table public.datev_bookings_v907(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.profiles(id) on delete cascade,
 data jsonb not null,
 revision integer not null default 0,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.datev_exports_v907(
 id uuid primary key,
 company_id uuid not null references public.profiles(id) on delete cascade,
 period date not null check(extract(day from period)=1 and period>='2000-01-01' and period<'2100-01-01'),
 selection jsonb not null,
 settings_revision integer not null,
 settings jsonb not null default '{}',
 entries jsonb not null default '[]',
 booking_ids uuid[] not null default '{}',
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index datev_bookings_company on public.datev_bookings_v907(company_id,created_at desc);
create index datev_exports_company on public.datev_exports_v907(company_id,created_at desc);
create index datev_exports_bookings on public.datev_exports_v907 using gin(booking_ids);
alter table public.company_datev_settings_v907 enable row level security;
alter table public.datev_bookings_v907 enable row level security;
alter table public.datev_exports_v907 enable row level security;
revoke all on public.company_datev_settings_v907,public.datev_bookings_v907,public.datev_exports_v907 from public,anon,authenticated;
grant select on public.company_datev_settings_v907,public.datev_bookings_v907,public.datev_exports_v907 to authenticated;
grant insert(company_id,config),update(config) on public.company_datev_settings_v907 to authenticated;
grant insert(id,company_id,data),update(data),delete on public.datev_bookings_v907 to authenticated;
grant insert(id,company_id,period,selection,settings_revision) on public.datev_exports_v907 to authenticated;
grant all on public.company_datev_settings_v907,public.datev_bookings_v907,public.datev_exports_v907 to service_role;
create policy datev_settings_read on public.company_datev_settings_v907 for select to authenticated using(app_private.datev_manager_v907(company_id));
create policy datev_settings_write on public.company_datev_settings_v907 for all to authenticated using(app_private.datev_manager_v907(company_id)) with check(app_private.datev_manager_v907(company_id));
create policy datev_bookings_read on public.datev_bookings_v907 for select to authenticated using(app_private.datev_manager_v907(company_id));
create policy datev_bookings_write on public.datev_bookings_v907 for all to authenticated using(app_private.datev_manager_v907(company_id)) with check(app_private.datev_manager_v907(company_id));
create policy datev_exports_read on public.datev_exports_v907 for select to authenticated using(app_private.datev_manager_v907(company_id));
create policy datev_exports_insert on public.datev_exports_v907 for insert to authenticated with check(app_private.datev_manager_v907(company_id));

create function app_private.datev_settings_guard_v907() returns trigger language plpgsql security invoker set search_path='' as $$
declare c jsonb:=new.config; fiscal date;
begin
 if not app_private.datev_manager_v907(new.company_id) then raise exception 'Keine DATEV-Berechtigung.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('datev:'||new.company_id::text,0));
 if jsonb_typeof(c)<>'object' or not (c ?& array['consultant','client','fiscal_start','account_length','chart','posting']) or c-array['consultant','client','fiscal_start','account_length','chart','posting']<>'{}'::jsonb then raise exception 'Export-Einrichtung ist unvollständig.'; end if;
 if exists(select 1 from jsonb_each(c) x where jsonb_typeof(x.value)<>case when x.key='account_length' then 'number' else 'string' end) then raise exception 'Export-Einrichtung enthält ungültige Datentypen.'; end if;
 if c->>'consultant'!~'^[0-9]{4,7}$' or (c->>'consultant')::bigint not between 1001 and 9999999 or c->>'client'!~'^[0-9]{1,5}$' or (c->>'client')::int<1 then raise exception 'Berater- und Mandantennummer prüfen.'; end if;
 if c->>'account_length'!~'^[4-8]$' or c->>'chart'!~'^([0-9]{2}|[0-9]{4})$' or c->>'posting' not in ('0','1') then raise exception 'Kontenlänge, Kontenrahmen und Festschreibung prüfen.'; end if;
 if c->>'fiscal_start'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'Wirtschaftsjahresbeginn prüfen.'; end if;
 fiscal:=(c->>'fiscal_start')::date;
 if fiscal<'2000-01-01' or fiscal>='2100-01-01' then raise exception 'Wirtschaftsjahresbeginn außerhalb des unterstützten Bereichs.'; end if;
 new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;
 new.updated_at:=now(); return new;
end; $$;
revoke all on function app_private.datev_settings_guard_v907() from public,anon,authenticated;
create trigger datev_settings_guard before insert or update on public.company_datev_settings_v907 for each row execute function app_private.datev_settings_guard_v907();

create function app_private.datev_booking_guard_v907() returns trigger language plpgsql security invoker set search_path='' as $$
declare company uuid; d jsonb; docdate date;
begin
 company:=case when tg_op='DELETE' then old.company_id else new.company_id end;
 if current_user='service_role' and tg_op='DELETE' then return old; end if;
 if not app_private.datev_manager_v907(company) then raise exception 'Keine DATEV-Berechtigung.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('datev:'||company::text,0));
 if tg_op<>'INSERT' then
  if exists(select 1 from public.datev_exports_v907 e where e.company_id=company and e.booking_ids@>array[old.id]) then raise exception 'Bereits exportierte Daten bleiben unverändert. Eine separate Korrekturbuchung erfassen.'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.company_id<>old.company_id or new.id<>old.id then raise exception 'Firmenzuordnung und ID dürfen nicht geändert werden.'; end if;
 end if;
 d:=new.data;
 if jsonb_typeof(d)<>'object' or not(d ?& array['document_number','reference','document_date','amount_cents','direction','account','contra','booking_key','text','tax_confirmed']) or d-array['document_number','reference','document_date','amount_cents','direction','account','contra','booking_key','text','tax_confirmed']<>'{}'::jsonb then raise exception 'Buchungsdaten unvollständig oder nicht unterstützt.'; end if;
 if exists(select 1 from jsonb_each(d) x where jsonb_typeof(x.value)<>case when x.key='amount_cents' then 'number' when x.key='tax_confirmed' then 'boolean' else 'string' end) then raise exception 'Buchungsdaten enthalten ungültige Datentypen.'; end if;
 if coalesce(length(btrim(d->>'document_number')),0) not between 1 and 100 or d->>'reference'!~'^[A-Za-z0-9_$&%*+/-]{1,36}$' or d->>'reference'~'^[=+@-]' then raise exception 'Originalbelegnummer und DATEV-Belegschlüssel prüfen.'; end if;
 if d->>'document_date'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'Belegdatum prüfen.'; end if;
 docdate:=(d->>'document_date')::date;
 if jsonb_typeof(d->'amount_cents')<>'number' or d->>'amount_cents'!~'^[0-9]{1,12}$' or (d->>'amount_cents')::bigint not between 1 and 999999999999 then raise exception 'Positiven Betrag mit höchstens zwei Nachkommastellen angeben.'; end if;
 if d->>'direction' not in ('S','H') or d->>'account'!~'^[0-9]{1,9}$' or d->>'contra'!~'^[0-9]{1,9}$' or (d->>'account')::bigint=0 or (d->>'contra')::bigint=0 or d->>'account'=d->>'contra' then raise exception 'Soll/Haben, Konto und Gegenkonto prüfen.'; end if;
 if d->>'booking_key'<>'' and d->>'booking_key'!~'^[0-9]{4}$' then raise exception 'BU-Schlüssel vierstellig oder bei Kontenautomatik leer angeben.'; end if;
 if d->>'booking_key' in ('0049','0100','0400') then raise exception 'Dieser BU-Schlüssel benötigt zusätzliche, hier nicht unterstützte Steuerfelder.'; end if;
 if coalesce(length(btrim(d->>'text')),0) not between 1 and 60 or (d->>'tax_confirmed')::boolean is distinct from true then raise exception 'Buchungstext und Bestätigung der Kontierung prüfen.'; end if;
 if btrim(d->>'text')~'^[=+@-]' or btrim(d->>'document_number')~'^[=+@-]' or (d->>'text')~'[[:cntrl:]]' or (d->>'document_number')~'[[:cntrl:]]' then raise exception 'Steuerzeichen oder Tabellenformeln sind im Export nicht erlaubt.'; end if;
 if translate((d->>'text')||(d->>'document_number'),'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ','')!~'^[ -~ -ÿ]*$' then raise exception 'Die Texte enthalten Zeichen außerhalb des DATEV-Zeichensatzes Windows-1252.'; end if;
 new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;new.updated_at:=now();
 if tg_op='INSERT' then new.created_at:=now();new.created_by:=auth.uid(); end if;
 return new;
end; $$;
revoke all on function app_private.datev_booking_guard_v907() from public,anon,authenticated;
create trigger datev_booking_guard before insert or update or delete on public.datev_bookings_v907 for each row execute function app_private.datev_booking_guard_v907();

create function app_private.datev_export_guard_v907() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.company_datev_settings_v907; wanted integer; actual integer; ids uuid[]; finish date;
begin
 if not app_private.datev_manager_v907(new.company_id) then raise exception 'Keine DATEV-Berechtigung.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('datev:'||new.company_id::text,0));
 select * into p from public.company_datev_settings_v907 where company_id=new.company_id for update;
 if p.company_id is null or p.revision<>new.settings_revision then raise exception 'Export-Einrichtung wurde geändert. Bitte neu laden.' using errcode='40001'; end if;
 if jsonb_typeof(new.selection)<>'array' then raise exception 'Arbeitsscheine sind keine Buchungen. Bitte geprüfte Buchungsdaten auswählen.'; end if;
 wanted:=jsonb_array_length(new.selection);
 if wanted not between 1 and 1000 then raise exception 'Bitte 1 bis 1.000 geprüfte Buchungen je Export auswählen.'; end if;
 if exists(select 1 from jsonb_array_elements(new.selection) s where jsonb_typeof(s)<>'object' or not(s ?& array['id','revision']) or s-array['id','revision']<>'{}'::jsonb or s->>'revision'!~'^[0-9]+$') then raise exception 'Ungültige Auswahl.'; end if;
 select array_agg((s->>'id')::uuid) into ids from jsonb_array_elements(new.selection) s;
 if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Doppelte Buchung in Auswahl.'; end if;
 if exists(select 1 from public.datev_exports_v907 where company_id=new.company_id and booking_ids&&ids) then raise exception 'Ein Teil der Auswahl wurde bereits exportiert. Den vorhandenen Export erneut herunterladen.'; end if;
 finish:=(new.period+interval '1 month'-interval '1 day')::date;
 if new.period<(p.config->>'fiscal_start')::date or finish>=((p.config->>'fiscal_start')::date+interval '1 year')::date then raise exception 'Exportmonat liegt außerhalb des Wirtschaftsjahres.'; end if;
 perform 1 from public.datev_bookings_v907 where company_id=new.company_id and id=any(ids) order by id for update;
 select count(*) into actual from public.datev_bookings_v907 b join jsonb_array_elements(new.selection) s on b.id=(s->>'id')::uuid and b.revision=(s->>'revision')::int where b.company_id=new.company_id and (b.data->>'document_date')::date between new.period and finish;
 if actual<>wanted then raise exception 'Auswahl geändert, fremd oder außerhalb des Monats. Bitte neu laden.' using errcode='40001'; end if;
 if exists(select 1 from public.datev_bookings_v907 b where b.id=any(ids) and (length(b.data->>'account')>(p.config->>'account_length')::int+1 or length(b.data->>'contra')>(p.config->>'account_length')::int+1)) then raise exception 'Kontonummer passt nicht zur Sachkontenlänge.'; end if;
 new.settings:=p.config;
 select jsonb_agg(b.data||jsonb_build_object('id',b.id,'revision',b.revision) order by b.data->>'document_date',b.id) into new.entries from public.datev_bookings_v907 b where b.company_id=new.company_id and b.id=any(ids);
 new.booking_ids:=ids;new.created_by:=auth.uid();new.created_at:=now();return new;
end; $$;
revoke all on function app_private.datev_export_guard_v907() from public,anon,authenticated;
create trigger datev_export_guard before insert on public.datev_exports_v907 for each row execute function app_private.datev_export_guard_v907();

create function public.save_datev_settings_v907(p_company uuid,p_revision integer,p_config jsonb) returns public.company_datev_settings_v907 language plpgsql security invoker set search_path='' as $$
declare saved public.company_datev_settings_v907;
begin
 if not app_private.datev_manager_v907(p_company) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('datev:'||p_company::text,0));
 if p_revision=0 then insert into public.company_datev_settings_v907(company_id,config) values(p_company,p_config) returning * into saved;
 else update public.company_datev_settings_v907 set config=p_config where company_id=p_company and revision=p_revision returning * into saved; end if;
 if saved.company_id is null then raise exception 'Einrichtung wurde zwischenzeitlich geändert. Bitte neu laden.' using errcode='40001'; end if;return saved;
end; $$;
create function public.save_datev_booking_v907(p_id uuid,p_company uuid,p_revision integer,p_data jsonb) returns public.datev_bookings_v907 language plpgsql security invoker set search_path='' as $$
declare saved public.datev_bookings_v907;
begin
 if not app_private.datev_manager_v907(p_company) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('datev:'||p_company::text,0));
 if p_revision=0 then insert into public.datev_bookings_v907(id,company_id,data) values(p_id,p_company,p_data) returning * into saved;
 else update public.datev_bookings_v907 set data=p_data where id=p_id and company_id=p_company and revision=p_revision returning * into saved; end if;
 if saved.id is null then raise exception 'Buchung geändert oder nicht mehr verfügbar. Bitte neu laden.' using errcode='40001'; end if;return saved;
end; $$;
create function public.create_datev_export_v907(p_id uuid,p_company uuid,p_period date,p_selection jsonb,p_settings_revision integer) returns public.datev_exports_v907 language plpgsql security invoker set search_path='' as $$
declare saved public.datev_exports_v907;
begin
 if not app_private.datev_manager_v907(p_company) then raise exception 'Keine Berechtigung.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('datev:'||p_company::text,0));
 select * into saved from public.datev_exports_v907 where id=p_id;
 if saved.id is not null then
  if saved.company_id<>p_company or saved.period<>p_period or saved.selection<>p_selection or saved.settings_revision<>p_settings_revision then raise exception 'Export-ID ist bereits anders vergeben.'; end if;
  return saved;
 end if;
 insert into public.datev_exports_v907(id,company_id,period,selection,settings_revision) values(p_id,p_company,p_period,p_selection,p_settings_revision) returning * into saved;return saved;
end; $$;
revoke all on function public.save_datev_settings_v907(uuid,integer,jsonb),public.save_datev_booking_v907(uuid,uuid,integer,jsonb),public.create_datev_export_v907(uuid,uuid,date,jsonb,integer) from public,anon;
grant execute on function public.save_datev_settings_v907(uuid,integer,jsonb),public.save_datev_booking_v907(uuid,uuid,integer,jsonb),public.create_datev_export_v907(uuid,uuid,date,jsonb,integer) to authenticated;

-- Keep the actual generated bytes as well as the source snapshot, so future code
-- or price changes cannot alter a download already handed off to a business.
create table public.datev_export_artifacts_v907(
 export_id uuid primary key references public.datev_exports_v907(id) on delete cascade,
 company_id uuid not null references public.profiles(id) on delete cascade,
 content_base64 text not null check(length(content_base64) between 1 and 4000000),
 filename text not null check(length(filename) between 1 and 160 and filename~'^EXTF_[A-Za-z0-9_-]+\.csv$'),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 byte_count integer not null check(byte_count between 1 and 3000000),
 generated_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index datev_artifacts_company on public.datev_export_artifacts_v907(company_id,created_at desc);
alter table public.datev_export_artifacts_v907 enable row level security;
revoke all on public.datev_export_artifacts_v907 from public,anon,authenticated;
grant select on public.datev_export_artifacts_v907 to authenticated;
grant all on public.datev_export_artifacts_v907 to service_role;
create policy datev_artifacts_read on public.datev_export_artifacts_v907 for select to authenticated using(app_private.datev_manager_v907(company_id));
create function public.store_datev_artifact_v907(p_export uuid,p_actor uuid,p_content text,p_filename text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare batch public.datev_exports_v907; existing public.datev_export_artifacts_v907; bytes bytea; digest text;
begin
 select * into batch from public.datev_exports_v907 where id=p_export for update;
 if batch.id is null or not exists(select 1 from public.profiles a where a.id=p_actor and (a.role='administrator' or a.role='business' and a.id=batch.company_id)) then raise exception 'Keine Berechtigung für die Übergabe.' using errcode='42501'; end if;
 select * into existing from public.datev_export_artifacts_v907 where export_id=p_export;
 if existing.export_id is not null then return jsonb_build_object('export_id',existing.export_id,'sha256',existing.sha256,'byte_count',existing.byte_count,'already_saved',true); end if;
 if p_content is null or length(p_content)>4000000 then raise exception 'Dateigröße nicht unterstützt.'; end if;
 bytes:=pg_catalog.decode(p_content,'base64');digest:=pg_catalog.encode(pg_catalog.sha256(bytes),'hex');
 insert into public.datev_export_artifacts_v907(export_id,company_id,content_base64,filename,sha256,byte_count,generated_by)
 values(p_export,batch.company_id,p_content,p_filename,digest,pg_catalog.octet_length(bytes),p_actor);
 return jsonb_build_object('export_id',p_export,'sha256',digest,'byte_count',pg_catalog.octet_length(bytes),'already_saved',false);
end; $$;
revoke all on function public.store_datev_artifact_v907(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.store_datev_artifact_v907(uuid,uuid,text,text) to service_role;
commit;
