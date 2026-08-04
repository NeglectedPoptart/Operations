-- Migration 044: cross-department notifications. An admin picks a specific
-- page from the Management > Notifications breakdown and pings either one
-- person or a whole role - each recipient gets their own row so the sender
-- can see exactly who has acknowledged and who hasn't.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tab_label text not null,
  subtab_label text not null,
  page_path text not null,
  message text not null default '',
  updated_by text,
  last_edited_at timestamptz,
  target_type text not null check (target_type in ('user', 'role')),
  target_role text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_at_idx on notifications (created_at desc);

create table if not exists notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  acknowledged_at timestamptz,
  unique (notification_id, user_id)
);

create index if not exists notification_recipients_user_id_idx on notification_recipients (user_id);
create index if not exists notification_recipients_notification_id_idx on notification_recipients (notification_id);

alter table notifications enable row level security;
alter table notification_recipients enable row level security;

drop policy if exists "authenticated full access" on notifications;
create policy "authenticated full access" on notifications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on notification_recipients;
create policy "authenticated full access" on notification_recipients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
