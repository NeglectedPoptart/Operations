-- Broccoli Inventory (Warehouse): a dedicated tracking sheet the user has
-- historically kept in Excel, replacing it here. Pulls on-floor lots in
-- from sr_inventory_lots and inbound lots in from mx_arrivals, but keeps
-- its own editable state (Crown/Ice condition, orders, manual lines) since
-- neither source system tracks those. The two partial-unique indexes make
-- the "pull from ..." actions idempotent upserts, so re-running one only
-- updates the matching row instead of duplicating it (and never touches
-- orders already added under a previously-pulled lot).
create table if not exists broccoli_lots (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'on_floor' check (status in ('inbound', 'on_floor')),
  source text not null default 'manual' check (source in ('warehouse', 'arrivals', 'manual')),
  source_lot_id uuid references sr_inventory_lots (id) on delete set null,
  source_arrival_id uuid references mx_arrivals (id) on delete set null,
  lot_number text,
  received_date date,
  label text,
  grade text,
  qty numeric,
  crown_quality text check (crown_quality in ('pass', 'slight_caution', 'caution', 'urgent', 'fail')),
  ice_quality text check (ice_quality in ('none', 'low', 'med', 'high')),
  position int not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists broccoli_lots_source_lot_idx on broccoli_lots (source_lot_id) where source_lot_id is not null;
create unique index if not exists broccoli_lots_source_arrival_idx on broccoli_lots (source_arrival_id) where source_arrival_id is not null;

create table if not exists broccoli_orders (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references broccoli_lots (id) on delete cascade,
  source_order_id uuid references mx_orders (id) on delete set null,
  order_number text,
  qty numeric,
  notes text,
  position int not null default 1,
  created_at timestamptz not null default now()
);
create unique index if not exists broccoli_orders_source_order_idx on broccoli_orders (source_order_id) where source_order_id is not null;

alter table broccoli_lots enable row level security;
alter table broccoli_orders enable row level security;

drop policy if exists "authenticated full access" on broccoli_lots;
create policy "authenticated full access" on broccoli_lots
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on broccoli_orders;
create policy "authenticated full access" on broccoli_orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
