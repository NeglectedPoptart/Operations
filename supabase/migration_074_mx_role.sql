-- Migration 074: MX role - Mexico-side staff. Sees Mexico, Meetings,
-- Marketing, Compliance, QC, and Warehouse (plus Home, open to every role).

-- Drops whatever the current role check constraint is named (same approach
-- as migration_037/038/041/049, rather than assuming a name) and re-adds it
-- with the new value.
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
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'accounting', 'buyer', 'executive', 'broker_carrier', 'mx'));
