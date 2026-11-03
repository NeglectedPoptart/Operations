-- Migration 161: the cold storage Inventory Report emailed to HOPS each morning.
--
-- The warehouse emails the same Inventory Report .xlsx that is normally uploaded on
-- Warehouse > Cold Inventory. The HOPS inbox reader loads it automatically; one row here per
-- email, so each is handled once and Cold Inventory can show what happened. The parsed lines
-- are kept so a file that was held back ("Apply anyway") can be applied from the page.
--
-- Safe to re-run.

create table if not exists cold_inventory_imports (
  id uuid primary key default gen_random_uuid(),
  graph_message_id text not null unique,
  received_at timestamptz not null,
  from_email text,
  subject text,
  file_name text,
  -- the report's own "Date:" line
  report_date date,
  customer text,
  -- applied = loaded into Cold Inventory; skipped = held back (older report, or a second file
  -- for a date already loaded); error = could not be read or saved (see note)
  status text not null check (status in ('applied', 'skipped', 'error')),
  items_count integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists cold_inventory_imports_received_idx on cold_inventory_imports (received_at desc);

alter table cold_inventory_imports enable row level security;
drop policy if exists "authenticated full access" on cold_inventory_imports;
create policy "authenticated full access" on cold_inventory_imports
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
