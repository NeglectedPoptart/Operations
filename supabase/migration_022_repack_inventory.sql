-- Migration 022: Warehouse - Repack Inventory.
-- Replaces the "one new column per usage date" spreadsheet with a running
-- balance per item (repack_items.current_stock) plus a ledger of every
-- usage/restock entry (repack_adjustments). A trigger keeps current_stock
-- in sync automatically whenever an adjustment is inserted or deleted (so
-- deleting a mis-entered line correctly un-does its effect), the same way
-- set_updated_at already keeps updated_at in sync elsewhere. Safe to re-run.

create table if not exists repack_items (
  id uuid primary key default gen_random_uuid(),
  position int not null default 1,
  name text not null,
  initial_stock numeric not null default 0,
  current_stock numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- qty is signed: negative = used by a repack, positive = restocked/corrected.
create table if not exists repack_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references repack_items (id) on delete cascade,
  entry_date date not null default current_date,
  qty numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists repack_adjustments_item_id_idx on repack_adjustments (item_id);

drop trigger if exists repack_items_set_updated_at on repack_items;
create trigger repack_items_set_updated_at
  before update on repack_items
  for each row execute function set_updated_at();

create or replace function apply_repack_adjustment()
returns trigger as $$
begin
  update repack_items set current_stock = current_stock + new.qty where id = new.item_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists repack_adjustments_apply_insert on repack_adjustments;
create trigger repack_adjustments_apply_insert
  after insert on repack_adjustments
  for each row execute function apply_repack_adjustment();

create or replace function reverse_repack_adjustment()
returns trigger as $$
begin
  update repack_items set current_stock = current_stock - old.qty where id = old.item_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists repack_adjustments_reverse_delete on repack_adjustments;
create trigger repack_adjustments_reverse_delete
  after delete on repack_adjustments
  for each row execute function reverse_repack_adjustment();

alter table repack_items enable row level security;
alter table repack_adjustments enable row level security;

drop policy if exists "authenticated full access" on repack_items;
create policy "authenticated full access" on repack_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on repack_adjustments;
create policy "authenticated full access" on repack_adjustments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
