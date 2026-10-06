-- Migration 127: Buyers List follow-up agent (Supreme > Agents).
--
-- Emails the Buyers List (Buyers > Buyers List) to the people who buy, asks
-- for an update on each line, and reads the reply back: a status goes into
-- that line's notes, and a line the buyer says is already purchased is
-- removed. Starts switched off, in approve-each-email mode.
--
-- Run migration 115 first. Safe to re-run.

insert into agents (key, name, description, enabled, mode, interval_hours, active_start_hour, active_end_hour, config) values
  ('buyers_list', 'Buyers List Follow-up',
   'Emails the Buyers List and asks for an update on each line. Replies go into the line''s notes; a line already purchased is removed.',
   false, 'approve', 24, 5, 21,
   '{"recipients": ["rramirez@harvestbestinc.com", "ops@harvestbestinc.com", "sales@harvestbestinc.com"],
     "send_times": ["08:00", "13:00"], "window_start": "05:00", "window_end": "21:30"}'::jsonb)
on conflict (key) do nothing;
