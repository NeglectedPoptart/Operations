-- One-off (or short-range) overrides on top of a person's regular Week A/B
-- pattern - "off this one Saturday", "in an hour earlier for the next two
-- weeks", "working this Saturday even though it's normally off". A blank
-- hours_text means the day is off; a range covers every date from start to
-- end inclusive (a single day just has start = end).
create table if not exists schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  role_schedule_id uuid not null references role_schedules(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  hours_text text,
  created_at timestamptz not null default now()
);
create index if not exists schedule_exceptions_schedule_idx on schedule_exceptions (role_schedule_id);

alter table schedule_exceptions enable row level security;
drop policy if exists "authenticated full access" on schedule_exceptions;
create policy "authenticated full access" on schedule_exceptions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
