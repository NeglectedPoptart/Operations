-- One-time import of the current Call Out Sheet data (July 2026), generated
-- from the Coverage Issues tracker screenshot. Run this once in the
-- Supabase SQL Editor. Safe to re-run for callout_types (on conflict do
-- nothing); the entries themselves have no natural key, so re-running this
-- file would duplicate them - only run once.
--
-- Notes on a few edge-case rows from the source sheet:
-- - "Half of HBI" / "ALL ARRIVED" / "ALL EMPLOYEES" are team-wide notes, not
--   individual employees - inserted as-is into employee_name (no FK, so this
--   is fine) but not added to the Employee picker's locked list.
-- - The source sheet's "Approved?" and "Call Out Type" had an "n/a" value on
--   one row that doesn't fit the yes/no approved check - stored as null.
-- - "Notified By" values (e.g. "Ismael,Edgar,Tyler") are carried into the
--   renamed Notified At field as-is, since this is historical data.

-- Clean up test data left over from verifying the feature: a placeholder
-- Call Out entry (all fields blank except employee/date/type) and a test
-- Old Age row ("46217" / BROCCOLI) that isn't real inventory data.
delete from callout_entries
where employee_name = 'Luis Vasquez' and entry_date = '2026-07-14' and call_out_type = 'Late'
  and reason is null and notified_at is null and approved is null and return_date is null;

delete from old_age_items where document = '46217' and description = 'BROCCOLI';

insert into callout_types (name) values ('N/A')
on conflict (name) do nothing;

insert into callout_entries
  (employee_name, entry_date, call_out_type, reason, notified_at, approved, return_date)
values
  ('Luis Vasquez', '2026-07-01', 'Late', '20 MINUTES LATE', 'N/A', 'no', '2026-07-01'),
  ('Luis Vasquez', '2026-07-02', 'Late', '23 MINUTES LATE', 'N/A', 'no', '2026-07-02'),
  ('Tyler Sulay', '2026-07-02', 'Late', '30 MINUTES LATE', 'N/A', 'no', '2026-07-02'),
  ('Luis Vasquez', '2026-07-03', 'Late', '23 MINUTES LATE', 'N/A', 'no', '2026-07-03'),
  ('Tyler Sulay', '2026-07-03', 'Late', '30 MINUTES LATE', 'N/A', 'no', '2026-07-03'),
  ('Half of HBI', '2026-07-06', 'Personal', 'EXCUSED BECAUSE MX LOST I GUESS', 'Ismael,Edgar,Tyler', 'yes', '2026-07-07'),
  ('ALL ARRIVED', '2026-07-07', 'N/A', 'BECAUSE NASS WAS THERE', 'N/A', null, null),
  ('Tyler Sulay', '2026-07-08', 'Late', 'NONE GIVEN', 'N/A', 'no', '2026-07-08'),
  ('Luis Vasquez', '2026-07-08', 'Late', 'NONE GIVEN', 'N/A', 'no', '2026-07-08'),
  ('Tyler Sulay', '2026-07-09', 'Late', 'NONE GIVEN', 'N/A', 'no', '2026-07-09'),
  ('Luis Vasquez', '2026-07-09', 'Late', 'NONE GIVEN', 'N/A', 'no', '2026-07-09'),
  ('Tyler Sulay', '2026-07-10', 'Late', 'NONE GIVEN', 'N/A', 'no', '2026-07-08'),
  ('Luis Vasquez', '2026-07-10', 'Late', 'NONE GIVEN', 'N/A', 'no', '2026-07-08'),
  ('ALL EMPLOYEES', '2026-07-13', 'Other', 'Pass given', 'n/a', 'yes', '2026-07-13'),
  ('Luis Vasquez', '2026-07-14', 'Late', 'No reason', 'N/A', 'no', '2026-07-13');
