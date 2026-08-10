-- Migration 048: last calendar date (business timezone) a user dismissed
-- the Logistics List's "Pending Orders Check" popup - lets it show once per
-- day per account, same pattern as last_reminder_seen_date (migration 040),
-- just for a different page/popup.
alter table profiles add column if not exists last_pending_orders_seen_date date;
