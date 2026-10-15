-- The user approved the release of the 261015 Star Loop.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261015_01') THEN
    RAISE EXCEPTION 'Star Loop catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id='261015_01' AND status<>'published';
END $$;
COMMIT;
