-- Migration 027: Logistics Invoicing - Statement Checker flag.
-- Set true when the Statement Checker finds an invoice marked Done (green)
-- on our side but still carrying a balance (not actually paid) in the
-- accounting system's statement - surfaced as a small red flag until
-- someone dismisses it or the row is otherwise resolved.
alter table invoice_statements add column if not exists flagged boolean not null default false;
