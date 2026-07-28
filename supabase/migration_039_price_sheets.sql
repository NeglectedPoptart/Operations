-- Migration 039: Buyers - Price Sheets + Vendor Catalog.

-- vendors: one row per produce vendor. sheet_date is the date on their most
-- recently pasted sheet (parsed from the paste, or the paste's calendar day
-- if no date was found) - price_sheet_items reflects that vendor's CURRENT
-- sheet only (full-replaced on every paste), so sheet_date is what "today"
-- comparisons in the Vendor Catalog check against.
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_unknown boolean not null default false,
  sheet_date date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_position_idx on vendors (position);

-- price_sheet_items: a vendor's current price sheet, full-replaced on every
-- paste-import (old rows for that vendor deleted, new ones inserted) - this
-- is a snapshot of what they're offering right now, not a price history.
create table if not exists price_sheet_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors (id) on delete cascade,
  category text not null,
  item_label text not null,
  size text,
  price numeric,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists price_sheet_items_vendor_id_idx on price_sheet_items (vendor_id);
create index if not exists price_sheet_items_category_idx on price_sheet_items (category);

-- vendor_commodities: a persistent "this vendor sells this category" record,
-- separate from price_sheet_items - once a vendor has shown up selling a
-- category on any price sheet, they stay listed under it in the Vendor
-- Catalog going forward even on a day their current sheet doesn't mention
-- it (only price_sheet_items + sheet_date determine whether a price shows).
create table if not exists vendor_commodities (
  vendor_id uuid not null references vendors (id) on delete cascade,
  category text not null,
  first_seen_at timestamptz not null default now(),
  primary key (vendor_id, category)
);

drop trigger if exists vendors_set_updated_at on vendors;
create trigger vendors_set_updated_at
  before update on vendors
  for each row execute function set_updated_at();

drop trigger if exists price_sheet_items_set_updated_at on price_sheet_items;
create trigger price_sheet_items_set_updated_at
  before update on price_sheet_items
  for each row execute function set_updated_at();

alter table vendors enable row level security;
alter table price_sheet_items enable row level security;
alter table vendor_commodities enable row level security;

drop policy if exists "authenticated full access" on vendors;
create policy "authenticated full access" on vendors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on price_sheet_items;
create policy "authenticated full access" on price_sheet_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on vendor_commodities;
create policy "authenticated full access" on vendor_commodities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed: a standing "Unknown / TBD" vendor for sheets with no identified
-- source at paste time.
insert into vendors (name, is_unknown, position)
select 'Unknown / TBD', true, -1
where not exists (select 1 from vendors where name = 'Unknown / TBD');
