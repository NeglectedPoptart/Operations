-- Migration 157: Warehouse > Repacks - a log of every repack job.
--
-- repacks: one row per repack - the product that went in, the product that came out,
-- how many cartons were used, what it cost, and notes. Shown on Warehouse > Repacks
-- and in the Weekly Company Call (Lead Quality Control, last 7 days).
--
-- repack_adjustments.repack_id: when a repack uses supplies from Repack Inventory, each
-- supply line is an ordinary adjustment (a negative quantity) tagged with the repack it
-- belongs to. The existing trigger keeps the item's stock in step, and deleting the repack
-- deletes those adjustments - which puts the supplies back on the shelf automatically.
--
-- Safe to re-run.

create table if not exists repacks (
  id uuid primary key default gen_random_uuid(),
  repack_date date not null default current_date,
  product_in text not null default '',
  qty_in numeric,
  product_out text not null default '',
  qty_out numeric,
  cartons_used numeric,
  carton_type text,
  cost numeric(12, 2),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repacks_date_idx on repacks (repack_date desc);

drop trigger if exists repacks_set_updated_at on repacks;
create trigger repacks_set_updated_at
  before update on repacks
  for each row execute function set_updated_at();

alter table repacks enable row level security;

drop policy if exists "authenticated full access" on repacks;
create policy "authenticated full access" on repacks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table repack_adjustments add column if not exists repack_id uuid references repacks (id) on delete cascade;

create index if not exists repack_adjustments_repack_id_idx on repack_adjustments (repack_id);
