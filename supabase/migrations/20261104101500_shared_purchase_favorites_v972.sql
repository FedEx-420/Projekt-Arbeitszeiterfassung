begin;
set local lock_timeout='5s';

create function app_private.can_share_purchase_lists_v972(company uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.profiles p where p.id=(select auth.uid()) and (
   p.role='administrator' or (p.role='business' and p.id=company) or
   (p.role='employee' and p.business_id=company and exists (
    select 1 from public.neugart_accounts_v971 a
    where a.company_id=company and p.id=any(a.employee_ids)
   ))
  )
 );
$$;
revoke all on function app_private.can_share_purchase_lists_v972(uuid) from public, anon;
grant execute on function app_private.can_share_purchase_lists_v972(uuid) to authenticated;

create policy favorites_company_read_v972 on public.material_favorite_lists_v959 for select to authenticated
using(app_private.can_share_purchase_lists_v972(business_id));
create policy favorite_items_company_read_v972 on public.material_favorite_items_v959 for select to authenticated
using(app_private.can_share_purchase_lists_v972(business_id));
create policy favorite_items_company_add_v972 on public.material_favorite_items_v959 for insert to authenticated
with check(app_private.can_share_purchase_lists_v972(business_id));
create policy favorite_items_company_edit_v972 on public.material_favorite_items_v959 for update to authenticated
using(app_private.can_share_purchase_lists_v972(business_id))
with check(app_private.can_share_purchase_lists_v972(business_id));
create policy favorite_items_company_remove_v972 on public.material_favorite_items_v959 for delete to authenticated
using(app_private.can_share_purchase_lists_v972(business_id));

commit;
