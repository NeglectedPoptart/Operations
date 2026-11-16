-- Migration 169: Freight Statements agent (Submanagement > Agents).
--
-- Email a carrier's freight statement to the HOP@ mailbox - the PDF, an Excel / CSV file, or (for Jear) the
-- table pasted into the email - and this agent reads it the same way "Upload Statement" does on Accounting >
-- Logistics Invoicing, and adds the invoices that aren't on that carrier's list yet. It never changes or removes
-- an invoice that is already on the list. It emails the sender back with what it did.
--
-- Reads ALIMAT, AMP, DSV, Griffith, Jear, Jerue, PGTrans and Profreight. Only emails from a HOPS login (or an
-- address you add on the agent's card) are read.
--
-- Starts switched ON - it only ever adds new invoices, and only for senders you've allowed. Turn it off from
-- the Agents page. Run migration 115 (agents) first. Safe to re-run.

insert into agents (key, name, description, enabled, mode, interval_hours, active_start_hour, active_end_hour, config) values
  ('freight_statements', 'Freight Statements',
   'Email a carrier''s statement (PDF, Excel, CSV, or Jear''s table) to the HOP@ mailbox and it adds the new invoices to that carrier''s list on Logistics Invoicing.',
   true, 'auto', 1, 0, 24,
   '{"read_replies": false}'::jsonb)
on conflict (key) do nothing;
