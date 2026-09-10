-- Migration 081: Buyer/Sales role - a hybrid for staff who need both the
-- Buyer tabs and full Sales access (including CRM), rather than one or the
-- other.
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
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'accounting', 'buyer', 'executive', 'broker_carrier', 'mx', 'buyer_sales'));
