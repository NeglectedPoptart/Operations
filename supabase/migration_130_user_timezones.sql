-- Migration 130: per-user time zones.
--
-- The app's main clock is Central (see APP_TIMEZONE in src/lib/dates.ts).
-- Each person's own time zone is now remembered so the Activity Log can show
-- both "your time" (Central) and "their time".
--   profiles.timezone         - IANA name, e.g. 'America/Bogota'
--   profiles.timezone_source  - 'auto' = picked up from their browser/phone on
--                               each visit; 'manual' = set on User Roles and
--                               never overwritten by the auto-detect
--   audit_log.user_timezone   - their zone when the event happened, so a
--                               traveller's old entries keep showing the time
--                               they actually had then
-- Safe to re-run.

alter table profiles add column if not exists timezone text;
alter table profiles add column if not exists timezone_source text not null default 'auto'
  check (timezone_source in ('auto', 'manual'));

alter table audit_log add column if not exists user_timezone text;
