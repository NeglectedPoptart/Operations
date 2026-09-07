-- Mexico module: Growers directory + a weekly Arrivals report. Growers,
-- Labels, and Commodities are all selection-based (never free-typed on the
-- Arrivals report itself) so the same grower/label/commodity never ends up
-- spelled two different ways across rows.
create table if not exists mx_growers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  origin text,
  best_contact text,
  accounting_contact text,
  logistics_contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mx_grower_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into mx_grower_labels (name) values
  ('FCR'), ('FCG'), ('FUJ'), ('GEN'), ('HB'), ('Fresco'), ('Happy')
on conflict (name) do nothing;

create table if not exists mx_commodities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into mx_commodities (name) values
  ('Broccoli #1'), ('Broccoli #2'), ('Broccoli Iceless'), ('Iceberg'), ('Romaine'),
  ('Green Leaf'), ('Red Leaf'), ('Mixed Leafy'), ('Celery 24s'), ('Celery 30s'),
  ('Carrots'), ('Bells'), ('Green Beans'), ('Hot Peppers'), ('Cauliflower')
on conflict (name) do nothing;

insert into mx_growers (name, origin) values
  ('Nieto', 'GTO'),
  ('Don Gu', 'GTO'),
  ('Navarro', 'PUE'),
  ('Fuerte', null),
  ('Don Alberto', null),
  ('Produce First', null),
  ('Torres', null),
  ('Chinampa', null)
on conflict (name) do nothing;

-- One row = one truck/manifest. week_start_date is always a Monday (same
-- convention as broker_rate_entries / weekly-company-call), section is which
-- of the 4 report groupings the row was added under. Up to 4 commodities can
-- ride on one truck, sharing one combined box count and price - matching how
-- the source spreadsheet already treats a multi-commodity load as one line
-- (e.g. "Broccoli #1 / #2" with one combined box count), just with each
-- commodity now a real selection instead of typed into one text cell.
-- truck_group/truck_position link separate manifests (possibly in different
-- sections) that physically rode on the same truck.
create table if not exists mx_arrivals (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  section text not null check (section in ('lettuce', 'broccoli', 'peppers_hothouse', 'celery_carrots_cauliflower')),
  position int not null default 1,
  grower_id uuid references mx_growers (id) on delete set null,
  label_id uuid references mx_grower_labels (id) on delete set null,
  commodity_1_id uuid references mx_commodities (id) on delete set null,
  commodity_2_id uuid references mx_commodities (id) on delete set null,
  commodity_3_id uuid references mx_commodities (id) on delete set null,
  commodity_4_id uuid references mx_commodities (id) on delete set null,
  boxes_approx text,
  price_to_grower text,
  manifesto text,
  arrival_day text check (arrival_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  notes text,
  truck_group text,
  truck_position text check (truck_position in ('nose', 'middle', 'tail')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mx_arrivals_week_idx on mx_arrivals (week_start_date);

alter table mx_growers enable row level security;
alter table mx_grower_labels enable row level security;
alter table mx_commodities enable row level security;
alter table mx_arrivals enable row level security;

drop policy if exists "authenticated full access" on mx_growers;
create policy "authenticated full access" on mx_growers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on mx_grower_labels;
create policy "authenticated full access" on mx_grower_labels
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on mx_commodities;
create policy "authenticated full access" on mx_commodities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on mx_arrivals;
create policy "authenticated full access" on mx_arrivals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
