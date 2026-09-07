-- Performance Reviews: per-employee, per-quarter tracking of quick notes,
-- improvements, and major issues/warnings. The Call Outs section pulls
-- live from the existing callout_entries table (no new table needed) -
-- these three are the only new logs. Employees are matched by name, the
-- same free-text convention callout_entries/pto_requests already use -
-- there's no employees FK anywhere in the schema to join against instead.
create table if not exists performance_review_quick_notes (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  note text not null default '',
  occurred_date date,
  follow_up_notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists performance_review_quick_notes_lookup_idx
  on performance_review_quick_notes (employee_name, year, quarter);

create table if not exists performance_review_improvements (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  note text not null default '',
  occurred_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists performance_review_improvements_lookup_idx
  on performance_review_improvements (employee_name, year, quarter);

create table if not exists performance_review_major_issues (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  occurred_date date,
  issue_type text check (issue_type in ('formal_warning', 'informal_warning', 'major_issue_resolved')),
  description text,
  action_plan text,
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists performance_review_major_issues_lookup_idx
  on performance_review_major_issues (employee_name, year, quarter);

alter table performance_review_quick_notes enable row level security;
alter table performance_review_improvements enable row level security;
alter table performance_review_major_issues enable row level security;

drop policy if exists "authenticated full access" on performance_review_quick_notes;
create policy "authenticated full access" on performance_review_quick_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on performance_review_improvements;
create policy "authenticated full access" on performance_review_improvements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on performance_review_major_issues;
create policy "authenticated full access" on performance_review_major_issues
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
