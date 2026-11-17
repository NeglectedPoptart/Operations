-- Migration 172: Per-drop delivery + POD for multi-drop loads (Logistics > Load Board).
--
-- A load with more than one drop (load_stops) can now be marked delivered, and have its POD attached, one
-- drop at a time instead of only as a whole load. Once every drop on a multi-drop load is marked delivered,
-- the load itself is set to Complete automatically - a single-drop load works exactly as it did before.
--
-- Run migration 126 (load_documents) first. Safe to re-run.

alter table load_stops add column if not exists delivered_at timestamptz;
alter table load_stops add column if not exists delivered_by text;

-- Which drop a POD belongs to, when the load has more than one. Null on every document from before this
-- migration (and on a single-drop load's POD) - those stay whole-load documents, same as always.
alter table load_documents add column if not exists stop_id uuid references load_stops (id) on delete set null;
create index if not exists load_documents_stop_idx on load_documents (stop_id);
