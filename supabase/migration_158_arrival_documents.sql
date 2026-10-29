-- Migration 158: documents attached to a Mexico Arrivals row (e.g. the purchase order
-- sent to the grower for that specific load).
--
-- Files live in the existing private "load-documents" bucket (created in migration 126)
-- under arrivals/<arrival id>/..., and are read back through short-lived signed URLs.
-- Deleting an arrival deletes its document rows (the app removes the files too).
--
-- Safe to re-run.

create table if not exists mx_arrival_documents (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid not null references mx_arrivals (id) on delete cascade,
  kind text not null default 'purchase_order' check (kind in ('purchase_order', 'other')),
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists mx_arrival_documents_arrival_idx on mx_arrival_documents (arrival_id);

alter table mx_arrival_documents enable row level security;
drop policy if exists "authenticated full access" on mx_arrival_documents;
create policy "authenticated full access" on mx_arrival_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- The bucket and its storage policy come from migration 126; repeated here so this
-- migration works on its own.
insert into storage.buckets (id, name, public)
values ('load-documents', 'load-documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage load-documents" on storage.objects;
create policy "authenticated manage load-documents" on storage.objects
  for all using (bucket_id = 'load-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'load-documents' and auth.role() = 'authenticated');
