-- Migration 028: Logistics Invoicing - "Request Statement" toggle per broker.
-- A manual flag your team flips on the Invoicing home page as a signal to
-- email that carrier requesting their current statement.
alter table brokers add column if not exists request_statement boolean not null default false;
