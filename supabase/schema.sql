-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- for a brand new project. Safe to re-run: every statement is idempotent.
--
-- If you already ran an earlier version of this file, run
-- migration_002_stops_lanes_submissions.sql instead - it upgrades an
-- existing database in place without needing this file.

create extension if not exists "pgcrypto";

-- Brokers (e.g. GRIFFITH, DESERT, PGTRANS) --------------------------------
create table if not exists brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Lanes used by the weekly broker rate tracker (From hub -> destination). --
-- "destination" is a plain label, e.g. "Houston, TX", or a composite like
-- "Jessup, MD & Philly, PA" for multi-drop loads - see load_stops below.
create table if not exists lanes (
  id uuid primary key default gen_random_uuid(),
  from_hub text not null,
  destination text not null,
  unique (from_hub, destination)
);

-- Loads: the Pending to Load / On the Road / Complete Load board. ---------
-- One row = one truck run. Per-drop details (client, order/PO, destination,
-- delivery date/time) live in load_stops, since a single truck can carry
-- multiple orders to different destinations on different delivery dates.
create table if not exists loads (
  id uuid primary key default gen_random_uuid(),
  loading_date date,
  source text,
  status text not null default 'pending_to_load'
    check (status in ('pending_to_load', 'on_the_road', 'complete')),
  status_note text,
  rate numeric,
  broker_id uuid references brokers (id) on delete set null,
  notes text,
  ready_to_load boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loads_loading_date_idx on loads (loading_date);
create index if not exists loads_status_idx on loads (status);

-- One row per drop on a load, in pickup/delivery order (position). --------
create table if not exists load_stops (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  position int not null default 1,
  order_number text,
  po_number text,
  client_name text,
  destination_city text,
  destination_state text,
  delivery_date date,
  delivery_time text
);

create index if not exists load_stops_load_id_idx on load_stops (load_id);
create index if not exists load_stops_delivery_date_idx on load_stops (delivery_date);

-- Weekly broker rate quotes, one row per lane + broker + week -------------
create table if not exists broker_rate_entries (
  id uuid primary key default gen_random_uuid(),
  lane_id uuid not null references lanes (id) on delete cascade,
  broker_id uuid not null references brokers (id) on delete cascade,
  week_start_date date not null,
  rate numeric,
  unique (lane_id, broker_id, week_start_date)
);

-- A week is "locked" once it has a submission row - see the Broker Tracker
-- Submit / Unlock to edit workflow.
create table if not exists rate_submissions (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  submitted_by text not null,
  submitted_at timestamptz not null default now()
);

-- Warehouse: AM Holdovers - each morning's list of inbounds that didn't -----
-- arrive the day before. A fresh list per entry_date; past days stay around
-- for history.
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

-- Warehouse: Old Age - pasted in wholesale from the Excel aging report each --
-- time (the whole list is replaced on import), then annotated with a next
-- step and notes here.
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
    check (next_step in ('pending_qc', 'cash_sale', 'repack', 'as_is', 'dump_donate', 'moved')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep loads.updated_at current on every edit ------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists loads_set_updated_at on loads;
create trigger loads_set_updated_at
  before update on loads
  for each row execute function set_updated_at();

drop trigger if exists am_holdovers_set_updated_at on am_holdovers;
create trigger am_holdovers_set_updated_at
  before update on am_holdovers
  for each row execute function set_updated_at();

drop trigger if exists old_age_items_set_updated_at on old_age_items;
create trigger old_age_items_set_updated_at
  before update on old_age_items
  for each row execute function set_updated_at();

-- Row Level Security: any signed-in user (this is an internal 1-3 person
-- tool, so all authenticated users get full read/write access) -----------
alter table brokers enable row level security;
alter table lanes enable row level security;
alter table loads enable row level security;
alter table load_stops enable row level security;
alter table broker_rate_entries enable row level security;
alter table rate_submissions enable row level security;
alter table am_holdovers enable row level security;
alter table old_age_items enable row level security;

drop policy if exists "authenticated full access" on brokers;
create policy "authenticated full access" on brokers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on lanes;
create policy "authenticated full access" on lanes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on loads;
create policy "authenticated full access" on loads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on load_stops;
create policy "authenticated full access" on load_stops
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on broker_rate_entries;
create policy "authenticated full access" on broker_rate_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on rate_submissions;
create policy "authenticated full access" on rate_submissions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on am_holdovers;
create policy "authenticated full access" on am_holdovers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on old_age_items;
create policy "authenticated full access" on old_age_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
