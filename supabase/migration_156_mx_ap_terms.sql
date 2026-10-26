-- Migration 156: grower AP terms and the AP Summary (Mexico > AP Summary).
--
-- mx_growers.ap_terms_days / ap_terms_note: how many days after a load arrives that the
-- grower is paid (Net 7, Net 14...) and an optional note ("pays every Friday").
-- mx_arrivals.arrived_at: when the Arrived box was ticked (the Arrived tick only ever said
-- yes/no, so this is what lets the AP Summary count days since arrival from the real day).
-- mx_arrivals.ap_paid_at / ap_paid_by: set when Accounting marks a load as paid, so it stops
-- showing as due.
--
-- Safe to re-run.

alter table mx_growers add column if not exists ap_terms_days integer;
alter table mx_growers add column if not exists ap_terms_note text;

alter table mx_arrivals add column if not exists arrived_at timestamptz;
alter table mx_arrivals add column if not exists ap_paid_at timestamptz;
alter table mx_arrivals add column if not exists ap_paid_by text;
