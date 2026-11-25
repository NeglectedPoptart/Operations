-- Migration 177: brokers.needs_review.
--
-- A flag on the Logistics Invoicing carrier tiles: "someone should review this carrier". Separate from
-- request_statement (which means "ask the carrier for a statement"). needs_review_at is when it was flagged.
--
-- Safe to re-run.

alter table brokers add column if not exists needs_review boolean not null default false;
alter table brokers add column if not exists needs_review_at timestamptz;
