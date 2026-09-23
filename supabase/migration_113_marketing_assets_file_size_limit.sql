-- marketing-assets had no explicit file_size_limit (confirmed NULL), so it
-- was silently deferring to the project's global Storage default - which
-- rejected a 64.5MB brochure PDF. Sets a generous explicit ceiling (100MB)
-- on just this bucket so future large print-quality assets go through too.
update storage.buckets
set file_size_limit = 104857600
where id = 'marketing-assets';
