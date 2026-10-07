-- Migration 129: credits applied against each AR invoice.
--
-- The new "AR Aging Detail by Customer Including Credits" report lists what
-- was already applied under every invoice (checks, ACH payments, and
-- adjustments). Two totals are kept per invoice so the AR page can tell a
-- true short pay (a check/ACH was applied and a balance is still left) from a
-- plain adjustment (a deduction already agreed - not a short pay):
--   credits_total  - everything applied (checks + ACH + adjustments)
--   payments_total - just the checks and ACH within that
-- Both stay null on an invoice until it is synced from the new report, and
-- the AR page falls back to its old short-pay rule for those. Safe to re-run.

alter table ar_invoices add column if not exists credits_total numeric;
alter table ar_invoices add column if not exists payments_total numeric;
