-- Tracks the last time the Statement Checker was actually run against a
-- carrier (separate from last_activity_at, which only bumps on a Done/note
-- event) - shown on the Invoicing tile right under "Last update".
alter table brokers add column if not exists last_statement_checked_at timestamptz;
