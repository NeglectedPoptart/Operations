-- Mexico Orders: what each customer needs fulfilled, one row per line item.
-- customer/commodity are free text (not FK'd to a fixed list, unlike
-- Arrivals' growers/labels/commodities) since customers and their SKUs
-- vary constantly and each one's own order format is pasted/parsed
-- separately (see src/lib/mxOrdersParse.ts).
create table if not exists mx_orders (
  id uuid primary key default gen_random_uuid(),
  customer text not null,
  commodity text not null,
  plu text,
  size text,
  coo text,
  grade text,
  qty numeric,
  qty_unit text,
  po_number text,
  reference_number text,
  loading_date date,
  delivery_date date,
  status text not null default 'pending' check (status in ('pending', 'fulfilled')),
  notes text,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mx_orders_delivery_date_idx on mx_orders (delivery_date);

drop trigger if exists mx_orders_set_updated_at on mx_orders;
create trigger mx_orders_set_updated_at
  before update on mx_orders
  for each row execute function set_updated_at();

alter table mx_orders enable row level security;

drop policy if exists "authenticated full access" on mx_orders;
create policy "authenticated full access" on mx_orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
