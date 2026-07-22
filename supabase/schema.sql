-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- for a brand new project. Safe to re-run: every statement is idempotent.
--
-- If you already ran an earlier version of this file, run
-- migration_002_stops_lanes_submissions.sql instead - it upgrades an
-- existing database in place without needing this file.

create extension if not exists "pgcrypto";

-- Permission levels: one role per auth user (Admin / Operations /
-- Warehouse-QC / Sales / Compliance - see src/lib/roles.ts for what each can
-- access). New sign-ups default to the least-privileged role via the
-- trigger below; an admin upgrades them via Management -> User Roles.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'sales'
    check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'compliance')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

-- is_admin() is security definer so these policies can check the caller's
-- own role without recursing back into profiles' own RLS - it runs as the
-- function owner and bypasses RLS internally. Lets an admin manage every
-- user's role from an in-app panel (Management -> User Roles).
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer set search_path = public stable;

drop policy if exists "admins read all profiles" on profiles;
create policy "admins read all profiles" on profiles
  for select using (is_admin());

drop policy if exists "admins update roles" on profiles;
create policy "admins update roles" on profiles
  for update using (is_admin()) with check (is_admin());

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
-- request_statement: a manual flag flipped on the Invoicing home page as a
-- signal to email that carrier requesting their current statement.
-- position: manual display order for the Invoicing home page's "Edit Layout".
create table if not exists brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  request_statement boolean not null default false,
  position integer not null default 0
);

-- Logistics: Invoicing - per-broker aging list of pasted statement lines.
-- Merge-only import matched on (broker_id, invoice_no). Age is never
-- stored - always computed from invoice_date at render/copy time.
create table if not exists invoice_statements (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references brokers (id) on delete cascade,
  invoice_no text not null,
  invoice_date date,
  customer_po text,
  amount numeric,
  status text check (status in ('pending', 'done')),
  notes text,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_statements_broker_id_idx on invoice_statements (broker_id);
create unique index if not exists invoice_statements_broker_invoice_idx on invoice_statements (broker_id, invoice_no);

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
  -- Manually flipped on the Board once the rate confirmation has been sent
  -- to the broker; flagged everywhere while unset on an active load.
  rate_con_sent boolean not null default false,
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
  delivery_time text,
  appointment text
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

-- Warehouse: Local Inbounds - entered throughout the day, marked Arrived ----
-- when the truck shows up. Same "fresh list per entry_date" pattern as AM
-- Holdovers.
create table if not exists local_inbounds (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  po text,
  pu_info text,
  vendor text,
  loading_warehouse text,
  eta text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'arrived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_inbounds_entry_date_idx on local_inbounds (entry_date);

-- Warehouse: Repack Inventory - one row per material with a running -------
-- current_stock, instead of the spreadsheet's "one new column per usage
-- date". repack_adjustments is the full ledger (qty negative = used by a
-- repack, positive = restocked/corrected); a trigger further down keeps
-- current_stock in sync automatically on insert or delete.
create table if not exists repack_items (
  id uuid primary key default gen_random_uuid(),
  position int not null default 1,
  name text not null,
  initial_stock numeric not null default 0,
  current_stock numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists repack_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references repack_items (id) on delete cascade,
  entry_date date not null default current_date,
  qty numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists repack_adjustments_item_id_idx on repack_adjustments (item_id);

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

-- Warehouse: Cold Inventory - pasted from the cold storage pivot report
-- (Manifest x Commodity/Size -> Sum of On Hand Cases). Each paste fully
-- replaces the current snapshot (stock no longer present is deleted), but
-- status/notes carry over automatically when the same manifest+commodity+
-- size reappears in a later paste - manifest_order/column_order get
-- refreshed on every import to reflect the latest paste's layout.
create table if not exists cold_inventory_items (
  id uuid primary key default gen_random_uuid(),
  manifest text not null,
  commodity text not null,
  size text not null,
  qty numeric not null,
  manifest_order integer not null default 0,
  column_order integer not null default 0,
  status text check (status in ('good', 'issue', 'dump')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manifest, commodity, size)
);

-- Sales: Buyers List - a standing task list of shortages (negative Avl)
-- found in the pasted inventory pivot report. Pasting only adds newly-
-- negative rows or refreshes qty_needed for one already listed (matched on
-- whse+comm+variety+pstyle+size+label) - nothing is auto-removed, only by
-- manual delete once resolved.
create table if not exists buyers_list_items (
  id uuid primary key default gen_random_uuid(),
  whse text not null,
  comm text not null,
  variety text not null,
  pstyle text not null,
  size text not null,
  label text not null,
  qty_needed numeric not null,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whse, comm, variety, pstyle, size, label)
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
  highlight text not null default 'none' check (highlight in ('none', 'yellow', 'red')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pas_files_order_no_po_idx on pas_files (order_no, po);

-- QC: Inspections - a running, append-only log of each day's inbound QC ----
-- checks (what was expected, what was checked, what held over) matching the
-- team's existing Excel tracker. Unlike PAS Files there's no reliable
-- natural key to merge on (PO/Lot are often blank), so every paste just
-- appends new rows - a few new rows added per day, same as the sheet itself.
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

-- Sales: Pending to Invoice - same paste-import as PAS Files (Compliance) - -
-- when the full pending-to-invoice export is pasted there, rows marked PAS
-- (on PO or Order Type) go to pas_files, everything else lands here. A
-- running list matched on order_no + po; rows are deleted once invoiced.
create table if not exists pending_to_invoice (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pending_to_invoice_order_no_po_idx on pending_to_invoice (order_no, po);

-- Sales: FOB Pricing - a fixed commodity catalog (seeded below) where only
-- the fob price typically changes each morning, plus a small freight rate
-- reference table that is edited in place and never resets.
create table if not exists fob_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('western_veg', 'hot_house')),
  commodity_group text not null,
  variety text,
  unit_per numeric,
  size text,
  fob numeric,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fob_items_section_position_idx on fob_items (section, position);

create table if not exists fob_freight_rates (
  id uuid primary key default gen_random_uuid(),
  lane text not null,
  ltl numeric,
  ftl numeric,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fob_freight_rates_position_idx on fob_freight_rates (position);

-- Sales: Delivered Price Sheets - per-lane editable "specials" message shown
-- under the title of each lane's delivered sheet (Houston, etc.). The
-- pricing itself (LTL/FTL per commodity) is computed on the fly from
-- fob_items + fob_freight_rates, nothing to store for that.
create table if not exists delivered_price_messages (
  id uuid primary key default gen_random_uuid(),
  lane text not null unique,
  message text,
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

drop trigger if exists invoice_statements_set_updated_at on invoice_statements;
create trigger invoice_statements_set_updated_at
  before update on invoice_statements
  for each row execute function set_updated_at();

drop trigger if exists am_holdovers_set_updated_at on am_holdovers;
create trigger am_holdovers_set_updated_at
  before update on am_holdovers
  for each row execute function set_updated_at();

drop trigger if exists local_inbounds_set_updated_at on local_inbounds;
create trigger local_inbounds_set_updated_at
  before update on local_inbounds
  for each row execute function set_updated_at();

drop trigger if exists repack_items_set_updated_at on repack_items;
create trigger repack_items_set_updated_at
  before update on repack_items
  for each row execute function set_updated_at();

create or replace function apply_repack_adjustment()
returns trigger as $$
begin
  update repack_items set current_stock = current_stock + new.qty where id = new.item_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists repack_adjustments_apply_insert on repack_adjustments;
create trigger repack_adjustments_apply_insert
  after insert on repack_adjustments
  for each row execute function apply_repack_adjustment();

create or replace function reverse_repack_adjustment()
returns trigger as $$
begin
  update repack_items set current_stock = current_stock - old.qty where id = old.item_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists repack_adjustments_reverse_delete on repack_adjustments;
create trigger repack_adjustments_reverse_delete
  after delete on repack_adjustments
  for each row execute function reverse_repack_adjustment();

drop trigger if exists old_age_items_set_updated_at on old_age_items;
create trigger old_age_items_set_updated_at
  before update on old_age_items
  for each row execute function set_updated_at();

drop trigger if exists fob_items_set_updated_at on fob_items;
create trigger fob_items_set_updated_at
  before update on fob_items
  for each row execute function set_updated_at();

drop trigger if exists fob_freight_rates_set_updated_at on fob_freight_rates;
create trigger fob_freight_rates_set_updated_at
  before update on fob_freight_rates
  for each row execute function set_updated_at();

drop trigger if exists delivered_price_messages_set_updated_at on delivered_price_messages;
create trigger delivered_price_messages_set_updated_at
  before update on delivered_price_messages
  for each row execute function set_updated_at();

drop trigger if exists cold_inventory_items_set_updated_at on cold_inventory_items;
create trigger cold_inventory_items_set_updated_at
  before update on cold_inventory_items
  for each row execute function set_updated_at();

drop trigger if exists buyers_list_items_set_updated_at on buyers_list_items;
create trigger buyers_list_items_set_updated_at
  before update on buyers_list_items
  for each row execute function set_updated_at();

-- Row Level Security: any signed-in user (this is an internal 1-3 person
-- tool, so all authenticated users get full read/write access) -----------
alter table brokers enable row level security;
alter table invoice_statements enable row level security;
alter table lanes enable row level security;
alter table hubs enable row level security;
alter table destination_cities enable row level security;
alter table loads enable row level security;
alter table load_stops enable row level security;
alter table broker_rate_entries enable row level security;
alter table rate_submissions enable row level security;
alter table am_holdovers enable row level security;
alter table local_inbounds enable row level security;
alter table repack_items enable row level security;
alter table repack_adjustments enable row level security;
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
alter table qc_inspections enable row level security;
alter table pending_to_invoice enable row level security;
alter table fob_items enable row level security;
alter table fob_freight_rates enable row level security;
alter table delivered_price_messages enable row level security;
alter table cold_inventory_items enable row level security;
alter table buyers_list_items enable row level security;

drop policy if exists "authenticated full access" on invoice_statements;
create policy "authenticated full access" on invoice_statements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

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

drop policy if exists "authenticated full access" on local_inbounds;
create policy "authenticated full access" on local_inbounds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on repack_items;
create policy "authenticated full access" on repack_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on repack_adjustments;
create policy "authenticated full access" on repack_adjustments
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

drop policy if exists "authenticated full access" on qc_inspections;
create policy "authenticated full access" on qc_inspections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on pending_to_invoice;
create policy "authenticated full access" on pending_to_invoice
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on fob_items;
create policy "authenticated full access" on fob_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on fob_freight_rates;
create policy "authenticated full access" on fob_freight_rates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on delivered_price_messages;
create policy "authenticated full access" on delivered_price_messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on cold_inventory_items;
create policy "authenticated full access" on cold_inventory_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on buyers_list_items;
create policy "authenticated full access" on buyers_list_items
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

-- Seed: FOB Pricing commodity catalog (from the current McAllen price sheet)
insert into fob_items (section, commodity_group, variety, unit_per, size, fob, position)
select * from (values
  ('western_veg', 'Broccoli', 'Fu Choy Red', 56, '20lb', 15.25, 1),
  ('western_veg', 'Broccoli', 'Fu Choy Green', 56, '20lb', 13.25, 2),
  ('western_veg', 'Broccoli', 'Generic', 56, '20lb', 13.25, 3),
  ('western_veg', 'Broccoli', 'Iceless', 64, '20lb', 14.25, 4),
  ('western_veg', 'Carrots', 'MED', 50, '50lb', 13.25, 5),
  ('western_veg', 'Carrots', 'LGE', 50, '50lb', 13.25, 6),
  ('western_veg', 'Carrots', 'JBO', 50, '50lb', 16.25, 7),
  ('western_veg', 'Cauliflower', '12ct', 56, '12ct', 18.25, 8),
  ('western_veg', 'Cauliflower', '16ct', 56, '12ct', null, 9),
  ('western_veg', 'Celery - Naked', 'Sleeved +$2', 32, '24s', 14.25, 10),
  ('western_veg', 'Celery - Naked', 'Sleeved +$2', 32, '30s', 15.25, 11),
  ('western_veg', 'Cucumbers', 'Super Select', 42, null, null, 12),
  ('western_veg', 'Cucumbers', 'Select', 42, null, null, 13),
  ('western_veg', 'Cucumbers', 'Plain', 42, null, null, 14),
  ('western_veg', 'Cucumbers', 'Large', 42, null, null, 15),
  ('western_veg', 'Lemon', null, 54, '115', null, 16),
  ('western_veg', 'Lettuce', 'Romaine Hearts', 40, 'Liner', 13.25, 17),
  ('western_veg', 'Lettuce', 'Iceberg', 40, 'Cello', 13.25, 18),
  ('western_veg', 'Lettuce', 'Iceberg', 40, 'Liner', 13.25, 19),
  ('western_veg', 'Lettuce', 'Romaine', 40, 'Liner', 14.25, 20),
  ('western_veg', 'Lettuce', 'Red Leaf', 40, 'Liner', null, 21),
  ('western_veg', 'Lettuce', 'Green Leaf', 40, 'Liner', 14.25, 22),
  ('western_veg', 'Tomatoes', null, 81, null, null, 23),
  ('western_veg', 'Squash', 'Zucchini FCY', 88, 'FCY', null, 24),
  ('western_veg', 'Squash', 'Zucchini W/B', 49, 'W/B', null, 25),
  ('western_veg', 'Squash', 'Yellow Straightneck FCY', 88, 'FCY', null, 26),
  ('western_veg', 'Squash', 'Yellow Straightneck W/B', 49, 'W/B', null, 27),
  ('western_veg', 'Squash', 'Grey FCY', 88, 'FCY', null, 28),

  ('hot_house', 'Bell Pepper 1lb', 'Red - MED/LGE', 100, null, 14.25, 1),
  ('hot_house', 'Bell Pepper 1lb', 'Red - XLG/JBO', 100, null, 14.25, 2),
  ('hot_house', 'Bell Pepper 1lb', 'Yellow - MED/LGE', 100, null, 12.25, 3),
  ('hot_house', 'Bell Pepper 1lb', 'Yellow - XLG/JBO', 100, null, 12.25, 4),
  ('hot_house', 'Bell Pepper 1lb', 'Orange - MED/LGE', 100, null, 12.25, 5),
  ('hot_house', 'Bell Pepper 1lb', 'Orange - XLG/JBO', 100, null, 12.25, 6),
  ('hot_house', 'Bell Pepper 25lb', 'Red - LGE', 56, null, 28.25, 7),
  ('hot_house', 'Bell Pepper 25lb', 'Red - MED', 56, null, 30.25, 8),
  ('hot_house', 'Bell Pepper 25lb', 'Red - XLG/JBO', 56, null, null, 9),
  ('hot_house', 'Bell Pepper 25lb', 'Yellow - LGE', 56, null, 22.25, 10),
  ('hot_house', 'Bell Pepper 25lb', 'Yellow - MED', 56, null, 24.25, 11),
  ('hot_house', 'Bell Pepper 25lb', 'Yellow - XLG/JBO', 56, null, null, 12),
  ('hot_house', 'Bell Pepper 25lb', 'Orange - SML', 56, null, 25.25, 13),
  ('hot_house', 'Bell Pepper 25lb', 'Orange - MED', 56, null, 10.25, 14),
  ('hot_house', 'Bell Pepper 25lb', 'Orange - XLG/JBO', 56, null, 12.25, 15),
  ('hot_house', 'Bell Pepper 25lb', 'Green - JBO', 56, null, 25.25, 16),
  ('hot_house', 'Bell Pepper 25lb', 'Green - XLG', 56, null, 25.25, 17),
  ('hot_house', 'Bell Pepper 25lb', 'Green - LGE', 56, null, 24.25, 18),
  ('hot_house', 'Bell Pepper 25lb', 'Green - MED', 56, null, 22.25, 19),
  ('hot_house', 'Bell Pepper 25lb', 'Green - CH', 56, null, 22.25, 20),
  ('hot_house', 'Bell Pepper 25lb', 'Jalapeno LG', 50, null, 18.75, 21),
  ('hot_house', 'Bell Pepper 25lb', 'Jalapeno XLG', 50, null, 19.75, 22),
  ('hot_house', 'Bell Pepper 25lb', 'Serrano', 50, null, 22.25, 23),
  ('hot_house', 'Bell Pepper 25lb', 'Tomatillo', 50, null, 20.25, 24),
  ('hot_house', 'Bell Pepper 25lb', 'Poblano', 50, null, null, 25),
  ('hot_house', 'Bell Pepper 25lb', 'Mini Sweet 12/1', 30, null, null, 26),
  ('hot_house', 'Tomatoes', 'Bulk 20lb - LGE', 80, null, null, 27),
  ('hot_house', 'Tomatoes', 'Bulk 20lb - MED', 80, null, null, 28),
  ('hot_house', 'Tomatoes', '12x1 Clam', 156, null, null, 29)
) as seed(section, commodity_group, variety, unit_per, size, fob, position)
where not exists (select 1 from fob_items);

-- Seed: FOB Pricing freight rate reference (from the current freight sheet)
insert into fob_freight_rates (lane, ltl, ftl, position)
select * from (values
  ('Houston', 137.00, 1850.00, 1),
  ('Victoria', 137.00, 1625.00, 2),
  ('Dallas', 192.00, 2650.00, 3),
  ('Temple', 165.00, 1550.00, 4),
  ('NC', null, 385.00, 5),
  ('MD', null, 385.00, 6),
  ('PA', null, 412.00, 7),
  ('NJ', null, 412.00, 8),
  ('YUMA-MD', null, 495.00, 9),
  ('YUMA-PA', null, 495.00, 10)
) as seed(lane, ltl, ftl, position)
where not exists (select 1 from fob_freight_rates);

-- Seed: Delivered Price Sheets default message (Houston)
insert into delivered_price_messages (lane, message)
select * from (values
  ('houston', 'Please find our current price sheet attached for your review, If you have any questions or would like to discuss volume pricing or specific product needs please let us know!')
) as seed(lane, message)
where not exists (select 1 from delivered_price_messages where lane = 'houston');
