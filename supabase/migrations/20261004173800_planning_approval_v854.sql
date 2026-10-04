-- Additive planning proposals. No historical records are rewritten.
begin;
create table public.planning_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  team_employee_ids uuid[] not null default '{}',
  event_date date not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check(length(customer_name) between 1 and 160),
  title text not null check(length(title) between 1 and 160),
  notes text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
  revision integer not null default 1,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index planning_requests_company_status on public.planning_requests(business_id,status,event_date);
create index planning_requests_submitter on public.planning_requests(submitted_by,created_at);
create index planning_requests_employee on public.planning_requests(employee_id);
create index planning_requests_customer on public.planning_requests(customer_id);
create index planning_requests_reviewer on public.planning_requests(reviewed_by);
alter table public.planning_requests enable row level security;
revoke all on public.planning_requests from public,anon,authenticated;
grant select on public.planning_requests to authenticated;
create policy "Own proposals or own company management" on public.planning_requests for select to authenticated
using(submitted_by=(select auth.uid()) or app_private.team_can_manage(business_id));

create function app_private.planning_meta(p_notes text) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
begin
  if left(p_notes,10)='ZE-PLAN-1:' then return substring(p_notes from 11)::jsonb; end if;
  return '{}'::jsonb;
exception when invalid_text_representation then return '{}'::jsonb;
end; $$;

create function app_private.save_planning_request(p_data jsonb,p_revision integer default null)
returns public.planning_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.profiles%rowtype; old public.planning_requests%rowtype; saved public.planning_requests%rowtype;
  request_id uuid; owner uuid; company uuid; members uuid[]; member uuid; customer public.customers%rowtype;
  event_day date; starts text; ends text; meta jsonb; title_value text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if not found then raise exception 'Bitte anmelden.'; end if;
  request_id:=nullif(p_data->>'id','')::uuid;
  if request_id is not null then
    select * into old from public.planning_requests where id=request_id for update;
    if not found or not (old.submitted_by=actor.id or app_private.team_can_manage(old.business_id)) then raise exception 'Die Planungsanfrage ist nicht verfügbar.'; end if;
    if old.status not in ('pending','rejected') then raise exception 'Diese Anfrage ist bereits abgeschlossen.'; end if;
    if p_revision is distinct from old.revision then raise exception 'Die Planung wurde inzwischen geändert. Bitte neu öffnen.'; end if;
  end if;
  owner:=coalesce(nullif(p_data->>'employee_id','')::uuid,actor.id);
  company:=app_private.team_company(owner);
  if company is null or not exists(select 1 from public.profiles where id=company and role='business') then raise exception 'Ein Mitarbeiter einer bestehenden Firma ist erforderlich.'; end if;
  if actor.role='employee' then
    if owner<>actor.id or company is distinct from actor.business_id or (old.id is not null and old.submitted_by<>actor.id) then raise exception 'Nur eigene Planungsanfragen dürfen eingereicht werden.'; end if;
  elsif not app_private.team_can_manage(company) then raise exception 'Keine Berechtigung für diese Firma.'; end if;
  if old.id is not null and old.business_id<>company then raise exception 'Die Firma einer Anfrage darf nicht geändert werden.'; end if;
  if jsonb_typeof(coalesce(p_data->'team_employee_ids','[]'))<>'array' then raise exception 'Ungültige Mitarbeiterauswahl.'; end if;
  select coalesce(array_agg(distinct value::uuid) filter(where value::uuid<>owner),'{}') into members from jsonb_array_elements_text(coalesce(p_data->'team_employee_ids','[]'));
  if cardinality(members)>100 then raise exception 'Zu viele Mitarbeiter.'; end if;
  foreach member in array members loop
    if app_private.team_company(member) is distinct from company then raise exception 'Alle Mitarbeiter müssen derselben Firma angehören.'; end if;
  end loop;
  event_day:=(p_data->>'event_date')::date;
  starts:=p_data->>'start'; ends:=p_data->>'end';
  if event_day is null or starts is null or ends is null or starts!~'^(0[0-9]|1[0-9]|2[0-3]):(00|15|30|45)$' or ends!~'^(0[0-9]|1[0-9]|2[0-3]):(00|15|30|45)$' or ends<=starts then raise exception 'Bitte gültige Viertelstunden-Zeiten eingeben.'; end if;
  foreach member in array array_prepend(owner,members) loop perform app_private.team_check_day(member,event_day); end loop;
  select * into customer from public.customers where id=nullif(p_data->>'customer_id','')::uuid;
  if not found or app_private.team_company(customer.employee_id) is distinct from company then raise exception 'Bitte einen Kunden dieser Firma auswählen.'; end if;
  title_value:=left(btrim(coalesce(p_data->>'title','')),160);
  if title_value='' then raise exception 'Bitte eine Beschreibung eingeben.'; end if;
  meta:=jsonb_build_object('start',starts,'end',ends,'status','planned','priority',case when p_data->>'priority' in ('low','normal','high') then p_data->>'priority' else 'normal' end,'details',left(btrim(coalesce(p_data->>'details','')),4000),'workOrderId','','customerDetails',jsonb_build_object('name',customer.name,'custom_fields',customer.custom_fields));
  if old.id is null then
    insert into public.planning_requests(employee_id,business_id,submitted_by,team_employee_ids,event_date,customer_id,customer_name,title,notes)
    values(owner,company,actor.id,members,event_day,customer.id,customer.name,title_value,'ZE-PLAN-1:'||meta::text) returning * into saved;
  else
    update public.planning_requests set employee_id=owner,team_employee_ids=members,event_date=event_day,customer_id=customer.id,customer_name=customer.name,title=title_value,notes='ZE-PLAN-1:'||meta::text,status='pending',revision=revision+1,reviewed_by=null,reviewed_at=null,review_note='',updated_at=now() where id=old.id returning * into saved;
  end if;
  if old.id is null or old.status='rejected' or actor.role='employee' then
    insert into public.mailbox_messages(recipient_id,sender_id,message_type,title,body)
    select id,actor.id,'info',left('Planung zur Freigabe: '||customer.name,160),jsonb_build_object('planning_request_id',saved.id,'message',coalesce(nullif(actor.display_name,''),actor.username)||' hat den Auftrag „'||title_value||'“ am '||to_char(event_day,'DD.MM.YYYY')||' von '||starts||' bis '||ends||' Uhr eingereicht. Bitte in der Planungsübersicht bearbeiten und freigeben.') from public.profiles where id=company or role='administrator';
  end if;
  return saved;
end; $$;

create function app_private.review_planning_request(p_id uuid,p_revision integer,p_action text,p_note text default '')
returns public.planning_requests language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request public.planning_requests%rowtype; member uuid; meta jsonb; existing public.appointments%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Bitte anmelden.'; end if;
  select * into request from public.planning_requests where id=p_id for update;
  if not found then raise exception 'Die Anfrage wurde nicht gefunden.'; end if;
  if p_action='withdraw' then
    if request.submitted_by<>auth.uid() then raise exception 'Nur eigene Anfragen können zurückgezogen werden.'; end if;
  elsif p_action not in ('approve','reject') or not app_private.team_can_manage(request.business_id) then raise exception 'Nur die Geschäftsleitung darf diese Anfrage freigeben.'; end if;
  if request.status='approved' and p_action='approve' then return request; end if;
  if request.status<>'pending' then raise exception 'Diese Anfrage ist nicht mehr offen.'; end if;
  if request.revision is distinct from p_revision then raise exception 'Die Planung wurde inzwischen geändert. Bitte neu öffnen.'; end if;
  if p_action='approve' then
    perform pg_advisory_xact_lock(hashtextextended(request.business_id::text||request.event_date::text,854));
    meta:=app_private.planning_meta(request.notes);
    if app_private.team_company(request.employee_id) is distinct from request.business_id then raise exception 'Der Mitarbeiter gehört nicht mehr zur Firma.'; end if;
    if request.customer_id is null or not exists(select 1 from public.customers c where c.id=request.customer_id and app_private.team_company(c.employee_id)=request.business_id) then raise exception 'Der Kunde wurde entfernt oder gehört nicht mehr zur Firma.'; end if;
    foreach member in array array_prepend(request.employee_id,request.team_employee_ids) loop
      if app_private.team_company(member) is distinct from request.business_id then raise exception 'Ein Mitarbeiter gehört nicht mehr zur Firma.'; end if;
      perform app_private.team_check_day(member,request.event_date);
      if exists(select 1 from public.appointments a where a.event_date=request.event_date and (a.employee_id=member or member=any(a.team_employee_ids)) and coalesce(app_private.planning_meta(a.notes)->>'status','planned')<>'cancelled' and app_private.planning_meta(a.notes)->>'start'<meta->>'end' and app_private.planning_meta(a.notes)->>'end'>meta->>'start') then raise exception 'Ein Mitarbeiter hat zu dieser Zeit bereits einen geplanten Auftrag.'; end if;
    end loop;
    insert into public.appointments(id,employee_id,team_employee_ids,event_date,customer_id,customer_name,title,notes)
    values(request.id,request.employee_id,request.team_employee_ids,request.event_date,request.customer_id,request.customer_name,request.title,request.notes);
  end if;
  update public.planning_requests set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'withdrawn' end,reviewed_by=auth.uid(),review_note=left(btrim(coalesce(p_note,'')),2000),reviewed_at=now(),updated_at=now(),revision=revision+1 where id=p_id returning * into request;
  if p_action in ('approve','reject') then
    insert into public.mailbox_messages(recipient_id,sender_id,message_type,title,body)
    values(request.submitted_by,auth.uid(),'info',case p_action when 'approve' then 'Planung genehmigt: ' else 'Planung abgelehnt: ' end||left(request.customer_name,120),jsonb_build_object('planning_request_id',request.id,'message','Ihr Planungsvorschlag „'||request.title||'“ am '||to_char(request.event_date,'DD.MM.YYYY')||case p_action when 'approve' then ' wurde genehmigt und veröffentlicht.' else ' wurde abgelehnt.' end||case when request.review_note<>'' then E'\n'||request.review_note else '' end));
  end if;
  if p_action='approve' then
    insert into public.mailbox_messages(recipient_id,sender_id,message_type,title,body)
    select member_id,auth.uid(),'info',left('Neuer geplanter Auftrag: '||request.customer_name,160),jsonb_build_object('message','Der Auftrag „'||request.title||'“ am '||to_char(request.event_date,'DD.MM.YYYY')||' wurde in Ihrer Planungsübersicht veröffentlicht.') from unnest(array_prepend(request.employee_id,request.team_employee_ids)) member_id where member_id<>request.submitted_by and member_id<>auth.uid();
  end if;
  return request;
end; $$;

-- Client-facing wrappers use INVOKER; privileged validation stays private.
create function public.save_planning_request(p_data jsonb,p_revision integer default null) returns public.planning_requests language sql security invoker set search_path='' as $$select app_private.save_planning_request(p_data,p_revision)$$;
create function public.review_planning_request(p_id uuid,p_revision integer,p_action text,p_note text default '') returns public.planning_requests language sql security invoker set search_path='' as $$select app_private.review_planning_request(p_id,p_revision,p_action,p_note)$$;
revoke all on function app_private.planning_meta(text),app_private.save_planning_request(jsonb,integer),app_private.review_planning_request(uuid,integer,text,text),public.save_planning_request(jsonb,integer),public.review_planning_request(uuid,integer,text,text) from public,anon;
grant execute on function app_private.save_planning_request(jsonb,integer),app_private.review_planning_request(uuid,integer,text,text),public.save_planning_request(jsonb,integer),public.review_planning_request(uuid,integer,text,text) to authenticated;
grant execute on function app_private.team_can_manage(uuid) to authenticated;

-- Also prevent a direct REST insert from bypassing the proposal workflow.
create function app_private.guard_planning_publication() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if auth.uid() is not null and not app_private.team_can_manage(app_private.team_company(new.employee_id)) then raise exception 'Mitarbeiterplanungen müssen zuerst von der Geschäftsleitung freigegeben werden.'; end if;
  return new;
end; $$;
revoke all on function app_private.guard_planning_publication() from public,anon,authenticated;
create trigger guard_planning_publication before insert on public.appointments for each row execute function app_private.guard_planning_publication();
notify pgrst,'reload schema';
commit;
