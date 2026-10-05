-- Migration 126: Proof of delivery (POD) for loads on the road.
--
-- The HOPS Agents carrier follow-up (migration 115) asks carriers for an ETA
-- every few hours. A carrier can answer "delivered" - until the signed POD
-- arrives the load stays On the Road with a "Pending POD" flag, and once a
-- real POD is received the load moves to Complete.
--
-- Run migration 115 first. Safe to re-run.

alter table loads add column if not exists pod_pending boolean not null default false;

create table if not exists load_documents (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  kind text not null default 'pod' check (kind in ('pod')),
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  -- email = pulled from a carrier's reply by the agent; manual = marked by hand
  source text not null default 'email' check (source in ('email', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists load_documents_load_idx on load_documents (load_id);

alter table load_documents enable row level security;
drop policy if exists "authenticated full access" on load_documents;
create policy "authenticated full access" on load_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Private bucket - read back through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('load-documents', 'load-documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated manage load-documents" on storage.objects;
create policy "authenticated manage load-documents" on storage.objects
  for all using (bucket_id = 'load-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'load-documents' and auth.role() = 'authenticated');

-- Files a carrier attached to a reply, and what Claude made of each:
-- [{file_name, storage_path, content_type, size_bytes, is_pod, load_number, note}]
alter table agent_replies add column if not exists attachments jsonb not null default '[]'::jsonb;

-- The Load ETA agent now sends at fixed times of day rather than every N
-- hours: 5:00, 9:00, 13:00, 17:00 and 21:00 Central, nothing after 21:30.
update agents
set config = config || '{"send_times": ["05:00","09:00","13:00","17:00","21:00"], "window_start": "05:00", "window_end": "21:30"}'::jsonb,
    description = 'On the Road loads: emails each carrier at fixed times (5am, 9am, 1pm, 5pm, 9pm) for an ETA/location update, writes the answer to the load''s ETA note, and handles "delivered" + POD.'
where key = 'load_eta';
