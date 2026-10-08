-- Migration 131: remember when each person last changed their password in
-- HOPS (Change Password in the menu, or set by the Supreme account on User
-- Roles). Only the date is kept - never the password itself, which Supabase
-- stores as a one-way hash that nobody can read back. Safe to re-run.

alter table profiles add column if not exists password_changed_at timestamptz;
