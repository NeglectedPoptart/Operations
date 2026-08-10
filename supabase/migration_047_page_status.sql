-- Migration 047: manual "up to date" confirmation per page - a big button
-- someone clicks after finishing that page's daily update, so anyone else
-- can see at a glance (and exactly when/who) without needing to check the
-- data itself. One row per page; marking it always overwrites in place
-- (marked_at bumps to now, marked_by to whoever clicked it).
create table if not exists page_status (
  page_key text primary key,
  marked_at timestamptz not null,
  marked_by uuid references profiles (id) on delete set null
);

alter table page_status enable row level security;

drop policy if exists "authenticated full access" on page_status;
create policy "authenticated full access" on page_status
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
