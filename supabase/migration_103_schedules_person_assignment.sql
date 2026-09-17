-- Schedules: a tile is now either assigned to a specific person (with a
-- 2-week alternating hours pattern you can browse week-by-week, e.g. Luis's
-- Non-Saturday/Saturday alternation) or a general role (unchanged - a
-- static description like "Office hours 8am-5pm" for salaried staff).
-- week_a/week_b replace hours_text going forward for both types (a role
-- tile just never fills in week_b, so it reads the same every week);
-- hours_text itself is left in place, backfilled once, rather than dropped.
alter table role_schedules add column if not exists assignment_type text not null default 'role';
alter table role_schedules drop constraint if exists role_schedules_assignment_type_check;
alter table role_schedules add constraint role_schedules_assignment_type_check
  check (assignment_type in ('person', 'role'));

alter table role_schedules add column if not exists employee_id uuid references employees(id) on delete set null;
alter table role_schedules add column if not exists week_a_hours_text text;
alter table role_schedules add column if not exists week_b_hours_text text;

update role_schedules set week_a_hours_text = hours_text where week_a_hours_text is null;
