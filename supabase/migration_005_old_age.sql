-- Run this in the Supabase SQL Editor to add the Warehouse -> Old Age page.
-- Safe to re-run.

create table if not exists old_age_items (
  id uuid primary key default gen_random_uuid(),
  position int not null default 1,
  document text,
  received_date date,
  description text,
  pack_style text,
  size text,
  qty numeric,
  age integer,
  next_step text
    check (next_step in ('pending_qc', 'cash_sale', 'repack', 'as_is', 'dump_donate')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuses the same set_updated_at() trigger function created by schema.sql /
-- migration_002 for the loads table.
drop trigger if exists old_age_items_set_updated_at on old_age_items;
create trigger old_age_items_set_updated_at
  before update on old_age_items
  for each row execute function set_updated_at();

alter table old_age_items enable row level security;
drop policy if exists "authenticated full access" on old_age_items;
create policy "authenticated full access" on old_age_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
