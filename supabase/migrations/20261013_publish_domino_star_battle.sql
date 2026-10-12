-- The user approved the release of the 261003 domino star battle.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261003_02') THEN
    RAISE EXCEPTION 'Domino star battle catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id='261003_02' AND status<>'published';
END $$;
COMMIT;
