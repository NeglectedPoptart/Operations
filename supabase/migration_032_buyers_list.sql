-- Migration 032: Sales - Buyers List.
-- Pasted from the inventory pivot report; any row whose Avl (available)
-- column is negative gets added here as something to go source. A standing
-- task list, not a snapshot: pasting only adds newly-negative rows (matched
-- on warehouse+commodity+variety+pack style+size+label) or refreshes the
-- qty needed for one already on the list - nothing is ever removed except by
-- deleting it manually once resolved.
create table if not exists buyers_list_items (
  id uuid primary key default gen_random_uuid(),
  whse text not null,
  comm text not null,
  variety text not null,
  pstyle text not null,
  size text not null,
  label text not null,
  qty_needed numeric not null,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whse, comm, variety, pstyle, size, label)
);

drop trigger if exists buyers_list_items_set_updated_at on buyers_list_items;
create trigger buyers_list_items_set_updated_at
  before update on buyers_list_items
  for each row execute function set_updated_at();

alter table buyers_list_items enable row level security;
drop policy if exists "authenticated full access" on buyers_list_items;
create policy "authenticated full access" on buyers_list_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
