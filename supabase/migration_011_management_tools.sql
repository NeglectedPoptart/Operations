-- Migration 011: Management tab tools - Workflow, Call Out Sheet, QC Agenda.
-- Safe to re-run.

-- Workflow: a single standing checklist (no daily history - see the
-- Management round discussion). Status/notes get manually cleared each
-- morning via "Reset Day"; is_permanent distinguishes core tasks (survive a
-- reset) from one-off tasks added for just that day (deleted on reset).
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

-- Call Out Sheet -------------------------------------------------------------
-- Locked lists (same "type-to-filter + add new" pattern as hubs/destination_cities)
-- so repeat employee names and call-out types don't fork into near-duplicates.
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

-- QC Agenda: a per-day form (like AM Holdovers), editable and reprintable
-- throughout the day, with past days kept as history. -----------------------
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

-- Row Level Security: same uniform policy as every other table -------------
alter table workflow_tasks enable row level security;
alter table employees enable row level security;
alter table callout_types enable row level security;
alter table callout_entries enable row level security;
alter table qc_agenda_meta enable row level security;
alter table qc_agenda_inbounds enable row level security;
alter table qc_agenda_floor_aging enable row level security;
alter table qc_agenda_repack enable row level security;

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

-- Seed: Workflow core tasks (from the current daily checklist). Guarded by
-- "table is currently empty" (rather than an on-conflict target) since a
-- couple of task names intentionally repeat (e.g. "Email Review" appears
-- twice in the source list) - re-running this migration is still safe
-- because the guard only fires once, on a genuinely empty table.
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

-- Seed: Call Out Sheet known employees (from the current tracker) ----------
insert into employees (name)
select * from (values ('Luis Vasquez'), ('Tyler Sulay')) as seed(name)
on conflict (name) do nothing;
