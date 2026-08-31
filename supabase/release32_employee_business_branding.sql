-- Employees may only read their own profile through RLS. This narrow RPC
-- exposes exactly the branding data of their assigned business account.
create or replace function public.current_business_branding()
returns table (
  id uuid,
  company_name text,
  company_logo_path text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    business.id,
    business.company_name,
    business.company_logo_path
  from public.profiles as own
  join public.profiles as business
    on business.id = case
      when own.role = 'employee' then own.business_id
      when own.role = 'business' then own.id
      else null::uuid
    end
  where own.id = (select auth.uid())
    and (select auth.uid()) is not null
    and business.role = 'business';
$$;

revoke all on function public.current_business_branding() from public;
revoke all on function public.current_business_branding() from anon;
revoke all on function public.current_business_branding() from authenticated;
grant execute on function public.current_business_branding() to authenticated;
