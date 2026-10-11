-- The user approved the release of the 261011 intruder star battle.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261011_01') THEN
    RAISE EXCEPTION 'Intruder star battle catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id='261011_01' AND status<>'published';
END $$;
COMMIT;
