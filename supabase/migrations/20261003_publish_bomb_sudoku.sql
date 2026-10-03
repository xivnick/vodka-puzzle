-- The user approved the release with its completion ranking badge.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261003_01') THEN
    RAISE EXCEPTION 'Bomb sudoku catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=COALESCE(published_at,now())
  WHERE season_id='2026-2' AND puzzle_id='261003_01' AND status<>'published';
END $$;
COMMIT;
