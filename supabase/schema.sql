-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- for a brand new project. Safe to re-run: every statement is idempotent.
--
-- If you already ran an earlier version of this file, run
-- migration_002_stops_lanes_submissions.sql instead - it upgrades an
-- existing database in place without needing this file.

create extension if not exists "pgcrypto";

-- Permission levels: one role per auth user (Admin / Operations /
-- Warehouse-QC / Sales - see src/lib/roles.ts for what each can access).
-- New sign-ups default to the least-privileged role via the trigger below;
-- an admin upgrades them manually via the SQL Editor.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'sales'
    check (role in ('admin', 'operations', 'warehouse_qc', 'sales')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'sales')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

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

-- Locked list of Source City values for the load form - prevents duplicate
-- entries from typos/capitalization (e.g. "pharr tx" vs "Pharr, TX").
create table if not exists hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name like '%,%')
);

insert into hubs (name) values
  ('Pharr, TX'), ('Salinas, CA'), ('Santa Maria, CA'), ('Nogales, AZ')
on conflict (name) do nothing;

-- Locked list of Destination values for the load form, same reasoning as
-- hubs above.
create table if not exists destination_cities (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text not null,
  unique (city, state)
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
  rate numeric,
  broker_id uuid references brokers (id) on delete set null,
  notes text,
  eta_note text,
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
  customer_name text,
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

-- Management: Workflow - a single standing checklist (no daily history). ---
-- Status/notes are cleared manually each morning via "Reset Day";
-- is_permanent distinguishes core tasks (survive a reset) from one-off tasks
-- added for just that day (deleted on reset).
create table if not exists workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('morning_early_afternoon', 'afternoon_early_evening')),
  position int not null default 1,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  notes text,
  is_permanent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_tasks_section_idx on workflow_tasks (section, position);

-- Management: Call Out Sheet -------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists callout_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into callout_types (name) values ('Absent'), ('Late'), ('Personal'), ('Other')
on conflict (name) do nothing;

create table if not exists callout_entries (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  entry_date date not null,
  call_out_type text not null,
  reason text,
  notified_at text,
  approved text check (approved in ('yes', 'no')),
  return_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists callout_entries_date_idx on callout_entries (entry_date);

-- Planned future time off (a date range) - a different shape from the
-- reactive, single-day callout_entries log above, so it gets its own table.
create table if not exists pto_requests (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pto_requests_start_date_idx on pto_requests (start_date);

-- Management: QC Agenda - a per-day form (like AM Holdovers), editable and --
-- reprintable throughout the day, with past days kept as history.
create table if not exists qc_agenda_meta (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null unique,
  prepared_by text,
  qc1 text,
  qc2 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists qc_agenda_inbounds (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  vendor_origin text,
  commodity_sku text,
  po_load_number text,
  carrier text,
  eta text,
  photo_report text,
  status text check (status in ('in_transit', 'arrived', 'qc_completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qc_agenda_inbounds_date_idx on qc_agenda_inbounds (entry_date);

-- old_age_item_id is set null (not cascaded) if the source Old Age row is
-- later deleted, so a pulled-in floor-aging row isn't silently wiped out.
create table if not exists qc_agenda_floor_aging (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  commodity_sku text,
  lot_number text,
  received_date date,
  days_on_floor int,
  action_needed text,
  old_age_item_id uuid references old_age_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qc_agenda_floor_aging_date_idx on qc_agenda_floor_aging (entry_date);

create table if not exists qc_agenda_repack (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  reference text,
  pack_format text,
  priority text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qc_agenda_repack_date_idx on qc_agenda_repack (entry_date);

-- Compliance: PAS Files - a running sheet (never wholesale-replaced) --------
-- tracking Price As Sale orders pending invoice, for the accountant. Each
-- day's paste is merged in: rows already present (matched on order_no + po)
-- are left completely untouched; only genuinely new rows get inserted.
-- "Days" isn't stored - it's computed from ship_date at render time.
create table if not exists pas_files (
  id uuid primary key default gen_random_uuid(),
  position int not null default 1,
  order_no text not null,
  po text,
  customer text,
  slp text,
  order_date date,
  ship_date date,
  ship_qty numeric,
  fob_amt numeric,
  whse text,
  status text,
  order_type text,
  sales_type text,
  update_notes text,
  last_contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pas_files_order_no_po_idx on pas_files (order_no, po);

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
alter table hubs enable row level security;
alter table destination_cities enable row level security;
alter table loads enable row level security;
alter table load_stops enable row level security;
alter table broker_rate_entries enable row level security;
alter table rate_submissions enable row level security;
alter table am_holdovers enable row level security;
alter table old_age_items enable row level security;
alter table workflow_tasks enable row level security;
alter table employees enable row level security;
alter table callout_types enable row level security;
alter table callout_entries enable row level security;
alter table pto_requests enable row level security;
alter table qc_agenda_meta enable row level security;
alter table qc_agenda_inbounds enable row level security;
alter table qc_agenda_floor_aging enable row level security;
alter table qc_agenda_repack enable row level security;
alter table pas_files enable row level security;

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

drop policy if exists "authenticated full access" on workflow_tasks;
create policy "authenticated full access" on workflow_tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on employees;
create policy "authenticated full access" on employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on callout_types;
create policy "authenticated full access" on callout_types
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on callout_entries;
create policy "authenticated full access" on callout_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on pto_requests;
create policy "authenticated full access" on pto_requests
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on qc_agenda_meta;
create policy "authenticated full access" on qc_agenda_meta
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on qc_agenda_inbounds;
create policy "authenticated full access" on qc_agenda_inbounds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on qc_agenda_floor_aging;
create policy "authenticated full access" on qc_agenda_floor_aging
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on qc_agenda_repack;
create policy "authenticated full access" on qc_agenda_repack
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on pas_files;
create policy "authenticated full access" on pas_files
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed: Workflow core tasks (from the current daily checklist). Guarded by
-- "table is currently empty" (rather than an on-conflict target) since a
-- couple of task names intentionally repeat (e.g. "Email Review" appears
-- twice in the source list).
insert into workflow_tasks (section, position, name)
select * from (values
  ('morning_early_afternoon', 1, 'Sales Call with Broccoli/Lettuce Breakdown'),
  ('morning_early_afternoon', 2, 'Initial Buyer List - Negatives'),
  ('morning_early_afternoon', 3, 'C/O sheet'),
  ('morning_early_afternoon', 4, 'Price Sheet Mailchimp/Excel'),
  ('morning_early_afternoon', 5, 'OTR Logistics ETAs/Followups'),
  ('morning_early_afternoon', 6, 'InTransit/Shipped Orders Verification'),
  ('morning_early_afternoon', 7, 'Inventory Management'),
  ('morning_early_afternoon', 8, 'QC Verification'),
  ('morning_early_afternoon', 9, 'Passings Sent'),
  ('morning_early_afternoon', 10, 'Pending to Invoice - PAS Update/Verification'),
  ('morning_early_afternoon', 11, 'Pending to Invoice Update'),
  ('morning_early_afternoon', 12, 'Email Review'),
  ('morning_early_afternoon', 13, 'Daily QC Agenda'),
  ('morning_early_afternoon', 14, 'OFX and HEB TMS Daily Checks'),
  ('morning_early_afternoon', 15, 'Priority Morning Customers'),
  ('morning_early_afternoon', 16, 'APO List'),
  ('morning_early_afternoon', 17, 'Previous Repack Verification'),
  ('morning_early_afternoon', 18, 'Buyers List Verification'),
  ('morning_early_afternoon', 19, 'Email Review'),
  ('morning_early_afternoon', 20, 'Freight Dispatching'),
  ('morning_early_afternoon', 21, 'Order Follow-up'),
  ('morning_early_afternoon', 22, 'Old Age'),
  ('morning_early_afternoon', 23, 'Old Age - Cash Sale Checkup'),
  ('morning_early_afternoon', 24, 'Broccoli Allocation'),
  ('morning_early_afternoon', 25, 'Order Allocation'),
  ('morning_early_afternoon', 26, 'Local Freight Overview'),
  ('morning_early_afternoon', 27, 'Freight Confirmations / Information Verification'),
  ('morning_early_afternoon', 28, 'Important item Basket'),
  ('afternoon_early_evening', 1, 'Local Freight Overview'),
  ('afternoon_early_evening', 2, 'Freight Check Ins / Check In ETAs'),
  ('afternoon_early_evening', 3, 'Order Allocation'),
  ('afternoon_early_evening', 4, 'Accounting issue reviews - Tyler'),
  ('afternoon_early_evening', 5, 'Accounting issue reviews - Jacob'),
  ('afternoon_early_evening', 6, 'Accounting issue reviews - Elena'),
  ('afternoon_early_evening', 7, 'Freight Invoicing')
) as seed(section, position, name)
where not exists (select 1 from workflow_tasks);

-- Seed: Call Out Sheet known employees (from the current tracker)
insert into employees (name)
select * from (values ('Luis Vasquez'), ('Tyler Sulay')) as seed(name)
on conflict (name) do nothing;
