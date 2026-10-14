-- Additional company documents only. Does not write any original application table.
begin;
create table public.company_legal_info_v900 (
 company_id uuid primary key references public.profiles(id) on delete cascade,
 details jsonb not null default '{}' check(jsonb_typeof(details)='object' and octet_length(details::text)<=20000),
 revision integer not null default 1 check(revision>0),
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table public.company_legal_documents_v900 (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.company_legal_info_v900(company_id) on delete cascade,
 kind text not null check(kind in ('imprint','privacy','avv','processors','contracts','accounting')),
 version integer not null check(version>0),
 info_revision integer not null check(info_revision>0),
 content text not null check(length(btrim(content)) between 1 and 30000),
 status text not null default 'draft' check(status in ('draft','reviewed','released')),
 reviewer text not null default '' check(length(reviewer)<=200),
 review_date date,
 evidence text not null default '' check(length(evidence)<=2000),
 confirmed boolean not null default false,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(company_id,kind,version),
 check(status='draft' or (confirmed and length(btrim(reviewer))>0 and review_date is not null and length(btrim(evidence))>0))
);
alter table public.company_legal_info_v900 enable row level security;
alter table public.company_legal_documents_v900 enable row level security;
revoke all on public.company_legal_info_v900, public.company_legal_documents_v900 from public,anon,authenticated;
grant select,insert on public.company_legal_info_v900,public.company_legal_documents_v900 to authenticated;
grant update(details) on public.company_legal_info_v900 to authenticated;

create function app_private.manage_company_legal_v900(p_company uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from public.profiles c where c.id=p_company and c.role='business')
 and (exists(select 1 from public.profiles p where p.id=auth.uid() and p.id=p_company and p.role='business')
 or exists(select 1 from public.platform_policy_v900 s where s.founder_profile_id=auth.uid()));
$$;
revoke all on function app_private.manage_company_legal_v900(uuid) from public,anon;
grant execute on function app_private.manage_company_legal_v900(uuid) to authenticated;
create policy company_legal_info_read on public.company_legal_info_v900 for select to authenticated
using(app_private.manage_company_legal_v900(company_id));
create policy company_legal_info_insert on public.company_legal_info_v900 for insert to authenticated
with check(app_private.manage_company_legal_v900(company_id));
create policy company_legal_info_update on public.company_legal_info_v900 for update to authenticated
using(app_private.manage_company_legal_v900(company_id)) with check(app_private.manage_company_legal_v900(company_id));
-- Narrow, non-exposed lookup needed to evaluate the latest published version
-- without allowing employees to read draft texts or private company form data.
create function app_private.current_company_legal_document_v900(p_company uuid,p_kind text,p_version integer,p_info_revision integer) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='employee' and p.business_id=p_company)
 and exists(select 1 from public.company_legal_info_v900 c where c.company_id=p_company and c.revision=p_info_revision)
 and p_version=(select max(version) from public.company_legal_documents_v900 d where d.company_id=p_company and d.kind=p_kind);
$$;
revoke all on function app_private.current_company_legal_document_v900(uuid,text,integer,integer) from public,anon;
grant execute on function app_private.current_company_legal_document_v900(uuid,text,integer,integer) to authenticated;
create policy company_legal_document_read on public.company_legal_documents_v900 for select to authenticated
using(app_private.manage_company_legal_v900(company_id) or (status='released' and app_private.current_company_legal_document_v900(company_id,kind,version,info_revision)));
create policy company_legal_document_insert on public.company_legal_documents_v900 for insert to authenticated
with check(app_private.manage_company_legal_v900(company_id));

create function app_private.stamp_company_legal_info_v900() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not app_private.manage_company_legal_v900(new.company_id) then raise exception 'Company permission missing.' using errcode='42501'; end if;
 if tg_op='UPDATE' and new.company_id is distinct from old.company_id then raise exception 'Company cannot be reassigned.'; end if;
 new.revision:=case when tg_op='UPDATE' then old.revision+1 else 1 end;
 new.updated_by:=auth.uid(); new.updated_at:=now(); return new;
end $$;
revoke all on function app_private.stamp_company_legal_info_v900() from public,anon,authenticated;
create trigger stamp_company_legal_info_v900 before insert or update on public.company_legal_info_v900
for each row execute function app_private.stamp_company_legal_info_v900();

create function app_private.stamp_company_legal_document_v900() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_revision integer; next_version integer;
begin
 if not app_private.manage_company_legal_v900(new.company_id) then raise exception 'Company permission missing.' using errcode='42501'; end if;
 select revision into current_revision from public.company_legal_info_v900 where company_id=new.company_id for update;
 select coalesce(max(version),0)+1 into next_version from public.company_legal_documents_v900 where company_id=new.company_id and kind=new.kind;
 if new.version<>next_version or new.info_revision<>current_revision then raise exception 'Document changed. Reload before saving.' using errcode='40001'; end if;
 if new.status<>'draft' and new.review_date>current_date then raise exception 'Review date cannot be in the future.'; end if;
 if new.status='draft' then new.reviewer:='';new.review_date:=null;new.evidence:='';new.confirmed:=false;end if;
 new.created_by:=auth.uid(); new.created_at:=now(); return new;
end $$;
revoke all on function app_private.stamp_company_legal_document_v900() from public,anon,authenticated;
create trigger stamp_company_legal_document_v900 before insert on public.company_legal_documents_v900
for each row execute function app_private.stamp_company_legal_document_v900();

create function public.save_company_legal_info_v900(p_company uuid,p_revision integer,p_details jsonb)
returns public.company_legal_info_v900 language plpgsql security invoker set search_path='' as $$
declare saved public.company_legal_info_v900;
begin
 if not app_private.manage_company_legal_v900(p_company) then raise exception 'Company permission missing.' using errcode='42501'; end if;
 if p_revision=0 then
  insert into public.company_legal_info_v900(company_id,details) values(p_company,p_details) returning * into saved;
 else
  update public.company_legal_info_v900 set details=p_details where company_id=p_company and revision=p_revision returning * into saved;
 end if;
 if saved.company_id is null then raise exception 'Company details changed. Reload before saving.' using errcode='40001'; end if;
 return saved;
end $$;
revoke all on function public.save_company_legal_info_v900(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_company_legal_info_v900(uuid,integer,jsonb) to authenticated;

-- One transaction for any draft bundle: no partly saved six-document set.
create function public.append_company_legal_documents_v900(p_company uuid,p_info_revision integer,p_documents jsonb)
returns setof public.company_legal_documents_v900 language plpgsql security invoker set search_path='' as $$
declare item jsonb; current_revision integer; current_version integer; saved public.company_legal_documents_v900;
begin
 if not app_private.manage_company_legal_v900(p_company) then raise exception 'Company permission missing.' using errcode='42501'; end if;
 select revision into current_revision from public.company_legal_info_v900 where company_id=p_company for update;
 if current_revision is null or current_revision is distinct from p_info_revision then raise exception 'Company details changed. Reload before saving.' using errcode='40001'; end if;
 if p_documents is null or jsonb_typeof(p_documents) is distinct from 'array' or jsonb_array_length(p_documents) not between 1 and 6 then raise exception 'One to six documents required.'; end if;
 for item in select value from jsonb_array_elements(p_documents) loop
  select coalesce(max(version),0) into current_version from public.company_legal_documents_v900 where company_id=p_company and kind=item->>'kind';
  if item->>'expected_version' is null or (item->>'expected_version')::integer<>current_version then raise exception 'Document changed. Reload before saving.' using errcode='40001'; end if;
  insert into public.company_legal_documents_v900(company_id,kind,version,info_revision,content,status,reviewer,review_date,evidence,confirmed)
   values(p_company,item->>'kind',current_version+1,current_revision,item->>'content',coalesce(item->>'status','draft'),coalesce(item->>'reviewer',''),nullif(item->>'review_date','')::date,coalesce(item->>'evidence',''),coalesce((item->>'confirmed')::boolean,false)) returning * into saved;
  return next saved;
 end loop;
end $$;
revoke all on function public.append_company_legal_documents_v900(uuid,integer,jsonb) from public,anon;
grant execute on function public.append_company_legal_documents_v900(uuid,integer,jsonb) to authenticated;
commit;
