-- Additional user-provided labels; normalize 하 to 쉬움 and 중/보통 to 중간.
BEGIN;
CREATE TEMP TABLE confirmed_difficulties (
  puzzle_id text PRIMARY KEY, title text NOT NULL, difficulty text NOT NULL
) ON COMMIT DROP;
INSERT INTO confirmed_difficulties VALUES
  ('261003_01', '261003 봄버스터즈 스도쿠', '중간'),
  ('261005_01', '261005 토마토스 스도쿠', '중간'),
  ('261010_01', '261010 스타배틀 1', '쉬움'),
  ('261010_02', '261010 스타배틀 2', '중간');
DO $$
BEGIN
  PERFORM 1 FROM public.puzzle_catalog
  WHERE season_id='2026-2' AND puzzle_id IN (SELECT puzzle_id FROM confirmed_difficulties)
  FOR UPDATE;
  IF (SELECT count(*) FROM public.puzzle_catalog p JOIN confirmed_difficulties c
      ON p.puzzle_id=c.puzzle_id AND p.title=c.title
      WHERE p.season_id='2026-2' AND (p.difficulty IS NULL OR p.difficulty=c.difficulty)) <> 4 THEN
    RAISE EXCEPTION 'Confirmed difficulty catalog entries missing or changed';
  END IF;
  UPDATE public.puzzle_catalog p SET difficulty=c.difficulty
  FROM confirmed_difficulties c
  WHERE p.season_id='2026-2' AND p.puzzle_id=c.puzzle_id
    AND p.difficulty IS DISTINCT FROM c.difficulty;
END $$;
COMMIT;
