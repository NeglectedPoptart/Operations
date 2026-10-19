-- Migration 149: each person's NFL team.
--
-- profiles.nfl_team: the team's abbreviation (e.g. 'CHI'), or 'none' if they
-- don't follow the NFL. Empty (null) means they haven't been asked yet - the
-- app asks once, the next time they are signed in. The menu then shows their
-- team's game for the week.
--
-- Safe to re-run.

alter table profiles add column if not exists nfl_team text;
