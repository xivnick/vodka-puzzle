-- Include the released Pepero Day formula puzzle in the existing math challenge.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.puzzle_catalog
    WHERE season_id='2026-2' AND puzzle_id='261111_02'
      AND status='published' AND published_at<=now()
  ) OR NOT EXISTS (
    SELECT 1 FROM private.achievement_rules WHERE id='math' AND metric='bound'
  ) THEN
    RAISE EXCEPTION 'Published Pepero formula puzzle or math achievement is missing';
  END IF;
  INSERT INTO private.achievement_puzzle_bindings(achievement_id,season_id,puzzle_id)
  VALUES('math','2026-2','261111_02')
  ON CONFLICT DO NOTHING;
END $$;
COMMIT;
