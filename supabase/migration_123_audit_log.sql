-- Activity log for a small set of named users (see TRACKED_HANDLES in
-- src/lib/auditLog.ts): logins, opening Accounts Receivable, AR report
-- uploads, and AR edits. Records actions only - no keystrokes.
--
-- Append-only by design: users can insert rows for themselves, but there is
-- no update or delete policy for anyone, and only the Supreme account can
-- read it back (the tracked users can neither see nor alter their own trail
-- through the app or the Supabase client).
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  user_email text not null,
  event_type text not null,
  summary text not null,
  details jsonb
);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_user_email_idx on audit_log (user_email);

alter table audit_log enable row level security;

drop policy if exists "users log their own activity" on audit_log;
create policy "users log their own activity" on audit_log
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "supreme reads audit log" on audit_log;
create policy "supreme reads audit log" on audit_log
  for select to authenticated using ((auth.jwt() ->> 'email') = 'tcamph@harvestbestinc.com');
