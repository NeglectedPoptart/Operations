-- Customer Lumpers (Logistics): a flat reference table of per-customer
-- unloading/lumper fees - which customer, what the charge is for, the
-- price, and any note (e.g. a special condition the fee only applies
-- under).
create table if not exists customer_lumpers (
  id uuid primary key default gen_random_uuid(),
  customer text,
  description text,
  price numeric,
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table customer_lumpers enable row level security;

drop policy if exists "authenticated full access" on customer_lumpers;
create policy "authenticated full access" on customer_lumpers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
