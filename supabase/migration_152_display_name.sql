-- Migration 152: let each person set the name HOPS shows for them.
--
-- profiles.display_name: shown in the menu and on things they send from HOPS
-- (e.g. "last sent by"). Empty means HOPS uses their employee-record name,
-- then the start of their login email.
--
-- Safe to re-run.

alter table profiles add column if not exists display_name text;
