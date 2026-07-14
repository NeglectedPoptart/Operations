-- Run this in the Supabase SQL Editor to add the Warehouse -> AM Holdovers
-- page. Safe to re-run.

create table if not exists am_holdovers (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  po_lot_number text,
  status text not null default 'pending_inbound'
    check (status in ('pending_inbound', 'pending_changes', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists am_holdovers_entry_date_idx on am_holdovers (entry_date);

-- Reuses the same set_updated_at() trigger function created by schema.sql /
-- migration_002 for the loads table.
drop trigger if exists am_holdovers_set_updated_at on am_holdovers;
create trigger am_holdovers_set_updated_at
  before update on am_holdovers
  for each row execute function set_updated_at();

alter table am_holdovers enable row level security;
drop policy if exists "authenticated full access" on am_holdovers;
create policy "authenticated full access" on am_holdovers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
