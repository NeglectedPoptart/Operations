-- Flag a device as having an issue that needs follow-up (paired with the
-- existing free-text notes column).
alter table devices add column if not exists has_issue boolean not null default false;
