-- Migration 136: Warehouse > Orders (pending orders from the Orders Summary PDF).
--
-- pending_orders: one row per order on the last uploaded report, plus what
--   people add in HOPS (notes, a legend colour, greyed out, moved to tomorrow).
--   Uploading a new report updates the orders it contains and keeps all of that.
-- order_legend: the colours - a name, a colour and an opacity each.
-- order_report_meta: when the last report was uploaded, and by whom.
-- Also adds the "Orders follow-up" agent (Supreme > Agents), switched off,
-- emailing the Operations role at 11:00, 14:00 and 17:00.
--
-- Run migration 115 first. Safe to re-run.

create table if not exists order_legend (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#facc15',
  -- 0.05 - 1: how strongly the colour shows on the row.
  opacity numeric not null default 0.45,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists pending_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  warehouse text,
  ship_date date,
  status text,
  customer_code text,
  customer_name text,
  salesperson text,
  terms text,
  truck text,
  freight text,
  ordered numeric not null default 0,
  shipped numeric not null default 0,
  notes text not null default '',
  legend_id uuid references order_legend (id) on delete set null,
  -- Greyed out: set automatically when the report first shows a shipped
  -- quantity, and can be switched on or off by hand.
  greyed boolean not null default false,
  -- Set to a date when the order is moved to a later day; it shows in the
  -- "moved" list until that day arrives, then back in the main list.
  moved_to date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pending_orders_ship_date_idx on pending_orders (ship_date, order_no);

create table if not exists order_report_meta (
  id int primary key default 1 check (id = 1),
  uploaded_at timestamptz,
  uploaded_by text,
  source_file text,
  report_parameters text,
  order_count int not null default 0
);
insert into order_report_meta (id) values (1) on conflict (id) do nothing;

alter table order_legend enable row level security;
alter table pending_orders enable row level security;
alter table order_report_meta enable row level security;

drop policy if exists "authenticated full access" on order_legend;
create policy "authenticated full access" on order_legend
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on pending_orders;
create policy "authenticated full access" on pending_orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on order_report_meta;
create policy "authenticated full access" on order_report_meta
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into agents (key, name, description, enabled, mode, interval_hours, active_start_hour, active_end_hour, config) values
  ('orders_pending', 'Orders Follow-up',
   'Emails the pending orders (Warehouse > Orders) three times a day and asks the team for an update on each. Replies go into the order''s notes.',
   false, 'approve', 24, 5, 21,
   '{"recipient_roles": ["operations"], "recipients": [],
     "send_times": ["11:00", "14:00", "17:00"], "window_start": "05:00", "window_end": "21:30"}'::jsonb)
on conflict (key) do nothing;
