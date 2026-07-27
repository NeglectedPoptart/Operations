-- Migration 037: rename the "Compliance" role to "Accounting" and drop its
-- Warehouse access (it keeps Logistics, QC, Sales, and the Compliance tab -
-- see src/lib/roles.ts for the exact list). Existing users with the old
-- role value are migrated in place.
update profiles set role = 'accounting' where role = 'compliance';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'accounting'));
