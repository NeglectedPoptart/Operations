-- Migration 135: Lot Inspections (the inspection records, photos and history link).
--
-- One row per inspection done in HOPS. The plan as it was at the time is kept
-- with the inspection (plan_snapshot), so editing a plan later never changes an
-- old report. Photos live in a private storage bucket; each submitted
-- inspection also gets a row on the QC Inspection History sheet
-- (qc_inspections), linked by lot_inspection_id. Safe to re-run.

create table if not exists qc_lot_inspections (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references qc_plans (id) on delete set null,
  plan_snapshot jsonb not null default '{}'::jsonb,
  plan_name text not null,
  commodity text not null,
  control_point text,
  inspector_id uuid references profiles (id) on delete set null,
  inspector_name text,
  inspector_initials text,
  inspection_time timestamptz not null default now(),
  sample_time timestamptz,
  -- Filter columns pulled out of the header so lists can search them.
  grower text,
  facility text,
  product_label text,
  lot_number text,
  header jsonb not null default '{}'::jsonb,
  sample_size int,
  -- [{key, name, severity, count}]
  defects jsonb not null default '[]'::jsonb,
  -- [{box_weight: 24.3, ...}] one object per sample, in order
  samples jsonb not null default '[]'::jsonb,
  notes_1 text,
  notes_2 text,
  result text,
  created_at timestamptz not null default now()
);
create index if not exists qc_lot_inspections_time_idx on qc_lot_inspections (inspection_time desc);

create table if not exists qc_lot_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references qc_lot_inspections (id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists qc_lot_photos_inspection_idx on qc_lot_photos (inspection_id, position);

alter table qc_lot_inspections enable row level security;
alter table qc_lot_photos enable row level security;

drop policy if exists "authenticated full access" on qc_lot_inspections;
create policy "authenticated full access" on qc_lot_inspections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on qc_lot_photos;
create policy "authenticated full access" on qc_lot_photos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Private bucket - read back through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('qc-photos', 'qc-photos', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage qc-photos" on storage.objects;
create policy "authenticated manage qc-photos" on storage.objects
  for all using (bucket_id = 'qc-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'qc-photos' and auth.role() = 'authenticated');

-- Links a history row to its detailed inspection.
alter table qc_inspections add column if not exists lot_inspection_id uuid
  references qc_lot_inspections (id) on delete set null;
