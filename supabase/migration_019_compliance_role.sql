-- Migration 019: add the "Compliance" permission level (role value
-- 'compliance'). Same access as Operations - everything except Management -
-- see src/lib/roles.ts for the exact tab list. Safe to re-run.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'compliance'));
