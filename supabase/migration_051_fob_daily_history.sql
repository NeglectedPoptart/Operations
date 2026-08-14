-- Migration 051: FOB Pharr - daily history (auto-clear each morning, view
-- prior days like QC Agenda).
--
-- fob_items becomes date-scoped: one full set of rows per calendar day,
-- keyed by entry_date, exactly like qc_agenda_inbounds/qc_agenda_repack.
-- The app (src/lib/fobDaily.ts) lazily creates each new day's rows the
-- first time anyone opens FOB Pharr or a Delivered pricing page that day,
-- copying yesterday's catalog structure (commodity_group/variety/unit_per/
-- size/position) forward but with fob cleared to null - so there's no way
-- to accidentally leave/send a stale price, and every prior day's numbers
-- stay in place to look back on.
--
-- fob_freight_rates is deliberately NOT touched - it's a small reference
-- table that's edited in place and never resets (unchanged from
-- migration_023's original design).

alter table fob_items add column if not exists entry_date date not null default current_date;

drop index if exists fob_items_section_position_idx;
create index if not exists fob_items_entry_date_idx on fob_items (entry_date);
create index if not exists fob_items_entry_date_section_position_idx on fob_items (entry_date, section, position);
