begin;
set local lock_timeout='5s';
create table public.material_favorite_lists_v959 (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.profiles(id) on delete cascade,
 owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 created_at timestamptz not null default now(),
 unique(id,business_id,owner_id), unique(business_id,owner_id,name)
);
create table public.material_favorite_items_v959 (
 id uuid primary key default gen_random_uuid(),
 list_id uuid not null, business_id uuid not null, owner_id uuid not null default auth.uid(),
 article_key text not null check(length(article_key) between 1 and 700),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=12000),
 created_at timestamptz not null default now(),
 foreign key(list_id,business_id,owner_id) references public.material_favorite_lists_v959(id,business_id,owner_id) on delete cascade,
 unique(list_id,article_key)
);
create index material_favorite_lists_owner_v959 on public.material_favorite_lists_v959(owner_id,business_id);
create index material_favorite_items_owner_v959 on public.material_favorite_items_v959(owner_id,business_id,list_id);
alter table public.material_favorite_lists_v959 enable row level security;
alter table public.material_favorite_items_v959 enable row level security;
create policy favorites_owner on public.material_favorite_lists_v959 for all to authenticated
 using(owner_id=(select auth.uid()) and (business_id=(select app_private.current_business_id()) or (select app_private.is_administrator())))
 with check(owner_id=(select auth.uid()) and (business_id=(select app_private.current_business_id()) or (select app_private.is_administrator())));
create policy favorites_owner on public.material_favorite_items_v959 for all to authenticated
 using(owner_id=(select auth.uid()) and (business_id=(select app_private.current_business_id()) or (select app_private.is_administrator())))
 with check(owner_id=(select auth.uid()) and (business_id=(select app_private.current_business_id()) or (select app_private.is_administrator())));
revoke all on public.material_favorite_lists_v959,public.material_favorite_items_v959 from public,anon;
grant select,insert,update,delete on public.material_favorite_lists_v959,public.material_favorite_items_v959 to authenticated;
commit;
