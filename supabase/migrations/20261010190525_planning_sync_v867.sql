-- Small change checks instead of repeatedly transferring the full history.
-- No existing account, order, time, absence or customer record is changed.
begin;

create table app_private.planning_sync_revisions (
  company_id uuid primary key,
  revision bigint not null default 1 check (revision > 0)
);
alter table app_private.planning_sync_revisions enable row level security;
revoke all on app_private.planning_sync_revisions from public,anon,authenticated;
insert into app_private.planning_sync_revisions(company_id)
select id from public.profiles where role='business';
-- A profile deletion/reassignment may cascade after its company lookup vanished.
-- The opaque global counter invalidates every reader in that case.
insert into app_private.planning_sync_revisions(company_id)
values ('00000000-0000-0000-0000-000000000000');

create function app_private.bump_planning_sync_v867()
returns trigger language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare old_company uuid; new_company uuid; company uuid;
begin
  if tg_table_name <> 'profiles' then
    if tg_op in ('UPDATE','DELETE') then
      old_company:=coalesce((to_jsonb(old)->>'business_id')::uuid,
        app_private.team_company((to_jsonb(old)->>'employee_id')::uuid));
    end if;
    if tg_op in ('UPDATE','INSERT') then
      new_company:=coalesce((to_jsonb(new)->>'business_id')::uuid,
        app_private.team_company((to_jsonb(new)->>'employee_id')::uuid));
    end if;
  end if;
  for company in
    select distinct id from unnest(array[old_company,new_company]) id
    where id is not null order by id
  loop
    insert into app_private.planning_sync_revisions as revisions(company_id,revision)
    values (company,1) on conflict(company_id) do update
    set revision=revisions.revision+1;
  end loop;
  if old_company is null and new_company is null then
    update app_private.planning_sync_revisions set revision=revision+1
    where company_id='00000000-0000-0000-0000-000000000000';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function app_private.bump_planning_sync_v867() from public,anon,authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','appointments','work_days',
    'vacation_requests','work_orders','time_entries','customers','planning_requests']
  loop
    execute format('create trigger planning_sync_v867 after insert or update or delete on public.%I for each row execute function app_private.bump_planning_sync_v867()',table_name);
  end loop;
end; $$;

-- Definer is necessary only to read the hidden counters/live actor. It returns
-- an opaque digest, never customer/profile IDs, counts or other firms' data.
create function app_private.planning_sync_stamp_v867()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,pg_temp as $$
declare actor public.profiles%rowtype; company uuid; stamp text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if not found or coalesce(actor.role,'') not in ('administrator','business','employee') then
    raise exception 'Bitte mit einem vorhandenen Konto anmelden.' using errcode='42501';
  end if;
  company:=app_private.team_company(actor.id);
  if actor.role <> 'administrator' and company is null then
    raise exception 'Das Konto gehört zu keiner Firma.' using errcode='42501';
  end if;
  select md5(actor.id::text||':'||coalesce(string_agg(r.company_id::text||':'||r.revision::text,',' order by r.company_id),''))
  into stamp from app_private.planning_sync_revisions r
  where actor.role='administrator' or r.company_id=company
    or r.company_id='00000000-0000-0000-0000-000000000000';
  return jsonb_build_object('version',1,'stamp',stamp);
end; $$;
revoke all on function app_private.planning_sync_stamp_v867() from public,anon,authenticated;
grant execute on function app_private.planning_sync_stamp_v867() to authenticated;
create function public.planning_sync_stamp()
returns jsonb language sql stable security invoker
set search_path=pg_catalog,pg_temp as $$
  select app_private.planning_sync_stamp_v867();
$$;
revoke all on function public.planning_sync_stamp() from public,anon,authenticated;
grant execute on function public.planning_sync_stamp() to authenticated;
commit;
