-- Migration 014: split loads.notes (entered at load creation, for loading/
-- delivery info) from a new eta_note column (used only by the On the Road
-- ETA / location update box). Previously both used the same notes column,
-- so an ETA update would silently overwrite the load's real notes. Safe to
-- re-run.

alter table loads add column if not exists eta_note text;
