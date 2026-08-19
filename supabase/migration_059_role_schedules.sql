-- Management > Schedules: a tile per role showing its hours, grouped by
-- department. hours_text is free-form (multi-line) rather than a rigid
-- day-by-day schema, since shift patterns vary a lot department to
-- department (rotating Saturdays, different weekday/Saturday-week splits,
-- etc.) and this just needs to display + be editable, not compute anything.
create table if not exists role_schedules (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  role_name text not null,
  hours_text text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists role_schedules_department_idx on role_schedules (department, position);

alter table role_schedules enable row level security;

drop policy if exists "authenticated full access" on role_schedules;
create policy "authenticated full access" on role_schedules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed the QC Department schedule from Harvest_Best_Shift_Schedule.pdf -
-- only if QC has no rows yet, so re-running this migration is harmless.
insert into role_schedules (department, role_name, hours_text, position)
select * from (
  values
    (
      'QC',
      '1st Shift - Morning',
      e'Non-Saturday weeks (2x/month): Mon-Fri 8:00 AM - 4:00 PM (40 hrs)\nSaturday weeks (2x/month): Mon-Fri 8:00 AM - 3:00 PM, Sat 8:00 AM - 1:00 PM (40 hrs)',
      0
    ),
    (
      'QC',
      '2nd Shift - Night QC',
      e'Every week, Mon-Fri: 3:00 PM - 11:00 PM (40 hrs)\nRotating Saturday (on top of weekday hours):\n  Week 1 & 3: 9:00 AM - 1:00 PM (4 hrs)\n  Week 2 & 4: 1:00 PM - 5:00 PM (4 hrs)',
      1
    )
) as seed(department, role_name, hours_text, position)
where not exists (select 1 from role_schedules where department = 'QC');
