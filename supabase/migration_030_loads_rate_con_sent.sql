-- Migration 030: Logistics - per-load "Rate Con Sent" toggle.
-- Manually flipped on the Board once the rate confirmation has been sent to
-- the broker. A load still active (not Complete) with this unset is flagged
-- across the Board, Home dashboard, and Logistics Summary pages, same as a
-- missing appointment.
alter table loads add column if not exists rate_con_sent boolean not null default false;
