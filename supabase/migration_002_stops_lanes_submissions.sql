-- Run this in the Supabase SQL Editor to upgrade a project that already ran
-- the original schema.sql. It moves loads to a multi-drop model, simplifies
-- lanes to a single destination label, and adds weekly rate submissions.
--
-- WARNING: this drops loads.client_name / order_number / po_number /
-- destination / delivery_date / delivery_time and the old lanes.to_city /
-- to_state columns. Any test loads/lanes you already entered will lose that
-- data (the load/lane rows themselves are kept, just those columns).

create extension if not exists "pgcrypto";

-- 1. load_stops: per-drop details, one truck can have many ----------------
create table if not exists load_stops (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  position int not null default 1,
  order_number text,
  po_number text,
  client_name text,
  destination_city text,
  destination_state text,
  delivery_date date,
  delivery_time text
);

create index if not exists load_stops_load_id_idx on load_stops (load_id);
create index if not exists load_stops_delivery_date_idx on load_stops (delivery_date);

alter table load_stops enable row level security;
drop policy if exists "authenticated full access" on load_stops;
create policy "authenticated full access" on load_stops
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Move any existing per-load stop data into load_stops as drop #1 ---------
insert into load_stops (load_id, position, order_number, po_number, client_name, destination_city, destination_state, delivery_date, delivery_time)
select
  id,
  1,
  order_number,
  po_number,
  client_name,
  split_part(destination, ',', 1),
  trim(split_part(destination, ',', 2)),
  delivery_date,
  delivery_time
from loads
where order_number is not null or po_number is not null or client_name is not null
   or destination is not null or delivery_date is not null or delivery_time is not null;

-- 2. Drop the now-per-stop columns off loads -------------------------------
alter table loads
  drop column if exists client_name,
  drop column if exists order_number,
  drop column if exists po_number,
  drop column if exists destination,
  drop column if exists delivery_date,
  drop column if exists delivery_time;

drop index if exists loads_delivery_date_idx;

-- 3. Simplify lanes to a single destination label --------------------------
alter table lanes add column if not exists destination text;
update lanes set destination = to_city || ', ' || to_state where destination is null;
alter table lanes alter column destination set not null;
alter table lanes drop column if exists to_city;
alter table lanes drop column if exists to_state;
alter table lanes drop constraint if exists lanes_from_hub_to_city_to_state_key;
drop index if exists lanes_from_hub_to_city_to_state_key;
alter table lanes drop constraint if exists lanes_from_hub_destination_key;
alter table lanes add constraint lanes_from_hub_destination_key unique (from_hub, destination);

-- 4. Weekly rate submissions (Submit / Unlock to edit) ---------------------
create table if not exists rate_submissions (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  submitted_by text not null,
  submitted_at timestamptz not null default now()
);

alter table rate_submissions enable row level security;
drop policy if exists "authenticated full access" on rate_submissions;
create policy "authenticated full access" on rate_submissions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
