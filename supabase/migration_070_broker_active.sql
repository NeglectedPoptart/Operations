-- Lets a broker/carrier be marked "not actively using" without deleting it -
-- it stays visible (greyed out, in its own section) on the Invoicing tile
-- list so it's easy to go back to, but drops out of the broker picker when
-- creating a new load.
alter table brokers add column if not exists active boolean not null default true;
