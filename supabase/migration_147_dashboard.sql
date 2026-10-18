-- Migration 147: the Dashboard workspace (admin only for now).
--
-- dashboard_layouts: each person's saved workspace layouts (which modules are
-- open in which pane, which widgets show, their notes). Everyone sees and
-- changes only their own.
-- The Admin role also gets the new "Dashboard" section so it shows in the menu
-- (the Supreme account always has it).
--
-- Run migration 128 first. Safe to re-run.

create table if not exists dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists dashboard_layouts_user_name on dashboard_layouts (user_id, lower(name));

alter table dashboard_layouts enable row level security;

drop policy if exists "own dashboard layouts" on dashboard_layouts;
create policy "own dashboard layouts" on dashboard_layouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

update roles
set tabs = array_append(tabs, 'dashboard')
where key = 'admin' and not ('dashboard' = any (tabs));
