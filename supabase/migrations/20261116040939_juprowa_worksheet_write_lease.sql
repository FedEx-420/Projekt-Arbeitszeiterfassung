begin;

create table app_private.juprowa_worksheet_leases(
  business_id uuid not null references public.profiles(id) on delete cascade,
  worksheet_id text not null,
  nonce uuid not null,
  expires_at timestamptz not null,
  primary key(business_id,worksheet_id)
);
alter table app_private.juprowa_worksheet_leases enable row level security;
revoke all on app_private.juprowa_worksheet_leases from public,anon,authenticated;
grant select,insert,update,delete on app_private.juprowa_worksheet_leases to service_role;

create function public.juprowa_worksheet_lease(p_business uuid,p_revision uuid,p_sheet text,p_nonce uuid,p_release boolean)
returns boolean language plpgsql security invoker set search_path=''
as $$
begin
  if p_sheet !~ '^[1-9][0-9]{0,14}$' then return false; end if;
  if p_release then
    delete from app_private.juprowa_worksheet_leases
      where business_id=p_business and worksheet_id=p_sheet and nonce=p_nonce;
    return found;
  end if;
  if not exists(select 1 from public.juprowa_servicepad_connections where business_id=p_business and revision=p_revision)
    then return false; end if;
  insert into app_private.juprowa_worksheet_leases as lease(business_id,worksheet_id,nonce,expires_at)
    values(p_business,p_sheet,p_nonce,clock_timestamp()+interval '2 minutes')
    on conflict(business_id,worksheet_id) do update set nonce=excluded.nonce,expires_at=excluded.expires_at
      where lease.expires_at <= clock_timestamp();
  return found;
end;
$$;
revoke all on function public.juprowa_worksheet_lease(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.juprowa_worksheet_lease(uuid,uuid,text,uuid,boolean) to service_role;

commit;
