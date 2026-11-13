begin;

select cron.unschedule(jobid)
from cron.job
where jobname = 'klarwerk-supplier-portals';

update app_private.klarwerk_links_v1007
set offers_allowed = false
where offers_allowed;

create or replace function public.klarwerk_manage_v1007(p_actor uuid,p_company uuid,p_op text,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if p_op not in ('pair', 'links', 'revoke') then
    raise exception 'Diese Aktion ist in der Arbeitszeiterfassung nicht mehr verfügbar.' using errcode = '42501';
  end if;
  if p_op = 'pair' then
    p_body := coalesce(p_body, '{}'::jsonb) || '{"offers_allowed":false}'::jsonb;
  end if;
  return app_private.klarwerk_manage_v1007(p_actor,p_company,p_op,p_body);
end;
$$;

notify pgrst, 'reload schema';
commit;
