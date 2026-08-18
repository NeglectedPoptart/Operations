-- Migration 056: Local vs OTR broker/carrier categorization.
--
-- A backend-only flag (nothing on the front end explains it) that changes
-- which lists a broker shows up in: Local brokers are dropped from the
-- Freight Rates page (both Broker Tracker and Route Averages) since local
-- hauls don't belong in long-haul lane pricing, but keep showing up
-- everywhere else (Invoicing tiles/dropdown, Board's carrier picker, etc.)
-- exactly as before. Defaults to false so every existing broker stays OTR
-- (unchanged behavior) until someone flips it.
alter table brokers add column if not exists is_local boolean not null default false;
