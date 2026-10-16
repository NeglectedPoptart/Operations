-- Migration 146: PTO tracking (Management > Schedules).
--
-- pto_requests.days is how many working days a time-off entry uses - normally
-- the weekdays between its start and end, but it can be changed (a half day is
-- 0.5). Entries made before this existed get their weekday count filled in.
-- Everyone who has been here a year gets one week (5 days) per year of service;
-- the page works that out from the hire date on Employee Files.
--
-- Run migration 012 first. Safe to re-run.

alter table pto_requests add column if not exists days numeric;

update pto_requests
set days = (
  select count(*)
  from generate_series(start_date::timestamp, end_date::timestamp, interval '1 day') d
  where extract(isodow from d) < 6
)
where days is null;
