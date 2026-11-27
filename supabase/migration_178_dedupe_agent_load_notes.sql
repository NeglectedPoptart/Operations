-- Clean up repeated email-agent lines in load notes: when a "[Agent 11/27] ..." line says exactly the same
-- thing as the agent line right before it, the repeat is dropped (typed notes are never touched).

DO $$
DECLARE
  r record;
  l text;
  cur text;
  prev text;
  kept text[];
  new_notes text;
BEGIN
  FOR r IN SELECT id, notes FROM loads WHERE notes LIKE '%[Agent %' LOOP
    kept := ARRAY[]::text[];
    prev := NULL;
    FOREACH l IN ARRAY string_to_array(r.notes, E'\n') LOOP
      IF l ~ '^\s*\[Agent [^\]]*\]' THEN
        cur := lower(regexp_replace(regexp_replace(l, '^\s*\[Agent [^\]]*\]\s*', ''), '[^a-zA-Z0-9]+', '', 'g'));
        IF prev IS NOT NULL AND cur = prev THEN
          CONTINUE;
        END IF;
        prev := cur;
      END IF;
      kept := kept || l;
    END LOOP;
    new_notes := array_to_string(kept, E'\n');
    IF new_notes IS DISTINCT FROM r.notes THEN
      UPDATE loads SET notes = new_notes WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
