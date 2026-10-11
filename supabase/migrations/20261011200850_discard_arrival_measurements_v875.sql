-- Discard unbooked measurements; keep a suppression marker, never erase hours.
begin;
alter table public.job_timers add column discarded_at timestamptz;
alter table public.job_timers add constraint job_timer_discarded_unbooked_v875
 check(discarded_at is null or (finished_at is not null and consumed_at is null and work_order_id is null));

create function app_private.discard_job_timer_v875(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; worker uuid; timer public.job_timers;
begin
 select * into actor from public.profiles where id=auth.uid() for update;
 if actor.id is null or actor.role is null or actor.role not in ('employee','business','administrator') then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 select employee_id into worker from public.job_timers where id=p_id;
 if worker is null then raise exception 'Die Messung ist nicht mehr verfügbar.' using errcode='42501';end if;
 perform 1 from public.profiles where id=worker for update;
 select * into timer from public.job_timers where id=p_id for update;
 if timer.id is null or not ((timer.employee_id=actor.id and timer.business_id is not distinct from app_private.team_company(actor.id))
 or app_private.team_can_manage(timer.business_id)) then raise exception 'Diese Messung gehört nicht zu Ihrem Arbeitskonto.' using errcode='42501';end if;
 if timer.consumed_at is not null or timer.work_order_id is not null then raise exception 'Diese Messung wurde bereits in einen Arbeitsschein übernommen. Bitte den Arbeitsschein öffnen.';end if;
 if timer.discarded_at is null then
  update public.job_timers set discarded_at=now(),finished_at=coalesce(finished_at,greatest(now(),started_at)) where id=timer.id returning * into timer;
  update app_private.owntracks_devices_v871 set timer_id=null,candidate_id=null,candidate_since=null,candidate_stamp=null,outside_since=null,last_status='discarded'
   where timer_id=timer.id;
 end if;
 return jsonb_build_object('id',timer.id,'discarded',true);
end $$;
revoke all on function app_private.discard_job_timer_v875(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.discard_job_timer_v875(uuid) to authenticated;
create function public.discard_job_timer_v875(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select app_private.discard_job_timer_v875(p_id)$$;
revoke all on function public.discard_job_timer_v875(uuid) from public,anon,authenticated,service_role;
grant execute on function public.discard_job_timer_v875(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
