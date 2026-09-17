-- Documents (Admin/Exec, same access as Management): a single page of
-- printable company forms, grouped under headers ("categories") like
-- Onboarding. Categories are their own table (not a free-text column) so
-- an empty header can exist ready to receive documents later, same as
-- Employee Files' onboarding/offboarding split but open-ended instead of
-- a fixed two-value enum.
create table if not exists document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_documents (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references document_categories(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_documents_category_idx on company_documents (category_id);

alter table document_categories enable row level security;
alter table company_documents enable row level security;

drop policy if exists "authenticated full access" on document_categories;
create policy "authenticated full access" on document_categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on company_documents;
create policy "authenticated full access" on company_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage: a private bucket, same as employee-documents - read back via
-- short-lived signed URLs rather than public URLs.
insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage company-documents" on storage.objects;
create policy "authenticated manage company-documents" on storage.objects
  for all using (bucket_id = 'company-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'company-documents' and auth.role() = 'authenticated');

-- Seed the first category so the page isn't empty on first load.
insert into document_categories (name, position)
select 'Onboarding', 1
where not exists (select 1 from document_categories where name = 'Onboarding');
