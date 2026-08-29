-- Management > Meal Plans: a growing recipe database (mains + snacks) the
-- user builds up over time via prompts, plus a plan-builder page that picks
-- a handful of recipes and generates a printable/copyable breakdown. The
-- breakdown itself (which recipes were picked, for what period) is
-- deliberately NOT persisted - it's just a client-side snapshot of whatever
-- is currently selected, same "generate and view" shape as the old Batch &
-- Bowl page it replaces, minus that page's fixed/hardcoded plan.
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_type text not null check (recipe_type in ('main', 'snack')),
  name text not null,
  servings text,
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_type_idx on recipes (recipe_type, name);

alter table recipes enable row level security;

drop policy if exists "authenticated full access" on recipes;
create policy "authenticated full access" on recipes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists recipes_set_updated_at on recipes;
create trigger recipes_set_updated_at
  before update on recipes
  for each row execute function set_updated_at();
