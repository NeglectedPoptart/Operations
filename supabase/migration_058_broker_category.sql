-- Replaces the local/OTR-only is_local flag with a 3-way category so
-- brokers can also be marked LTL. LTL behaves like Local for Freight Rates
-- purposes (excluded from Broker Tracker + Route Averages) but, like Local,
-- still shows up everywhere else (Invoicing, Board's carrier dropdown).
alter table brokers add column if not exists category text not null default 'otr';
alter table brokers add constraint brokers_category_check check (category in ('otr', 'local', 'ltl'));

update brokers set category = 'local' where is_local = true;

alter table brokers drop column if exists is_local;
