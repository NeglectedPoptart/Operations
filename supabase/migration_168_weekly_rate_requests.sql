-- Migration 168: Weekly Rate Requests agent (Submanagement > Agents).
--
-- Every Monday from 7:00 AM (Central) the agent emails each active OTR carrier asking them to log in and
-- update their lane rates, with a button straight to the rate portal and a big "I've submitted my rates"
-- button that tells you they are done. Carriers who haven't updated get the email again every hour until
-- they have (or until the end of the sending window, 5:00 PM by default).
--
-- broker_rate_requests: one row per carrier per week - how many emails went out, and how it ended
-- (completed_via 'rates' = the agent saw rates entered this week; 'button' = they clicked the done button).
--
-- Starts switched OFF. Turn it on from the Agents page; put your own address in "Test address" first to see
-- the email. Run migration 115 (agents) and 049 (is_broker_carrier) first. Safe to re-run.

create table if not exists broker_rate_requests (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references brokers (id) on delete cascade,
  week_start date not null,
  sends integer not null default 0,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  completed_at timestamptz,
  completed_via text check (completed_via in ('rates', 'button')),
  note text,
  created_at timestamptz not null default now(),
  unique (broker_id, week_start)
);
create index if not exists broker_rate_requests_week_idx on broker_rate_requests (week_start);

alter table broker_rate_requests enable row level security;
drop policy if exists "staff full access" on broker_rate_requests;
create policy "staff full access" on broker_rate_requests
  for all using (not is_broker_carrier()) with check (not is_broker_carrier());

insert into agents (key, name, description, enabled, mode, interval_hours, active_start_hour, active_end_hour, config) values
  ('carrier_rates', 'Weekly Rate Requests',
   'Every Monday morning, emails each carrier asking them to log in and update their rates - and keeps asking every hour until they do.',
   false, 'auto', 1, 0, 24,
   '{"window_start": "07:00", "window_end": "17:00", "repeat_minutes": 60, "read_replies": false}'::jsonb)
on conflict (key) do nothing;
