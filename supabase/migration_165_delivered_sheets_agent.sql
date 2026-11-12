-- Migration 165: Delivered price sheet agent (Submanagement > Agents).
--
-- Once today's FOB Pharr prices have been filled in (by the morning Availability email, or Apply now on FOB
-- Pharr), emails the Houston, Dallas and East Coast Delivered price sheets to each lane's customer list - the
-- same picture and email as "Email to customers" on the Delivered pages. Each sheet goes out once a day, and a
-- sheet someone already emailed by hand that day is left alone.
--
-- Starts switched OFF. Turn it on from the Agents page. To try it first, put your own address in "Test address"
-- there: the sheets then go only to you, with [TEST] in the subject.
--
-- Run migrations 115, 151 (Delivered email lists) and 159 (FOB email imports) first. Safe to re-run.

insert into agents (key, name, description, enabled, mode, interval_hours, active_start_hour, active_end_hour, config) values
  ('delivered_sheets', 'Delivered Price Sheets',
   'After the morning FOB prices are filled in, emails the Houston, Dallas and East Coast Delivered price sheets to their customer lists.',
   false, 'auto', 24, 0, 24,
   '{"lanes": ["houston", "dallas", "east-coast"], "read_replies": false}'::jsonb)
on conflict (key) do nothing;
