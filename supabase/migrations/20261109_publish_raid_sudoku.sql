-- The user approved the immediate release of all ten Sudoku Raid puzzles.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.puzzle_catalog
      WHERE season_id='2026-2' AND puzzle_id BETWEEN '261109_01' AND '261109_10') <> 10 THEN
    RAISE EXCEPTION 'Expected all ten Sudoku Raid catalog entries';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2'
    AND puzzle_id BETWEEN '261109_01' AND '261109_10'
    AND (status<>'published' OR published_at IS NULL OR published_at>now());
END $$;
COMMIT;
