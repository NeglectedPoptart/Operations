-- Migration 009: restore the "Yuma, AZ" hub entry.
-- migration_008 renamed loads.source from "YUMA" to "Yuma, AZ" but only
-- deleted the old bare "YUMA" hub row - it never inserted the new canonical
-- "Yuma, AZ" row (Pharr/Salinas already existed as seeded rows, so those
-- renames worked; Yuma wasn't one of the originally-seeded hubs, so it just
-- disappeared from the Source picker). Safe to re-run.

insert into hubs (name) values ('Yuma, AZ')
on conflict (name) do nothing;
