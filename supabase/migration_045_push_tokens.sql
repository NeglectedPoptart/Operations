-- Migration 045: device push tokens for the Android/iOS app shell. A token
-- belongs to whichever account is signed in on that device right now - if
-- someone signs out and a different person signs in on the same phone, the
-- upsert in registerPushToken() reassigns user_id rather than leaving a
-- stale second row for the same physical token.
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

-- set_updated_at() already exists from schema.sql - reused here, not redefined.
drop trigger if exists push_tokens_set_updated_at on push_tokens;
create trigger push_tokens_set_updated_at
  before update on push_tokens
  for each row execute function set_updated_at();

alter table push_tokens enable row level security;

drop policy if exists "authenticated full access" on push_tokens;
create policy "authenticated full access" on push_tokens
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
