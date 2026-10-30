-- The user approved the release of the 261030 Yajilin.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261030_01') THEN
    RAISE EXCEPTION 'Yajilin catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET status='published', published_at=now()
  WHERE season_id='2026-2' AND puzzle_id='261030_01' AND status<>'published';
END $$;
COMMIT;
