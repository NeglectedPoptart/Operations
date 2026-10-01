-- Arrivals: a free-text ETA field, shown after Notes - same simple text
-- field as Local Inbounds' own "eta" column, distinct from the existing
-- arrival_day (which day of the week) since this is a finer-grained time
-- estimate (e.g. "2pm", "tonight").
alter table mx_arrivals add column if not exists eta text;
