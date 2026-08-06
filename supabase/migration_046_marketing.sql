-- Migration 046: Marketing - brand asset previews (packaging mockups, etc.),
-- a lightweight task list, and a shared notes field, plus the Supabase
-- Storage bucket the uploaded files themselves live in.
create table if not exists marketing_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  label text,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_files_created_at_idx on marketing_files (created_at desc);

create table if not exists marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_tasks_position_idx on marketing_tasks (position);

-- Single shared row - same "one row, always upserted" shape as
-- delivered_price_messages, just with no key to look up by since there's
-- only ever one.
create table if not exists marketing_notes (
  id uuid primary key default gen_random_uuid(),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

insert into marketing_notes (notes)
select ''
where not exists (select 1 from marketing_notes);

-- Seed: a few starter tasks matching where the packaging mockups are right
-- now (design review stage) - guarded the same way workflow_tasks' seed is,
-- so it only runs once on a fresh table.
insert into marketing_tasks (position, name)
select * from (values
  (0, 'Review packaging mockups for accuracy (sizes, nutrition facts, UPCs)'),
  (1, 'Confirm final pack sizes to move forward with per commodity'),
  (2, 'Get UPC/barcode assignments confirmed for each SKU'),
  (3, 'Send approved art files to packaging printer'),
  (4, 'Decide which SKUs launch first vs. later')
) as seed(position, name)
where not exists (select 1 from marketing_tasks);

drop trigger if exists marketing_tasks_set_updated_at on marketing_tasks;
create trigger marketing_tasks_set_updated_at
  before update on marketing_tasks
  for each row execute function set_updated_at();

drop trigger if exists marketing_notes_set_updated_at on marketing_notes;
create trigger marketing_notes_set_updated_at
  before update on marketing_notes
  for each row execute function set_updated_at();

alter table marketing_files enable row level security;
alter table marketing_tasks enable row level security;
alter table marketing_notes enable row level security;

drop policy if exists "authenticated full access" on marketing_files;
create policy "authenticated full access" on marketing_files
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on marketing_tasks;
create policy "authenticated full access" on marketing_tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on marketing_notes;
create policy "authenticated full access" on marketing_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage: a public bucket (these are marketing images, not sensitive) so
-- previews can just use a stable public URL instead of a signed one.
insert into storage.buckets (id, name, public)
values ('marketing-assets', 'marketing-assets', true)
on conflict (id) do nothing;

drop policy if exists "authenticated manage marketing-assets" on storage.objects;
create policy "authenticated manage marketing-assets" on storage.objects
  for all using (bucket_id = 'marketing-assets' and auth.role() = 'authenticated')
  with check (bucket_id = 'marketing-assets' and auth.role() = 'authenticated');
