-- Migration 141: saved page layouts (starting with the column widths on QC
-- Inspection History). An Admin (or the Supreme account) lays a page out once
-- and everyone sees it. Anyone signed in can read; only an Admin or the
-- Supreme account can change.
--
-- Safe to re-run.

create table if not exists ui_layouts (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table ui_layouts enable row level security;

drop policy if exists "read ui layouts" on ui_layouts;
create policy "read ui layouts" on ui_layouts
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin changes ui layouts" on ui_layouts;
create policy "admin changes ui layouts" on ui_layouts
  for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or (auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com'
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or (auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com'
  );
