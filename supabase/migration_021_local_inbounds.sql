-- Migration 021: Warehouse - Local Inbounds.
-- A fresh list per entry_date (same pattern as AM Holdovers) - entered
-- throughout the day, marked Arrived when the truck shows up. Past days
-- stay around for history; the page only ever queries today's entry_date.
-- Safe to re-run.

create table if not exists local_inbounds (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  position int not null default 1,
  po text,
  pu_info text,
  vendor text,
  loading_warehouse text,
  eta text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'arrived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_inbounds_entry_date_idx on local_inbounds (entry_date);

drop trigger if exists local_inbounds_set_updated_at on local_inbounds;
create trigger local_inbounds_set_updated_at
  before update on local_inbounds
  for each row execute function set_updated_at();

alter table local_inbounds enable row level security;

drop policy if exists "authenticated full access" on local_inbounds;
create policy "authenticated full access" on local_inbounds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
