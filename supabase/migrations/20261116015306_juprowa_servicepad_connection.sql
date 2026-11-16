create table public.juprowa_servicepad_connections (
  business_id uuid primary key references public.profiles(id) on delete cascade,
  portal_customer_id text not null,
  mandant_id text not null,
  label text not null,
  encrypted_login text not null,
  revision uuid not null default gen_random_uuid()
);

alter table public.juprowa_servicepad_connections enable row level security;
revoke all on table public.juprowa_servicepad_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.juprowa_servicepad_connections to service_role;
