-- Migration 013: add Customer Name to AM Holdovers, right after PO/Lot #.
-- Safe to re-run.

alter table am_holdovers add column if not exists customer_name text;
