-- Migration 055: Accounts Payable - Pay Lists.
--
-- Built from the AP page: check off payables into a running preview,
-- title it, notify whoever needs to sign off, submit. Lands here as its
-- own record, then gets reviewed (Notes + Good to Pay/HOLD per item) on
-- the Pay Lists page.

create table if not exists ap_pay_lists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ap_pay_lists_created_at_idx on ap_pay_lists (created_at desc);

-- Snapshot of the payable's fields at submission time, not a live join
-- back to ap_payables - a pay list is a record of what was submitted for
-- payment as of that moment, and shouldn't silently change (or vanish) if
-- a later AP sync updates or removes the source payable. ap_payable_id is
-- kept only as an optional back-reference.
create table if not exists ap_pay_list_items (
  id uuid primary key default gen_random_uuid(),
  pay_list_id uuid not null references ap_pay_lists (id) on delete cascade,
  ap_payable_id uuid references ap_payables (id) on delete set null,
  vendor_code text not null,
  vendor_name text not null,
  gl_account_label text not null,
  document text not null,
  doc_date date,
  type text,
  concept text,
  balance numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'good_to_pay', 'hold')),
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ap_pay_list_items_pay_list_id_idx on ap_pay_list_items (pay_list_id);

drop trigger if exists ap_pay_lists_set_updated_at on ap_pay_lists;
create trigger ap_pay_lists_set_updated_at
  before update on ap_pay_lists
  for each row execute function set_updated_at();

drop trigger if exists ap_pay_list_items_set_updated_at on ap_pay_list_items;
create trigger ap_pay_list_items_set_updated_at
  before update on ap_pay_list_items
  for each row execute function set_updated_at();

alter table ap_pay_lists enable row level security;
alter table ap_pay_list_items enable row level security;

drop policy if exists "authenticated full access" on ap_pay_lists;
create policy "authenticated full access" on ap_pay_lists
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on ap_pay_list_items;
create policy "authenticated full access" on ap_pay_list_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
