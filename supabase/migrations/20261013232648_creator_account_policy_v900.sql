-- Additive policy. No existing Auth user, profile, work record or file is changed.
begin;

create table public.platform_policy_v900 (
  singleton boolean primary key default true check (singleton),
  founder_profile_id uuid not null references public.profiles(id) on delete restrict,
  future_plan_name text not null default 'Standard' check (length(btrim(future_plan_name)) between 1 and 80),
  future_monthly_cents integer not null default 0 check (future_monthly_cents between 0 and 10000000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
create table public.company_entitlements_v900 (
  company_id uuid primary key references public.profiles(id) on delete cascade,
  account_policy text not null check (account_policy in ('existing_free','new_fixed_price')),
  monthly_cents integer not null check (monthly_cents between 0 and 10000000),
  plan_name text not null,
  price_revision integer not null check (price_revision >= 0),
  created_at timestamptz not null default now(),
  check (account_policy <> 'existing_free' or monthly_cents = 0)
);
alter table public.platform_policy_v900 enable row level security;
alter table public.company_entitlements_v900 enable row level security;
revoke all on public.platform_policy_v900, public.company_entitlements_v900 from public, anon, authenticated;
grant select on public.platform_policy_v900, public.company_entitlements_v900 to authenticated;
grant update (future_plan_name, future_monthly_cents) on public.platform_policy_v900 to authenticated;

-- Pin the existing single administrator, not a name, metadata claim or new account.
do $$
begin
  if (select count(*) from public.profiles where role = 'administrator') <> 1 then
    raise exception 'Exactly one existing administrator is required; no policy was installed.';
  end if;
end $$;
insert into public.platform_policy_v900 (founder_profile_id)
select id from public.profiles where role = 'administrator';
insert into public.company_entitlements_v900 (company_id, account_policy, monthly_cents, plan_name, price_revision)
select id, 'existing_free', 0, 'Kostenloser Bestand', 0 from public.profiles where role = 'business';

create policy founder_read_v900 on public.platform_policy_v900 for select to authenticated
using (founder_profile_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'administrator'
));
create policy founder_price_v900 on public.platform_policy_v900 for update to authenticated
using (founder_profile_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'administrator'
)) with check (founder_profile_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'administrator'
));
create policy company_plan_read_v900 on public.company_entitlements_v900 for select to authenticated
using (
  company_id = (select auth.uid())
  or company_id = (select p.business_id from public.profiles p where p.id = (select auth.uid()))
  or exists (select 1 from public.platform_policy_v900 s where s.founder_profile_id = (select auth.uid()))
);

create function app_private.price_revision_v900() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.founder_profile_id is distinct from old.founder_profile_id then
    raise exception 'The founder identity cannot be reassigned.';
  end if;
  new.future_plan_name := btrim(new.future_plan_name);
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.price_revision_v900() from public, anon, authenticated;
create trigger price_revision_v900 before update on public.platform_policy_v900
for each row execute function app_private.price_revision_v900();

create function public.save_future_price_v900(p_revision integer, p_plan_name text, p_monthly_cents integer)
returns public.platform_policy_v900 language plpgsql security invoker set search_path = '' as $$
declare saved public.platform_policy_v900;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  update public.platform_policy_v900
    set future_plan_name = p_plan_name, future_monthly_cents = p_monthly_cents
    where singleton and founder_profile_id = auth.uid() and revision = p_revision
    returning * into saved;
  if saved.singleton is null then
    raise exception 'Price changed or permission missing. Reload before saving.' using errcode = '40001';
  end if;
  return saved;
end $$;
revoke all on function public.save_future_price_v900(integer,text,integer) from public, anon;
grant execute on function public.save_future_price_v900(integer,text,integer) to authenticated;

-- Only the server-side profile-creation trigger may assign the fixed initial price.
-- This is an internal trigger, not a callable Data API function. No billing occurs.
create function app_private.company_price_snapshot_v900() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'business' then
    insert into public.company_entitlements_v900
      (company_id, account_policy, monthly_cents, plan_name, price_revision)
    select new.id, 'new_fixed_price', s.future_monthly_cents, s.future_plan_name, s.revision
      from public.platform_policy_v900 s where s.singleton
    on conflict (company_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function app_private.company_price_snapshot_v900() from public, anon, authenticated;
create trigger company_price_snapshot_v900 after insert or update of role on public.profiles
for each row execute function app_private.company_price_snapshot_v900();
commit;
