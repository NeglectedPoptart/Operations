-- Migration 139: the Grower, Product Label and Commodity pick-lists.
--
-- Adds the growers, labels and commodities from the QC team's list to the
-- pick-lists the New Inspection form (Grower, Product Label) and the
-- Inspection Plans editor (Commodity) use, plus the commodity of every
-- existing plan. An entry that is already there (any capitalization) is left
-- as it is. The "TOTAL" rows on the spreadsheet were left out.
--
-- Run migration 138 first. Safe to re-run.

insert into qc_field_options (field_key, value)
select v.field_key, v.value
from (values
  -- Growers
  ('grower', 'Abogue'),
  ('grower', 'AGRICOLA DEL FUERTE'),
  ('grower', 'AGRICOLA NIETO'),
  ('grower', 'CANO FRESH'),
  ('grower', 'CHINAMPA'),
  ('grower', 'DON ALBERTO PRODUCE'),
  ('grower', 'FRANCISCO NAVARRO'),
  ('grower', 'MK LECHUGAS'),
  ('grower', 'PRODUCE FIRST'),
  ('grower', 'SAIB/TALAYOTE'),
  ('grower', 'TEPA PRIME'),
  ('grower', 'TORRES TEJEDA'),
  ('grower', 'WERITA'),
  -- Commodities
  ('commodity', 'Asian Vegetables'),
  ('commodity', 'BELL PEPPERS'),
  ('commodity', 'BROCCOLI CROWNS'),
  ('commodity', 'Carrots'),
  ('commodity', 'Cauliflower'),
  ('commodity', 'Celery'),
  ('commodity', 'Chili Peppers'),
  ('commodity', 'Cilantro'),
  ('commodity', 'Cucumbers'),
  ('commodity', 'Green Beans'),
  ('commodity', 'Lettuce'),
  ('commodity', 'SQUASH RECEIVING'),
  -- Labels
  ('product_label', 'BELLA BELLS'),
  ('product_label', 'BUNCHES'),
  ('product_label', 'CHENEY'),
  ('product_label', 'CHENEY #2'),
  ('product_label', 'CHONA''S'),
  ('product_label', 'FU CHOY'),
  ('product_label', 'FU CHOY GREEN'),
  ('product_label', 'FU CHOY RED'),
  ('product_label', 'FU CHOY RED #2 LARGE'),
  ('product_label', 'FU JIAN'),
  ('product_label', 'GENERIC'),
  ('product_label', 'GENERIC #2'),
  ('product_label', 'HARVEST BEST'),
  ('product_label', 'JIN YE')
) as v(field_key, value)
where not exists (
  select 1 from qc_field_options o where o.field_key = v.field_key and lower(o.value) = lower(v.value)
);

-- The commodity of every plan already set up (e.g. "Broccoli Crowns").
insert into qc_field_options (field_key, value)
select 'commodity', btrim(p.commodity)
from (select distinct commodity from qc_plans where btrim(commodity) <> '') p
where not exists (
  select 1 from qc_field_options o where o.field_key = 'commodity' and lower(o.value) = lower(btrim(p.commodity))
);
