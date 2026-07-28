-- Migration 038: add the "Buyer" role (Warehouse, QC, Sales, and the new
-- Buyers tab - see src/lib/roles.ts for the exact list). Drops any check
-- constraint on profiles.role by inspecting pg_constraint rather than
-- assuming its name, the same way migration_037 had to after a stale,
-- differently-named constraint silently survived a hardcoded drop-if-exists.
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
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'accounting', 'buyer'));
