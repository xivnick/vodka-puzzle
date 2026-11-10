-- The user approved the immediate release of Pepero Sudoku.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.puzzle_catalog
    WHERE season_id='2026-2' AND puzzle_id='261111_01'
  ) THEN
    RAISE EXCEPTION 'Pepero Sudoku catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id='261111_01'
    AND (status<>'published' OR published_at IS NULL OR published_at>now());
END $$;
COMMIT;
