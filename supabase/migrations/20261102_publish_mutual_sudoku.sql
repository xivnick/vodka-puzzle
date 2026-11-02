-- The user approved the release of the 261102 Mutual Pointing Sudoku.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261102_01') THEN
    RAISE EXCEPTION 'Mutual Pointing Sudoku catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id='261102_01' AND status<>'published';
END $$;
COMMIT;
