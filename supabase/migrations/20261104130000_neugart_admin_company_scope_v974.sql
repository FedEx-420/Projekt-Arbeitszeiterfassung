create or replace function public.neugart_account_v971(actor uuid, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 person public.profiles%rowtype;
 account public.neugart_accounts_v971%rowtype;
 target uuid;
 target_company uuid;
 employees uuid[];
begin
 select * into person from public.profiles where id=actor;
 if person.role is null or person.role not in ('administrator','business','employee') then
  raise exception 'Account unavailable' using errcode='42501';
 end if;
 if person.role='administrator' then
  target_company:=(payload->>'company')::uuid;
  if not exists(select 1 from public.profiles p where p.id=target_company and p.role='business') then
   raise exception 'Company unavailable' using errcode='42501';
  end if;
 elsif person.role='business' then target_company:=actor;
 else target_company:=person.business_id;
 end if;
 if operation='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'label',a.label,
   'employee_ids',case when person.role in ('administrator','business') then a.employee_ids else '{}'::uuid[] end) order by a.label,a.id)
   from public.neugart_accounts_v971 a where
   (person.role in ('administrator','business') and a.company_id=target_company) or
   (person.role='employee' and a.company_id=person.business_id and actor=any(a.employee_ids))), '[]'::jsonb);
 end if;
 if operation='create' and person.role in ('administrator','business') then
  insert into public.neugart_accounts_v971(company_id,label,secret_id)
  values(target_company,trim(payload->>'label'),vault.create_secret((payload->'credentials')::text))
  returning id into target;
  return jsonb_build_object('id',target);
 end if;
 select * into account from public.neugart_accounts_v971
 where id=(payload->>'id')::uuid and
 ((person.role in ('administrator','business') and company_id=target_company) or
  (operation='credentials' and person.role='employee' and company_id=person.business_id and actor=any(employee_ids)))
 for update;
 if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
 if operation='credentials' then
  return (select jsonb_build_object('company',account.company_id,'credentials',decrypted_secret::jsonb)
          from vault.decrypted_secrets where id=account.secret_id);
 elsif operation='grant' and person.role in ('administrator','business') then
  employees:=array(select distinct value::uuid from jsonb_array_elements_text(payload->'employee_ids'));
  if exists(select 1 from unnest(employees) e(id) where not exists
   (select 1 from public.profiles p where p.id=e.id and p.role='employee' and p.business_id=target_company)) then
   raise exception 'Employee unavailable' using errcode='42501';
  end if;
  update public.neugart_accounts_v971 set employee_ids=employees where id=account.id;
 elsif operation='delete' and person.role in ('administrator','business') then
  delete from public.neugart_accounts_v971 where id=account.id;
 else
  raise exception 'Operation unavailable' using errcode='42501';
 end if;
 return '{}'::jsonb;
end
$$;
revoke all on function public.neugart_account_v971(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.neugart_account_v971(uuid,text,jsonb) to service_role;
