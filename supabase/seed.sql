-- Optional: run after schema.sql to pre-populate the brokers and lanes
-- shown in your rate tracker, so you don't have to type them in by hand.
-- Safe to re-run - duplicates are skipped.

insert into brokers (name) values
  ('GRIFFITH'), ('DESERT'), ('KOOL'), ('FIRSTCALL'), ('PGTRANS'), ('REDLAB')
on conflict (name) do nothing;

insert into lanes (from_hub, destination) values
  ('PHARR', 'Clackamas, OR'),
  ('PHARR', 'Puyallup, WA'),
  ('PHARR', 'Riverside, CA'),
  ('PHARR', 'Compton, CA'),
  ('PHARR', 'Mira Loma, CA'),
  ('PHARR', 'Richmond, CA'),
  ('PHARR', 'Chicago, IL'),
  ('PHARR', 'Atlanta, GA'),
  ('PHARR', 'Greensboro, NC'),
  ('PHARR', 'Ocala, FL'),
  ('PHARR', 'Jessup, MD'),
  ('PHARR', 'Philly, PA'),
  ('PHARR', 'S Plainfield, NJ'),
  ('PHARR', 'Bayonne, NJ'),
  ('PHARR', 'Bronx, NY'),
  ('PHARR', 'MD/PA, SPLT'),
  ('PHARR', 'Dallas, TX'),
  ('PHARR', 'Temple, TX'),
  ('PHARR', 'Houston, TX'),
  ('PHARR', 'San Antonio, TX'),
  ('NOGALES', 'Jessup, MD'),
  ('SALINAS', 'Temple, TX'),
  ('SALINAS', 'San Antonio, TX'),
  ('SALINAS', 'Lansing, MI'),
  ('SALINAS', 'Atlanta, GA'),
  ('SALINAS', 'Greensboro, NC'),
  ('SALINAS', 'Ocala, FL'),
  ('SALINAS', 'Jessup, MD'),
  ('SALINAS', 'Philly, PA'),
  ('SALINAS', 'New Hope, MN'),
  ('SANTA MARIA', 'Denver, CO'),
  ('SANTA MARIA', 'Clackamas, OR'),
  ('SANTA MARIA', 'Puyallup, WA'),
  ('SANTA MARIA', 'Riverside, CA'),
  ('SANTA MARIA', 'Compton, CA'),
  ('SANTA MARIA', 'Houston, TX'),
  ('YUMA', 'Houston, TX'),
  ('YUMA', 'Richmond, CA'),
  ('YUMA', 'Mira Loma, CA'),
  ('YUMA', 'Jessup, MD'),
  ('YUMA', 'Denver, CO'),
  ('YUMA', 'Clackamas, OR'),
  ('YUMA', 'Puyallup, WA')
on conflict (from_hub, destination) do nothing;
