-- Powers the new Activity Tracking page (Exec/Admin only): who added a
-- company and who actually logged an activity entry, tracked separately
-- from the free-text "Owner" field on activities (which was never a real
-- user reference) and from crm_companies' existing assigned_to/landed_by/
-- dns_by, none of which cover "who created this record in the first place".
alter table crm_companies
  add column created_by uuid references profiles (id) on delete set null;
alter table crm_activities
  add column logged_by uuid references profiles (id) on delete set null;
create index if not exists crm_companies_created_by_idx on crm_companies (created_by);
create index if not exists crm_activities_logged_by_idx on crm_activities (logged_by);
