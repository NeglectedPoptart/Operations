-- Carton Inventory: tracks cartons manufactured by PCA (Texas, "Homebase")
-- and shipped out to Mexico growers. Modeled as a signed ledger
-- (carton_transactions) with a trigger-maintained running balance
-- (carton_balances) per (carton_type, location) - not a lot model, since a
-- carton type needs to move between many locations over time, not just
-- receive-then-deplete at one place (see repack_items/repack_adjustments
-- in migration_022_repack_inventory.sql for the same pattern).

-- Every place cartons can sit: the one Homebase (PCA, Texas) plus one row
-- per grower, kept in sync automatically so a new grower is immediately
-- selectable as a transfer destination with no manual setup step.
create table if not exists carton_locations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('homebase', 'grower')),
  grower_id uuid unique references mx_growers (id) on delete cascade,
  name text, -- only used for the homebase row's display name
  created_at timestamptz not null default now(),
  constraint carton_locations_grower_match check (
    (kind = 'grower' and grower_id is not null) or (kind = 'homebase' and grower_id is null)
  )
);
create unique index if not exists carton_locations_single_homebase on carton_locations (kind) where kind = 'homebase';

insert into carton_locations (kind, name)
  select 'homebase', 'PCA - Texas (Homebase)'
  where not exists (select 1 from carton_locations where kind = 'homebase');

insert into carton_locations (kind, grower_id)
  select 'grower', id from mx_growers
  on conflict (grower_id) do nothing;

create or replace function create_carton_location_for_grower() returns trigger as $$
begin
  insert into carton_locations (kind, grower_id) values ('grower', new.id) on conflict (grower_id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists mx_growers_create_carton_location on mx_growers;
create trigger mx_growers_create_carton_location after insert on mx_growers
  for each row execute function create_carton_location_for_grower();

create table if not exists carton_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position int not null default 1,
  created_at timestamptz not null default now()
);
insert into carton_types (name, position) values
  ('Bella Bells 11lb BElls', 1),
  ('Fu Choy Broccoli Green DN', 2),
  ('Fu choy Broccoli Red DN', 3),
  ('Fu choy broccoli Red V26', 4),
  ('Fuel of life shipper', 5),
  ('Harvest - 25lb Bell Pepper', 6),
  ('Harvest Celery KR', 7),
  ('Harvest Lettuce DW DN', 8)
on conflict (name) do nothing;

-- Reuses mx_commodities (already seeded, already wired into
-- MxArrival.commodity_1_id..4_id) rather than a parallel products table -
-- Supreme > Produce just manages this same table under a "Products" label.
alter table mx_commodities add column if not exists carton_type_id uuid references carton_types (id) on delete set null;

-- Signed ledger (+ in, - out). A transfer is two rows sharing
-- related_transaction_id. A future Arrivals auto-deduction row would be
-- tagged source='arrival' with source_arrival_id/source_arrival_slot so an
-- edited arrival line can find and replace its own row instead of
-- double-counting (not built yet - see the plan's Phase 2).
create table if not exists carton_transactions (
  id uuid primary key default gen_random_uuid(),
  carton_type_id uuid not null references carton_types (id) on delete restrict,
  location_id uuid not null references carton_locations (id) on delete restrict,
  qty integer not null,
  entry_date date not null default current_date,
  related_transaction_id uuid references carton_transactions (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'transfer', 'arrival')),
  source_arrival_id uuid references mx_arrivals (id) on delete set null,
  source_arrival_slot int,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists carton_transactions_arrival_slot_idx on carton_transactions (source_arrival_id, source_arrival_slot)
  where source = 'arrival';

create table if not exists carton_balances (
  carton_type_id uuid not null references carton_types (id) on delete cascade,
  location_id uuid not null references carton_locations (id) on delete cascade,
  qty integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (carton_type_id, location_id)
);

create or replace function apply_carton_transaction() returns trigger as $$
begin
  insert into carton_balances (carton_type_id, location_id, qty)
  values (new.carton_type_id, new.location_id, new.qty)
  on conflict (carton_type_id, location_id) do update set qty = carton_balances.qty + excluded.qty, updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists carton_transactions_apply on carton_transactions;
create trigger carton_transactions_apply after insert on carton_transactions
  for each row execute function apply_carton_transaction();

create or replace function reverse_carton_transaction() returns trigger as $$
begin
  update carton_balances set qty = qty - old.qty, updated_at = now()
  where carton_type_id = old.carton_type_id and location_id = old.location_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists carton_transactions_reverse on carton_transactions;
create trigger carton_transactions_reverse after delete on carton_transactions
  for each row execute function reverse_carton_transaction();

alter table mx_growers add column if not exists address text, add column if not exists city text, add column if not exists state text;

alter table carton_locations enable row level security;
alter table carton_types enable row level security;
alter table carton_transactions enable row level security;
alter table carton_balances enable row level security;

drop policy if exists "authenticated full access" on carton_locations;
create policy "authenticated full access" on carton_locations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on carton_types;
create policy "authenticated full access" on carton_types
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on carton_transactions;
create policy "authenticated full access" on carton_transactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on carton_balances;
create policy "authenticated full access" on carton_balances
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
