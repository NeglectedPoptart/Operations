-- Migration 023: Sales - FOB Pricing (FOB - Pharr).
-- A fixed catalog of commodities (seeded once below, editable after) where
-- only the FOB price typically changes each morning, plus a small freight
-- rate reference table that is edited in place and never resets. Seed rows
-- only insert the first time this migration runs (idempotent re-run safe).

create table if not exists fob_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('western_veg', 'hot_house')),
  commodity_group text not null,
  variety text,
  unit_per numeric,
  size text,
  fob numeric,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fob_items_section_position_idx on fob_items (section, position);

drop trigger if exists fob_items_set_updated_at on fob_items;
create trigger fob_items_set_updated_at
  before update on fob_items
  for each row execute function set_updated_at();

create table if not exists fob_freight_rates (
  id uuid primary key default gen_random_uuid(),
  lane text not null,
  ltl numeric,
  ftl numeric,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fob_freight_rates_position_idx on fob_freight_rates (position);

drop trigger if exists fob_freight_rates_set_updated_at on fob_freight_rates;
create trigger fob_freight_rates_set_updated_at
  before update on fob_freight_rates
  for each row execute function set_updated_at();

do $$
begin
  if not exists (select 1 from fob_items limit 1) then
    insert into fob_items (section, commodity_group, variety, unit_per, size, fob, position) values
      ('western_veg', 'Broccoli', 'Fu Choy Red', 56, '20lb', 15.25, 1),
      ('western_veg', 'Broccoli', 'Fu Choy Green', 56, '20lb', 13.25, 2),
      ('western_veg', 'Broccoli', 'Generic', 56, '20lb', 13.25, 3),
      ('western_veg', 'Broccoli', 'Iceless', 64, '20lb', 14.25, 4),
      ('western_veg', 'Carrots', 'MED', 50, '50lb', 13.25, 5),
      ('western_veg', 'Carrots', 'LGE', 50, '50lb', 13.25, 6),
      ('western_veg', 'Carrots', 'JBO', 50, '50lb', 16.25, 7),
      ('western_veg', 'Cauliflower', '12ct', 56, '12ct', 18.25, 8),
      ('western_veg', 'Cauliflower', '16ct', 56, '12ct', null, 9),
      ('western_veg', 'Celery - Naked', 'Sleeved +$2', 32, '24s', 14.25, 10),
      ('western_veg', 'Celery - Naked', 'Sleeved +$2', 32, '30s', 15.25, 11),
      ('western_veg', 'Cucumbers', 'Super Select', 42, null, null, 12),
      ('western_veg', 'Cucumbers', 'Select', 42, null, null, 13),
      ('western_veg', 'Cucumbers', 'Plain', 42, null, null, 14),
      ('western_veg', 'Cucumbers', 'Large', 42, null, null, 15),
      ('western_veg', 'Lemon', null, 54, '115', null, 16),
      ('western_veg', 'Lettuce', 'Romaine Hearts', 40, 'Liner', 13.25, 17),
      ('western_veg', 'Lettuce', 'Iceberg', 40, 'Cello', 13.25, 18),
      ('western_veg', 'Lettuce', 'Iceberg', 40, 'Liner', 13.25, 19),
      ('western_veg', 'Lettuce', 'Romaine', 40, 'Liner', 14.25, 20),
      ('western_veg', 'Lettuce', 'Red Leaf', 40, 'Liner', null, 21),
      ('western_veg', 'Lettuce', 'Green Leaf', 40, 'Liner', 14.25, 22),
      ('western_veg', 'Tomatoes', null, 81, null, null, 23),
      ('western_veg', 'Squash', 'Zucchini FCY', 88, 'FCY', null, 24),
      ('western_veg', 'Squash', 'Zucchini W/B', 49, 'W/B', null, 25),
      ('western_veg', 'Squash', 'Yellow Straightneck FCY', 88, 'FCY', null, 26),
      ('western_veg', 'Squash', 'Yellow Straightneck W/B', 49, 'W/B', null, 27),
      ('western_veg', 'Squash', 'Grey FCY', 88, 'FCY', null, 28),

      ('hot_house', 'Bell Pepper 1lb', 'Red - MED/LGE', 100, null, 14.25, 1),
      ('hot_house', 'Bell Pepper 1lb', 'Red - XLG/JBO', 100, null, 14.25, 2),
      ('hot_house', 'Bell Pepper 1lb', 'Yellow - MED/LGE', 100, null, 12.25, 3),
      ('hot_house', 'Bell Pepper 1lb', 'Yellow - XLG/JBO', 100, null, 12.25, 4),
      ('hot_house', 'Bell Pepper 1lb', 'Orange - MED/LGE', 100, null, 12.25, 5),
      ('hot_house', 'Bell Pepper 1lb', 'Orange - XLG/JBO', 100, null, 12.25, 6),
      ('hot_house', 'Bell Pepper 25lb', 'Red - LGE', 56, null, 28.25, 7),
      ('hot_house', 'Bell Pepper 25lb', 'Red - MED', 56, null, 30.25, 8),
      ('hot_house', 'Bell Pepper 25lb', 'Red - XLG/JBO', 56, null, null, 9),
      ('hot_house', 'Bell Pepper 25lb', 'Yellow - LGE', 56, null, 22.25, 10),
      ('hot_house', 'Bell Pepper 25lb', 'Yellow - MED', 56, null, 24.25, 11),
      ('hot_house', 'Bell Pepper 25lb', 'Yellow - XLG/JBO', 56, null, null, 12),
      ('hot_house', 'Bell Pepper 25lb', 'Orange - SML', 56, null, 25.25, 13),
      ('hot_house', 'Bell Pepper 25lb', 'Orange - MED', 56, null, 10.25, 14),
      ('hot_house', 'Bell Pepper 25lb', 'Orange - XLG/JBO', 56, null, 12.25, 15),
      ('hot_house', 'Bell Pepper 25lb', 'Green - JBO', 56, null, 25.25, 16),
      ('hot_house', 'Bell Pepper 25lb', 'Green - XLG', 56, null, 25.25, 17),
      ('hot_house', 'Bell Pepper 25lb', 'Green - LGE', 56, null, 24.25, 18),
      ('hot_house', 'Bell Pepper 25lb', 'Green - MED', 56, null, 22.25, 19),
      ('hot_house', 'Bell Pepper 25lb', 'Green - CH', 56, null, 22.25, 20),
      ('hot_house', 'Bell Pepper 25lb', 'Jalapeno LG', 50, null, 18.75, 21),
      ('hot_house', 'Bell Pepper 25lb', 'Jalapeno XLG', 50, null, 19.75, 22),
      ('hot_house', 'Bell Pepper 25lb', 'Serrano', 50, null, 22.25, 23),
      ('hot_house', 'Bell Pepper 25lb', 'Tomatillo', 50, null, 20.25, 24),
      ('hot_house', 'Bell Pepper 25lb', 'Poblano', 50, null, null, 25),
      ('hot_house', 'Bell Pepper 25lb', 'Mini Sweet 12/1', 30, null, null, 26),
      ('hot_house', 'Tomatoes', 'Bulk 20lb - LGE', 80, null, null, 27),
      ('hot_house', 'Tomatoes', 'Bulk 20lb - MED', 80, null, null, 28),
      ('hot_house', 'Tomatoes', '12x1 Clam', 156, null, null, 29);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from fob_freight_rates limit 1) then
    insert into fob_freight_rates (lane, ltl, ftl, position) values
      ('Houston', 137.00, 1850.00, 1),
      ('Victoria', 137.00, 1625.00, 2),
      ('Dallas', 192.00, 2650.00, 3),
      ('Temple', 165.00, 1550.00, 4),
      ('NC', null, 385.00, 5),
      ('MD', null, 385.00, 6),
      ('PA', null, 412.00, 7),
      ('NJ', null, 412.00, 8),
      ('YUMA-MD', null, 495.00, 9),
      ('YUMA-PA', null, 495.00, 10);
  end if;
end $$;

alter table fob_items enable row level security;
alter table fob_freight_rates enable row level security;

drop policy if exists "authenticated full access" on fob_items;
create policy "authenticated full access" on fob_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on fob_freight_rates;
create policy "authenticated full access" on fob_freight_rates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
