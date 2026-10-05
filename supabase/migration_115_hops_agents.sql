-- Migration 115: HOPS Agents (Supreme Tab > Agents) - Phase 1.
--
-- Automated email follow-ups sent from the shared HOP@harvestbestinc.com
-- Outlook mailbox (Microsoft Graph), with replies read back, turned into
-- proposed HOPS updates by Claude, and applied to the load once reviewed.
--
-- Two agents to start:
--   load_eta     - On the Road loads: asks the load's carrier for an ETA /
--                  location update. Replies update loads.eta_note.
--   load_pending - Pending to Load loads: one digest email to Operations
--                  asking for status. Replies can update notes,
--                  ready_to_load, or move the load On the Road.
--
-- Nothing runs on a timer until the pg_cron job at the bottom of this file
-- is set up (it needs the app URL + secret, so it's commented out). Safe to
-- re-run.

-- Where a carrier's ETA follow-ups go. Comma-separated for more than one.
alter table brokers add column if not exists followup_email text;

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  enabled boolean not null default false,
  -- approve: every outgoing email waits in Drafts for a click, and every
  --          reply waits in Review before it touches HOPS.
  -- auto:    emails send on their own, and confident note/ETA updates are
  --          applied on their own. Status changes are always reviewed.
  mode text not null default 'approve' check (mode in ('approve', 'auto')),
  -- Minimum hours between follow-ups on the same load (or between digests).
  interval_hours numeric not null default 6,
  -- Business-hours window (APP_TIMEZONE, 24h clock) the agent may send in.
  active_start_hour int not null default 6,
  active_end_hour int not null default 18,
  -- Extra per-agent settings, e.g. {"recipients": ["a@x.com"]} to override
  -- the load_pending default of every Operations-role login.
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

insert into agents (key, name, description, interval_hours, active_start_hour, active_end_hour) values
  ('load_eta', 'Load ETA Follow-up',
   'On the Road loads: emails the carrier for an ETA/location update and writes the answer to the load''s ETA note.',
   6, 6, 18),
  ('load_pending', 'Pending to Load Follow-up',
   'Pending to Load loads: sends Operations one digest asking for status, and applies their replies to each load.',
   24, 7, 17)
on conflict (key) do nothing;

-- One outgoing email (draft or sent) and the conversation it starts.
create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents (id) on delete cascade,
  -- Short code put in the subject, e.g. "[HOPS-7F3A2C]" - the fallback
  -- match for replies if Outlook's conversationId doesn't line up.
  tag text not null unique,
  -- The loads this email is about, in the order they're numbered in the
  -- email body (a load_pending digest covers several).
  record_ids uuid[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'replied', 'no_reply', 'discarded', 'failed')),
  to_emails text[] not null default '{}',
  subject text not null,
  body text not null,
  graph_message_id text,
  conversation_id text,
  error text,
  sent_at timestamptz,
  last_reply_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_threads_agent_idx on agent_threads (agent_id, created_at desc);
create index if not exists agent_threads_conversation_idx on agent_threads (conversation_id);

-- One inbound reply and what Claude proposes doing with it.
create table if not exists agent_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads (id) on delete cascade,
  graph_message_id text not null unique,
  from_email text,
  received_at timestamptz,
  body_text text,
  summary text,
  -- [{load_id, eta_note, append_note, ready_to_load, new_status, confident}]
  proposed jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'applied', 'auto_applied', 'dismissed', 'no_update')),
  error text,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_replies_status_idx on agent_replies (status, created_at desc);

-- Activity feed shown on the Agents page.
create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents (id) on delete cascade,
  thread_id uuid references agent_threads (id) on delete set null,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_events_created_idx on agent_events (created_at desc);

-- Small key/value store, e.g. the mailbox's last-polled timestamp.
create table if not exists agent_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table agents enable row level security;
alter table agent_threads enable row level security;
alter table agent_replies enable row level security;
alter table agent_events enable row level security;
alter table agent_state enable row level security;

drop policy if exists "authenticated full access" on agents;
create policy "authenticated full access" on agents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on agent_threads;
create policy "authenticated full access" on agent_threads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on agent_replies;
create policy "authenticated full access" on agent_replies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on agent_events;
create policy "authenticated full access" on agent_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "authenticated full access" on agent_state;
create policy "authenticated full access" on agent_state
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Scheduler (run separately, once the app is deployed with AGENT_CRON_SECRET
-- set). Vercel's free plan only allows one cron a day, so Supabase's own
-- pg_cron calls the app every 15 minutes instead. Replace both <...> values.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('hops-agents-tick', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://<your-app>.vercel.app/api/agents/tick',
--     headers := jsonb_build_object('Authorization', 'Bearer <AGENT_CRON_SECRET>', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 60000
--   );
-- $$);
