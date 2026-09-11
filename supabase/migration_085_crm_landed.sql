-- Marks a pipeline company as "landed" (full setup done, they've pulled a
-- PO) - who did it and when, so it can move out of the working pipeline
-- views into an Exec/Admin-only Completed list.
alter table crm_companies
  add column landed_at timestamptz,
  add column landed_by uuid references profiles (id) on delete set null;
create index if not exists crm_companies_landed_at_idx on crm_companies (landed_at);
