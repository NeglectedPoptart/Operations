-- Migration 166: internal messaging (the "Messages" page) - channels and direct messages between HOPS staff.
--
-- chat_conversations: a channel (#general, #logistics ... open to every staff login) or a direct message
--   between people (dm_key is the two people's ids, so a pair only ever has one).
-- chat_members: who has joined a conversation, when they last read it (drives the unread counts) and
--   whether they muted it. Everyone in a DM is a member; channels are joined from the Messages page.
-- chat_messages: the messages (text, attached files, who was @mentioned). Editing and deleting are soft.
--
-- Broker/carrier logins are locked out of everything here. Staff can read any channel and only the DMs
-- they are in. Run migration 049 (is_broker_carrier) first. Safe to re-run.

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('channel', 'dm')),
  name text,
  topic text,
  dm_key text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create unique index if not exists chat_channel_name_idx on chat_conversations (lower(name)) where kind = 'channel';

create table if not exists chat_members (
  conversation_id uuid not null references chat_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists chat_members_user_idx on chat_members (user_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  body text not null default '',
  -- [{ "path": "...", "name": "...", "type": "image/png", "size": 12345 }] in the chat-files bucket
  attachments jsonb not null default '[]'::jsonb,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists chat_messages_conv_idx on chat_messages (conversation_id, created_at desc);

-- ---- who is staff, and what they may see ---------------------------------------------------------

create or replace function chat_is_staff()
returns boolean as $$
  select auth.uid() is not null and not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'broker_carrier'
  );
$$ language sql security definer set search_path = public stable;

create or replace function chat_can_see(conv uuid)
returns boolean as $$
  select public.chat_is_staff() and exists (
    select 1 from public.chat_conversations c
    where c.id = conv
      and (c.kind = 'channel' or exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
  );
$$ language sql security definer set search_path = public stable;

alter table chat_conversations enable row level security;
alter table chat_members enable row level security;
alter table chat_messages enable row level security;

drop policy if exists "staff read conversations" on chat_conversations;
create policy "staff read conversations" on chat_conversations for select using (chat_can_see(id));
drop policy if exists "staff create channels" on chat_conversations;
create policy "staff create channels" on chat_conversations for insert with check (chat_is_staff() and kind = 'channel' and created_by = auth.uid());
drop policy if exists "staff edit channels" on chat_conversations;
create policy "staff edit channels" on chat_conversations for update using (chat_is_staff() and kind = 'channel') with check (chat_is_staff() and kind = 'channel');

drop policy if exists "staff read members" on chat_members;
create policy "staff read members" on chat_members for select using (chat_can_see(conversation_id));
drop policy if exists "staff join channels" on chat_members;
create policy "staff join channels" on chat_members for insert
  with check (chat_is_staff() and user_id = auth.uid() and exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.kind = 'channel'));
drop policy if exists "staff update own membership" on chat_members;
create policy "staff update own membership" on chat_members for update using (chat_is_staff() and user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff leave channels" on chat_members;
create policy "staff leave channels" on chat_members for delete using (chat_is_staff() and user_id = auth.uid());

drop policy if exists "staff read messages" on chat_messages;
create policy "staff read messages" on chat_messages for select using (chat_can_see(conversation_id));
drop policy if exists "staff send messages" on chat_messages;
create policy "staff send messages" on chat_messages for insert with check (chat_can_see(conversation_id) and user_id = auth.uid());
drop policy if exists "staff edit own messages" on chat_messages;
create policy "staff edit own messages" on chat_messages for update using (chat_is_staff() and user_id = auth.uid()) with check (user_id = auth.uid());

-- A new message moves its conversation to the top of the list.
create or replace function chat_touch_conversation()
returns trigger as $$
begin
  update public.chat_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists chat_messages_touch on chat_messages;
create trigger chat_messages_touch after insert on chat_messages for each row execute function chat_touch_conversation();

-- ---- functions the Messages page calls -------------------------------------------------------------

-- Everyone who can be messaged (staff logins), with the name HOPS shows for them.
create or replace function chat_directory()
returns table (id uuid, name text, email text) as $$
  select p.id,
         coalesce(nullif(trim(p.display_name), ''), (select e.name from public.employees e where e.linked_user_id = p.id limit 1), split_part(p.email, '@', 1)) as name,
         p.email
  from public.profiles p
  where public.chat_is_staff() and p.role <> 'broker_carrier' and p.email is not null
  order by 2;
$$ language sql security definer set search_path = public stable;

-- Unread messages per conversation the caller belongs to (not their own, not deleted).
create or replace function chat_unread()
returns table (conversation_id uuid, unread bigint) as $$
  select m.conversation_id,
         (select count(*) from public.chat_messages x
           where x.conversation_id = m.conversation_id and x.created_at > m.last_read_at and x.user_id is distinct from auth.uid() and x.deleted_at is null)
  from public.chat_members m
  where m.user_id = auth.uid() and not m.muted;
$$ language sql stable;

-- Opens (creating it the first time) the one direct message between the caller and another person.
create or replace function chat_open_dm(other uuid)
returns uuid as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
begin
  if not public.chat_is_staff() then raise exception 'Not allowed'; end if;
  if other is null or other = me then raise exception 'Pick someone else'; end if;
  if exists (select 1 from public.profiles where id = other and role = 'broker_carrier') or not exists (select 1 from public.profiles where id = other) then
    raise exception 'That person cannot be messaged';
  end if;
  key := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into conv from public.chat_conversations where dm_key = key;
  if conv is null then
    insert into public.chat_conversations (kind, dm_key, created_by) values ('dm', key, me) returning id into conv;
  end if;
  insert into public.chat_members (conversation_id, user_id) values (conv, me), (conv, other) on conflict do nothing;
  return conv;
end;
$$ language plpgsql security definer set search_path = public;

-- ---- files ------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', false) on conflict (id) do nothing;
drop policy if exists "staff manage chat-files" on storage.objects;
create policy "staff manage chat-files" on storage.objects for all
  using (bucket_id = 'chat-files' and public.chat_is_staff())
  with check (bucket_id = 'chat-files' and public.chat_is_staff());

-- ---- live updates -----------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table chat_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table chat_conversations; exception when duplicate_object then null; end;
  end if;
end $$;

-- The first channel.
insert into chat_conversations (kind, name, topic)
select 'channel', 'general', 'Company-wide announcements and anything everyone should see'
where not exists (select 1 from chat_conversations where kind = 'channel' and lower(name) = 'general');
