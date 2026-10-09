-- Migration 138: pick-lists for the New Inspection form.
--
-- Facility, Grower, Product Label, Variety and the other descriptive header
-- fields become lists to choose from instead of typing. Anyone doing an
-- inspection can add a missing entry from the bottom of the list. The lists
-- are shared by every plan (a grower is a grower on any commodity) and start
-- with every value already used on an inspection (including the LotPath
-- imports). Lot number, dates and notes stay typed.
--
-- Run migration 135 first. Safe to re-run.

create table if not exists qc_field_options (
  id uuid primary key default gen_random_uuid(),
  field_key text not null,
  value text not null,
  created_at timestamptz not null default now()
);

-- "Fresh Farms" and "fresh farms" are the same entry.
create unique index if not exists qc_field_options_unique on qc_field_options (field_key, lower(value));

alter table qc_field_options enable row level security;
drop policy if exists "authenticated full access" on qc_field_options;
create policy "authenticated full access" on qc_field_options
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into qc_field_options (field_key, value)
select distinct e.key, btrim(e.value)
from qc_lot_inspections i, jsonb_each_text(i.header) as e
where btrim(e.value) <> ''
  and e.key not like '%lot%'
  and e.key not like '%date%'
  and e.key not like '%note%'
on conflict do nothing;
