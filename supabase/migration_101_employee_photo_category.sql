-- Allow a third employee_documents category, "photo", so employee photos
-- reuse the existing document storage/signed-URL plumbing instead of a
-- separate table/bucket. Finds and drops whatever the existing category
-- check constraint is actually named (it was created inline, unnamed, back
-- in migration_088) rather than guessing, so this can't leave the old,
-- more restrictive constraint in place alongside the new one.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'employee_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table employee_documents drop constraint %I', con.conname);
  end loop;
end $$;

alter table employee_documents add constraint employee_documents_category_check
  check (category in ('onboarding', 'offboarding', 'photo'));
