-- Migration 010: permission levels (Admin / Operations / Warehouse-QC / Sales).
-- Adds a profiles table holding one role per auth user. New sign-ups default
-- to the least-privileged role ('sales') via a trigger - an admin upgrades
-- them manually afterward (matches this app's existing "run SQL to manage
-- reference data" convention, e.g. brokers/hubs). Existing users predate this
-- feature and are backfilled to 'admin' so nobody loses access they already
-- had. Safe to re-run.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'sales'
    check (role in ('admin', 'operations', 'warehouse_qc', 'sales')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

-- No insert/update policy for authenticated users - profiles are created by
-- the trigger below and role changes are made via the SQL Editor by an
-- admin, not through the app.

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'sales')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: every auth user that predates this migration gets 'admin' so
-- existing accounts keep the full access they already had.
insert into public.profiles (id, email, role)
select id, email, 'admin' from auth.users
on conflict (id) do nothing;
