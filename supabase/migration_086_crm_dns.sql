-- "Do Not Sell" - the mirror of landed_at/landed_by for a company the
-- pipeline owner (or Admin/Exec) has decided NOT to pursue, moving it out
-- of the working pipeline views into its own Exec/Admin-only DNS list.
alter table crm_companies
  add column dns_at timestamptz,
  add column dns_by uuid references profiles (id) on delete set null;
create index if not exists crm_companies_dns_at_idx on crm_companies (dns_at);
