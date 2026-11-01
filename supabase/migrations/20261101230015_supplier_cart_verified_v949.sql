-- Server-written transfer ledger. A repeated request never adds the same lines twice.
create table if not exists public.supplier_cart_transfers_v949 (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  company_id uuid not null references public.profiles(id),
  fingerprint text not null check (length(fingerprint)=64),
  state text not null default 'started' check (state in ('started','created','sent','confirmed','uncertain')),
  cart_ref text,
  receipt jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.supplier_cart_transfers_v949 enable row level security;
revoke all on public.supplier_cart_transfers_v949 from anon, authenticated;
grant select on public.supplier_cart_transfers_v949 to authenticated;
grant select,insert,update,delete on public.supplier_cart_transfers_v949 to service_role;
create policy "Read own transfer receipts" on public.supplier_cart_transfers_v949
  for select to authenticated using (user_id = (select auth.uid()));
create index if not exists supplier_cart_transfers_v949_owner on public.supplier_cart_transfers_v949(user_id,created_at desc);
comment on table public.supplier_cart_transfers_v949 is 'Verified cart transfer receipts only. Never merchant passwords, tokens, prices or cookies.';
