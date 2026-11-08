-- Supplemental finance workspace; native issued invoices/work orders are untouched.
create schema if not exists app_private;
create or replace function app_private.finance_access_v1000(target text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists (
  select 1 from public.profiles actor join public.profiles company on company.id::text=target and company.role='business'
  where actor.id=(select auth.uid()) and (actor.role='administrator' or (actor.role='business' and actor.id=company.id))
 );
$$;
revoke all on function app_private.finance_access_v1000(text) from public,anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.finance_access_v1000(text) to authenticated;

create or replace function app_private.finance_valid_v1000(body jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text; doc jsonb; t jsonb;
begin
 if jsonb_typeof(body) is distinct from 'object' or octet_length(body::text)>2200000 or jsonb_typeof(body->'profile') is distinct from 'object' or jsonb_typeof(body->'templates') is distinct from 'object' then return false; end if;
 foreach k in array array['invoices','quotes','expenses','clients','transactions','log'] loop
  if jsonb_typeof(body->k) is distinct from 'array' or jsonb_array_length(body->k)>50000 then return false; end if;
 end loop;
 for doc in select value from jsonb_array_elements((body->'invoices')||(body->'quotes')||coalesce(body->'trash','[]'::jsonb)) loop
  if coalesce(doc->>'key','')!~'^[A-Za-z0-9_-]{1,100}$' or coalesce(doc->>'kind','') not in ('invoice','quote') or jsonb_typeof(doc->'items') is distinct from 'array' or jsonb_typeof(doc->'payments') is distinct from 'array' then return false; end if;
 end loop;
 for doc in select value from jsonb_array_elements(body->'expenses') loop
  if coalesce(doc->>'key','')!~'^[A-Za-z0-9_-]{1,100}$' or (coalesce(doc->>'asset','')<>'' and doc->>'asset'!~'^[A-Za-z0-9_-]{1,100}$') then return false; end if;
 end loop;
 for doc in select value from jsonb_array_elements(body->'transactions') loop
  if coalesce(doc->>'id','')!~'^[A-Za-z0-9_-]{1,100}$' or (coalesce(doc->>'match','')<>'' and doc->>'match'!~'^(expense:)?[A-Za-z0-9_-]{1,100}$') then return false; end if;
 end loop;
 for t in select body#>'{templates,invoice}' union all select body#>'{templates,quote}' union all select value#>'{frozen,template}' from jsonb_array_elements((body->'invoices')||(body->'quotes')||coalesce(body->'trash','[]'::jsonb)) where value?'frozen' loop
  if t is null or coalesce(t->>'color','')!~'^#[a-fA-F0-9]{6}$' or coalesce(t->>'layout','') not in ('left','right') then return false; end if;
  foreach k in array array['logo','background'] loop
   if coalesce(t->>k,'')<>'' and t->>k!~'^[A-Za-z0-9_-]{1,100}$' then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end;
$$;
revoke all on function app_private.finance_valid_v1000(jsonb) from public,anon;
grant execute on function app_private.finance_valid_v1000(jsonb) to authenticated;
create table public.finance_workspaces_v1000(
 company_id uuid primary key references public.profiles(id) on delete restrict,
 state jsonb not null check(app_private.finance_valid_v1000(state)),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default statement_timestamp(),
 updated_by uuid not null default auth.uid() references public.profiles(id)
);
alter table public.finance_workspaces_v1000 enable row level security;
revoke all on public.finance_workspaces_v1000 from anon;
grant select,insert,update on public.finance_workspaces_v1000 to authenticated;
create policy finance_read_v1000 on public.finance_workspaces_v1000 for select to authenticated using(app_private.finance_access_v1000(company_id::text));
create policy finance_insert_v1000 on public.finance_workspaces_v1000 for insert to authenticated with check(app_private.finance_access_v1000(company_id::text) and updated_by=(select auth.uid()));
create policy finance_update_v1000 on public.finance_workspaces_v1000 for update to authenticated using(app_private.finance_access_v1000(company_id::text)) with check(app_private.finance_access_v1000(company_id::text) and updated_by=(select auth.uid()));
create table public.finance_events_v1000(id bigint generated always as identity primary key,company_id uuid not null references public.profiles(id),actor_id uuid not null references public.profiles(id),revision integer not null,created_at timestamptz not null default statement_timestamp());
alter table public.finance_events_v1000 enable row level security;
revoke all on public.finance_events_v1000 from public,anon,authenticated;
grant select on public.finance_events_v1000 to authenticated;
create policy finance_events_read_v1000 on public.finance_events_v1000 for select to authenticated using(app_private.finance_access_v1000(company_id::text));
create index finance_events_company_v1000 on public.finance_events_v1000(company_id,created_at desc);
create function app_private.finance_revision_v1000() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Login required' using errcode='42501';end if;
 if TG_OP='UPDATE' and (new.company_id<>old.company_id or new.version<>old.version+1) then raise exception 'Revision conflict' using errcode='40001';end if;
 new.updated_by:=(select auth.uid());new.updated_at:=statement_timestamp();
 return new;
end $$;
revoke all on function app_private.finance_revision_v1000() from public,anon,authenticated;
create trigger finance_revision_v1000 before insert or update on public.finance_workspaces_v1000 for each row execute function app_private.finance_revision_v1000();
create function app_private.finance_audit_v1000() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.finance_events_v1000(company_id,actor_id,revision) values(new.company_id,(select auth.uid()),new.version);return new;end $$;
revoke all on function app_private.finance_audit_v1000() from public,anon,authenticated;
create trigger finance_audit_v1000 after insert or update on public.finance_workspaces_v1000 for each row execute function app_private.finance_audit_v1000();
create function public.finance_save_v1000(p_company uuid,p_version integer,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved integer;
begin
 if not app_private.finance_access_v1000(p_company::text) then raise exception 'Finance access denied' using errcode='42501';end if;
 if not app_private.finance_valid_v1000(p_state) then raise exception 'Invalid finance data' using errcode='22023';end if;
 if p_version=0 then
  insert into public.finance_workspaces_v1000(company_id,state,version,updated_by) values(p_company,p_state,1,(select auth.uid())) on conflict(company_id) do nothing returning version into saved;
 else
  update public.finance_workspaces_v1000 set state=p_state,version=version+1,updated_by=(select auth.uid()) where company_id=p_company and version=p_version returning version into saved;
 end if;
 if saved is null then raise exception 'Finance revision conflict. Reload before saving.' using errcode='40001';end if;
 return jsonb_build_object('version',saved);
end $$;
revoke all on function public.finance_save_v1000(uuid,integer,jsonb) from public,anon;
grant execute on function public.finance_save_v1000(uuid,integer,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('finance-v1000','finance-v1000',false,15000000,array['application/json']) on conflict(id) do nothing;
create policy finance_files_read_v1000 on storage.objects for select to authenticated using(bucket_id='finance-v1000' and app_private.finance_access_v1000((storage.foldername(name))[1]));
create policy finance_files_insert_v1000 on storage.objects for insert to authenticated with check(bucket_id='finance-v1000' and app_private.finance_access_v1000((storage.foldername(name))[1]) and name~'^[a-fA-F0-9-]{36}/[A-Za-z0-9_-]{1,100}\.json$');
create policy finance_files_update_v1000 on storage.objects for update to authenticated using(bucket_id='finance-v1000' and app_private.finance_access_v1000((storage.foldername(name))[1])) with check(bucket_id='finance-v1000' and app_private.finance_access_v1000((storage.foldername(name))[1]) and name~'^[a-fA-F0-9-]{36}/[A-Za-z0-9_-]{1,100}\.json$');
