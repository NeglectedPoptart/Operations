-- Migration 017: let an admin manage user roles from an in-app panel
-- (Management -> User Roles) instead of the SQL Editor. Adds an is_admin()
-- helper so the RLS policies below can check the caller's own role without
-- recursing back into profiles' own RLS - it's security definer, so its
-- internal select runs as the function owner and bypasses RLS. Safe to
-- re-run.

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer set search_path = public stable;

drop policy if exists "admins read all profiles" on profiles;
create policy "admins read all profiles" on profiles
  for select using (is_admin());

drop policy if exists "admins update roles" on profiles;
create policy "admins update roles" on profiles
  for update using (is_admin()) with check (is_admin());
