-- CRM pipelines: an unassigned company sits in the shared "General Bucket";
-- claiming it (by the salesperson themselves, or by an Admin/Exec assigning
-- it on someone's behalf) moves it into that person's own pipeline.
alter table public.crm_companies
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column assigned_at timestamptz;
create index if not exists crm_companies_assigned_to_idx on crm_companies (assigned_to);
