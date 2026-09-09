-- Shipping/Receiving: a standalone prototype ERP (inspired by iSolve Produce's
-- module breakdown - Warehouse/Inventory, Sales Orders, Purchase Orders), kept
-- deliberately independent of this app's other produce-tracking features
-- (Mexico Growers, Vendor Catalog, AR customers) since each of those is
-- shaped for its own specific workflow, not a general item/vendor/customer
-- master. Prefixed sr_ throughout.

-- Master data --------------------------------------------------------------------

create table if not exists sr_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pack_style text,
  size text,
  unit text,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sr_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sr_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  phone text,
  email text,
  terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventory ------------------------------------------------------------------------

-- One row per received lot (pallet-tag style, per iSolve's model) rather than
-- one row per item - qty_on_hand starts equal to qty_received and depletes as
-- Shipping ships against it (oldest lot first), so aging/rotation is visible
-- per lot, not just as a single blended item total.
create table if not exists sr_inventory_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references sr_items (id) on delete set null,
  lot_number text,
  vendor_id uuid references sr_vendors (id) on delete set null,
  po_id uuid,
  received_date date,
  qty_received numeric,
  qty_on_hand numeric,
  unit_cost numeric,
  warehouse text,
  status text not null default 'available' check (status in ('available', 'committed', 'shipped', 'adjusted')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sr_inventory_lots_item_idx on sr_inventory_lots (item_id);

-- Purchase Orders -----------------------------------------------------------------

create table if not exists sr_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  vendor_id uuid references sr_vendors (id) on delete set null,
  order_date date,
  status text not null default 'open' check (status in ('open', 'partial', 'received', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sr_po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references sr_purchase_orders (id) on delete cascade,
  position int not null default 1,
  item_id uuid references sr_items (id) on delete set null,
  qty_ordered numeric,
  unit_cost numeric,
  qty_received numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sr_po_lines_po_idx on sr_po_lines (po_id);

alter table sr_inventory_lots add constraint sr_inventory_lots_po_id_fkey
  foreign key (po_id) references sr_purchase_orders (id) on delete set null;

-- Sales Orders --------------------------------------------------------------------

create table if not exists sr_sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references sr_customers (id) on delete set null,
  order_date date,
  ship_date date,
  status text not null default 'open' check (status in ('open', 'shipped', 'invoiced', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sr_so_lines (
  id uuid primary key default gen_random_uuid(),
  so_id uuid not null references sr_sales_orders (id) on delete cascade,
  position int not null default 1,
  item_id uuid references sr_items (id) on delete set null,
  qty_ordered numeric,
  unit_price numeric,
  qty_shipped numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sr_so_lines_so_idx on sr_so_lines (so_id);

alter table sr_items enable row level security;
alter table sr_vendors enable row level security;
alter table sr_customers enable row level security;
alter table sr_inventory_lots enable row level security;
alter table sr_purchase_orders enable row level security;
alter table sr_po_lines enable row level security;
alter table sr_sales_orders enable row level security;
alter table sr_so_lines enable row level security;

drop policy if exists "authenticated full access" on sr_items;
create policy "authenticated full access" on sr_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_vendors;
create policy "authenticated full access" on sr_vendors for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_customers;
create policy "authenticated full access" on sr_customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_inventory_lots;
create policy "authenticated full access" on sr_inventory_lots for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_purchase_orders;
create policy "authenticated full access" on sr_purchase_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_po_lines;
create policy "authenticated full access" on sr_po_lines for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_sales_orders;
create policy "authenticated full access" on sr_sales_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on sr_so_lines;
create policy "authenticated full access" on sr_so_lines for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
