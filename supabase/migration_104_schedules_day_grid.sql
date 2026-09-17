-- Person schedules now store an actual per-day grid (Mon-Sat) instead of a
-- single free-text block, so a multi-week calendar can be generated forward
-- - Week A/Week B alternate the same way as before (see migration_103),
-- just with structured hours per day now instead of one text blob. Role
-- rows (salaried, e.g. "Operations") are unaffected - still hours_text.
alter table role_schedules add column if not exists week_a_days jsonb;
alter table role_schedules add column if not exists week_b_days jsonb;
