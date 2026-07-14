-- Migration 007: locked Source/Destination lists + drop status_note.
-- Run this once against an existing database that already has migration_002+.
-- Safe to re-run.

-- Hubs: locked list of Source City values -----------------------------------
create table if not exists hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into hubs (name) values
  ('Pharr, TX'), ('Salinas, CA'), ('Santa Maria, CA'), ('Nogales, AZ')
on conflict (name) do nothing;

-- Backfill from every source value already used on a load, so existing loads
-- keep working once the field is locked to this list.
insert into hubs (name)
select distinct trim(source) from loads where source is not null and trim(source) <> ''
on conflict (name) do nothing;

-- Destination cities: locked list of Destination values --------------------
create table if not exists destination_cities (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text not null,
  unique (city, state)
);

-- Backfill from every destination already used on a load stop.
insert into destination_cities (city, state)
select distinct trim(destination_city), trim(destination_state)
from load_stops
where destination_city is not null and trim(destination_city) <> ''
  and destination_state is not null and trim(destination_state) <> ''
on conflict (city, state) do nothing;

-- Backfill from lanes' destination labels too (e.g. "Chicago, IL"), so lanes
-- that haven't had a load booked yet still show up as a known city. Composite
-- multi-drop labels ("Houston, TX (2 Drop)", "A, TX & B, OK") are split on
-- " & " and the "(N Drop)" suffix stripped before parsing each "City, ST".
insert into destination_cities (city, state)
select distinct trim(parts[1]), trim(parts[2])
from (
  select regexp_split_to_array(trim(seg), '\s*,\s*') as parts
  from (
    select unnest(string_to_array(regexp_replace(destination, '\s*\(\d+\s*Drop\)', '', 'g'), '&')) as seg
    from lanes
  ) s
) t
where array_length(parts, 1) = 2
on conflict (city, state) do nothing;

-- Merge any existing status_note into notes, then drop the column - Draft
-- Changes: "Remove Status Notes, Just need 1 Box for Notes."
update loads
set notes = trim(both ' ' from concat_ws(' | ', nullif(trim(notes), ''), nullif(trim(status_note), '')))
where status_note is not null and trim(status_note) <> '';

alter table loads drop column if exists status_note;

alter table hubs enable row level security;
alter table destination_cities enable row level security;

drop policy if exists "authenticated full access" on hubs;
create policy "authenticated full access" on hubs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on destination_cities;
create policy "authenticated full access" on destination_cities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
