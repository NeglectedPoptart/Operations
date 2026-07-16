-- Migration 018: QC - Inspections.
-- A running, append-only log of each day's inbound QC checks (what was
-- expected, what was checked, what held over) matching the team's existing
-- Excel tracker. Unlike PAS Files there's no reliable natural key to merge
-- on (PO/Lot are often blank), so every paste just appends new rows - this
-- mirrors how the sheet is actually built, a few new rows added per day.
-- Safe to re-run.

create table if not exists qc_inspections (
  id uuid primary key default gen_random_uuid(),
  position int not null default 1,
  entry_date date,
  po text,
  lot text,
  product text,
  qc text,
  chat boolean not null default false,
  report boolean not null default false,
  mail boolean not null default false,
  status text,
  result text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table qc_inspections enable row level security;

drop policy if exists "authenticated full access" on qc_inspections;
create policy "authenticated full access" on qc_inspections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
