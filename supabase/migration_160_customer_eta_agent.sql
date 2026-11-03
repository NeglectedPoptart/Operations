-- Migration 160: Customer ETA agent (Submanagement > HOPS Agents).
--
-- Emails each customer the latest carrier ETA for their loads on the road, at set times
-- (8:00 and 14:00 Central by default). Starts switched OFF and in approve-each-email mode:
-- every email is drafted first and waits for APPROVE / SKIP.
--
-- customer_emails: who each customer's ETA emails go to (To and CC). name_key is the customer
-- name lower-cased with only letters and numbers, so "WinCo Foods, LLC" matches "Winco Foods LLC".
-- agent_threads.cc_emails: CC on a sent email (used by the customer emails).
--
-- Run migration 115 first. Safe to re-run.

create table if not exists customer_emails (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  to_emails text,
  cc_emails text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table customer_emails enable row level security;
drop policy if exists "authenticated full access" on customer_emails;
create policy "authenticated full access" on customer_emails
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table agent_threads add column if not exists cc_emails text[] not null default '{}';

insert into agents (key, name, description, enabled, mode, interval_hours, active_start_hour, active_end_hour, config) values
  ('customer_eta', 'Customer ETA Updates',
   'Emails each customer the latest carrier ETA for their loads on the road, at set times. Only sends when an ETA is new or has changed.',
   false, 'approve', 24, 6, 18,
   '{"send_times": ["08:00", "14:00"], "window_start": "06:00", "window_end": "18:00", "read_replies": false}'::jsonb)
on conflict (key) do nothing;
