-- Run this in the Supabase SQL Editor to add the Ready/Not Ready toggle for
-- Pending to Load items.

alter table loads add column if not exists ready_to_load boolean not null default false;
