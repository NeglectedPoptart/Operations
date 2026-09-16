-- Costs (Management): the first section on this page is Repack Costs - a
-- flat reference table of what each repack movement/action costs, and
-- the unit it's billed per (per box, per case, etc.). Table name is
-- specific to this section on purpose, since later sections on the same
-- page (if any) will likely need their own shape rather than sharing
-- this one.
create table if not exists repack_costs (
  id uuid primary key default gen_random_uuid(),
  action text,
  cost numeric,
  unit text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table repack_costs enable row level security;

drop policy if exists "authenticated full access" on repack_costs;
create policy "authenticated full access" on repack_costs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
