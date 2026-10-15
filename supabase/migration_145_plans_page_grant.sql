-- Migration 145: a role given the Inspection Plans page can change the plans.
--
-- Inspection plans could only be changed by the Quality Control Manager and the
-- Supreme account. Now a role that is given the "Inspection Plans" page on
-- User Roles (one-page grant) can too. The Quality Control Manager and the
-- Supreme account are unchanged.
--
-- Run migration 134 and 142 first. Safe to re-run.

create or replace function public.role_has_page_grant(page text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.key = p.role
    where p.id = auth.uid() and page = any (r.allowed_pages)
  );
$$;

drop policy if exists "roles given the plans page change plans" on qc_plans;
create policy "roles given the plans page change plans" on qc_plans
  for all
  using (public.role_has_page_grant('/qc/plans'))
  with check (public.role_has_page_grant('/qc/plans'));
