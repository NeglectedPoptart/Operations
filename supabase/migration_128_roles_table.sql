-- Migration 128: roles you can edit in the app (Supreme Tab > User Roles).
--
-- Until now the list of roles and what each can open lived in code. This
-- moves them into a table so they can be changed - and new roles created -
-- from the User Roles screen. The 10 existing roles are seeded with exactly
-- the access they have today, so nothing changes on day one.
--
-- If this table is ever unreadable the app falls back to those same
-- defaults, so it can't lock anyone out. Safe to re-run.

create table if not exists roles (
  key text primary key,
  label text not null,
  -- Sections (tabs) the role can open.
  tabs text[] not null default '{}',
  -- Single pages (menu paths, e.g. '/sales/calculator') hidden even though
  -- their section is open.
  hidden_pages text[] not null default '{}',
  position int not null default 0,
  -- The original roles. They can be edited and renamed but not deleted,
  -- because some special rules in the app are tied to them.
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table roles enable row level security;
drop policy if exists "authenticated full access" on roles;
create policy "authenticated full access" on roles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into roles (key, label, tabs, position, is_builtin) values
  ('admin', 'Admin',
   '{logistics,warehouse,qc,sales,management,compliance,buyers,marketing,accounting,meetings,mexico,shipping_receiving,crm,documents}', 0, true),
  ('operations', 'Operations',
   '{logistics,warehouse,qc,sales,compliance,buyers,marketing,accounting,meetings,mexico,crm}', 1, true),
  ('warehouse_qc', 'Warehouse/QC', '{warehouse,qc,buyers,meetings,mexico}', 2, true),
  ('sales', 'Sales', '{sales,qc,buyers,marketing,meetings,crm}', 3, true),
  ('accounting', 'Accounting', '{sales,compliance,accounting,meetings}', 4, true),
  ('buyer', 'Buyer', '{warehouse,qc,sales,buyers,meetings}', 5, true),
  ('executive', 'Executive',
   '{warehouse,qc,sales,management,compliance,buyers,marketing,accounting,meetings,mexico,crm,documents}', 6, true),
  ('broker_carrier', 'Broker/Carrier', '{}', 7, true),
  ('mx', 'MX', '{mexico,meetings,marketing,compliance,qc,warehouse}', 8, true),
  ('buyer_sales', 'Buyer/Sales', '{warehouse,qc,sales,buyers,meetings,marketing,crm}', 9, true)
on conflict (key) do nothing;

-- profiles.role was limited to the fixed list by a check constraint; it now
-- has to accept any role in the roles table instead.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table profiles drop constraint if exists profiles_role_fkey;
alter table profiles add constraint profiles_role_fkey
  foreign key (role) references roles (key) on update cascade;
