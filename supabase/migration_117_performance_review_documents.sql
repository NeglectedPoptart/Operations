-- Performance Reviews: document attachments, one per employee/year/quarter,
-- same shape and Storage pattern as employee_documents/employee-documents
-- (private bucket, signed URLs, metadata row separate from the file bytes
-- since a Server Action's body is capped at ~4.5MB on Vercel).
create table if not exists performance_review_documents (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  year int not null,
  quarter int not null,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists performance_review_documents_lookup_idx
  on performance_review_documents (employee_name, year, quarter);

alter table performance_review_documents enable row level security;
drop policy if exists "authenticated full access" on performance_review_documents;
create policy "authenticated full access" on performance_review_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('performance-review-documents', 'performance-review-documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage performance-review-documents" on storage.objects;
create policy "authenticated manage performance-review-documents" on storage.objects
  for all using (bucket_id = 'performance-review-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'performance-review-documents' and auth.role() = 'authenticated');
