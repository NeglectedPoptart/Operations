-- Migration 031: Warehouse - Cold Inventory.
-- Pasted from the cold storage pivot report (Manifest x Commodity/Size ->
-- Sum of On Hand Cases). Each paste fully replaces the current snapshot -
-- rows no longer present in the new paste are deleted (that stock shipped
-- out) - but a row's Good/Issue/Dump status and notes carry over
-- automatically when the same manifest+commodity+size reappears in a later
-- paste, since manifest_order/column_order get refreshed on every import but
-- status/notes are only ever touched by the user.
create table if not exists cold_inventory_items (
  id uuid primary key default gen_random_uuid(),
  manifest text not null,
  commodity text not null,
  size text not null,
  qty numeric not null,
  manifest_order integer not null default 0,
  column_order integer not null default 0,
  status text check (status in ('good', 'issue', 'dump')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manifest, commodity, size)
);

drop trigger if exists cold_inventory_items_set_updated_at on cold_inventory_items;
create trigger cold_inventory_items_set_updated_at
  before update on cold_inventory_items
  for each row execute function set_updated_at();

alter table cold_inventory_items enable row level security;
drop policy if exists "authenticated full access" on cold_inventory_items;
create policy "authenticated full access" on cold_inventory_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
