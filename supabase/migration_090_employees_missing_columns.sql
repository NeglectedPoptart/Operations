-- Corrective: the live employees table is missing department, start_date,
-- status, direct_manager, and last_anniversary_alert_year - only id, name,
-- title, and linked_user_id (added later, separately) actually exist,
-- despite migration_088 defining all of them in one create table
-- statement. Whatever happened when that migration ran, this re-adds
-- exactly what's missing without touching what's already there - every
-- clause is guarded so this is a no-op for any column that does exist.
alter table employees add column if not exists department text;
alter table employees add column if not exists start_date date;
alter table employees add column if not exists direct_manager text;
alter table employees add column if not exists last_anniversary_alert_year int;
alter table employees add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_status_check') then
    alter table employees add constraint employees_status_check check (status in ('active', 'resigned', 'terminated'));
  end if;
end $$;
