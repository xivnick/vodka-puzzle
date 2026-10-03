-- Rename the test puzzle without changing its publication settings or admin metadata.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261001_04') THEN
    IF EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261003_01') THEN
      RAISE EXCEPTION 'Destination puzzle ID already exists';
    END IF;
    UPDATE public.puzzle_catalog
    SET puzzle_id='261003_01', title=regexp_replace(title, '^26100[12]', '261003')
    WHERE season_id='2026-2' AND puzzle_id='261001_04';
  ELSIF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261003_01') THEN
    RAISE EXCEPTION 'Source puzzle is missing';
  END IF;
END $$;
COMMIT;
