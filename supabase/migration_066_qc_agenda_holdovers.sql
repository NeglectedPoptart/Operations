-- QC Agenda: "Pull Holdovers" - carries yesterday's (or, on a Monday,
-- Saturday's + Sunday's) unresolved QC Inspections rows into today's agenda
-- so nothing that was never checked, chatted, or reported silently falls
-- off the radar overnight.
create table if not exists qc_agenda_holdovers (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  inspection_date date,
  po text,
  lot text,
  product text,
  qc text,
  notes text,
  qc_inspection_id uuid references qc_inspections (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table qc_agenda_holdovers enable row level security;

create policy "authenticated full access" on qc_agenda_holdovers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
