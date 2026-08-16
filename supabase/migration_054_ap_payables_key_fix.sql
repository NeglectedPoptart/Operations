-- Migration 054: fix Accounts Payable's natural key.
--
-- A vendor + document number isn't unique on the source report - a single
-- document can carry multiple payable lines with different Concepts (e.g.
-- "Customs" and "Freight" both filed under the same document #), which is
-- exactly why the first real sync attempt's batch insert failed silently
-- against the old vendor+document unique constraint (Postgres rejected the
-- whole batch, so nothing landed). Verified against the actual 1,467-row
-- report: vendor + document + concept has zero collisions.

alter table ap_payables drop constraint if exists ap_payables_vendor_id_document_key;
alter table ap_payables add constraint ap_payables_vendor_id_document_concept_key unique (vendor_id, document, concept);
