-- Migration 040: track the last date each user dismissed their daily
-- Warehouse/QC login reminder (Old Age / QC Agenda / Cold Inventory
-- check), so it shows once per calendar day per account regardless of
-- device/browser rather than relying on browser-local state.
alter table profiles add column if not exists last_reminder_seen_date date;
