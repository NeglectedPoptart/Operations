-- New CRM module: a company/prospect list (modeled on the user's existing
-- "Robbie Texas Produce CRM" Excel workbook - Companies/Notes/Lists sheets)
-- plus a per-company dated activity log replacing the Notes sheet.
create table if not exists crm_companies (
  id uuid primary key default gen_random_uuid(),
  blue_book_id text unique,
  name text not null,
  legal_name text,
  city_state text,
  location_type text,
  phone text,
  classification text,
  score int,
  rating numeric,
  source_status text,
  profile_url text,
  crm_status text not null default 'prospect'
    check (crm_status in ('prospect', 'contacted', 'qualified', 'customer', 'inactive', 'do_not_contact')),
  priority text check (priority in ('high', 'medium', 'low')),
  primary_contact text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_companies_status_idx on crm_companies (crm_status);

create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references crm_companies (id) on delete cascade,
  activity_date date not null,
  contact_person text,
  activity_type text
    check (activity_type in ('call', 'email', 'meeting', 'quote', 'follow_up', 'visit', 'other')),
  outcome text
    check (outcome in ('no_answer', 'left_message', 'connected', 'interested', 'quote_sent', 'follow_up_needed', 'won', 'lost', 'other')),
  notes text,
  next_action text,
  next_follow_up date,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_activities_company_idx on crm_activities (company_id);
create index if not exists crm_activities_date_idx on crm_activities (activity_date);

alter table crm_companies enable row level security;
alter table crm_activities enable row level security;

drop policy if exists "authenticated full access" on crm_companies;
create policy "authenticated full access" on crm_companies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on crm_activities;
create policy "authenticated full access" on crm_activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
