-- Lets an Employee Files tile be matched up to its person's actual login
-- account (profiles row) when they have one - optional, since not every
-- employee (e.g. warehouse floor staff) necessarily has a system login.
-- Deliberately just an identity link (who they are in the system) - no
-- password field. Supabase Auth never stores or exposes the actual
-- password anywhere, even to this app, only an irreversible hash, so
-- there's no real value to show; a lost password is a reset, not a lookup.
alter table employees
  add column linked_user_id uuid references profiles (id) on delete set null;
