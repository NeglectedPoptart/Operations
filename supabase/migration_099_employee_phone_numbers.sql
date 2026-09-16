-- Additional, self-labeled phone numbers per employee - for when the three
-- fixed fields (Personal, Work Cell, Office) aren't enough.
create table if not exists employee_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  label text,
  phone_number text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table employee_phone_numbers enable row level security;

drop policy if exists "authenticated full access" on employee_phone_numbers;
create policy "authenticated full access" on employee_phone_numbers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
