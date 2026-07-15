-- Migration 012: PTO requests on the Call Out Sheet.
-- Planned future time off (a date range) is a different shape from the
-- reactive, single-day callout_entries log, so it gets its own table. Safe
-- to re-run.

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

alter table pto_requests enable row level security;

drop policy if exists "authenticated full access" on pto_requests;
create policy "authenticated full access" on pto_requests
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
