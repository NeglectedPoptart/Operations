-- Migration 016: PAS Files row highlight (Yellow = needs contact, Red =
-- escalated). Safe to re-run.

alter table pas_files add column if not exists highlight text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pas_files_highlight_check') then
    alter table pas_files add constraint pas_files_highlight_check check (highlight in ('none', 'yellow', 'red'));
  end if;
end $$;
