-- Migration 024: Logistics - per-stop delivery Appointment.
-- Free-typed field: an actual appointment time/reference, or the literal
-- "FCFS" (First Come First Serve) - either counts as filled. A stop with
-- neither is flagged as missing an appointment across the Board, Home, and
-- Logistics Summary pages.
alter table load_stops add column if not exists appointment text;
