-- Migration 043: a single truck can pick up from more than one place before
-- delivering. loads.source (the hub) stays the truck's primary/originating
-- pickup - this table is only for EXTRA pickups beyond that, same "child
-- table of loads" shape as load_stops (which is only for drops).
create table if not exists load_pickups (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  position int not null default 1,
  pu_number text,
  vendor text,
  location text
);

create index if not exists load_pickups_load_id_idx on load_pickups (load_id);

alter table load_pickups enable row level security;

drop policy if exists "authenticated full access" on load_pickups;
create policy "authenticated full access" on load_pickups
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
