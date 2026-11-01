-- The user approved the basic Juru Marble puzzle at medium difficulty.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.puzzle_catalog WHERE season_id='2026-2' AND puzzle_id='261101_03') THEN
    RAISE EXCEPTION 'Juru Marble catalog entry is missing';
  END IF;
  UPDATE public.puzzle_catalog
  SET title='주루마블 스도쿠', difficulty='중', status='published',
      published_at=CASE WHEN status='published' THEN published_at ELSE now() END
  WHERE season_id='2026-2' AND puzzle_id='261101_03';
END $$;
COMMIT;
