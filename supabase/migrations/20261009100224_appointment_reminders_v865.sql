begin;

-- One reminder per saved appointment. No changes to work orders, hours,
-- identities or push keys. Old firm defaults remain a compatibility fallback.
create table public.appointment_reminders (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  reminder_minutes integer not null default 30 check(reminder_minutes between 0 and 10080),
  notification_time time,
  check(notification_time is null or extract(second from notification_time)=0)
);
create index appointment_reminders_business on public.appointment_reminders(business_id);
alter table public.appointment_reminders enable row level security;
revoke all on public.appointment_reminders from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.appointment_reminders to authenticated;
grant select on public.appointment_reminders to service_role;

create policy appointment_reminder_read on public.appointment_reminders for select to authenticated using (
  app_private.team_can_manage(business_id) or (
    business_id=app_private.team_company((select auth.uid()))
    and exists(select 1 from public.appointments a where a.id=appointment_id
      and (a.employee_id=(select auth.uid()) or (select auth.uid())=any(a.team_employee_ids)))
  )
);
create policy appointment_reminder_insert on public.appointment_reminders for insert to authenticated with check (
  app_private.team_can_manage(business_id)
  and exists(select 1 from public.appointments a where a.id=appointment_id and app_private.team_company(a.employee_id)=business_id)
);
create policy appointment_reminder_update on public.appointment_reminders for update to authenticated using (
  app_private.team_can_manage(business_id)
) with check (
  app_private.team_can_manage(business_id)
  and exists(select 1 from public.appointments a where a.id=appointment_id and app_private.team_company(a.employee_id)=business_id)
);
create policy appointment_reminder_delete on public.appointment_reminders for delete to authenticated using(app_private.team_can_manage(business_id));

create function app_private.validate_appointment_reminder_v865()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare starts text; raw_notes text;
begin
  if new.enabled and new.notification_time is not null then
    select a.notes into raw_notes from public.appointments a where a.id=new.appointment_id;
    begin
      if left(raw_notes,10)='ZE-PLAN-1:' then starts:=substring(raw_notes from 11)::jsonb->>'start'; end if;
    exception when invalid_text_representation then starts:=null;
    end;
    if coalesce(starts,'')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' or new.notification_time>starts::time then
      raise exception 'Die Erinnerungsuhrzeit muss am Termintag vor oder zum Beginn liegen.' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.validate_appointment_reminder_v865() from public,anon,authenticated,service_role;

-- Preserve the effective settings of every existing plan. Missing firm
-- defaults stay disabled; a manager can explicitly enable that one plan.
insert into public.appointment_reminders(appointment_id,business_id,enabled,reminder_minutes,notification_time)
select a.id,app_private.team_company(a.employee_id),coalesce(c.enabled,false),coalesce(c.reminder_minutes,30),c.notification_time
from public.appointments a left join public.company_notification_settings c on c.business_id=app_private.team_company(a.employee_id)
where app_private.team_company(a.employee_id) is not null;

-- Attach after the backfill so legacy after-start/malformed plans keep the
-- exact old (non-delivering) behavior until a manager corrects their time.
create trigger validate_appointment_reminder_v865 before insert or update on public.appointment_reminders
for each row execute function app_private.validate_appointment_reminder_v865();

create or replace function public.claim_appointment_push_v863()
returns table(appointment_id uuid,subscription_id uuid,scheduled_at timestamptz,endpoint text,p256dh text,auth text)
language sql security invoker set search_path=pg_catalog,public,pg_temp as $$
  with due as (
    select a.id appointment_id,s.id subscription_id,
      app_private.reminder_at_v863(a.event_date,a.notes,
        case when r.appointment_id is not null then r.reminder_minutes else c.reminder_minutes end,
        case when r.appointment_id is not null then r.notification_time else c.notification_time end) scheduled_at
    from public.appointments a
    left join public.appointment_reminders r on r.appointment_id=a.id and r.business_id=app_private.team_company(a.employee_id)
    left join public.company_notification_settings c on c.business_id=app_private.team_company(a.employee_id)
    join public.push_subscriptions s on s.enabled and (s.user_id=a.employee_id or s.user_id=any(a.team_employee_ids))
    join public.profiles p on p.id=s.user_id and app_private.team_company(p.id)=app_private.team_company(a.employee_id)
    where (case when r.appointment_id is not null then r.enabled else coalesce(c.enabled,false) end)
      and a.event_date between (now() at time zone 'Europe/Berlin')::date-1 and (now() at time zone 'Europe/Berlin')::date+7
  ), claimed as (
    insert into public.push_deliveries(appointment_id,subscription_id,scheduled_at,lease_until)
    select d.appointment_id,d.subscription_id,d.scheduled_at,now()+interval '3 minutes' from due d
    where d.scheduled_at<=now() and d.scheduled_at>now()-interval '15 minutes'
      and not exists(select 1 from public.push_deliveries old where old.appointment_id=d.appointment_id and old.subscription_id=d.subscription_id and old.scheduled_at=d.scheduled_at and (old.sent_at is not null or old.lease_until>=now() or old.attempts>=3))
    order by d.scheduled_at limit 100
    on conflict(appointment_id,subscription_id,scheduled_at) do update set lease_until=excluded.lease_until,attempts=push_deliveries.attempts+1
    where push_deliveries.sent_at is null and push_deliveries.lease_until<now() and push_deliveries.attempts<3
    returning push_deliveries.appointment_id,push_deliveries.subscription_id,push_deliveries.scheduled_at
  ) select c.appointment_id,c.subscription_id,c.scheduled_at,s.endpoint,s.p256dh,s.auth from claimed c join public.push_subscriptions s on s.id=c.subscription_id;
$$;
revoke all on function public.claim_appointment_push_v863() from public,anon,authenticated;
grant execute on function public.claim_appointment_push_v863() to service_role;

notify pgrst,'reload schema';
commit;
