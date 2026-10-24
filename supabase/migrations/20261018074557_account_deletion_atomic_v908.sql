-- User-approved temporary suspension. This migration installs no destructive
-- account implementation. Shared planning and in-flight Storage writes require
-- a separately verified lifecycle protocol before hard deletion can return.
begin;
create function public.delete_account_v908(p_actor uuid,p_target uuid,p_kind text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'Das Löschen von Konten ist vorübergehend pausiert. Es wurden keine Daten und keine Zugänge geändert. Das Konto kann weiterhin verwendet werden.'
  using errcode='55000';
end;
$$;
revoke all on function public.delete_account_v908(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_account_v908(uuid,uuid,text) to service_role;
commit;
