-- Food Safety: per-grower compliance documents (certs, insurance, tests,
-- etc.), each with an expiration date (auto-detected from the PDF when
-- possible, entered by hand otherwise), plus who gets pinged as a document
-- nears its expiration.

create table if not exists food_safety_report_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Whether a grower needs this on file to be fully compliant - drives the
  -- A-F grower score (missing/expired required docs hurt it; optional ones
  -- don't).
  required boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into food_safety_report_types (name, required, position) values
  ('GAP Certification', true, 1),
  ('Liability Insurance', true, 2),
  ('Pesticide Residue Test', true, 3),
  ('Kosher Certification', false, 4),
  ('Organic Certification', false, 5)
on conflict (name) do nothing;

create table if not exists food_safety_documents (
  id uuid primary key default gen_random_uuid(),
  grower_id uuid not null references mx_growers (id) on delete cascade,
  report_type_id uuid references food_safety_report_types (id) on delete set null,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  expiration_date date,
  -- Whether expiration_date came from scanning the PDF text or was typed in
  -- by hand - shown as a small badge so a bad auto-read is easy to spot.
  auto_detected boolean not null default false,
  notes text,
  uploaded_by uuid references profiles (id) on delete set null,
  -- Smallest alert threshold (days-to-expiration) already notified for, so
  -- the same crossing doesn't re-fire every page load - null means never
  -- notified yet.
  last_alert_threshold_sent int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_safety_documents_grower_idx on food_safety_documents (grower_id);
create index if not exists food_safety_documents_expiration_idx on food_safety_documents (expiration_date);

-- Who gets notified as a document nears expiration - managed from
-- Supreme > Notifications.
create table if not exists food_safety_alert_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

drop trigger if exists food_safety_documents_set_updated_at on food_safety_documents;
create trigger food_safety_documents_set_updated_at
  before update on food_safety_documents
  for each row execute function set_updated_at();

alter table food_safety_report_types enable row level security;
alter table food_safety_documents enable row level security;
alter table food_safety_alert_recipients enable row level security;

drop policy if exists "authenticated full access" on food_safety_report_types;
create policy "authenticated full access" on food_safety_report_types
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on food_safety_documents;
create policy "authenticated full access" on food_safety_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on food_safety_alert_recipients;
create policy "authenticated full access" on food_safety_alert_recipients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage: a private bucket (real grower compliance paperwork, not for
-- public display) - files are read back via short-lived signed URLs rather
-- than a public URL (contrast with marketing-assets, which is public).
insert into storage.buckets (id, name, public)
values ('food-safety-docs', 'food-safety-docs', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage food-safety-docs" on storage.objects;
create policy "authenticated manage food-safety-docs" on storage.objects
  for all using (bucket_id = 'food-safety-docs' and auth.role() = 'authenticated')
  with check (bucket_id = 'food-safety-docs' and auth.role() = 'authenticated');
