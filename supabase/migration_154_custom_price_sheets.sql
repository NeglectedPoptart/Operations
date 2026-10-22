-- Migration 154: saved Custom Price Sheets (Sales > Custom Price Sheets).
--
-- custom_price_sheets: a sheet someone built - its title, summary, which
-- commodities/sizes it quotes (selection) and any delivered locations with their
-- freight (destinations). Shared with the whole team so a sheet can be reused;
-- prices are always read fresh from the day's FOB list when it is opened.
--
-- Safe to re-run.

create table if not exists custom_price_sheets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '',
  summary text not null default '',
  footer text not null default '',
  selection jsonb not null default '[]'::jsonb,
  destinations jsonb not null default '[]'::jsonb,
  created_by text,
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_price_sheets_name on custom_price_sheets (lower(name));

alter table custom_price_sheets enable row level security;

drop policy if exists "authenticated full access" on custom_price_sheets;
create policy "authenticated full access" on custom_price_sheets
  for all to authenticated using (true) with check (true);
