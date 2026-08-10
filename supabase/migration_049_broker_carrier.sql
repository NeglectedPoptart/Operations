-- Migration 049: Broker/Carrier role - external carrier logins that see
-- exactly one page (Logistics > Broker Rate Entry) and only ever their own
-- rates, never another carrier's name or numbers. Locked down at the RLS
-- level (not just hidden in the UI), since these are real outside
-- companies' logins rather than trusted internal staff like every other
-- role in this app.

-- Drops whatever the current role check constraint is named (same approach
-- as migration_037/038/041, rather than assuming a name) and re-adds it
-- with the new value.
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

alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'operations', 'warehouse_qc', 'sales', 'accounting', 'buyer', 'executive', 'broker_carrier'));

-- Which broker/carrier company a broker_carrier login is - null for every
-- other role. Set from Management > User Roles once the role is chosen.
alter table profiles add column if not exists broker_id uuid references brokers (id) on delete set null;

-- "Include timestamps so I can see when they updated information."
alter table broker_rate_entries add column if not exists updated_at timestamptz not null default now();

drop trigger if exists broker_rate_entries_set_updated_at on broker_rate_entries;
create trigger broker_rate_entries_set_updated_at
  before update on broker_rate_entries
  for each row execute function set_updated_at();

-- security definer (like is_admin()) so these can check the caller's own
-- role/broker_id without recursing back into profiles' own RLS.
create or replace function is_broker_carrier()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'broker_carrier'
  );
$$ language sql security definer set search_path = public stable;

create or replace function current_broker_id()
returns uuid as $$
  select broker_id from public.profiles where id = auth.uid();
$$ language sql security definer set search_path = public stable;

-- brokers: staff (everyone else) keep full access; a broker/carrier login
-- only ever reads its own single row - never another carrier's name.
drop policy if exists "authenticated full access" on brokers;
drop policy if exists "staff full access to brokers" on brokers;
create policy "staff full access to brokers" on brokers
  for all using (not is_broker_carrier()) with check (not is_broker_carrier());

drop policy if exists "broker carrier reads own broker" on brokers;
create policy "broker carrier reads own broker" on brokers
  for select using (is_broker_carrier() and id = current_broker_id());

-- broker_rate_entries: staff keep full access; a broker/carrier login can
-- read/write only rows tagged with its own broker_id - never another
-- carrier's rates.
drop policy if exists "authenticated full access" on broker_rate_entries;
drop policy if exists "staff full access to broker_rate_entries" on broker_rate_entries;
create policy "staff full access to broker_rate_entries" on broker_rate_entries
  for all using (not is_broker_carrier()) with check (not is_broker_carrier());

drop policy if exists "broker carrier manages own rates" on broker_rate_entries;
create policy "broker carrier manages own rates" on broker_rate_entries
  for all using (is_broker_carrier() and broker_id = current_broker_id())
  with check (is_broker_carrier() and broker_id = current_broker_id());
