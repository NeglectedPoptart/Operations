-- Migration 143: Management > Employee Hours.
--
-- One row per employee per day: clock in, lunch out, lunch in, clock out (times
-- of day as typed in), plus an optional note (sick, holiday...). The page adds
-- the day and week totals itself.
--
-- Run migration 088 (employees) first. Safe to re-run.

create table if not exists employee_hours (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  work_date date not null,
  clock_in time,
  lunch_out time,
  lunch_in time,
  clock_out time,
  notes text,
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists employee_hours_date_idx on employee_hours (work_date);

alter table employee_hours enable row level security;

drop policy if exists "authenticated full access" on employee_hours;
create policy "authenticated full access" on employee_hours
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
