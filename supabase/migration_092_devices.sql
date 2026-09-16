-- Devices (Supreme only): a lightweight master registry of company
-- equipment - add/remove devices here, and assign/reassign who currently
-- holds each one, from either this page or an employee's own Employee
-- Files tile. Separate from Employee Files' Equipment section
-- (employee_devices) - that's the detailed one-time paperwork record per
-- issue (condition, PIN, signatures-equivalent); this is just "who has
-- what right now."
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  device_type text,
  device_type_other text,
  device_name text,
  serial_number text,
  assigned_to uuid references employees (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists devices_assigned_to_idx on devices (assigned_to);

drop trigger if exists devices_set_updated_at on devices;
create trigger devices_set_updated_at
  before update on devices
  for each row execute function set_updated_at();

alter table devices enable row level security;
drop policy if exists "authenticated full access" on devices;
create policy "authenticated full access" on devices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
