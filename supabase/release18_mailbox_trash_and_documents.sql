alter table public.mailbox_messages
  add column if not exists deleted_at timestamptz;

create index if not exists mailbox_messages_recipient_deleted_idx
  on public.mailbox_messages (recipient_id, deleted_at, created_at desc);

alter table public.work_orders
  add column if not exists documentation text not null default '';

create table if not exists public.work_order_documents (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists work_order_documents_order_idx
  on public.work_order_documents (work_order_id, created_at);

alter table public.work_order_documents enable row level security;
grant select, insert, update, delete on public.work_order_documents to authenticated;

drop policy if exists "Documents visible to owner or chief" on public.work_order_documents;
create policy "Documents visible to owner or chief"
on public.work_order_documents for select to authenticated
using (
  employee_id = (select auth.uid())
  or (select app_private.is_chief())
);

drop policy if exists "Documents can be created by owner or chief" on public.work_order_documents;
create policy "Documents can be created by owner or chief"
on public.work_order_documents for insert to authenticated
with check (
  exists (
    select 1
    from public.work_orders o
    where o.id = work_order_id
      and o.employee_id = work_order_documents.employee_id
      and (
        o.employee_id = (select auth.uid())
        or (select app_private.is_chief())
      )
  )
);

drop policy if exists "Documents can be changed by owner or chief" on public.work_order_documents;
create policy "Documents can be changed by owner or chief"
on public.work_order_documents for update to authenticated
using (
  employee_id = (select auth.uid())
  or (select app_private.is_chief())
)
with check (
  employee_id = (select auth.uid())
  or (select app_private.is_chief())
);

drop policy if exists "Documents can be deleted by owner or chief" on public.work_order_documents;
create policy "Documents can be deleted by owner or chief"
on public.work_order_documents for delete to authenticated
using (
  employee_id = (select auth.uid())
  or (select app_private.is_chief())
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('work-order-documents', 'work-order-documents', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Work documents are readable by owner or chief" on storage.objects;
create policy "Work documents are readable by owner or chief"
on storage.objects for select to authenticated
using (
  bucket_id = 'work-order-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select app_private.is_chief())
  )
);

drop policy if exists "Work documents can be uploaded by owner or chief" on storage.objects;
create policy "Work documents can be uploaded by owner or chief"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-order-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select app_private.is_chief())
  )
);

drop policy if exists "Work documents can be removed by owner or chief" on storage.objects;
create policy "Work documents can be removed by owner or chief"
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-order-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select app_private.is_chief())
  )
);

