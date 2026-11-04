begin;
set local lock_timeout='5s';

create function app_private.can_manage_favorites_v980(company uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid())
  and (p.role='administrator' or (p.role='business' and p.id=company)));
$$;
revoke all on function app_private.can_manage_favorites_v980(uuid) from public,anon;
grant execute on function app_private.can_manage_favorites_v980(uuid) to authenticated;

-- Restrictive policies also constrain the old permissive owner ALL policy.
create policy favorites_manager_delete_v980 on public.material_favorite_lists_v959
as restrictive for delete to authenticated
using(app_private.can_manage_favorites_v980(business_id));
create policy favorite_items_manager_delete_v980 on public.material_favorite_items_v959
as restrictive for delete to authenticated
using(app_private.can_manage_favorites_v980(business_id));

-- Moving or replacing an entry's identity must not bypass DELETE protection.
create function app_private.protect_favorite_identity_v980()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.id,new.list_id,new.business_id,new.owner_id,new.article_key)
    is distinct from (old.id,old.list_id,old.business_id,old.owner_id,old.article_key)
    and not (app_private.can_manage_favorites_v980(old.business_id)
             and app_private.can_manage_favorites_v980(new.business_id)) then
  raise exception 'Nur Geschäftsleitung und Verwaltung dürfen Favoriten verschieben oder ersetzen.' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function app_private.protect_favorite_identity_v980() from public,anon;
create trigger protect_favorite_identity_v980 before update
on public.material_favorite_items_v959 for each row
execute function app_private.protect_favorite_identity_v980();
commit;
