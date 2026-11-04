-- Migration 162: Weekly Reports (Supreme tab) and the logs they need.
--
--   pas_file_log          who added / changed / removed a PAS file and when. Filled by a database
--                         trigger on pas_files, so every edit is caught wherever it comes from.
--   price_sheet_uploads   one row per Price Sheets upload (price sheets are overwritten on every
--                         upload, so without this only each vendor's latest upload survives).
--   app_settings          small key/value store (the Weekly Reports recipient list).
--   report_sends          history of weekly report emails sent.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- PAS file change log

create table if not exists pas_file_log (
  id uuid primary key default gen_random_uuid(),
  pas_file_id uuid not null,
  order_no text,
  po text,
  customer text,
  action text not null check (action in ('added', 'changed', 'removed')),
  changed_fields text[] not null default '{}',
  changed_by text,
  created_at timestamptz not null default now()
);
create index if not exists pas_file_log_created_idx on pas_file_log (created_at desc);
create index if not exists pas_file_log_file_idx on pas_file_log (pas_file_id);

alter table pas_file_log enable row level security;
drop policy if exists "authenticated read" on pas_file_log;
create policy "authenticated read" on pas_file_log for select using (auth.role() = 'authenticated');

-- A row counts as "added" once it has an order number: the + Add Row button inserts a blank row
-- that is then filled in, and that is one new file, not a new file plus a change.
create or replace function log_pas_file_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
  fields text[];
begin
  select email into who from profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    if coalesce(btrim(new.order_no), '') <> '' then
      insert into pas_file_log (pas_file_id, order_no, po, customer, action, changed_by)
      values (new.id, new.order_no, new.po, new.customer, 'added', who);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(btrim(old.order_no), '') <> '' then
      insert into pas_file_log (pas_file_id, order_no, po, customer, action, changed_by)
      values (old.id, old.order_no, old.po, old.customer, 'removed', who);
    end if;
    return old;
  end if;

  -- UPDATE: which columns actually changed (position and timestamps do not count)
  select coalesce(array_agg(n.key order by n.key), '{}') into fields
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value
    and n.key not in ('id', 'position', 'created_at', 'updated_at');

  if coalesce(array_length(fields, 1), 0) = 0 then
    return new;
  end if;

  if coalesce(btrim(old.order_no), '') = '' and coalesce(btrim(new.order_no), '') <> '' then
    insert into pas_file_log (pas_file_id, order_no, po, customer, action, changed_by)
    values (new.id, new.order_no, new.po, new.customer, 'added', who);
  elsif coalesce(btrim(new.order_no), '') <> '' then
    insert into pas_file_log (pas_file_id, order_no, po, customer, action, changed_fields, changed_by)
    values (new.id, new.order_no, new.po, new.customer, 'changed', fields, who);
  end if;
  return new;
end;
$$;

drop trigger if exists pas_files_log_changes on pas_files;
create trigger pas_files_log_changes
  after insert or update or delete on pas_files
  for each row execute function log_pas_file_change();

-- ---------------------------------------------------------------------------
-- Price sheet uploads

create table if not exists price_sheet_uploads (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid,
  vendor_name text,
  item_count integer not null default 0,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
create index if not exists price_sheet_uploads_at_idx on price_sheet_uploads (uploaded_at desc);

alter table price_sheet_uploads enable row level security;
drop policy if exists "authenticated full access" on price_sheet_uploads;
create policy "authenticated full access" on price_sheet_uploads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Settings and report history

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
drop policy if exists "authenticated full access" on app_settings;
create policy "authenticated full access" on app_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists report_sends (
  id uuid primary key default gen_random_uuid(),
  sent_by text,
  to_emails text[] not null default '{}',
  reports text[] not null default '{}',
  range_start date not null,
  range_end date not null,
  created_at timestamptz not null default now()
);
create index if not exists report_sends_created_idx on report_sends (created_at desc);
alter table report_sends enable row level security;
drop policy if exists "authenticated full access" on report_sends;
create policy "authenticated full access" on report_sends
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
