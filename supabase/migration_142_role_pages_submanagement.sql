-- Migration 142: give roles single pages, and make SubManagement assignable.
--
-- roles.allowed_pages: individual pages (menu links such as '/accounting/ar')
-- a role can open even when it does not have that page's whole section. Pages
-- inside a section the role does have are still hidden through hidden_pages.
--
-- SubManagement (Agents, Activity Log) is now a section a role can be given
-- like any other (tab 'submanagement'). The Activity Log's audit trail is read
-- through the database, so reading it is opened to the roles that can open
-- that page (the Supreme account always can).
--
-- Run migration 128 first. Safe to re-run.

alter table roles add column if not exists allowed_pages text[] not null default '{}';

-- Can the signed-in person open this page through their role?
create or replace function public.role_can_open(page text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.key = p.role
    where p.id = auth.uid()
      and (
        page = any (r.allowed_pages)
        or ('submanagement' = any (r.tabs) and not (page = any (r.hidden_pages)))
      )
  );
$$;

drop policy if exists "roles with the activity log read it" on audit_log;
create policy "roles with the activity log read it" on audit_log
  for select using (public.role_can_open('/submanagement/activity-log'));
