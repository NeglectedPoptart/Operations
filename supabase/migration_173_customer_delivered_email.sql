-- Migration 173: Customer "delivered" emails (Customer ETA agent, Submanagement > Agents).
--
-- Once a load (or one drop of a multi-drop load) is delivered and its POD is on file, the Customer ETA agent
-- emails that customer "your order was delivered" with the POD attached - same customer email list, same
-- approve-first / auto mode as the ETA emails. Only PODs added from now on trigger it (delivered_from), so
-- turning this on never emails customers about old loads.
--
-- load_stops.delivered_email_at: when that drop's delivered email was drafted or sent (so it goes once).
-- agent_threads.attachment_paths: files (POD scans in the load-documents bucket) attached when a thread is sent.
--
-- Run migrations 160 and 172 first. Safe to re-run.

alter table load_stops add column if not exists delivered_email_at timestamptz;
alter table agent_threads add column if not exists attachment_paths jsonb not null default '[]'::jsonb;

update agents
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('delivered_from', now())
where key = 'customer_eta' and not (coalesce(config, '{}'::jsonb) ? 'delivered_from');

update agents
set description = 'Emails each customer the latest carrier ETA for their loads on the road, at set times, and a "delivered" email with the POD attached once a load is delivered.'
where key = 'customer_eta';
