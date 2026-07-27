-- Migration 037: rename the "Compliance" role to "Accounting" and drop its
-- Warehouse access (it keeps Logistics, QC, Sales, and the Compliance tab -
-- see src/lib/roles.ts for the exact list). Existing users with the old
-- role value are migrated in place.
--
-- Drops every check constraint on profiles.role by name rather than
-- assuming it's called "profiles_role_check" - if it was ever recreated
-- under a different auto-generated name, a hardcoded drop-if-exists would
-- silently no-op and leave the old constraint (still rejecting 'accounting')
-- in place alongside the new one, which is exactly the "select Accounting,
-- it snaps back to Admin" symptom that motivated this rewrite.
update profiles set role = 'accounting' where role = 'compliance';

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'accounting'));
