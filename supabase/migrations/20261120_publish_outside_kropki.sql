-- The user approved the immediate release of both outside Kropki puzzles.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.puzzle_catalog
      WHERE season_id='2026-2' AND puzzle_id IN ('261120_01','261120_02')) <> 2 THEN
    RAISE EXCEPTION 'Outside Kropki catalog entries are missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id IN ('261120_01','261120_02')
    AND (status<>'published' OR published_at IS NULL OR published_at>now());
END $$;
COMMIT;
