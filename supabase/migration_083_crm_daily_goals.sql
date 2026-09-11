-- A daily goal per person, shown in the CRM's side "Goals" bookmark tab -
-- what they're working on today (goal_text) and how far along they are
-- against a numeric target (current_count / target_count), reset by simply
-- being scoped to goal_date: a new day means an empty slate until someone
-- sets today's goal.
create table if not exists crm_daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  goal_date date not null,
  goal_text text not null,
  target_count int not null default 0,
  current_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, goal_date)
);
create index if not exists crm_daily_goals_date_idx on crm_daily_goals (goal_date);

alter table crm_daily_goals enable row level security;
drop policy if exists "authenticated full access" on crm_daily_goals;
create policy "authenticated full access" on crm_daily_goals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
