-- Employee Files (Management, Admin/Exec only): one tile per employee -
-- name/title/department/start date/status/direct manager - plus
-- onboarding/offboarding document attachments and a device checkout log
-- (a simplified digital version of the paper Employee Device Checkout
-- Form: drops Employee Name/Title/Employee ID since those already live on
-- the employee record itself, and drops Device Brand & Model/Operating
-- System/Login Username-Email/Password/Additional Access Notes per
-- request - the account-credential fields especially are too sensitive to
-- store in a general ops tracking tool).

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  department text,
  start_date date,
  status text not null default 'active' check (status in ('active', 'resigned', 'terminated')),
  direct_manager text,
  -- Anniversary year number (1, 2, 3...) already alerted for, so the same
  -- anniversary doesn't re-notify every page load - null means never
  -- notified yet.
  last_anniversary_alert_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  category text not null check (category in ('onboarding', 'offboarding')),
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists employee_documents_employee_idx on employee_documents (employee_id);

-- One row per device checkout event - an employee can have several over
-- time (a phone today, a replacement laptop next year), each tracked
-- independently start to finish (issue through return).
create table if not exists employee_devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  device_type text,
  device_type_other text,
  device_name text,
  serial_number text,
  condition_at_checkout text,
  condition_notes text,
  device_pin text,
  date_of_issue date,
  date_returned date,
  condition_at_return text,
  return_notes text,
  manager_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_devices_employee_idx on employee_devices (employee_id);

-- Who gets notified as an employee nears a work anniversary - managed from
-- Supreme > Notifications, same shape as food_safety_alert_recipients.
create table if not exists employee_anniversary_alert_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Default recipient so the feature alerts someone out of the box - the
-- Supreme account can add/remove recipients afterward on the Notifications
-- page like any other alert list.
insert into employee_anniversary_alert_recipients (user_id)
select id from profiles where email = 'tcamph@harvestbestinc.com'
on conflict (user_id) do nothing;

drop trigger if exists employees_set_updated_at on employees;
create trigger employees_set_updated_at
  before update on employees
  for each row execute function set_updated_at();
drop trigger if exists employee_devices_set_updated_at on employee_devices;
create trigger employee_devices_set_updated_at
  before update on employee_devices
  for each row execute function set_updated_at();

alter table employees enable row level security;
alter table employee_documents enable row level security;
alter table employee_devices enable row level security;
alter table employee_anniversary_alert_recipients enable row level security;

drop policy if exists "authenticated full access" on employees;
create policy "authenticated full access" on employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on employee_documents;
create policy "authenticated full access" on employee_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on employee_devices;
create policy "authenticated full access" on employee_devices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on employee_anniversary_alert_recipients;
create policy "authenticated full access" on employee_anniversary_alert_recipients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage: a private bucket (personnel documents, not for public display) -
-- same as food-safety-docs, read back via short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage employee-documents" on storage.objects;
create policy "authenticated manage employee-documents" on storage.objects
  for all using (bucket_id = 'employee-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'employee-documents' and auth.role() = 'authenticated');
