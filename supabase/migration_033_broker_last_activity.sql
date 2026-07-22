-- Migration 033: Logistics Invoicing - "Last update" per broker tile.
-- Stamped whenever an invoice for that broker is marked Done or gets a note
-- added (via the per-broker page or the Statement Checker), so the
-- Invoicing home page can show when a broker was last worked.
alter table brokers add column if not exists last_activity_at timestamptz;
