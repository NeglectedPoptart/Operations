-- Lets each person have up to 3 goals per day instead of just 1 - a "slot"
-- (1, 2, or 3) alongside user_id/goal_date so each of the 3 rows for a
-- person's day is independently settable/clearable.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'crm_daily_goals'::regclass and contype = 'u'
  loop
    execute format('alter table crm_daily_goals drop constraint %I', r.conname);
  end loop;
end $$;

alter table crm_daily_goals add column if not exists slot int not null default 1;
alter table crm_daily_goals add constraint crm_daily_goals_slot_check check (slot in (1, 2, 3));
alter table crm_daily_goals add constraint crm_daily_goals_user_date_slot_key unique (user_id, goal_date, slot);
